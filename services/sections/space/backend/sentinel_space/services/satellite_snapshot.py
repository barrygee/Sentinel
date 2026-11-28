"""Space's satellite read: the one both its routes share.

`GET /api/space/satellite/{norad_id}` and `/api/space/iss` answer from
`satellite_snapshot`, so the TLE comes through the same cache, upstream and
fallback rules (`tle_service.fetch_tle`) and is propagated the same way.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from backend.utils import resolve_domain_urls
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_space.models import TleCache
from sentinel_space.services import satellite as sat_service
from sentinel_space.services import tle as tle_service


@dataclass(frozen=True)
class SatelliteSnapshot:
    """One satellite now: its TLE name and the map's `{position, ground_track, footprint}` document."""

    name: str
    track: dict


async def tle_database_is_empty(db: AsyncSession) -> bool:
    """Return True if the TLE cache table contains no rows."""
    result = await db.execute(select(func.count()).select_from(TleCache))
    return result.scalar() == 0


async def held_norad_ids(db: AsyncSession, norad_ids: list[str]) -> set[str]:
    """The ids among `norad_ids` that the TLE cache holds a row for, fresh or not."""
    result = await db.execute(select(TleCache.cache_key).where(TleCache.cache_key.in_(norad_ids)))
    return set(result.scalars().all())


async def satellite_snapshot(
    norad_id: str,
    db: AsyncSession,
    obs_lat: float | None = None,
    obs_lon: float | None = None,
) -> SatelliteSnapshot:
    """Fetch TLE, propagate position/track/footprint for any satellite.

    When an observer location is supplied, the live position is annotated with
    observer-relative look angles (az/el) so the sky-plot marker is exact.

    Raises RuntimeError if TLE is unavailable, or re-raises other exceptions.
    """
    primary_url, fallback_url = await resolve_domain_urls("space", db)
    tle_text = await tle_service.fetch_tle(norad_id, db, primary_url, fallback_url)
    name, line1, line2 = tle_service.parse_tle_lines(tle_text)

    # SGP4 propagation is CPU-bound (the ground track alone is ~1,440
    # propagations), so it runs in a worker thread to keep the event loop free
    # for other requests. Only plain strings and floats cross the thread boundary.
    track = await asyncio.to_thread(_propagate_satellite, line1, line2, obs_lat, obs_lon)
    return SatelliteSnapshot(name=name, track=track)


def _propagate_satellite(
    line1: str,
    line2: str,
    obs_lat: float | None,
    obs_lon: float | None,
) -> dict:
    """Compute position, ground track, footprint and optional look angles from TLE lines.

    Synchronous and free of loop-bound state, so it is safe to run in a worker thread.
    """
    position = sat_service.compute_position(line1, line2)
    ground_track = sat_service.compute_ground_track(line1, line2)
    footprint = sat_service.compute_footprint(position["lat"], position["lon"], position["alt_km"])
    if obs_lat is not None and obs_lon is not None:
        position.update(
            sat_service.compute_look_angles(
                position["lat"],
                position["lon"],
                position["alt_km"],
                obs_lat,
                obs_lon,
            )
        )
    return {"position": position, "ground_track": ground_track, "footprint": footprint}
