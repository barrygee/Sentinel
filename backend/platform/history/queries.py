"""Bounded reads of a section's history table: samples for replay, coverage for the timeline, status for Settings.

Every read is capped: a window of 30 minutes at most per call, a row limit,
a validated bounding box, and times clamped to the retention window. A replay
client pages through history in chunks rather than asking for a week at once.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any

from backend.platform.history.retention import retention_cutoff_ms
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

MAX_WINDOW_MS = 30 * 60 * 1000
MAX_LOOKBACK_MS = 60 * 60 * 1000
DEFAULT_MAX_ROWS = 100_000
MAX_COVERAGE_SPAN_MS = 8 * 24 * 60 * 60 * 1000
COVERAGE_BUCKET_MS = 60 * 1000
# A coarser bucket for long coverage spans keeps the reply small (a week of
# minutes would be ~10k buckets). The timeline shades bands, not minutes.
COVERAGE_MAX_BUCKETS = 2_000


class HistoryQueryError(ValueError):
    """A request outside the bounds; the router turns it into a 422."""


@dataclass(frozen=True)
class BoundingBox:
    """south, west, north, east in degrees. ``west > east`` means it crosses the antimeridian."""

    south: float
    west: float
    north: float
    east: float


def parse_bbox(raw: str | None) -> BoundingBox | None:
    """Parse ``"s,w,n,e"`` (the order Sea's vessel endpoint already uses); None/empty means everywhere."""
    if raw is None or raw.strip() == "":
        return None
    parts = raw.split(",")
    if len(parts) != 4:
        raise HistoryQueryError("bbox must be south,west,north,east")
    try:
        south, west, north, east = (float(part) for part in parts)
    except ValueError as error:
        raise HistoryQueryError("bbox values must be numbers") from error
    if not all(math.isfinite(value) for value in (south, west, north, east)):
        raise HistoryQueryError("bbox values must be finite")
    if not (-90 <= south <= north <= 90):
        raise HistoryQueryError("bbox latitudes must satisfy -90 <= south <= north <= 90")
    if not (-180 <= west <= 180 and -180 <= east <= 180):
        raise HistoryQueryError("bbox longitudes must be within -180..180")
    return BoundingBox(south, west, north, east)


def clamp_window(from_ms: int, to_ms: int, now_ms: int, retention_days: int, max_span_ms: int) -> tuple[int, int]:
    """Validate a [from, to] window and clamp it to what retention can hold."""
    if to_ms < from_ms:
        raise HistoryQueryError("'to' must not be before 'from'")
    if to_ms - from_ms > max_span_ms:
        raise HistoryQueryError(f"window must be at most {max_span_ms // 1000} s")
    oldest = retention_cutoff_ms(now_ms, retention_days)
    return max(from_ms, oldest), min(to_ms, now_ms)


def _bbox_clause(model: type, bbox: BoundingBox | None) -> Any:
    if bbox is None:
        return None
    latitude = model.lat.between(bbox.south, bbox.north)
    if bbox.west <= bbox.east:
        return and_(latitude, model.lon.between(bbox.west, bbox.east))
    return and_(latitude, or_(model.lon >= bbox.west, model.lon <= bbox.east))


def sample_to_wire(row: Any) -> dict[str, Any]:
    """One stored row in the compact shape the replay player reads."""
    return {
        "t": row.t_ms,
        "lat": row.lat,
        "lon": row.lon,
        "alt": row.alt,
        "heading": row.heading,
        "speed": row.speed,
        "source": row.source_mode,
        "extra": json.loads(row.extra) if row.extra else None,
    }


async def fetch_samples(
    db: AsyncSession,
    model: type,
    from_ms: int,
    to_ms: int,
    bbox: BoundingBox | None = None,
    max_rows: int = DEFAULT_MAX_ROWS,
) -> dict[str, Any]:
    """Every sample in [from, to], grouped by entity and ordered by time.

    ``truncated`` is true when ``max_rows`` cut the reply short (the oldest
    rows are kept, so the player still has a correct start state and simply
    pages on from the last time it received).
    """
    clauses = [model.t_ms >= from_ms, model.t_ms <= to_ms]
    area = _bbox_clause(model, bbox)
    if area is not None:
        clauses.append(area)
    statement = select(model).where(*clauses).order_by(model.t_ms, model.id).limit(max_rows + 1)
    rows = (await db.execute(statement)).scalars().all()
    truncated = len(rows) > max_rows
    rows = rows[:max_rows]
    entities: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        entities.setdefault(row.entity_id, []).append(sample_to_wire(row))
    return {
        "from": from_ms,
        "to": rows[-1].t_ms if truncated else to_ms,
        "truncated": truncated,
        "entities": entities,
    }


def coverage_bucket_ms(span_ms: int) -> int:
    """The smallest whole-minute bucket that keeps a span under the bucket cap."""
    minutes_per_bucket = max(1, math.ceil(span_ms / COVERAGE_BUCKET_MS / COVERAGE_MAX_BUCKETS))
    return minutes_per_bucket * COVERAGE_BUCKET_MS


async def fetch_coverage(db: AsyncSession, model: type, from_ms: int, to_ms: int) -> dict[str, Any]:
    """Which time buckets hold data, and from which source, for shading the timeline.

    Each bucket is ``[start_ms, samples, source]``; a bucket heard from both
    sources appears once per source, so the client can tint a switch.
    """
    bucket_ms = coverage_bucket_ms(max(0, to_ms - from_ms))
    # SQLAlchemy 2 makes "/" true division even on integers; "//" floors.
    bucket_start = (model.t_ms // bucket_ms) * bucket_ms
    statement = (
        select(bucket_start.label("bucket"), func.count().label("samples"), model.source_mode)
        .where(model.t_ms >= from_ms, model.t_ms <= to_ms)
        .group_by("bucket", model.source_mode)
        .order_by("bucket")
    )
    rows = (await db.execute(statement)).all()
    return {
        "from": from_ms,
        "to": to_ms,
        "bucketMs": bucket_ms,
        "buckets": [[int(row.bucket), int(row.samples), row.source_mode] for row in rows],
    }


async def database_size_bytes(db: AsyncSession) -> int:
    """Size of the section's whole database file: history plus everything else the section keeps (Air's ADS-B cache)."""
    page_count = (await db.execute(text("PRAGMA page_count"))).scalar() or 0
    page_size = (await db.execute(text("PRAGMA page_size"))).scalar() or 0
    return int(page_count) * int(page_size)


async def table_size_bytes(db: AsyncSession, table_name: str) -> int | None:
    """Bytes one table and its indexes take on disk, or None when SQLite can't say.

    Reads the ``dbstat`` virtual table, which the backend image's SQLite has
    but not every build does (macOS's system Python, for one). Rather than
    guess, None tells the caller to show only the whole database's size.
    """
    try:
        size = (
            await db.execute(
                text(
                    "SELECT SUM(pgsize) FROM dbstat WHERE name IN "
                    "(SELECT name FROM sqlite_master WHERE tbl_name = :table)"
                ),
                {"table": table_name},
            )
        ).scalar()
    except OperationalError:
        return None
    return int(size or 0)


async def fetch_status(db: AsyncSession, model: type) -> dict[str, Any]:
    """Oldest/newest sample, row count, and the history's and whole database's sizes: the Settings status line."""
    oldest, newest, rows = (
        await db.execute(select(func.min(model.t_ms), func.max(model.t_ms), func.count()).select_from(model))
    ).one()
    return {
        "oldestMs": oldest,
        "newestMs": newest,
        "samples": int(rows or 0),
        "historyBytes": await table_size_bytes(db, model.__tablename__),
        "databaseBytes": await database_size_bytes(db),
    }
