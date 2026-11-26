"""Sea's answer to the globe's `sea.globe.snapshot` request (ADR 0009).

Answered by `vessel_snapshot.vessel_snapshot`, the read behind the map's
`GET /api/sea/vessels`: the same feed nudge (AISStream online, the SDR decoder
off grid, never AISStream off grid) and the same store query, newest position
first. Only the fields the globe draws and lists cross the bus, as compact
rows, so a full view stays well inside NATS's 1 MB message limit.

Registered at import (this module is imported by `sentinel_sea.module`).
"""

from __future__ import annotations

import math
from typing import Any

from backend.platform.bus import EventPayload, bus
from backend.platform.globe_snapshots import SEA_MAX_ROWS, SEA_SNAPSHOT_SUBJECT, encode_rows, responder_session

from sentinel_sea.services import vessel_snapshot

VESSEL_FIELDS = (
    "mmsi",
    "name",
    "typeLabel",
    "family",
    "lat",
    "lon",
    "sog",
    "cog",
    "heading",
    "lastPositionMs",
)
"""The vessel record fields the globe draws and lists; the rest stay in Sea."""

FEED_FIELDS = ("mode", "status", "error", "newestPositionAt", "vesselCount")
"""The feed status fields the globe reports beside the vessels."""


def _bbox(raw: Any) -> vessel_snapshot.Bbox | None:
    """`[south, west, north, east]` checked like the map's bbox; None for everywhere."""
    if raw is None:
        return None
    if not isinstance(raw, list) or len(raw) != 4:
        raise ValueError("bbox must be [south, west, north, east]")
    if any(isinstance(value, bool) or not isinstance(value, int | float) for value in raw):
        raise ValueError("bbox values must be numbers")
    if not all(math.isfinite(value) for value in raw):
        raise ValueError("bbox values must be finite")
    # The map's own parser holds the range rules, so both callers share them.
    return vessel_snapshot.parse_bbox(",".join(str(value) for value in raw))


def _max_rows(raw: Any) -> int:
    """`maxRows` as an int in 1..`SEA_MAX_ROWS`; missing means the cap."""
    if raw is None:
        return SEA_MAX_ROWS
    if isinstance(raw, bool) or not isinstance(raw, int) or not 1 <= raw <= SEA_MAX_ROWS:
        raise ValueError(f"maxRows must be an integer from 1 to {SEA_MAX_ROWS}")
    return raw


async def answer_sea_snapshot(payload: EventPayload) -> dict[str, Any]:
    """The vessels inside `{bbox}`, at most `{maxRows}`, with the active feed's status.

    Reply: `{feed: {mode, status, error, newestPositionAt, vesselCount},
    vessels: {fields, rows, truncated}}`. A malformed request raises
    `ValueError`, which the bus returns to the globe as an error.
    """
    bbox = _bbox(payload.get("bbox"))
    max_rows = _max_rows(payload.get("maxRows"))
    async with responder_session(payload) as db:
        vessels, feed = await vessel_snapshot.vessel_snapshot(db, max_rows, bbox)
    return {
        "feed": {field: feed.get(field) for field in FEED_FIELDS},
        "vessels": encode_rows(vessels, VESSEL_FIELDS),
    }


bus.reply(SEA_SNAPSHOT_SUBJECT, answer_sea_snapshot)
