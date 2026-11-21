"""
Tests for backend/platform/history/retention.py — the rolling window every
history table is pruned to.
"""

import asyncio
import logging

import pytest
from sqlalchemy import Column, Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.platform.history import retention as retention_module
from backend.platform.history.retention import (
    DAY_MS,
    DEFAULT_RETENTION_DAYS,
    PruneTarget,
    RetentionLoop,
    clamp_retention_days,
    prune_older_than,
    read_retention_days,
    retention_cutoff_ms,
)
from backend.platform.history.schema import PositionHistoryMixin


class _TestBase(DeclarativeBase):
    pass


class RetentionTestHistory(PositionHistoryMixin, _TestBase):
    __tablename__ = "retention_test_history"


class RetentionTestVersions(_TestBase):
    """A table dated by a column other than t_ms (as Space's TLE history is)."""

    __tablename__ = "retention_test_versions"
    id = Column(Integer, primary_key=True)
    recorded_ms = Column(Integer, nullable=False)


@pytest.fixture()
async def session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(_TestBase.metadata.create_all)
    yield sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


async def add_history_rows(session_factory, times):
    async with session_factory() as db:
        for index, t_ms in enumerate(times):
            db.add(
                RetentionTestHistory(
                    entity_id=f"e{index}", t_ms=t_ms, lat=0, lon=0, source_mode="online"
                )
            )
        await db.commit()


async def count(session_factory, model):
    async with session_factory() as db:
        return (await db.execute(select(func.count()).select_from(model))).scalar()


class TestClampRetentionDays:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [(1, 1), (7, 7), (3, 3), (0, 1), (-5, 1), (8, 7), (100, 7), ("4", 4), (4.9, 4)],
    )
    def test_clamps_to_one_through_seven(self, value, expected):
        assert clamp_retention_days(value) == expected

    @pytest.mark.parametrize("value", [None, "seven", {}, []])
    def test_unusable_values_are_the_default(self, value):
        assert clamp_retention_days(value) == DEFAULT_RETENTION_DAYS


async def test_read_retention_days_reads_and_clamps(monkeypatch):
    seen = {}

    async def fake_read_setting(db, namespace, key, default=None):
        seen["call"] = (namespace, key, default)
        return 30

    monkeypatch.setattr(retention_module, "read_setting", fake_read_setting)
    assert await read_retention_days(None, "sea") == 7
    assert seen["call"] == ("sea", "historyRetentionDays", DEFAULT_RETENTION_DAYS)


def test_cutoff_is_now_less_whole_days():
    assert retention_cutoff_ms(10 * DAY_MS, 3) == 7 * DAY_MS


class TestPruneOlderThan:
    async def test_deletes_only_rows_before_the_cutoff(self, session_factory):
        await add_history_rows(session_factory, [100, 199, 200, 300])
        async with session_factory() as db:
            deleted = await prune_older_than(db, PruneTarget(RetentionTestHistory), 200)
        assert deleted == 2
        async with session_factory() as db:
            remaining = (
                (
                    await db.execute(
                        select(RetentionTestHistory.t_ms).order_by(
                            RetentionTestHistory.t_ms
                        )
                    )
                )
                .scalars()
                .all()
            )
        assert remaining == [200, 300]

    async def test_works_in_batches_until_none_are_left(self, session_factory):
        await add_history_rows(session_factory, list(range(10)))
        async with session_factory() as db:
            deleted = await prune_older_than(
                db, PruneTarget(RetentionTestHistory), 100, batch_rows=3
            )
        assert deleted == 10
        assert await count(session_factory, RetentionTestHistory) == 0

    async def test_nothing_to_delete_returns_zero(self, session_factory):
        await add_history_rows(session_factory, [500])
        async with session_factory() as db:
            assert (
                await prune_older_than(db, PruneTarget(RetentionTestHistory), 100) == 0
            )
        assert await count(session_factory, RetentionTestHistory) == 1

    async def test_uses_the_named_time_column(self, session_factory):
        async with session_factory() as db:
            db.add_all(
                [
                    RetentionTestVersions(recorded_ms=10),
                    RetentionTestVersions(recorded_ms=1000),
                ]
            )
            await db.commit()
            deleted = await prune_older_than(
                db, PruneTarget(RetentionTestVersions, time_column="recorded_ms"), 500
            )
        assert deleted == 1
        assert await count(session_factory, RetentionTestVersions) == 1


class TestRetentionLoop:
    async def test_run_once_prunes_every_target_against_the_setting(
        self, session_factory, monkeypatch, caplog
    ):
        now_ms = 100 * DAY_MS
        monkeypatch.setattr(retention_module.time, "time", lambda: now_ms / 1000)

        async def two_days(*_args, **_kwargs):
            return 2

        monkeypatch.setattr(retention_module, "read_setting", two_days)
        await add_history_rows(
            session_factory, [now_ms - 3 * DAY_MS, now_ms - 1 * DAY_MS]
        )
        async with session_factory() as db:
            db.add_all(
                [
                    RetentionTestVersions(recorded_ms=now_ms - 5 * DAY_MS),
                    RetentionTestVersions(recorded_ms=now_ms),
                ]
            )
            await db.commit()
        loop = RetentionLoop(
            "air",
            [
                PruneTarget(RetentionTestHistory),
                PruneTarget(RetentionTestVersions, "recorded_ms"),
            ],
            session_factory,
        )
        with caplog.at_level(logging.INFO):
            assert await loop.run_once() == 2
        assert await count(session_factory, RetentionTestHistory) == 1
        assert await count(session_factory, RetentionTestVersions) == 1
        assert "pruned 2 rows" in caplog.text

    async def test_run_once_with_nothing_old_logs_nothing(
        self, session_factory, monkeypatch, caplog
    ):
        async def seven(*_args, **_kwargs):
            return 7

        monkeypatch.setattr(retention_module, "read_setting", seven)
        loop = RetentionLoop(
            "air", [PruneTarget(RetentionTestHistory)], session_factory
        )
        with caplog.at_level(logging.INFO):
            assert await loop.run_once() == 0
        assert "pruned" not in caplog.text

    async def test_start_is_idempotent_and_stop_cancels(
        self, session_factory, monkeypatch
    ):
        async def seven(*_args, **_kwargs):
            return 7

        monkeypatch.setattr(retention_module, "read_setting", seven)
        loop = RetentionLoop(
            "air", [PruneTarget(RetentionTestHistory)], session_factory, interval_s=3600
        )
        await loop.start()
        first = loop._task
        await loop.start()
        assert loop._task is first
        await loop.stop()
        assert loop._task is None
        assert first.cancelled() or first.done()

    async def test_stop_without_start_is_a_no_op(self, session_factory):
        loop = RetentionLoop("air", [], session_factory)
        await loop.stop()
        assert loop._task is None

    async def test_a_failed_pass_is_logged_and_retried(
        self, session_factory, monkeypatch, caplog
    ):
        loop = RetentionLoop("air", [], session_factory, interval_s=0)
        monkeypatch.setattr(retention_module, "PRUNE_RETRY_S", 0)
        passes = 0

        async def flaky():
            nonlocal passes
            passes += 1
            if passes == 1:
                raise RuntimeError("locked")
            if passes == 2:
                return 0
            raise asyncio.CancelledError

        monkeypatch.setattr(loop, "run_once", flaky)
        with caplog.at_level(logging.ERROR), pytest.raises(asyncio.CancelledError):
            await loop._run()
        assert passes == 3
        assert "prune failed; retrying" in caplog.text
