"""Air's ADS-B snapshot cache: one `adsb_cache` row per queried point and radius.

Shared by the map's endpoint and the background squawk watcher, so every
snapshot Sentinel spends an online call on can stand in for the map — the
watcher's included, which otherwise only fed the squawk alerts and was thrown
away while the map, refused the next call slot, had nothing to show.
"""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_air.models import AdsbCache


def cache_key(lat: float, lon: float, radius: int) -> str:
    """The row's key, e.g. `54.1453_-4.4815_250`: four decimals is about 10 m."""
    return f"{lat:.4f}_{lon:.4f}_{radius}"


async def find_snapshot(db: AsyncSession, lat: float, lon: float, radius: int) -> AdsbCache | None:
    """The cached row for exactly this point and radius, fresh or not."""
    result = await db.execute(select(AdsbCache).where(AdsbCache.cache_key == cache_key(lat, lon, radius)))
    return result.scalar_one_or_none()


def store_snapshot(
    db: AsyncSession,
    existing_row: AdsbCache | None,
    lat: float,
    lon: float,
    radius: int,
    snapshot: dict,
    fetched_at_ms: int,
    fresh_for_ms: int,
) -> None:
    """Stage `snapshot` as the row for this point: `existing_row` updated, or a new one added.

    Not committed: the caller decides what a failed commit means (the map
    still serves its fresh data; the watcher just tries again next time).
    """
    payload = json.dumps(snapshot)
    aircraft_count = len(snapshot.get("ac", []))
    if existing_row is not None:
        existing_row.payload = payload
        existing_row.ac_count = aircraft_count
        existing_row.fetched_at = fetched_at_ms
        existing_row.expires_at = fetched_at_ms + fresh_for_ms
        return
    db.add(
        AdsbCache(
            cache_key=cache_key(lat, lon, radius),
            lat=lat,
            lon=lon,
            radius_nm=radius,
            payload=payload,
            ac_count=aircraft_count,
            fetched_at=fetched_at_ms,
            expires_at=fetched_at_ms + fresh_for_ms,
        )
    )
