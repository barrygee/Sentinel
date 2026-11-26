"""Land's answer to the globe's `land.globe.snapshot` request (ADR 0009).

Answered by `aprs_store.get_stations`, the read behind the map's
`GET /api/land/aprs/stations`: every station heard within the operator's
retention window, most recently heard first. Stations only exist while a radio
runs the APRS decoder, so an empty list is the normal answer otherwise.

Registered at import (this module is imported by `sentinel_land.module`).
"""

from __future__ import annotations

from itertools import islice
from typing import Any

from backend.cache import now_ms
from backend.platform.bus import EventPayload, bus
from backend.platform.globe_snapshots import LAND_MAX_ROWS, LAND_SNAPSHOT_SUBJECT, encode_rows, responder_session

from sentinel_land.services import aprs_store

STATION_FIELDS = (
    "callsign",
    "latitude",
    "longitude",
    "altitude",
    "course",
    "speed",
    "symbol",
    "comment",
    "last_heard_ms",
)
"""The station fields the globe draws and lists; `path` and `raw` stay in Land."""


async def answer_land_snapshot(payload: EventPayload) -> dict[str, Any]:
    """The APRS stations heard within retention, at most `LAND_MAX_ROWS`.

    Reply: `{stationCount, stations: {fields, rows, truncated}}`, where
    `stationCount` is every station in retention, before the cap.
    """
    async with responder_session(payload) as db:
        stations = await aprs_store.get_stations(now_ms(), db)
    return {
        "stationCount": len(stations),
        "stations": encode_rows(islice(stations, LAND_MAX_ROWS), STATION_FIELDS),
    }


bus.reply(LAND_SNAPSHOT_SUBJECT, answer_land_snapshot)
