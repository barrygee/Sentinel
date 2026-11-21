"""
Tests for Air's replay history (sentinel_air.services.air_history) and where
it hooks in: the browser-poll route, the idle squawk watcher, the off-grid
watch-interval floor, the module lifecycle and the /api/air/history routes.
"""

from __future__ import annotations

from typing import Any

import pytest
from backend.db_helpers import upsert_setting
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_air import module as air_module
from sentinel_air.models import AirPositionHistory
from sentinel_air.services import adsb as adsb_service
from sentinel_air.services import adsb_squawk, air_history
from sentinel_air.services.air_history import observed_at_ms, record_snapshot, sample_from_aircraft


@pytest.fixture
def recording(monkeypatch):
    """Recording on, with a fresh gate and buffer that the test can read."""
    monkeypatch.setattr(air_history.recorder, "enabled", True)
    monkeypatch.setattr(air_history.recorder, "_buffer", type(air_history.recorder._buffer)(maxlen=1000))
    monkeypatch.setattr(air_history.recorder, "_last_stored", {})
    return air_history.recorder


# ── observed_at_ms ───────────────────────────────────────────────────────────


class TestObservedAt:
    def test_dates_the_fix_by_its_position_age(self):
        assert observed_at_ms(10_000, {"seen_pos": 2.5, "seen": 0.1}) == 7_500

    def test_falls_back_to_seen_without_seen_pos(self):
        assert observed_at_ms(10_000, {"seen": 1}) == 9_000

    def test_no_age_at_all_is_the_snapshot_time(self):
        assert observed_at_ms(10_000, {}) == 10_000

    @pytest.mark.parametrize("bad", [-5, True, "2", None])
    def test_negative_or_non_numeric_ages_count_as_zero(self, bad):
        assert observed_at_ms(10_000, {"seen_pos": bad}) == 10_000


# ── sample_from_aircraft ─────────────────────────────────────────────────────


class TestSampleFromAircraft:
    def test_maps_every_field(self):
        sample = sample_from_aircraft(
            {
                "hex": "ABC123",
                "lat": 51.5,
                "lon": -0.1,
                "alt_baro": 32000,
                "track": 270,
                "gs": 450.5,
                "flight": "BAW12  ",
                "squawk": "7000",
                "category": "A3",
                "r": "G-ABCD",
                "t": "A320",
                "seen_pos": 1,
            },
            snapshot_now_ms=100_000,
            source_mode="offgrid",
        )
        assert sample is not None
        assert sample.entity_id == "abc123"
        assert sample.t_ms == 99_000
        assert (sample.lat, sample.lon, sample.alt, sample.heading, sample.speed) == (51.5, -0.1, 32000.0, 270.0, 450.5)
        assert sample.source_mode == "offgrid"
        assert sample.extra == {
            "flight": "BAW12",
            "squawk": "7000",
            "category": "A3",
            "r": "G-ABCD",
            "t": "A320",
            "alt_baro": 32000,
        }

    def test_ground_keeps_the_raw_value_and_no_numeric_altitude(self):
        sample = sample_from_aircraft({"hex": "a", "lat": 1, "lon": 2, "alt_baro": "ground"}, 0, "online")
        assert sample.alt is None
        assert sample.extra == {"alt_baro": "ground"}

    def test_an_aircraft_with_nothing_extra_has_no_extra(self):
        sample = sample_from_aircraft({"hex": "a", "lat": 1, "lon": 2, "flight": "   "}, 0, "online")
        assert sample.extra is None

    @pytest.mark.parametrize(
        "aircraft",
        [
            {"lat": 1, "lon": 2},
            {"hex": "", "lat": 1, "lon": 2},
            {"hex": 123, "lat": 1, "lon": 2},
            {"hex": "a", "lon": 2},
            {"hex": "a", "lat": 1},
            {"hex": "a", "lat": "1", "lon": 2},
        ],
    )
    def test_no_identity_or_position_is_no_sample(self, aircraft):
        assert sample_from_aircraft(aircraft, 0, "online") is None


# ── record_snapshot ──────────────────────────────────────────────────────────


class TestRecordSnapshot:
    def test_does_nothing_while_recording_is_off(self, monkeypatch):
        monkeypatch.setattr(air_history.recorder, "enabled", False)
        assert record_snapshot({"ac": [{"hex": "a", "lat": 1, "lon": 2}]}, "online", 0) == 0

    def test_offers_every_positioned_aircraft(self, recording):
        kept = record_snapshot(
            {
                "now": 50_000,
                "ac": [
                    {"hex": "a", "lat": 1, "lon": 2},
                    {"hex": "b", "lat": 3, "lon": 4, "seen_pos": 2},
                    {"hex": "c"},  # no position
                    "not-a-dict",
                ],
            },
            "online",
            fetched_at_ms=99_999,
        )
        assert kept == 2
        assert [(sample.entity_id, sample.t_ms) for sample in recording._buffer] == [("a", 50_000), ("b", 48_000)]

    def test_uses_the_fetch_time_when_the_snapshot_has_none(self, recording):
        record_snapshot({"ac": [{"hex": "a", "lat": 1, "lon": 2}]}, "offgrid", fetched_at_ms=7_000)
        assert recording._buffer[0].t_ms == 7_000

    def test_a_snapshot_with_no_list_keeps_nothing(self, recording):
        assert record_snapshot({"now": 1}, "online", 0) == 0

    def test_the_same_snapshot_from_the_other_source_is_not_stored_twice(self, recording):
        """A source switch overlapping the same report: one sample, not two."""
        snapshot = {"now": 50_000, "ac": [{"hex": "ABC", "lat": 1, "lon": 2, "seen_pos": 1}]}
        assert record_snapshot(snapshot, "online", 0) == 1
        assert (
            record_snapshot({**snapshot, "ac": [{"hex": "abc", "lat": 1, "lon": 2, "seen_pos": 1}]}, "offgrid", 0) == 0
        )
        assert len(recording._buffer) == 1


# ── watch-interval floor ─────────────────────────────────────────────────────


@pytest.fixture
async def db(test_engine, db_setup):
    async with AsyncSession(test_engine, expire_on_commit=False) as session:
        yield session


class TestWatchIntervalFloor:
    @pytest.fixture(autouse=True)
    def defaults(self, monkeypatch):
        monkeypatch.setattr(adsb_squawk.settings, "adsb_watch_online_interval_s", 300.0)
        monkeypatch.setattr(adsb_squawk.settings, "adsb_watch_offgrid_interval_s", 20.0)

    async def test_off_grid_with_recording_on_fetches_every_ten_seconds(self, db, monkeypatch):
        monkeypatch.setattr(air_history.recorder, "enabled", True)
        assert await adsb_squawk.watch_interval_s(db, "offgrid") == air_history.OFFGRID_RECORDING_WATCH_INTERVAL_S

    async def test_a_shorter_operator_interval_is_kept(self, db, monkeypatch):
        monkeypatch.setattr(air_history.recorder, "enabled", True)
        await upsert_setting(db, "air", "squawkWatchOffgridIntervalSec", 6)
        await db.commit()
        assert await adsb_squawk.watch_interval_s(db, "offgrid") == 6.0

    async def test_a_longer_operator_interval_is_floored(self, db, monkeypatch):
        monkeypatch.setattr(air_history.recorder, "enabled", True)
        await upsert_setting(db, "air", "squawkWatchOffgridIntervalSec", 60)
        await db.commit()
        assert await adsb_squawk.watch_interval_s(db, "offgrid") == 10.0

    async def test_off_grid_with_recording_off_is_unchanged(self, db, monkeypatch):
        monkeypatch.setattr(air_history.recorder, "enabled", False)
        assert await adsb_squawk.watch_interval_s(db, "offgrid") == 20.0

    async def test_online_is_never_floored(self, db, monkeypatch):
        """The online feed's daily quota is shared with the map."""
        monkeypatch.setattr(air_history.recorder, "enabled", True)
        assert await adsb_squawk.watch_interval_s(db, "online") == 300.0


# ── the two recording call sites ─────────────────────────────────────────────


@pytest.fixture
def recorded_snapshots(monkeypatch) -> list[tuple[dict, str]]:
    calls: list[tuple[dict, str]] = []

    def fake_record(snapshot: dict, source_mode: str, fetched_at_ms: int) -> int:
        calls.append((snapshot, source_mode))
        return 0

    monkeypatch.setattr(air_history, "record_snapshot", fake_record)
    return calls


class _Tracker:
    last_observed_ms = 0
    last_browser_poll_ms = 0

    async def observe(self, snapshot: dict, db: Any) -> None:
        pass


@pytest.mark.parametrize(
    ("base_url", "expected_mode"),
    [("https://api.adsb.lol/v2", "online"), ("http://adsb-decoder:8080/data/aircraft.json", "offgrid")],
)
async def test_the_watcher_records_its_snapshot_with_its_source(
    monkeypatch, recorded_snapshots, base_url, expected_mode
):
    monkeypatch.setattr(adsb_squawk, "tracker", _Tracker())
    monkeypatch.setattr(adsb_squawk, "_now_ms", lambda: 10_000_000)

    async def passthrough(*_args, **_kwargs):
        return None

    async def effective_mode(domain, db):
        return "online"

    async def interval(db, mode):
        return 1.0

    async def area(db, mode=None):
        return (51.0, -1.0)

    async def urls(domain, db, *, online_default, offgrid_default):
        return (base_url, None)

    async def refresh(db):
        return 60.0

    async def fake_fetch(lat, lon, radius, url, online_interval_seconds=None):
        return {"ac": [{"hex": "a"}]}

    monkeypatch.setattr(adsb_squawk, "resolve_effective_mode", effective_mode)
    monkeypatch.setattr(adsb_squawk, "watch_interval_s", interval)
    monkeypatch.setattr(adsb_squawk, "watch_area", area)
    monkeypatch.setattr(adsb_squawk, "resolve_domain_urls", urls)
    monkeypatch.setattr(adsb_squawk.adsb_service, "online_refresh_interval_s", refresh)
    monkeypatch.setattr(adsb_squawk.adsb_service, "fetch_aircraft", fake_fetch)
    monkeypatch.setattr(adsb_squawk, "_cache_for_the_map", passthrough)

    assert await adsb_squawk.watch_once(None) is True
    assert recorded_snapshots == [({"ac": [{"hex": "a"}]}, expected_mode)]


class TestBrowserPollRecords:
    POINT = "/api/air/adsb/point/54.0/-1.5/100"

    def _patch_fetch(self, monkeypatch, payload):
        async def fake_fetch(lat, lon, radius, base_url, online_interval_seconds=None):
            return payload

        monkeypatch.setattr(adsb_service, "fetch_aircraft", fake_fetch)

    def test_an_online_snapshot_is_recorded_as_online(self, client, monkeypatch, recorded_snapshots):
        client.put("/api/settings/air/onlineDataSourceURL", json={"value": "https://online.example/v2"})
        payload = {"ac": [{"hex": "a", "lat": 54, "lon": -1.5}], "total": 1}
        self._patch_fetch(monkeypatch, payload)
        assert client.get(self.POINT).status_code == 200
        assert recorded_snapshots == [(payload, "online")]

    def test_an_off_grid_snapshot_is_recorded_as_offgrid(self, client, monkeypatch, recorded_snapshots):
        client.put("/api/settings/air/sourceOverride", json={"value": "offgrid"})
        client.put(
            "/api/settings/air/offgridDataSourceURL",
            json={"value": {"url": "http://decoder.example/data/aircraft.json"}},
        )
        payload = {"ac": [], "total": 0}
        self._patch_fetch(monkeypatch, payload)
        assert client.get(self.POINT).status_code == 200
        assert recorded_snapshots == [(payload, "offgrid")]


# ── storage, lifecycle and routes ────────────────────────────────────────────


async def test_recorded_aircraft_land_in_air_position_history(test_engine, db_setup, recording, monkeypatch):
    factory = lambda: AsyncSession(test_engine, expire_on_commit=False)  # noqa: E731
    monkeypatch.setattr(air_history.recorder, "session_factory", factory)
    record_snapshot({"now": 1_000_000, "ac": [{"hex": "abc", "lat": 51, "lon": -1, "flight": "X1"}]}, "online", 0)
    async with factory() as db:
        await air_history.recorder.flush(db)
        rows = (await db.execute(select(AirPositionHistory))).scalars().all()
    assert [(row.entity_id, row.t_ms, row.source_mode, row.extra) for row in rows] == [
        ("abc", 1_000_000, "online", '{"flight":"X1"}')
    ]


def test_the_table_is_not_a_removed_flight_replay_name():
    """Core drops air_snapshots/air_flights/air_aircraft on startup; history must not use them."""
    from backend.database import _REMOVED_TABLES

    assert AirPositionHistory.__tablename__ not in _REMOVED_TABLES


async def test_the_module_starts_and_stops_recording_and_retention(monkeypatch):
    events: list[str] = []

    async def record(name):
        events.append(name)

    async def noop():
        return None

    monkeypatch.setattr(air_module.online_quota.tracker, "load", noop)
    monkeypatch.setattr(air_module.watcher, "start", lambda: events.append("watcher.start"))

    async def watcher_stop():
        events.append("watcher.stop")

    monkeypatch.setattr(air_module.watcher, "stop", watcher_stop)
    monkeypatch.setattr(air_history.recorder, "start", lambda: record("recorder.start"))
    monkeypatch.setattr(air_history.recorder, "stop", lambda: record("recorder.stop"))
    monkeypatch.setattr(air_history.retention, "start", lambda: record("retention.start"))
    monkeypatch.setattr(air_history.retention, "stop", lambda: record("retention.stop"))

    await air_module._start()
    await air_module._stop()
    assert events == [
        "watcher.start",
        "recorder.start",
        "retention.start",
        "watcher.stop",
        "retention.stop",
        "recorder.stop",
    ]


def test_the_history_routes_answer(client):
    status = client.get("/api/air/history/status")
    assert status.status_code == 200
    assert status.json()["enabled"] is False
    assert status.json()["lookbackMs"] == air_history.REPLAY_LOOKBACK_MS
    assert client.get("/api/air/history/coverage").status_code == 200
    assert client.get("/api/air/history/samples").status_code == 422  # from/to are required
