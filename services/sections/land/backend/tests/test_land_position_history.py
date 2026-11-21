"""
Tests for Land's replay history (sentinel_land.services.land_history): every
APRS fix the station store upserts is also offered to history, which keeps
the route the station table overwrites.
"""

from __future__ import annotations

import pytest
from backend.database import Base
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from sentinel_land import module as land_module
from sentinel_land.models import LandPositionHistory
from sentinel_land.services import aprs_store, land_history


def station(**overrides) -> dict:
    base = {
        "callsign": "M0ABC-9",
        "latitude": 51.5,
        "longitude": -0.1,
        "symbol": "/>",
        "comment": "on the road",
        "course": 90.0,
        "speed": 30.0,
        "altitude": 120.0,
        "path": "WIDE1-1",
        "raw": "M0ABC-9>APRS:...",
    }
    base.update(overrides)
    return base


@pytest.fixture
def recording(monkeypatch):
    monkeypatch.setattr(land_history.recorder, "enabled", True)
    monkeypatch.setattr(land_history.recorder, "_buffer", type(land_history.recorder._buffer)(maxlen=1000))
    monkeypatch.setattr(land_history.recorder, "_last_stored", {})
    return land_history.recorder


@pytest.fixture
async def session_factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(aprs_store, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


class TestRecordStation:
    def test_does_nothing_while_recording_is_off(self, monkeypatch):
        monkeypatch.setattr(land_history.recorder, "enabled", False)
        assert land_history.record_station(station(), 1_000) is False

    def test_maps_the_fix_and_tags_it_off_grid(self, recording):
        assert land_history.record_station(station(), 1_000) is True
        (sample,) = recording._buffer
        assert (sample.entity_id, sample.t_ms, sample.lat, sample.lon) == ("M0ABC-9", 1_000, 51.5, -0.1)
        assert (sample.alt, sample.heading, sample.speed) == (120.0, 90.0, 30.0)
        assert sample.source_mode == "offgrid"
        assert sample.extra == {"symbol": "/>", "comment": "on the road", "path": "WIDE1-1"}

    def test_missing_optional_fields_are_left_out(self, recording):
        land_history.record_station(station(symbol=None, comment=None, path=None, course=None), 1_000)
        assert recording._buffer[0].extra is None
        assert recording._buffer[0].heading is None

    def test_a_digipeated_copy_seconds_later_is_skipped(self, recording):
        land_history.record_station(station(), 1_000)
        assert land_history.record_station(station(latitude=51.6), 3_000) is False
        assert land_history.record_station(station(latitude=51.6), 7_000) is True


class TestUpsertHook:
    async def test_every_upsert_also_offers_history(self, recording, session_factory):
        await aprs_store.upsert_station(station(), 1_000)
        await aprs_store.upsert_station(station(latitude=52.0), 120_000)
        assert [(sample.lat, sample.t_ms) for sample in recording._buffer] == [(51.5, 1_000), (52.0, 120_000)]

    async def test_the_injected_session_path_offers_history_too(self, recording, session_factory):
        async with session_factory() as db:
            await aprs_store.upsert_station(station(), 5_000, db)
        assert len(recording._buffer) == 1

    async def test_the_station_table_keeps_one_row_while_history_keeps_the_route(
        self, recording, session_factory, monkeypatch
    ):
        monkeypatch.setattr(land_history.recorder, "session_factory", session_factory)
        await aprs_store.upsert_station(station(), 1_000)
        await aprs_store.upsert_station(station(latitude=52.0), 120_000)
        async with session_factory() as db:
            await land_history.recorder.flush(db)
            rows = (await db.execute(select(LandPositionHistory).order_by(LandPositionHistory.t_ms))).scalars().all()
        assert [(row.entity_id, row.lat, row.source_mode) for row in rows] == [
            ("M0ABC-9", 51.5, "offgrid"),
            ("M0ABC-9", 52.0, "offgrid"),
        ]


async def test_the_module_starts_and_stops_history_with_the_cleanup_loop(monkeypatch):
    events: list[str] = []

    def recorder_of(name):
        async def record_event(*_args, **_kwargs):
            events.append(name)

        return record_event

    async def never_ending_cleanup():
        events.append("cleanup.run")

    monkeypatch.setattr(land_module, "_daily_cleanup_loop", never_ending_cleanup)
    monkeypatch.setattr(land_history.recorder, "start", recorder_of("recorder.start"))
    monkeypatch.setattr(land_history.recorder, "stop", recorder_of("recorder.stop"))
    monkeypatch.setattr(land_history.retention, "start", recorder_of("retention.start"))
    monkeypatch.setattr(land_history.retention, "stop", recorder_of("retention.stop"))

    await land_module._start()
    await land_module._stop()
    assert events[:2] == ["recorder.start", "retention.start"]
    assert events[-2:] == ["retention.stop", "recorder.stop"]


async def test_stop_without_a_cleanup_task_still_stops_history(monkeypatch):
    events: list[str] = []

    async def record_stop():
        events.append("stopped")

    monkeypatch.setattr(land_module, "_cleanup_task", None)
    monkeypatch.setattr(land_history.recorder, "stop", record_stop)
    monkeypatch.setattr(land_history.retention, "stop", record_stop)
    await land_module._stop()
    assert events == ["stopped", "stopped"]


def test_the_history_routes_answer(client):
    status = client.get("/api/land/history/status")
    assert status.status_code == 200
    assert status.json()["lookbackMs"] == land_history.REPLAY_LOOKBACK_MS
    assert client.get("/api/land/history/coverage").status_code == 200
    assert client.get("/api/land/history/samples").status_code == 422
