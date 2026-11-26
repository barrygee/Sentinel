"""Space's answer to the globe's `space.globe.snapshot` request (ADR 0009).

Answered by `satellite_snapshot.satellite_snapshot`, the read behind the map's
`GET /api/space/satellite/{norad_id}`, once per chosen satellite: the same TLE
cache and upstream rules, the same propagation. An id Space has no TLE for is
reported back in `unknown`, not raised, so one stale choice never hides the
others.

Registered at import (this module is imported by `sentinel_space.module`).
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any

from backend.platform.bus import EventPayload, bus
from backend.platform.globe_snapshots import SPACE_MAX_SATELLITES, SPACE_SNAPSHOT_SUBJECT, responder_session

from sentinel_space.services import satellite_snapshot

logger = logging.getLogger(__name__)

_NORAD_ID_PATTERN = re.compile(r"^\d{1,9}$")


def _norad_ids(raw: Any) -> list[str]:
    """`noradIds` as up to `SPACE_MAX_SATELLITES` distinct digit strings, in the order given."""
    if not isinstance(raw, list) or len(raw) > SPACE_MAX_SATELLITES:
        raise ValueError(f"noradIds must be a list of at most {SPACE_MAX_SATELLITES} ids")
    norad_ids = [str(value) for value in raw]
    if any(
        isinstance(value, bool) or not _NORAD_ID_PATTERN.match(norad_id)
        for value, norad_id in zip(raw, norad_ids, strict=True)
    ):
        raise ValueError("noradIds must be NORAD catalogue numbers")
    if len(set(norad_ids)) != len(norad_ids):
        raise ValueError("noradIds must not repeat")
    return norad_ids


def _observer(payload: EventPayload) -> tuple[float | None, float | None]:
    """The optional observer `{lat, lon}` for look angles; both or neither."""
    lat, lon = payload.get("lat"), payload.get("lon")
    if lat is None and lon is None:
        return None, None
    for name, value, limit in (("lat", lat, 90), ("lon", lon, 180)):
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise ValueError(f"{name} must be a number")
        if not math.isfinite(value) or abs(value) > limit:
            raise ValueError(f"{name} is out of range")
    return float(lat), float(lon)  # type: ignore[arg-type]  # both checked numeric above


async def answer_space_snapshot(payload: EventPayload) -> dict[str, Any]:
    """Each of `{noradIds}` now, seen from the optional `{lat, lon}`.

    Reply: `{noTleData, satellites: [{noradId, name, position, ground_track,
    footprint}], unknown: [ids], failed: [ids]}`. `noTleData` is True when
    Space's TLE database is empty (the map's 503 case). `unknown` lists ids
    Space holds no TLE for: they are not fetched from the upstream, which the
    map's endpoint would try, because one mistyped id would then hold the
    whole layer past its timeout (the picker chooses from Space's own
    catalogue, so a real choice is always held). `failed` lists ids whose TLE
    couldn't be refreshed or whose propagation went wrong (logged here, never
    sent).
    """
    norad_ids = _norad_ids(payload.get("noradIds"))
    obs_lat, obs_lon = _observer(payload)
    satellites: list[dict[str, Any]] = []
    unknown: list[str] = []
    failed: list[str] = []
    async with responder_session(payload) as db:
        if await satellite_snapshot.tle_database_is_empty(db):
            return {"noTleData": True, "satellites": [], "unknown": [], "failed": []}
        held = await satellite_snapshot.held_norad_ids(db, norad_ids)
        # One at a time: they share the session, and each may refresh its TLE.
        for norad_id in norad_ids:
            if norad_id not in held:
                unknown.append(norad_id)
                continue
            try:
                snapshot = await satellite_snapshot.satellite_snapshot(norad_id, db, obs_lat, obs_lon)
            except RuntimeError as error:
                logger.warning("Globe satellite %s unavailable: %s", norad_id, error)
                failed.append(norad_id)
                continue
            except Exception:
                logger.exception("Globe satellite %s failed to propagate", norad_id)
                failed.append(norad_id)
                continue
            satellites.append({"noradId": norad_id, "name": snapshot.name, **snapshot.track})
    return {"noTleData": False, "satellites": satellites, "unknown": unknown, "failed": failed}


bus.reply(SPACE_SNAPSHOT_SUBJECT, answer_space_snapshot)
