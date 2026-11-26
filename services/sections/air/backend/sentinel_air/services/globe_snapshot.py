"""Air's answer to the globe's `air.globe.snapshot` request (ADR 0009).

The globe asks for the aircraft around home (`{lat, lon}`, radius
`AIR_RADIUS_NM`), the same centre as Air's alerts service, and is answered by
`adsb_point.aircraft_near_point`, the function behind the map's endpoint. So the
off-grid receiver centre, the cache states, the online feed's daily quota and
the per-host rate limiter are the map's own: the globe adds no upstream call
that the map's polling wouldn't have made, and it counts as an open map for the
squawk watcher, as the map does.

Registered at import (this module is imported by `sentinel_air.module`), like
every bus responder, so it is in place in the Air service and the test app.
"""

from __future__ import annotations

import math
from typing import Any

from backend.platform.bus import EventPayload, bus
from backend.platform.globe_snapshots import AIR_RADIUS_NM, AIR_SNAPSHOT_SUBJECT, encode_rows, responder_session

from sentinel_air.services import adsb_point

AIRCRAFT_FIELDS = (
    "hex",
    "flight",
    "r",
    "t",
    "lat",
    "lon",
    "alt_baro",
    "gs",
    "track",
    "squawk",
    "category",
    "emergency",
    "dbFlags",
    "seen_pos",
)
"""The readsb fields the globe draws and lists; every other field of the feed stays in Air."""


def _coordinate(payload: EventPayload, name: str, limit: float) -> float:
    """`payload[name]` as a finite float within ±`limit`, or `ValueError`."""
    value = payload.get(name)
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError(f"{name} must be a number")
    number = float(value)
    if not math.isfinite(number) or abs(number) > limit:
        raise ValueError(f"{name} is out of range")
    return number


def _positioned(aircraft: Any) -> bool:
    """Only aircraft with a position can go on a globe."""
    return (
        isinstance(aircraft, dict)
        and isinstance(aircraft.get("lat"), int | float)
        and isinstance(aircraft.get("lon"), int | float)
    )


async def answer_air_snapshot(payload: EventPayload) -> dict[str, Any]:
    """The aircraft around `{lat, lon}`, compact, with the snapshot's cache facts.

    Reply: `{cacheState, snapshotAgeMs, snapshotLifetimeMs, unavailableReason,
    retryAfterSeconds, aircraft: {fields, rows, truncated}}`. When nothing could
    be served (`unavailableReason` set), `aircraft` has no rows. A malformed
    request raises `ValueError`, which the bus returns to the globe as an error.
    """
    lat = _coordinate(payload, "lat", 90)
    lon = _coordinate(payload, "lon", 180)
    async with responder_session(payload) as db:
        snapshot = await adsb_point.aircraft_near_point(db, lat, lon, AIR_RADIUS_NM)
    aircraft = (snapshot.aircraft_snapshot or {}).get("ac") or []
    return {
        "cacheState": snapshot.cache_state,
        "snapshotAgeMs": snapshot.age_ms,
        "snapshotLifetimeMs": snapshot.lifetime_ms,
        "unavailableReason": snapshot.unavailable_reason,
        "retryAfterSeconds": snapshot.retry_after_seconds,
        "aircraft": encode_rows((entry for entry in aircraft if _positioned(entry)), AIRCRAFT_FIELDS),
    }


bus.reply(AIR_SNAPSHOT_SUBJECT, answer_air_snapshot)
