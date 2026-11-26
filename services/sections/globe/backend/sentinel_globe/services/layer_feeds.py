"""One request per layer to the section that owns it, turned into a `LayerResult`.

Each `load_*` function sends its section's `<section>.globe.snapshot` request
over the bus (ADR 0009) with its own timeout, and never raises: a section that
is not deployed, is down, answers too late or answers with something unusable
becomes `status: unavailable` with a reason from a fixed vocabulary. The
detail goes to the log, never to the browser.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from typing import Any, TypeVar

from backend.platform.bus import bus
from backend.platform.globe_snapshots import (
    AIR_SNAPSHOT_SUBJECT,
    LAND_SNAPSHOT_SUBJECT,
    SEA_MAX_ROWS,
    SEA_SNAPSHOT_SUBJECT,
    SPACE_SNAPSHOT_SUBJECT,
    decode_rows,
)
from pydantic import BaseModel, ValidationError

from sentinel_globe.schemas import (
    AircraftItem,
    AprsStationItem,
    LayerResult,
    SatelliteItem,
    SatellitePosition,
    VesselItem,
)

logger = logging.getLogger(__name__)

AIR_TIMEOUT_S = 4.0
"""Air may have to make its one online call for this interval, which has its own short timeout."""

SEA_TIMEOUT_S = 3.0
LAND_TIMEOUT_S = 3.0

SPACE_TIMEOUT_S = 8.0
"""Up to twelve propagations, each possibly refreshing an expired TLE first."""

Bbox = tuple[float, float, float, float]
Item = TypeVar("Item", bound=BaseModel)

# readsb's aircraft-database flag for a military airframe (bit 1 of `dbFlags`).
_DB_FLAG_MILITARY = 1


def unavailable(reason: str, **meta: Any) -> LayerResult:
    """A layer with no items and why, e.g. `unavailable("timeout")`."""
    return LayerResult(status="unavailable", reason=reason, meta=meta)


async def _ask(layer: str, subject: str, payload: dict[str, Any], timeout_s: float) -> dict[str, Any] | LayerResult:
    """The section's reply, or the unavailable `LayerResult` that stands for its failure."""
    try:
        reply = await bus.request(subject, payload, timeout=timeout_s)
    except LookupError:
        # No responder: the section isn't deployed or isn't connected to NATS.
        return unavailable("section-unavailable")
    except TimeoutError:
        logger.warning("Globe %s layer: no reply on %s within %s s", layer, subject, timeout_s)
        return unavailable("timeout")
    except Exception as error:
        # A remote handler failure, or (in one process) the responder's own error.
        logger.warning("Globe %s layer: %s failed (%s: %s)", layer, subject, type(error).__name__, error)
        return unavailable("error")
    if not isinstance(reply, dict):
        logger.warning("Globe %s layer: %s answered with %s, not an object", layer, subject, type(reply).__name__)
        return unavailable("error")
    return reply


def _items(layer: str, records: Iterable[dict[str, Any]], build: Callable[[dict[str, Any]], Item]) -> list[Item]:
    """Build one item per record, skipping (and counting in the log) any that don't fit the model."""
    items: list[Item] = []
    skipped = 0
    for record in records:
        try:
            items.append(build(record))
        except (ValidationError, TypeError, ValueError):
            skipped += 1
    if skipped:
        logger.debug("Globe %s layer: skipped %d malformed items", layer, skipped)
    return items


def _number(value: Any) -> float | None:
    """A finite-looking number, or None for anything else (readsb mixes in strings like 'ground')."""
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


def _stripped(value: Any) -> str | None:
    """A non-empty stripped string, or None (callsigns arrive space-padded)."""
    return (value.strip() or None) if isinstance(value, str) else None


def _aircraft(record: dict[str, Any]) -> AircraftItem:
    altitude = record.get("alt_baro")
    on_ground = altitude == "ground"
    flags = record.get("dbFlags")
    return AircraftItem(
        hex=str(record["hex"]).lower(),
        callsign=_stripped(record.get("flight")),
        registration=_stripped(record.get("r")),
        typeCode=_stripped(record.get("t")),
        lat=record["lat"],
        lon=record["lon"],
        altitudeFt=0.0 if on_ground else _number(altitude),
        onGround=on_ground,
        groundSpeedKt=_number(record.get("gs")),
        trackDeg=_number(record.get("track")),
        squawk=_stripped(record.get("squawk")),
        category=_stripped(record.get("category")),
        emergency=_stripped(record.get("emergency")),
        military=isinstance(flags, int) and bool(flags & _DB_FLAG_MILITARY),
        seenPosSeconds=_number(record.get("seen_pos")),
    )


def _vessel(record: dict[str, Any]) -> VesselItem:
    return VesselItem(
        mmsi=str(record["mmsi"]),
        name=_stripped(record.get("name")),
        typeLabel=_stripped(record.get("typeLabel")),
        family=_stripped(record.get("family")),
        lat=record["lat"],
        lon=record["lon"],
        speedKt=_number(record.get("sog")),
        courseDeg=_number(record.get("cog")),
        headingDeg=_number(record.get("heading")),
        lastPositionMs=record.get("lastPositionMs"),
    )


def _station(record: dict[str, Any]) -> AprsStationItem:
    return AprsStationItem(
        callsign=str(record["callsign"]),
        lat=record["latitude"],
        lon=record["longitude"],
        altitudeM=_number(record.get("altitude")),
        courseDeg=_number(record.get("course")),
        speedKmh=_number(record.get("speed")),
        symbol=record.get("symbol"),
        comment=record.get("comment"),
        lastHeardMs=record.get("last_heard_ms"),
    )


def _satellite(record: dict[str, Any]) -> SatelliteItem:
    position = record["position"]
    return SatelliteItem(
        noradId=str(record["noradId"]),
        name=str(record.get("name") or record["noradId"]),
        position=SatellitePosition(
            lat=position["lat"],
            lon=position["lon"],
            altKm=position["alt_km"],
            velocityKms=_number(position.get("velocity_kms")),
            trackDeg=_number(position.get("track_deg")),
            azimuthDeg=_number(position.get("az")),
            elevationDeg=_number(position.get("el")),
        ),
        groundTrack=record["ground_track"],
        footprint=record["footprint"],
    )


def _decoded(layer: str, reply: dict[str, Any], key: str) -> list[dict[str, Any]] | None:
    """`reply[key]`'s compact rows as dicts, or None (logged) when they're malformed."""
    encoded = reply.get(key)
    try:
        if not isinstance(encoded, dict):
            raise ValueError(f"{key} is missing")
        return decode_rows(encoded)
    except ValueError as error:
        logger.warning("Globe %s layer: unusable reply (%s)", layer, error)
        return None


async def load_air(lat: float | None, lon: float | None) -> LayerResult:
    """Aircraft around home (`lat`, `lon`), from Air's cached snapshot for that centre."""
    if lat is None or lon is None:
        return unavailable("no-location")
    reply = await _ask("air", AIR_SNAPSHOT_SUBJECT, {"lat": lat, "lon": lon}, AIR_TIMEOUT_S)
    if isinstance(reply, LayerResult):
        return reply
    meta = {
        "cacheState": reply.get("cacheState"),
        "snapshotAgeMs": reply.get("snapshotAgeMs"),
        "snapshotLifetimeMs": reply.get("snapshotLifetimeMs"),
    }
    reason = reply.get("unavailableReason")
    if isinstance(reason, str) and reason:
        return unavailable(reason, retryAfterSeconds=reply.get("retryAfterSeconds"), **meta)
    records = _decoded("air", reply, "aircraft")
    if records is None:
        return unavailable("error")
    meta["truncated"] = bool(reply["aircraft"].get("truncated"))
    return LayerResult(status="ok", items=_items("air", records, _aircraft), meta=meta)


async def load_sea(bbox: Bbox | None) -> LayerResult:
    """Vessels inside `bbox` (everywhere when None), newest first, from Sea's store."""
    payload = {"bbox": list(bbox) if bbox is not None else None, "maxRows": SEA_MAX_ROWS}
    reply = await _ask("sea", SEA_SNAPSHOT_SUBJECT, payload, SEA_TIMEOUT_S)
    if isinstance(reply, LayerResult):
        return reply
    records = _decoded("sea", reply, "vessels")
    if records is None:
        return unavailable("error")
    feed = reply.get("feed") if isinstance(reply.get("feed"), dict) else {}
    meta = {"feed": feed, "truncated": bool(reply["vessels"].get("truncated"))}
    return LayerResult(status="ok", items=_items("sea", records, _vessel), meta=meta)


async def load_aprs() -> LayerResult:
    """APRS stations heard within Land's retention window, most recent first."""
    reply = await _ask("aprs", LAND_SNAPSHOT_SUBJECT, {}, LAND_TIMEOUT_S)
    if isinstance(reply, LayerResult):
        return reply
    records = _decoded("aprs", reply, "stations")
    if records is None:
        return unavailable("error")
    meta = {"stationCount": reply.get("stationCount"), "truncated": bool(reply["stations"].get("truncated"))}
    return LayerResult(status="ok", items=_items("aprs", records, _station), meta=meta)


async def load_space(norad_ids: tuple[str, ...], lat: float | None, lon: float | None) -> LayerResult:
    """Each chosen satellite's position, ground track and footprint, seen from home when known."""
    if not norad_ids:
        return LayerResult(status="ok", meta={"unknown": [], "failed": []})
    payload: dict[str, Any] = {"noradIds": list(norad_ids)}
    if lat is not None and lon is not None:
        payload.update(lat=lat, lon=lon)
    reply = await _ask("space", SPACE_SNAPSHOT_SUBJECT, payload, SPACE_TIMEOUT_S)
    if isinstance(reply, LayerResult):
        return reply
    if reply.get("noTleData"):
        return unavailable("no-tle-data")
    satellites = reply.get("satellites")
    if not isinstance(satellites, list):
        logger.warning("Globe space layer: unusable reply (satellites is missing)")
        return unavailable("error")
    meta = {"unknown": reply.get("unknown") or [], "failed": reply.get("failed") or []}
    return LayerResult(status="ok", items=_items("space", satellites, _satellite), meta=meta)
