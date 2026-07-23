"""APRS station store — persistence for stations heard by the Land APRS decoder.

The ``aprs-decoder`` sidecar (Direwolf) parses received packets and POSTs them to
the backend, which upserts each position-bearing station here (one row per
callsign, newest fix wins) so the Land map can plot the most recent position of
every station. Stations that have not been heard within the configured retention
window (``land``/``aprsRetentionMinutes``, default 5 min) are dropped by
:func:`cleanup_expired`, run from the periodic cleanup loop.

Kept deliberately small and self-contained (its own ``AsyncSessionLocal``
sessions) so it can be called from the ingest endpoint and the background sweep
alike, mirroring ``flight_history``.
"""

from __future__ import annotations

from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.db_helpers import get_setting
from backend.models import AprsStation
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession


async def _retention_ms(db: AsyncSession) -> int:
    """Resolve the APRS station retention window (ms) from the user setting.

    Reads ``land``/``aprsRetentionMinutes`` (minutes) and converts to ms; falls
    back to ``settings.aprs_station_ttl_ms`` (default 5 min) when unset, blank, or
    non-positive. This is read per query/sweep so a Settings change takes effect
    immediately without a restart.
    """
    raw = await get_setting(db, "land", "aprsRetentionMinutes", default=None)
    if raw is None:
        return settings.aprs_station_ttl_ms
    try:
        minutes = float(raw)
    except (TypeError, ValueError):
        return settings.aprs_station_ttl_ms
    if minutes <= 0:
        return settings.aprs_station_ttl_ms
    return int(minutes * 60_000)


def _coerce_float(value: object) -> float | None:
    """Return ``value`` as a float, or None if it is missing/non-numeric.

    APRS fields are optional and arrive from an external parser, so a bad or
    absent value must never raise — it simply means "not reported".
    """
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def station_from_event(event: dict) -> dict | None:
    """Extract the persistable station fields from a decoded APRS event.

    Returns None when the event lacks the callsign or a valid lat/lon (a status,
    message, or telemetry packet with no position is not plottable), so the
    caller can skip the upsert. ``from`` carries the source callsign in the
    aprslib-parsed payload.
    """
    callsign = event.get("from") or event.get("callsign")
    latitude = _coerce_float(event.get("latitude"))
    longitude = _coerce_float(event.get("longitude"))
    if not callsign or latitude is None or longitude is None:
        return None
    return {
        "callsign": str(callsign),
        "latitude": latitude,
        "longitude": longitude,
        "symbol": event.get("symbol"),
        "comment": event.get("comment"),
        "course": _coerce_float(event.get("course")),
        "speed": _coerce_float(event.get("speed")),
        "altitude": _coerce_float(event.get("altitude")),
        "path": event.get("path"),
        "raw": event.get("raw"),
    }


async def upsert_station(station: dict, now_ms: int, db: AsyncSession | None = None) -> None:
    """Insert or update one station's latest fix, keyed by callsign.

    ``station`` is a dict as returned by :func:`station_from_event`. An existing
    row for the callsign is overwritten with the new fix; otherwise a new row is
    created. A session may be injected (tests); otherwise one is opened here.
    """
    if db is not None:
        await _upsert_station(db, station, now_ms)
        return
    async with AsyncSessionLocal() as session:
        await _upsert_station(session, station, now_ms)
        await session.commit()


async def _upsert_station(db: AsyncSession, station: dict, now_ms: int) -> None:
    existing = (
        await db.execute(select(AprsStation).where(AprsStation.callsign == station["callsign"]))
    ).scalar_one_or_none()
    if existing is None:
        db.add(AprsStation(last_heard_ms=now_ms, **station))
        return
    for field_name, value in station.items():
        setattr(existing, field_name, value)
    existing.last_heard_ms = now_ms


def _station_to_dict(row: AprsStation) -> dict:
    """Serialise a station row for the Land map API (JSON-friendly keys)."""
    return {
        "callsign": row.callsign,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "symbol": row.symbol,
        "comment": row.comment,
        "course": row.course,
        "speed": row.speed,
        "altitude": row.altitude,
        "path": row.path,
        "raw": row.raw,
        "last_heard_ms": row.last_heard_ms,
    }


async def get_stations(now_ms: int, db: AsyncSession | None = None) -> list[dict]:
    """Return every non-expired station, most-recently-heard first.

    Stations older than ``aprs_station_ttl_ms`` are excluded (and swept
    separately), so a caller polling this always sees the current picture.
    """
    if db is not None:
        return await _get_stations(db, now_ms)
    async with AsyncSessionLocal() as session:
        return await _get_stations(session, now_ms)


async def _get_stations(db: AsyncSession, now_ms: int) -> list[dict]:
    cutoff = now_ms - await _retention_ms(db)
    rows = (
        (
            await db.execute(
                select(AprsStation)
                .where(AprsStation.last_heard_ms >= cutoff)
                .order_by(AprsStation.last_heard_ms.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_station_to_dict(row) for row in rows]


async def cleanup_expired(now_ms: int, db: AsyncSession | None = None) -> int:
    """Delete stations not heard within the TTL. Returns the number removed."""
    if db is not None:
        return await _cleanup_expired(db, now_ms)
    async with AsyncSessionLocal() as session:
        removed = await _cleanup_expired(session, now_ms)
        await session.commit()
        return removed


async def _cleanup_expired(db: AsyncSession, now_ms: int) -> int:
    cutoff = now_ms - await _retention_ms(db)
    result = await db.execute(delete(AprsStation).where(AprsStation.last_heard_ms < cutoff))
    return result.rowcount or 0
