"""
Tests for backend/platform/history/recorder.py — the gated, buffered position
recorder every section's replay history is written through.

A private declarative base keeps the test table out of the app's schema (the
schema golden would otherwise see it).
"""

import asyncio
import logging

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.platform.history import recorder as recorder_module
from backend.platform.history.recorder import (
    GATE_FORGET_AFTER_MS,
    HistoryRecorder,
    PositionSample,
    SampleGate,
    distance_m,
    heading_difference_deg,
    is_valid_position,
)
from backend.platform.history.schema import PositionHistoryMixin


class _TestBase(DeclarativeBase):
    pass


class RecorderTestHistory(PositionHistoryMixin, _TestBase):
    __tablename__ = "recorder_test_history"


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


def make_recorder(session_factory, gate=None, enabled=True) -> HistoryRecorder:
    return HistoryRecorder(
        namespace="air",
        model=RecorderTestHistory,
        gate=gate or SampleGate(min_interval_s=10, min_move_m=200),
        session_factory=session_factory,
        enabled=enabled,
    )


def sample(
    entity_id="abc", t_ms=1_000_000, lat=51.0, lon=-1.0, **fields
) -> PositionSample:
    return PositionSample(entity_id=entity_id, t_ms=t_ms, lat=lat, lon=lon, **fields)


async def stored_rows(session_factory):
    async with session_factory() as db:
        return (
            (
                await db.execute(
                    select(RecorderTestHistory).order_by(RecorderTestHistory.t_ms)
                )
            )
            .scalars()
            .all()
        )


# ── geometry helpers ─────────────────────────────────────────────────────────


class TestGeometry:
    def test_distance_of_one_degree_of_latitude_is_about_111_km(self):
        assert distance_m(51.0, 0.0, 52.0, 0.0) == pytest.approx(111_195, rel=0.001)

    def test_distance_to_itself_is_zero(self):
        assert distance_m(51.0, -1.0, 51.0, -1.0) == 0.0

    @pytest.mark.parametrize(
        ("first", "second", "expected"),
        [(10, 350, 20), (350, 10, 20), (0, 180, 180), (90, 90, 0), (720, 30, 30)],
    )
    def test_heading_difference_is_the_smaller_angle(self, first, second, expected):
        assert heading_difference_deg(first, second) == expected

    @pytest.mark.parametrize(
        ("lat", "lon", "valid"),
        [
            (0, 0, True),
            (90, 180, True),
            (-90, -180, True),
            (90.1, 0, False),
            (0, 180.1, False),
            (float("nan"), 0, False),
            (0, float("inf"), False),
            (None, 0, False),
            ("x", 0, False),
            ("51.5", "-1.0", True),
        ],
    )
    def test_is_valid_position(self, lat, lon, valid):
        assert is_valid_position(lat, lon) is valid


# ── offer / gate ─────────────────────────────────────────────────────────────


class TestOffer:
    def test_nothing_is_buffered_while_recording_is_off(self, session_factory):
        recorder = make_recorder(session_factory, enabled=False)
        assert recorder.offer(sample()) is False
        assert len(recorder._buffer) == 0

    @pytest.mark.parametrize(
        "bad",
        [sample(entity_id=""), sample(lat=95.0), sample(lon=float("nan"))],
    )
    def test_a_sample_without_identity_or_a_real_position_is_refused(
        self, session_factory, bad
    ):
        assert make_recorder(session_factory).offer(bad) is False

    def test_the_first_sample_of_an_entity_is_always_kept(self, session_factory):
        assert make_recorder(session_factory).offer(sample()) is True

    def test_the_same_or_an_older_observation_is_refused(self, session_factory):
        recorder = make_recorder(session_factory)
        recorder.offer(sample(t_ms=1_000_000))
        assert recorder.offer(sample(t_ms=1_000_000, lat=52.0)) is False
        assert recorder.offer(sample(t_ms=999_000, lat=52.0)) is False

    def test_a_sample_inside_the_interval_that_barely_moved_is_refused(
        self, session_factory
    ):
        recorder = make_recorder(session_factory)
        recorder.offer(sample(t_ms=1_000_000))
        assert recorder.offer(sample(t_ms=1_005_000, lat=51.0001)) is False

    def test_a_sample_after_the_interval_is_kept_even_without_moving(
        self, session_factory
    ):
        recorder = make_recorder(session_factory)
        recorder.offer(sample(t_ms=1_000_000))
        assert recorder.offer(sample(t_ms=1_010_000)) is True

    def test_a_sample_that_moved_far_enough_is_kept_inside_the_interval(
        self, session_factory
    ):
        recorder = make_recorder(session_factory)
        recorder.offer(sample(t_ms=1_000_000))
        assert recorder.offer(sample(t_ms=1_001_000, lat=51.01)) is True  # ~1.1 km

    def test_a_turn_is_kept_inside_the_interval(self, session_factory):
        recorder = make_recorder(session_factory)
        recorder.offer(sample(t_ms=1_000_000, heading=90.0))
        assert recorder.offer(sample(t_ms=1_001_000, heading=100.0)) is False
        assert recorder.offer(sample(t_ms=1_002_000, heading=120.0)) is True

    def test_a_turn_needs_both_headings(self, session_factory):
        recorder = make_recorder(session_factory)
        recorder.offer(sample(t_ms=1_000_000, heading=None))
        assert recorder.offer(sample(t_ms=1_001_000, heading=180.0)) is False

    def test_heading_is_ignored_when_the_gate_has_no_heading_threshold(
        self, session_factory
    ):
        recorder = make_recorder(
            session_factory, gate=SampleGate(min_interval_s=10, heading_change_deg=None)
        )
        recorder.offer(sample(t_ms=1_000_000, heading=0.0))
        assert recorder.offer(sample(t_ms=1_001_000, heading=180.0)) is False

    def test_a_climb_is_kept_when_the_gate_watches_altitude(self, session_factory):
        recorder = make_recorder(
            session_factory, gate=SampleGate(min_interval_s=10, altitude_change_ft=1000)
        )
        recorder.offer(sample(t_ms=1_000_000, alt=10_000.0))
        assert recorder.offer(sample(t_ms=1_001_000, alt=10_500.0)) is False
        assert recorder.offer(sample(t_ms=1_002_000, alt=11_000.0)) is True

    def test_altitude_needs_both_values(self, session_factory):
        recorder = make_recorder(
            session_factory, gate=SampleGate(min_interval_s=10, altitude_change_ft=1000)
        )
        recorder.offer(sample(t_ms=1_000_000, alt=None))
        assert recorder.offer(sample(t_ms=1_001_000, alt=30_000.0)) is False

    def test_min_gap_holds_back_a_move_reported_too_soon(self, session_factory):
        recorder = make_recorder(
            session_factory,
            gate=SampleGate(min_interval_s=300, min_move_m=25, min_gap_s=30),
        )
        recorder.offer(sample(t_ms=1_000_000))
        assert (
            recorder.offer(sample(t_ms=1_010_000, lat=51.01)) is False
        )  # moved, but only 10 s later
        assert recorder.offer(sample(t_ms=1_031_000, lat=51.01)) is True  # past the gap

    def test_a_move_counts_only_when_the_gate_has_a_distance(self, session_factory):
        recorder = make_recorder(
            session_factory, gate=SampleGate(min_interval_s=10, heading_change_deg=None)
        )
        recorder.offer(sample(t_ms=1_000_000))
        assert recorder.offer(sample(t_ms=1_001_000, lat=52.0)) is False

    def test_entities_are_gated_independently(self, session_factory):
        recorder = make_recorder(session_factory)
        recorder.offer(sample(entity_id="a", t_ms=1_000_000))
        assert recorder.offer(sample(entity_id="b", t_ms=1_000_500)) is True

    def test_a_full_buffer_drops_the_oldest_and_says_so_once(
        self, session_factory, monkeypatch, caplog
    ):
        recorder = make_recorder(session_factory)
        recorder._buffer = recorder_module.deque(maxlen=2)
        with caplog.at_level(logging.WARNING):
            for index in range(4):
                recorder.offer(sample(entity_id=f"e{index}", t_ms=1_000_000 + index))
        assert [buffered.entity_id for buffered in recorder._buffer] == ["e2", "e3"]
        assert sum("buffer full" in record.message for record in caplog.records) == 1


# ── flush ────────────────────────────────────────────────────────────────────


class TestFlush:
    async def test_an_empty_buffer_writes_nothing(self, session_factory):
        recorder = make_recorder(session_factory)
        async with session_factory() as db:
            assert await recorder.flush(db) == 0
        assert await stored_rows(session_factory) == []

    async def test_flush_writes_every_field_and_empties_the_buffer(
        self, session_factory
    ):
        recorder = make_recorder(session_factory)
        recorder.offer(
            sample(
                alt=30000.0,
                heading=90.0,
                speed=420.0,
                source_mode="offgrid",
                extra={"flight": "BAW1"},
            )
        )
        async with session_factory() as db:
            assert await recorder.flush(db) == 1
        assert len(recorder._buffer) == 0
        (row,) = await stored_rows(session_factory)
        assert (row.entity_id, row.t_ms, row.lat, row.lon) == (
            "abc",
            1_000_000,
            51.0,
            -1.0,
        )
        assert (row.alt, row.heading, row.speed, row.source_mode) == (
            30000.0,
            90.0,
            420.0,
            "offgrid",
        )
        assert row.extra == '{"flight":"BAW1"}'

    async def test_no_extra_is_stored_as_null(self, session_factory):
        recorder = make_recorder(session_factory)
        recorder.offer(sample())
        async with session_factory() as db:
            await recorder.flush(db)
        (row,) = await stored_rows(session_factory)
        assert row.extra is None

    async def test_a_duplicate_entity_and_time_is_ignored_not_an_error(
        self, session_factory
    ):
        recorder = make_recorder(session_factory)
        recorder.offer(sample())
        async with session_factory() as db:
            await recorder.flush(db)
        # A fresh recorder (a restart) offers the same observation again.
        again = make_recorder(session_factory)
        again.offer(sample(lat=52.0, source_mode="offgrid"))
        async with session_factory() as db:
            await again.flush(db)
        rows = await stored_rows(session_factory)
        assert len(rows) == 1
        assert rows[0].lat == 51.0


# ── refresh_enabled ──────────────────────────────────────────────────────────


class TestRefreshEnabled:
    async def test_reads_the_namespace_switch(self, session_factory, monkeypatch):
        seen = {}

        async def fake_read_setting(db, namespace, key, default=None):
            seen["call"] = (namespace, key, default)
            return True

        monkeypatch.setattr(recorder_module, "read_setting", fake_read_setting)
        recorder = make_recorder(session_factory, enabled=False)
        await recorder.refresh_enabled(None)
        assert recorder.enabled is True
        assert seen["call"] == ("air", "historyEnabled", False)

    async def test_turning_off_discards_unsaved_samples_and_the_gate(
        self, session_factory, monkeypatch
    ):
        async def off(*_args, **_kwargs):
            return False

        monkeypatch.setattr(recorder_module, "read_setting", off)
        recorder = make_recorder(session_factory)
        recorder.offer(sample())
        await recorder.refresh_enabled(None)
        assert recorder.enabled is False
        assert len(recorder._buffer) == 0
        assert recorder._last_stored == {}

    async def test_staying_off_does_nothing_else(self, session_factory, monkeypatch):
        async def off(*_args, **_kwargs):
            return False

        monkeypatch.setattr(recorder_module, "read_setting", off)
        recorder = make_recorder(session_factory, enabled=False)
        await recorder.refresh_enabled(None)
        assert recorder.enabled is False

    @pytest.mark.parametrize("previous", [True, False])
    async def test_an_unreadable_setting_keeps_the_last_state(
        self, session_factory, monkeypatch, caplog, previous
    ):
        async def broken(*_args, **_kwargs):
            raise RuntimeError("core down")

        monkeypatch.setattr(recorder_module, "read_setting", broken)
        recorder = make_recorder(session_factory, enabled=previous)
        with caplog.at_level(logging.WARNING):
            await recorder.refresh_enabled(None)
        assert recorder.enabled is previous
        assert f"keeping it {'on' if previous else 'off'}" in caplog.text


# ── run_once / clock / gate tidy ─────────────────────────────────────────────


class TestRunOnce:
    async def test_refreshes_then_flushes(self, session_factory, monkeypatch):
        async def on(*_args, **_kwargs):
            return True

        monkeypatch.setattr(recorder_module, "read_setting", on)
        recorder = make_recorder(session_factory)
        recorder.offer(sample(t_ms=int(recorder_module.time.time() * 1000)))
        await recorder.run_once()
        assert len(await stored_rows(session_factory)) == 1

    async def test_forgets_gate_entries_older_than_an_hour(
        self, session_factory, monkeypatch
    ):
        async def on(*_args, **_kwargs):
            return True

        monkeypatch.setattr(recorder_module, "read_setting", on)
        now_ms = 10_000_000_000
        monkeypatch.setattr(recorder_module.time, "time", lambda: now_ms / 1000)
        recorder = make_recorder(session_factory)
        recorder.offer(sample(entity_id="old", t_ms=now_ms - GATE_FORGET_AFTER_MS - 1))
        recorder.offer(sample(entity_id="new", t_ms=now_ms - 1000))
        await recorder.run_once()
        assert set(recorder._last_stored) == {"new"}

    def test_a_backward_clock_jump_is_logged_and_resets_the_gate(
        self, session_factory, caplog
    ):
        recorder = make_recorder(session_factory)
        recorder.offer(sample())
        recorder._note_clock(10_000_000)
        with caplog.at_level(logging.WARNING):
            recorder._note_clock(10_000_000 - 6 * 60 * 1000)
        assert "clock went back 360 s" in caplog.text
        assert recorder._last_stored == {}

    def test_a_small_backward_step_is_not_a_jump(self, session_factory, caplog):
        recorder = make_recorder(session_factory)
        recorder.offer(sample())
        recorder._note_clock(10_000_000)
        with caplog.at_level(logging.WARNING):
            recorder._note_clock(10_000_000 - 60_000)
        assert "clock went back" not in caplog.text
        assert "abc" in recorder._last_stored


# ── start / stop / loop ──────────────────────────────────────────────────────


class TestLoop:
    async def test_start_is_idempotent_and_stop_flushes_what_is_left(
        self, session_factory, monkeypatch
    ):
        async def off(*_args, **_kwargs):
            return True

        monkeypatch.setattr(recorder_module, "read_setting", off)
        recorder = make_recorder(session_factory)
        recorder.flush_interval_s = 3600
        await recorder.start()
        first_task = recorder._task
        await recorder.start()
        assert recorder._task is first_task
        await asyncio.sleep(0)  # let the first pass run
        recorder.offer(sample(t_ms=int(recorder_module.time.time() * 1000)))
        await recorder.stop()
        assert recorder._task is None
        assert len(await stored_rows(session_factory)) == 1

    async def test_stop_without_start_and_nothing_buffered_is_a_no_op(
        self, session_factory
    ):
        recorder = make_recorder(session_factory)
        await recorder.stop()
        assert recorder._task is None

    async def test_a_failing_final_flush_is_logged_not_raised(
        self, session_factory, caplog
    ):
        recorder = make_recorder(session_factory)
        recorder.offer(sample())

        def broken_factory():
            raise RuntimeError("db gone")

        recorder.session_factory = broken_factory
        with caplog.at_level(logging.ERROR):
            await recorder.stop()
        assert "final flush failed" in caplog.text

    async def test_a_failing_pass_is_logged_and_the_loop_keeps_going(
        self, session_factory, monkeypatch, caplog
    ):
        recorder = make_recorder(session_factory)
        recorder.flush_interval_s = 0
        passes = 0

        async def flaky_run_once():
            nonlocal passes
            passes += 1
            if passes == 1:
                raise RuntimeError("boom")
            if passes >= 3:
                raise asyncio.CancelledError

        monkeypatch.setattr(recorder, "run_once", flaky_run_once)
        with caplog.at_level(logging.ERROR), pytest.raises(asyncio.CancelledError):
            await recorder._run()
        assert passes == 3
        assert "flush failed; retrying" in caplog.text


async def test_rows_are_unique_per_entity_and_time(session_factory):
    """The schema itself refuses a duplicate (entity, time), the dedupe the recorder relies on."""
    async with session_factory() as db:
        db.add(
            RecorderTestHistory(
                entity_id="x", t_ms=1, lat=0, lon=0, source_mode="online"
            )
        )
        await db.commit()
        db.add(
            RecorderTestHistory(
                entity_id="x", t_ms=1, lat=1, lon=1, source_mode="online"
            )
        )
        with pytest.raises(Exception, match="UNIQUE"):
            await db.commit()
        await db.rollback()
        assert (
            await db.execute(select(func.count()).select_from(RecorderTestHistory))
        ).scalar() == 1
