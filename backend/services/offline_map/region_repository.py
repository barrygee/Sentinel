"""Data access for :class:`backend.models.OfflineMapRegion`.

Kept as a thin repository layer over the ORM so the router and the job runner
never build SQL/ORM queries inline — every read/write to the region table goes
through here. Filenames are always derived from ``region.id`` under
``resolved_offline_tiles_dir()`` (see :mod:`backend.services.offline_map.job_runner`);
callers never accept or construct a path from client input.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

from backend.database import AsyncSessionLocal
from backend.models import OfflineMapRegion
from sqlalchemy import delete, func, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

# Terminal states — a region in one of these is not running or queued.
TERMINAL_STATUSES = ("complete", "failed", "cancelled")
OUTSTANDING_STATUSES = ("queued", "running")


@dataclass(frozen=True)
class NewRegionRequest:
    """Validated fields needed to create a region row (mirrors the API's AreaRequest + label)."""

    label: str
    west: float
    south: float
    east: float
    north: float
    max_zoom: int
    include_basemap: bool
    include_terrain: bool
    bytes_estimated: int
    tiles_estimated: int
    source_url: str


async def create_region(db: AsyncSession, request: NewRegionRequest) -> OfflineMapRegion:
    """Insert a new region row in status 'queued' and return it."""
    region = OfflineMapRegion(
        id=str(uuid.uuid4()),
        label=request.label,
        west=request.west,
        south=request.south,
        east=request.east,
        north=request.north,
        max_zoom=request.max_zoom,
        include_basemap=request.include_basemap,
        include_terrain=request.include_terrain,
        status="queued",
        phase=None,
        bytes_done=0,
        bytes_estimated=request.bytes_estimated,
        tiles_estimated=request.tiles_estimated,
        size_bytes=None,
        error=None,
        source_url=request.source_url,
        created_at=int(time.time() * 1000),
        completed_at=None,
    )
    db.add(region)
    await db.commit()
    await db.refresh(region)
    return region


async def get_region(db: AsyncSession, region_id: str) -> OfflineMapRegion | None:
    result = await db.execute(select(OfflineMapRegion).where(OfflineMapRegion.id == region_id))
    return result.scalar_one_or_none()


async def list_regions(db: AsyncSession) -> list[OfflineMapRegion]:
    """All regions, newest first (per the API contract)."""
    result = await db.execute(select(OfflineMapRegion).order_by(OfflineMapRegion.created_at.desc()))
    return list(result.scalars().all())


async def list_all_region_ids(db: AsyncSession) -> set[str]:
    """Every region id regardless of status — used by the startup orphan-file
    sweep to tell a legitimate archive from a leftover with no matching row."""
    result = await db.execute(select(OfflineMapRegion.id))
    return set(result.scalars().all())


async def list_completed_archives(db: AsyncSession, *, terrain: bool) -> list[tuple[str, int]]:
    """(region_id, completed_at) for completed regions that include this tier,
    newest completed_at first — the tile resolver's tier order."""
    column = OfflineMapRegion.include_terrain if terrain else OfflineMapRegion.include_basemap
    result = await db.execute(
        select(OfflineMapRegion.id, OfflineMapRegion.completed_at)
        .where(OfflineMapRegion.status == "complete", column.is_(True))
        .order_by(OfflineMapRegion.completed_at.desc())
    )
    return [(row_id, completed_at) for row_id, completed_at in result.all()]


async def count_outstanding(db: AsyncSession) -> int:
    """Number of regions currently queued or running — the cap POST /regions enforces."""
    result = await db.execute(
        select(func.count()).select_from(OfflineMapRegion).where(OfflineMapRegion.status.in_(OUTSTANDING_STATUSES))
    )
    return int(result.scalar_one())


async def sum_outstanding_remaining_bytes(db: AsyncSession) -> int:
    """Sum of (bytes_estimated - bytes_done) over every queued/running region —
    what the disk-space gate must additionally reserve for jobs already ahead
    of a new request in the queue, not just the new request's own estimate."""
    result = await db.execute(
        select(OfflineMapRegion.bytes_estimated, OfflineMapRegion.bytes_done).where(
            OfflineMapRegion.status.in_(OUTSTANDING_STATUSES)
        )
    )
    return sum(max(0, estimated - done) for estimated, done in result.all())


async def delete_region(db: AsyncSession, region_id: str) -> None:
    await db.execute(delete(OfflineMapRegion).where(OfflineMapRegion.id == region_id))
    await db.commit()


async def update_region(db: AsyncSession, region_id: str, **fields: object) -> bool:
    """Patch arbitrary columns on a region row by id with a single atomic
    UPDATE ... WHERE id = :region_id (no read-modify-write gap for a
    concurrent DELETE to land in). Returns True if a row was found and
    updated, False if the id no longer exists (e.g. the region was deleted
    while a job was finishing) — callers use this to detect and unwind that
    race rather than silently writing into a void."""
    if not fields:
        return await get_region(db, region_id) is not None
    result = await db.execute(sa_update(OfflineMapRegion).where(OfflineMapRegion.id == region_id).values(**fields))
    await db.commit()
    return result.rowcount > 0


async def mark_stale_jobs_failed_on_startup() -> list[str]:
    """Startup recovery: any row still 'queued' or 'running' from a previous
    process (crash, or a --reload that didn't shut down cleanly) can never
    finish — its subprocess is gone. Mark them failed and return their ids so
    the caller can also remove any part/final files left behind.

    Uses its own session because it runs before any request-scoped session
    exists (called from `lifespan`, mirroring other startup steps in
    backend/database.py).
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(OfflineMapRegion).where(OfflineMapRegion.status.in_(OUTSTANDING_STATUSES)))
        stale = list(result.scalars().all())
        stale_ids = [region.id for region in stale]
        for region in stale:
            region.status = "failed"
            region.phase = None
            region.error = "Interrupted by a server restart."
            region.completed_at = int(time.time() * 1000)
        await db.commit()
    return stale_ids
