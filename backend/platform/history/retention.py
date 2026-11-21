"""The rolling retention window: an hourly prune of every history table a section owns."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from backend.platform.settings_client import read_setting
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

RETENTION_SETTING_KEY = "historyRetentionDays"
DEFAULT_RETENTION_DAYS = 7
MIN_RETENTION_DAYS = 1
MAX_RETENTION_DAYS = 7
DAY_MS = 24 * 60 * 60 * 1000

PRUNE_INTERVAL_S = 60 * 60
PRUNE_RETRY_S = 60
# Rows deleted per statement: small enough that each DELETE holds SQLite's
# write lock only briefly, so live writers (ADS-B cache, AIS snapshot) never
# wait behind a week's worth of rows.
PRUNE_BATCH_ROWS = 5_000


def clamp_retention_days(value: Any) -> int:
    """The retention setting as a whole number of days in 1–7; anything unusable is the default."""
    try:
        days = int(value)
    except (TypeError, ValueError):
        return DEFAULT_RETENTION_DAYS
    return max(MIN_RETENTION_DAYS, min(MAX_RETENTION_DAYS, days))


async def read_retention_days(db: AsyncSession, namespace: str) -> int:
    """``<namespace>.historyRetentionDays``, clamped."""
    return clamp_retention_days(await read_setting(db, namespace, RETENTION_SETTING_KEY, DEFAULT_RETENTION_DAYS))


def retention_cutoff_ms(now_ms: int, retention_days: int) -> int:
    """The oldest timestamp still inside the window."""
    return now_ms - retention_days * DAY_MS


@dataclass(frozen=True)
class PruneTarget:
    """One table to prune, and which of its integer Unix-ms columns dates a row."""

    model: type
    time_column: str = "t_ms"


async def prune_older_than(
    db: AsyncSession, target: PruneTarget, cutoff_ms: int, batch_rows: int = PRUNE_BATCH_ROWS
) -> int:
    """Delete every row of `target` dated before `cutoff_ms`, a batch at a time. Returns rows deleted."""
    time_column = getattr(target.model, target.time_column)
    primary_key = target.model.id
    deleted_total = 0
    while True:
        batch_ids = select(primary_key).where(time_column < cutoff_ms).limit(batch_rows).scalar_subquery()
        result = await db.execute(delete(target.model).where(primary_key.in_(batch_ids)))
        await db.commit()
        deleted = result.rowcount or 0
        deleted_total += deleted
        if deleted < batch_rows:
            return deleted_total
        # Yield between batches so request handlers get the lock.
        await asyncio.sleep(0)


class RetentionLoop:
    """Prune a section's history tables once at start, then hourly (a minute after a failure).

    It runs whether recording is on or off: turning recording off must still
    let what was already recorded age out on schedule.
    """

    def __init__(
        self,
        namespace: str,
        targets: Sequence[PruneTarget],
        session_factory: Callable[[], AsyncSession],
        interval_s: float = PRUNE_INTERVAL_S,
    ) -> None:
        self.namespace = namespace
        self.targets = tuple(targets)
        self.session_factory = session_factory
        self.interval_s = interval_s
        self._task: asyncio.Task[None] | None = None

    async def run_once(self) -> int:
        """Prune every target against the current retention setting. Returns rows deleted."""
        async with self.session_factory() as db:
            cutoff = retention_cutoff_ms(int(time.time() * 1000), await read_retention_days(db, self.namespace))
            deleted = 0
            for target in self.targets:
                deleted += await prune_older_than(db, target, cutoff)
        if deleted:
            logger.info("%s history: pruned %d rows older than the retention window", self.namespace, deleted)
        return deleted

    async def _run(self) -> None:
        while True:
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("%s history: prune failed; retrying in %d s", self.namespace, PRUNE_RETRY_S)
                await asyncio.sleep(PRUNE_RETRY_S)
                continue
            await asyncio.sleep(self.interval_s)

    async def start(self) -> None:
        """Start the loop (idempotent)."""
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Cancel the loop and wait for it, so a graceful shutdown never hangs on it."""
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
