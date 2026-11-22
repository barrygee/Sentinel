"""Space's replay history: the TLE versions it has stored, and positions recomputed from them.

``store_tle_bulk`` is the single path every TLE takes into Space (online
CelesTrak, a local-network URL, a paste or file upload), so recording there
covers online and off-grid alike. Replay reads only this table and
``tle_cache``: it never fetches, so it works with no internet.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any

from backend.database import AsyncSessionLocal
from backend.platform.history.queries import database_size_bytes, table_size_bytes
from backend.platform.history.recorder import ENABLED_SETTING_KEY
from backend.platform.history.retention import PruneTarget, RetentionLoop, read_retention_days
from backend.platform.settings_client import read_setting
from sqlalchemy import func, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_space.models import SpaceTleHistory, TleCache

NAMESPACE = "space"

retention = RetentionLoop(NAMESPACE, [PruneTarget(SpaceTleHistory, time_column="recorded_ms")], AsyncSessionLocal)


def tle_epoch_ms(line1: str) -> int | None:
    """The epoch in TLE line 1 (``YYDDD.DDDDDDDD``, columns 19–32) as Unix ms, or None if unreadable."""
    try:
        epoch_field = line1[18:32].strip()
        two_digit_year = int(epoch_field[:2])
        day_of_year = float(epoch_field[2:])
    except (ValueError, IndexError):
        return None
    # The TLE convention: 57–99 are 1957–1999, 00–56 are 2000–2056.
    year = 1900 + two_digit_year if two_digit_year >= 57 else 2000 + two_digit_year
    if not 1.0 <= day_of_year < 367.0:
        return None
    epoch = datetime(year, 1, 1, tzinfo=UTC) + timedelta(days=day_of_year - 1)
    return int(epoch.timestamp() * 1000)


async def history_enabled(db: AsyncSession) -> bool:
    """``space.historyEnabled``."""
    return bool(await read_setting(db, NAMESPACE, ENABLED_SETTING_KEY, False))


async def record_tle_versions(db: AsyncSession, entries: list[tuple[str, str, str]]) -> int:
    """Store each (name, line1, line2) whose epoch is new for its satellite. Returns rows offered.

    The caller commits (it is ``store_tle_bulk``'s transaction). Nothing is
    recorded while ``space.historyEnabled`` is off.
    """
    if not entries or not await history_enabled(db):
        return 0
    recorded_ms = int(time.time() * 1000)
    rows = []
    for _, line1, line2 in entries:
        epoch_ms = tle_epoch_ms(line1)
        if epoch_ms is None:
            continue
        rows.append(
            {
                "norad_id": line1[2:7].strip(),
                "epoch_ms": epoch_ms,
                "line1": line1,
                "line2": line2,
                "recorded_ms": recorded_ms,
            }
        )
    if rows:
        statement = sqlite_insert(SpaceTleHistory).on_conflict_do_nothing(index_elements=["norad_id", "epoch_ms"])
        await db.execute(statement, rows)
    return len(rows)


async def tle_lines_at(db: AsyncSession, norad_id: str, at_ms: int) -> tuple[str, str] | None:
    """The TLE to replay `norad_id` at `at_ms`: the newest stored version with an epoch not after it.

    Falls back to the current ``tle_cache`` entry (history off, or nothing that
    old), and None when Space has no TLE for it at all. Never fetches.
    """
    version = (
        await db.execute(
            select(SpaceTleHistory.line1, SpaceTleHistory.line2)
            .where(SpaceTleHistory.norad_id == norad_id, SpaceTleHistory.epoch_ms <= at_ms)
            .order_by(SpaceTleHistory.epoch_ms.desc())
            .limit(1)
        )
    ).first()
    if version is not None:
        return version.line1, version.line2
    cached = (await db.execute(select(TleCache.payload).where(TleCache.cache_key == norad_id))).scalar_one_or_none()
    if not cached:
        return None
    lines = [line for line in cached.splitlines() if line.strip()]
    if len(lines) < 3:
        return None
    return lines[1], lines[2]


async def history_status(db: AsyncSession) -> dict[str, Any]:
    """The Settings status line: switch, window, versions stored and database size."""
    oldest, newest, versions, satellites = (
        await db.execute(
            select(
                func.min(SpaceTleHistory.recorded_ms),
                func.max(SpaceTleHistory.recorded_ms),
                func.count(),
                func.count(func.distinct(SpaceTleHistory.norad_id)),
            )
        )
    ).one()
    return {
        "enabled": await history_enabled(db),
        "retentionDays": await read_retention_days(db, NAMESPACE),
        "oldestMs": oldest,
        "newestMs": newest,
        "tleVersions": int(versions or 0),
        "satellites": int(satellites or 0),
        "historyBytes": await table_size_bytes(db, SpaceTleHistory.__tablename__),
        "databaseBytes": await database_size_bytes(db),
    }
