"""In-memory store of live AIS vessels for the Sea domain.

Fed by :mod:`backend.services.ais_stream` (AISStream.io envelopes) and read by the
Sea router's snapshot endpoints. Mirrors the model the Land map uses for APRS —
a backend-owned feed exposed as a REST snapshot the map polls — but the AIS
message rate (hundreds per second worldwide) rules out a SQLite write per
message, so the live picture lives in memory and is only *snapshotted* to the
``sea_vessel_cache`` table on a slow cadence for warm starts and stale serving.

Two maps are kept, both keyed by MMSI: the vessel's latest position record and
its static data (name, type, destination, IMO), which arrive in different
message types and are merged so a position report without static data still
gets a name once one has been heard. A per-vessel track ring buffer holds the
recent path, thinned by time and distance so anchored ships collapse to a point.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
from collections import deque
from datetime import UTC, datetime
from typing import Any

from backend.cache import now_ms
from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.models import SeaVesselCache
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

logger = logging.getLogger(__name__)

# Rows per snapshot transaction — small enough that each write lock is brief.
_PERSIST_CHUNK = 1_000

# ── AIS ship-type mapping ─────────────────────────────────────────────────────
# ITU-R M.1371 ship-and-cargo type codes. Tens digit = family; a handful of
# codes in the 3x/5x ranges are specific vessel roles rather than families.
_SPECIAL_TYPE_LABELS: dict[int, tuple[str, str]] = {
    30: ("FISHING", "fishing"),
    31: ("TOWING", "service"),
    32: ("TOWING", "service"),
    33: ("DREDGER", "service"),
    34: ("DIVE OPS", "service"),
    35: ("MILITARY", "military"),
    36: ("SAILING", "pleasure"),
    37: ("PLEASURE", "pleasure"),
    50: ("PILOT", "service"),
    51: ("SAR", "sar"),
    52: ("TUG", "service"),
    53: ("PORT TENDER", "service"),
    54: ("ANTI-POLLUTION", "service"),
    55: ("LAW ENFORCE", "military"),
    58: ("MEDICAL", "service"),
}
_FAMILY_TYPE_LABELS: dict[int, tuple[str, str]] = {
    2: ("WIG", "other"),
    4: ("HIGH-SPEED", "passenger"),
    6: ("PASSENGER", "passenger"),
    7: ("CARGO", "cargo"),
    8: ("TANKER", "tanker"),
    9: ("OTHER", "other"),
}

# Every family value a vessel record can carry — the Sea filter's categories.
VESSEL_FAMILIES: tuple[str, ...] = (
    "cargo",
    "tanker",
    "passenger",
    "fishing",
    "service",
    "military",
    "sar",
    "pleasure",
    "other",
)


def classify_ship_type(raw_type: object) -> tuple[str, str]:
    """Map an AIS ship-type code to ``(label, family)``.

    Numeric codes follow ITU-R M.1371 (``71`` → ``("CARGO", "cargo")``); an
    already-textual type passes through as its own label with a family guessed
    from the text. Unknown or missing types are ``("", "other")`` so the map
    can still draw the vessel with the default styling.
    """
    text = str(raw_type or "").strip()
    if not text:
        return "", "other"
    if text.isdigit() and len(text) <= 2:
        code = int(text)
        if code <= 0:
            return "", "other"
        if code in _SPECIAL_TYPE_LABELS:
            return _SPECIAL_TYPE_LABELS[code]
        return _FAMILY_TYPE_LABELS.get(code // 10, ("OTHER", "other"))
    lowered = text.lower()
    for needle, family in (
        ("tanker", "tanker"),
        ("cargo", "cargo"),
        ("container", "cargo"),
        ("bulk", "cargo"),
        ("passenger", "passenger"),
        ("ferry", "passenger"),
        ("cruise", "passenger"),
        ("fishing", "fishing"),
        ("tug", "service"),
        ("pilot", "service"),
        ("military", "military"),
        ("sar", "sar"),
    ):
        if needle in lowered:
            return text.upper(), family
    return text.upper(), "other"


# ── Envelope parsing helpers ──────────────────────────────────────────────────


def _string_value(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _number_value(value: object) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _normalized_heading(value: object) -> float | None:
    """AIS uses 511 for "heading not available"; anything outside 0–360 is dropped."""
    heading = _number_value(value)
    if heading is None or heading < 0 or heading > 360:
        return None
    return heading


def _normalized_sog(value: object) -> float | None:
    """AIS uses 102.3 kn for "speed not available"."""
    speed = _number_value(value)
    if speed is None or speed < 0 or speed >= 102.3:
        return None
    return speed


def _normalized_cog(value: object) -> float | None:
    """AIS uses 360 for "course not available"."""
    course = _number_value(value)
    if course is None or course < 0 or course >= 360:
        return None
    return course


def parse_ais_timestamp_ms(value: object) -> int:
    """Parse an AISStream ``time_utc`` string ("2024-01-02 03:04:05.678 +0000 UTC")
    into Unix ms, falling back to now for missing or malformed values."""
    text = _string_value(value)
    if not text:
        return now_ms()
    normalized = text.replace(" +0000 UTC", "+00:00").replace(" UTC", "+00:00").replace(" ", "T", 1)
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return now_ms()
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return int(parsed.timestamp() * 1000)


def _iso_utc(unix_ms: int) -> str:
    return datetime.fromtimestamp(unix_ms / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _approx_meters_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Equirectangular distance — plenty for 25 m track thinning."""
    delta_lat = (lat2 - lat1) * 111_320
    delta_lon = (lon2 - lon1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(delta_lat, delta_lon)


# ── The store ─────────────────────────────────────────────────────────────────


class AisVesselStore:
    """Live vessel picture keyed by MMSI, with static-data merge and track buffers.

    The store is process-wide (one instance, ``store``) because it is the single
    place both the AISStream reader and the HTTP snapshot read from; tests build
    their own instances.
    """

    def __init__(self) -> None:
        self._vessels: dict[str, dict[str, Any]] = {}
        self._static: dict[str, dict[str, str]] = {}
        self._tracks: dict[str, deque[tuple[float, float, int]]] = {}
        # Newest position timestamp across the whole store — the "how fresh is
        # this picture" figure the snapshot endpoint reports.
        self.newest_position_ms: int | None = None
        # MMSIs changed since the last snapshot, so a persist only writes what
        # moved rather than rewriting the whole store.
        self._dirty_mmsis: set[str] = set()
        self._dirty = False

    def _mark_dirty(self, mmsi: str) -> None:
        self._dirty_mmsis.add(mmsi)
        self._dirty = True

    # ── ingest ────────────────────────────────────────────────────────────────

    def ingest_envelope(self, envelope: dict[str, Any], received_ms: int | None = None) -> bool:
        """Store one parsed AISStream envelope.

        Returns True only when the envelope carried a recognisable AIS record
        with an MMSI — that is the feed's liveness proof, so a well-formed JSON
        frame that says nothing about a vessel must not count.
        """
        if not isinstance(envelope, dict):
            return False
        message_type = _string_value(envelope.get("MessageType"))
        message_block = envelope.get("Message")
        message = message_block.get(message_type, {}) if isinstance(message_block, dict) else {}
        if not isinstance(message, dict):
            message = {}
        metadata = envelope.get("MetaData") or envelope.get("Metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        mmsi = _string_value(metadata.get("MMSI") or message.get("UserID") or message.get("UserId"))
        if not mmsi.isdigit() or not 5 <= len(mmsi) <= 10:
            return False

        if message_type in ("ShipStaticData", "StaticDataReport"):
            previous = self._static.get(mmsi, {})
            report_a = message.get("ReportA") if isinstance(message.get("ReportA"), dict) else {}
            report_b = message.get("ReportB") if isinstance(message.get("ReportB"), dict) else {}
            static_data = {
                "name": _string_value(metadata.get("ShipName") or message.get("Name") or report_a.get("Name"))
                or previous.get("name", ""),
                "type": _string_value(message.get("Type") or report_b.get("ShipType")) or previous.get("type", ""),
                "destination": _string_value(message.get("Destination")) or previous.get("destination", ""),
                "imo": _string_value(message.get("ImoNumber") or message.get("IMO")) or previous.get("imo", ""),
                "callsign": _string_value(message.get("CallSign") or report_b.get("CallSign"))
                or previous.get("callsign", ""),
            }
            self._static[mmsi] = static_data
            self._merge_static_into_live(mmsi, static_data)

        latitude = _number_value(metadata.get("latitude", metadata.get("Latitude", message.get("Latitude"))))
        longitude = _number_value(metadata.get("longitude", metadata.get("Longitude", message.get("Longitude"))))
        # AIS uses 91/181 for "position not available". A positionless but
        # well-formed record (static data) is still the feed delivering AIS
        # traffic, so it counts as liveness.
        if latitude is None or longitude is None or abs(latitude) > 90 or abs(longitude) > 180:
            return True

        static_data = self._static.get(mmsi, {})
        position_ms = parse_ais_timestamp_ms(metadata.get("time_utc", metadata.get("TimeUtc")))
        received = received_ms if received_ms is not None else now_ms()
        type_label, family = classify_ship_type(message.get("Type") or static_data.get("type"))
        name = _string_value(metadata.get("ShipName") or message.get("Name")) or static_data.get("name", "")
        nav_status = _number_value(message.get("NavigationalStatus"))
        record: dict[str, Any] = {
            "mmsi": mmsi,
            "name": name or f"MMSI {mmsi}",
            "imo": static_data.get("imo", ""),
            "callsign": static_data.get("callsign", ""),
            "type": _string_value(message.get("Type") or static_data.get("type")),
            "typeLabel": type_label,
            "family": family,
            "destination": _string_value(message.get("Destination")) or static_data.get("destination", ""),
            "lat": latitude,
            "lon": longitude,
            "sog": _normalized_sog(message.get("Sog", message.get("SOG"))),
            "cog": _normalized_cog(message.get("Cog", message.get("COG"))),
            "heading": _normalized_heading(message.get("TrueHeading", message.get("Heading"))),
            "navStatus": int(nav_status) if nav_status is not None else None,
            "lastPositionMs": position_ms,
            "lastPositionUtc": _iso_utc(position_ms),
            "_updatedAt": received,
        }
        self._vessels[mmsi] = record
        if self.newest_position_ms is None or position_ms > self.newest_position_ms:
            self.newest_position_ms = position_ms
        self._append_track_sample(mmsi, latitude, longitude, position_ms // 1000)
        self._mark_dirty(mmsi)
        # Expiry is swept by the reader's watchdog tick, not here: a full pass
        # over tens of thousands of vessels on every message (hundreds a second
        # worldwide) starved the event loop and dropped the WebSocket. Only the
        # hard cap is enforced inline, and only once it is actually exceeded.
        if len(self._vessels) > settings.sea_ais_cache_max:
            self.prune(received)
        return True

    def _merge_static_into_live(self, mmsi: str, static_data: dict[str, str]) -> None:
        existing = self._vessels.get(mmsi)
        if not existing:
            return
        if static_data["name"] and (not existing["name"] or existing["name"] == f"MMSI {mmsi}"):
            existing["name"] = static_data["name"]
        if static_data["type"] and not existing["type"]:
            existing["type"] = static_data["type"]
            existing["typeLabel"], existing["family"] = classify_ship_type(static_data["type"])
        for field in ("destination", "imo", "callsign"):
            if static_data[field] and not existing[field]:
                existing[field] = static_data[field]
        self._mark_dirty(mmsi)

    def _append_track_sample(self, mmsi: str, latitude: float, longitude: float, epoch_s: int) -> None:
        track = self._tracks.get(mmsi)
        if track is None:
            track = deque(maxlen=settings.sea_ais_track_samples)
            self._tracks[mmsi] = track
        if track:
            last_lat, last_lon, last_epoch = track[-1]
            if epoch_s - last_epoch < settings.sea_ais_track_min_gap_s:
                return
            if _approx_meters_between(last_lat, last_lon, latitude, longitude) < settings.sea_ais_track_min_move_m:
                return
        track.append((latitude, longitude, epoch_s))

    # ── eviction ──────────────────────────────────────────────────────────────

    def prune(self, current_ms: int | None = None) -> int:
        """Drop vessels outside the retention window, then enforce the size cap.

        Returns the number of vessels removed.
        """
        current = current_ms if current_ms is not None else now_ms()
        cutoff = current - settings.sea_ais_stale_ms
        expired = [mmsi for mmsi, row in self._vessels.items() if row["_updatedAt"] < cutoff]
        for mmsi in expired:
            self._forget(mmsi)
        overflow = len(self._vessels) - settings.sea_ais_cache_max
        if overflow > 0:
            oldest = sorted(self._vessels.items(), key=lambda item: item[1]["_updatedAt"])[:overflow]
            for mmsi, _row in oldest:
                self._forget(mmsi)
            expired.extend(mmsi for mmsi, _row in oldest)
        if expired:
            self._dirty = True
        return len(expired)

    def _forget(self, mmsi: str) -> None:
        self._vessels.pop(mmsi, None)
        self._tracks.pop(mmsi, None)
        self._static.pop(mmsi, None)
        self._dirty_mmsis.discard(mmsi)

    def clear(self) -> None:
        """Forget everything (tests, and a source switch)."""
        self._vessels.clear()
        self._static.clear()
        self._tracks.clear()
        self.newest_position_ms = None
        self._dirty_mmsis.clear()
        self._dirty = True

    # ── reads ─────────────────────────────────────────────────────────────────

    def __len__(self) -> int:
        return len(self._vessels)

    def vessels(
        self,
        max_rows: int,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> list[dict[str, Any]]:
        """Return up to ``max_rows`` vessel records, newest position first.

        ``bbox`` is ``(south, west, north, east)`` in degrees; a box that crosses
        the antimeridian (west > east) is honoured.
        """
        rows: list[dict[str, Any]] = []
        for row in self._vessels.values():
            if bbox is not None and not _inside_bbox(row["lat"], row["lon"], bbox):
                continue
            rows.append(row)
        rows.sort(key=lambda row: row["_updatedAt"], reverse=True)
        return [_public_record(row) for row in rows[:max_rows]]

    def get(self, mmsi: str) -> dict[str, Any] | None:
        """One vessel's public record, or None when it is not in the store."""
        row = self._vessels.get(mmsi)
        return _public_record(row) if row else None

    def track(self, mmsi: str) -> list[dict[str, float | int]]:
        """A vessel's recent path, oldest first, as ``{lat, lon, t}`` (``t`` = epoch s)."""
        return [{"lat": lat, "lon": lon, "t": epoch} for lat, lon, epoch in self._tracks.get(mmsi, ())]

    # ── persistence ───────────────────────────────────────────────────────────

    async def persist_snapshot(self, force: bool = False) -> int:
        """Write the vessels changed since the last snapshot to ``sea_vessel_cache``.

        Incremental and chunked on purpose: a worldwide feed holds tens of
        thousands of vessels, and rewriting them all in one transaction locked
        SQLite for seconds and blocked every other writer. Only dirty MMSIs are
        upserted (``force`` writes everything), in chunks each committed on its
        own with the event loop yielded between them; rows outside the retention
        window are deleted afterwards. Returns the number of rows written.
        """
        if not self._dirty and not force:
            return 0
        mmsis = list(self._vessels) if force else [mmsi for mmsi in self._dirty_mmsis if mmsi in self._vessels]
        self._dirty_mmsis.clear()
        self._dirty = False
        written = 0
        cutoff = now_ms() - settings.sea_ais_stale_ms
        async with AsyncSessionLocal() as db:
            for start in range(0, len(mmsis), _PERSIST_CHUNK):
                rows = []
                for mmsi in mmsis[start : start + _PERSIST_CHUNK]:
                    row = self._vessels.get(mmsi)
                    if row is None:
                        continue
                    rows.append(
                        {
                            "mmsi": mmsi,
                            "payload": json.dumps(_public_record(row)),
                            "track": json.dumps([list(sample) for sample in self._tracks.get(mmsi, ())]),
                            "updated_at": row["_updatedAt"],
                        }
                    )
                if not rows:
                    continue
                statement = sqlite_insert(SeaVesselCache).values(rows)
                await db.execute(
                    statement.on_conflict_do_update(
                        index_elements=[SeaVesselCache.mmsi],
                        set_={
                            "payload": statement.excluded.payload,
                            "track": statement.excluded.track,
                            "updated_at": statement.excluded.updated_at,
                        },
                    )
                )
                await db.commit()
                written += len(rows)
                # Let the WebSocket reader run between chunks.
                await asyncio.sleep(0)
            await db.execute(delete(SeaVesselCache).where(SeaVesselCache.updated_at < cutoff))
            await db.commit()
        return written

    async def load_snapshot(self, current_ms: int | None = None) -> int:
        """Warm the empty store from ``sea_vessel_cache``; returns vessels loaded.

        Only rows still inside the retention window are restored, and the store
        is left dirty=False so a persist immediately afterwards is a no-op.
        """
        current = current_ms if current_ms is not None else now_ms()
        cutoff = current - settings.sea_ais_stale_ms
        loaded = 0
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(SeaVesselCache).where(SeaVesselCache.updated_at >= cutoff))
            for cached in result.scalars().all():
                try:
                    record = json.loads(cached.payload)
                    samples = json.loads(cached.track)
                except (json.JSONDecodeError, TypeError):
                    continue
                if not isinstance(record, dict) or record.get("mmsi") != cached.mmsi:
                    continue
                record["_updatedAt"] = cached.updated_at
                self._vessels[cached.mmsi] = record
                track: deque[tuple[float, float, int]] = deque(maxlen=settings.sea_ais_track_samples)
                for sample in samples if isinstance(samples, list) else []:
                    if isinstance(sample, list) and len(sample) == 3:
                        track.append((float(sample[0]), float(sample[1]), int(sample[2])))
                self._tracks[cached.mmsi] = track
                position_ms = record.get("lastPositionMs")
                if isinstance(position_ms, int) and (
                    self.newest_position_ms is None or position_ms > self.newest_position_ms
                ):
                    self.newest_position_ms = position_ms
                loaded += 1
        self._dirty = False
        return loaded


def _inside_bbox(lat: float, lon: float, bbox: tuple[float, float, float, float]) -> bool:
    south, west, north, east = bbox
    if lat < south or lat > north:
        return False
    if west <= east:
        return west <= lon <= east
    # Antimeridian-crossing box: inside if east of `west` OR west of `east`.
    return lon >= west or lon <= east


def _public_record(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if not key.startswith("_")}


# Process-wide store shared by the AISStream reader and the Sea router.
store = AisVesselStore()
