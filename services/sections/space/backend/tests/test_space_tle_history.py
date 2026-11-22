"""
Tests for Space's replay: the TLE versions kept while `space.historyEnabled`
is on (sentinel_space.services.tle_history), positions / ground tracks /
the terminator recomputed for a past moment (`at`), the `?at=` endpoints,
and the module lifecycle that ages the versions out.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from backend.db_helpers import upsert_setting
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_space import module as space_module
from sentinel_space import router as space_router
from sentinel_space.models import SpaceTleHistory, TleCache
from sentinel_space.services import daynight, satellite, tle, tle_history

ISS_NAME = "ISS (ZARYA)"
# Epoch 26320.5 = 2026-11-16 12:00 UTC.
ISS_LINE1 = "1 25544U 98067A   26320.50000000  .00016717  00000-0  10270-3 0  9005"
ISS_LINE2 = "2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.49560000 10001"
ISS_EPOCH_MS = int(datetime(2026, 11, 16, 12, tzinfo=UTC).timestamp() * 1000)
# A later version of the same orbit: epoch 26322.5 = 2026-11-18 12:00 UTC.
ISS_LATER_LINE1 = "1 25544U 98067A   26322.50000000  .00016717  00000-0  10270-3 0  9005"
ISS_LATER_LINE2 = "2 25544  51.6400 199.0000 0006317  69.9862  25.2906 15.49560000 10031"


@pytest.fixture
async def db(test_engine, db_setup):
    async with AsyncSession(test_engine, expire_on_commit=False) as session:
        yield session


async def enable_history(db, enabled=True):
    await upsert_setting(db, "space", "historyEnabled", enabled)
    await db.commit()


async def versions(db):
    return (await db.execute(select(SpaceTleHistory).order_by(SpaceTleHistory.epoch_ms))).scalars().all()


# ── epoch parsing ────────────────────────────────────────────────────────────


class TestTleEpoch:
    def test_reads_the_epoch_from_line_one(self):
        assert tle_history.tle_epoch_ms(ISS_LINE1) == ISS_EPOCH_MS

    def test_years_57_to_99_are_the_1900s(self):
        line1 = "1 00005U 58002B   58001.00000000  .00000000  00000-0  00000-0 0  9999"
        assert tle_history.tle_epoch_ms(line1) == int(datetime(1958, 1, 1, tzinfo=UTC).timestamp() * 1000)

    def test_fractional_days_become_hours(self):
        line1 = ISS_LINE1.replace("26320.50000000", "26001.25000000")
        assert tle_history.tle_epoch_ms(line1) == int(datetime(2026, 1, 1, 6, tzinfo=UTC).timestamp() * 1000)

    @pytest.mark.parametrize(
        "line1",
        [
            "",
            "1 25544U",
            ISS_LINE1.replace("26320.50000000", "xx320.5000000"),
            ISS_LINE1.replace("26320", "26000"),
            ISS_LINE1.replace("26320", "26400"),
        ],
    )
    def test_unreadable_epochs_are_none(self, line1):
        assert tle_history.tle_epoch_ms(line1) is None


# ── recording ────────────────────────────────────────────────────────────────


class TestRecordTleVersions:
    async def test_nothing_is_kept_while_history_is_off(self, db):
        assert await tle_history.record_tle_versions(db, [(ISS_NAME, ISS_LINE1, ISS_LINE2)]) == 0
        await db.commit()
        assert await versions(db) == []

    async def test_an_empty_batch_is_nothing(self, db):
        await enable_history(db)
        assert await tle_history.record_tle_versions(db, []) == 0

    async def test_keeps_each_new_epoch_once(self, db):
        await enable_history(db)
        await tle_history.record_tle_versions(db, [(ISS_NAME, ISS_LINE1, ISS_LINE2)])
        await tle_history.record_tle_versions(
            db, [(ISS_NAME, ISS_LINE1, ISS_LINE2), (ISS_NAME, ISS_LATER_LINE1, ISS_LATER_LINE2)]
        )
        await db.commit()
        rows = await versions(db)
        assert [(row.norad_id, row.epoch_ms, row.line1) for row in rows] == [
            ("25544", ISS_EPOCH_MS, ISS_LINE1),
            ("25544", ISS_EPOCH_MS + 2 * 86_400_000, ISS_LATER_LINE1),
        ]
        assert all(row.recorded_ms > 0 for row in rows)

    async def test_lines_with_an_unreadable_epoch_are_skipped(self, db):
        await enable_history(db)
        bad = ISS_LINE1.replace("26320.50000000", "nonsense12345")
        assert await tle_history.record_tle_versions(db, [(ISS_NAME, bad, ISS_LINE2)]) == 0

    async def test_store_tle_bulk_records_versions_in_its_transaction(self, db):
        """Every TLE source passes through store_tle_bulk, so all are recorded."""
        await enable_history(db)
        await tle.store_tle_bulk([(ISS_NAME, ISS_LINE1, ISS_LINE2)], "manual", None, None, db)
        assert [row.epoch_ms for row in await versions(db)] == [ISS_EPOCH_MS]


# ── choosing the TLE for a moment ────────────────────────────────────────────


class TestTleLinesAt:
    async def test_uses_the_newest_version_not_after_the_moment(self, db):
        db.add_all(
            [
                SpaceTleHistory(
                    norad_id="25544", epoch_ms=ISS_EPOCH_MS, line1=ISS_LINE1, line2=ISS_LINE2, recorded_ms=1
                ),
                SpaceTleHistory(
                    norad_id="25544",
                    epoch_ms=ISS_EPOCH_MS + 2 * 86_400_000,
                    line1=ISS_LATER_LINE1,
                    line2=ISS_LATER_LINE2,
                    recorded_ms=1,
                ),
            ]
        )
        await db.commit()
        assert await tle_history.tle_lines_at(db, "25544", ISS_EPOCH_MS + 86_400_000) == (ISS_LINE1, ISS_LINE2)
        assert await tle_history.tle_lines_at(db, "25544", ISS_EPOCH_MS + 3 * 86_400_000) == (
            ISS_LATER_LINE1,
            ISS_LATER_LINE2,
        )

    async def test_falls_back_to_the_current_tle(self, db):
        db.add(
            TleCache(
                cache_key="25544",
                payload=f"{ISS_NAME}\n{ISS_LINE1}\n{ISS_LINE2}",
                source="online",
                fetched_at=0,
                expires_at=0,
            )
        )
        await db.commit()
        assert await tle_history.tle_lines_at(db, "25544", ISS_EPOCH_MS - 86_400_000) == (ISS_LINE1, ISS_LINE2)

    async def test_no_tle_at_all_is_none(self, db):
        assert await tle_history.tle_lines_at(db, "99999", ISS_EPOCH_MS) is None

    async def test_a_malformed_cached_tle_is_none(self, db):
        db.add(TleCache(cache_key="25544", payload="ISS only one line", source="online", fetched_at=0, expires_at=0))
        await db.commit()
        assert await tle_history.tle_lines_at(db, "25544", ISS_EPOCH_MS) is None

    async def test_an_empty_cached_payload_is_none(self, db):
        db.add(TleCache(cache_key="25544", payload="", source="online", fetched_at=0, expires_at=0))
        await db.commit()
        assert await tle_history.tle_lines_at(db, "25544", ISS_EPOCH_MS) is None


async def test_history_status(db, monkeypatch):
    async def fake_table_size(session, table_name):
        assert table_name == "space_tle_history"
        return 8192

    monkeypatch.setattr(tle_history, "table_size_bytes", fake_table_size)
    await enable_history(db)
    await upsert_setting(db, "space", "historyRetentionDays", 3)
    db.add(SpaceTleHistory(norad_id="25544", epoch_ms=1, line1=ISS_LINE1, line2=ISS_LINE2, recorded_ms=500))
    await db.commit()
    status = await tle_history.history_status(db)
    assert status["enabled"] is True
    assert status["retentionDays"] == 3
    assert (status["oldestMs"], status["newestMs"], status["tleVersions"], status["satellites"]) == (500, 500, 1, 1)
    assert status["historyBytes"] == 8192
    assert status["databaseBytes"] > 0


# ── propagation at a moment ──────────────────────────────────────────────────


class TestComputeAt:
    MOMENT = datetime(2026, 11, 16, 13, 0, tzinfo=UTC)

    def test_position_at_a_moment_is_deterministic(self):
        first = satellite.compute_position(ISS_LINE1, ISS_LINE2, self.MOMENT)
        again = satellite.compute_position(ISS_LINE1, ISS_LINE2, self.MOMENT)
        assert first == again
        assert -51.7 <= first["lat"] <= 51.7
        assert 380 < first["alt_km"] < 460

    def test_different_moments_give_different_positions(self):
        first = satellite.compute_position(ISS_LINE1, ISS_LINE2, self.MOMENT)
        later = satellite.compute_position(ISS_LINE1, ISS_LINE2, datetime(2026, 11, 16, 13, 10, tzinfo=UTC))
        assert (first["lat"], first["lon"]) != (later["lat"], later["lon"])

    def test_ground_track_is_centred_on_the_moment(self):
        track = satellite.compute_ground_track(ISS_LINE1, ISS_LINE2, self.MOMENT)
        position = satellite.compute_position(ISS_LINE1, ISS_LINE2, self.MOMENT)
        current_orbit_start = next(f for f in track["features"] if f["properties"]["track"] == "orbit1")
        lon, lat = current_orbit_start["geometry"]["coordinates"][0]
        assert lat == pytest.approx(position["lat"], abs=0.01)
        assert ((lon - position["lon"] + 180) % 360) - 180 == pytest.approx(0, abs=0.01)

    def test_terminator_at_a_moment_follows_the_sun(self):
        noon = daynight.compute_terminator(datetime(2026, 6, 21, 12, 0, tzinfo=UTC))
        midnight = daynight.compute_terminator(datetime(2026, 6, 21, 0, 0, tzinfo=UTC))
        assert noon["properties"]["sun_lat"] > 23
        assert abs(noon["properties"]["sun_lon"]) < 5
        assert abs(abs(midnight["properties"]["sun_lon"]) - 180) < 5


# ── endpoints ────────────────────────────────────────────────────────────────


class TestAtEndpoints:
    async def _seed_current(self, client):
        from backend.database import get_db

        async for session in client.app.dependency_overrides[get_db]():
            session.add(
                TleCache(
                    cache_key="25544",
                    payload=f"{ISS_NAME}\n{ISS_LINE1}\n{ISS_LINE2}",
                    source="online",
                    fetched_at=0,
                    expires_at=0,
                )
            )
            await session.commit()
            break

    async def test_iss_at_a_past_moment_never_fetches(self, client, monkeypatch):
        await self._seed_current(client)

        async def no_fetch(*_args, **_kwargs):
            raise AssertionError("replay must not fetch a TLE")

        monkeypatch.setattr(space_router.tle_service, "fetch_tle", no_fetch)
        at = ISS_EPOCH_MS + 3_600_000
        body = client.get("/api/space/iss", params={"at": at}).json()
        expected = satellite.compute_position(ISS_LINE1, ISS_LINE2, datetime.fromtimestamp(at / 1000, tz=UTC))
        assert body["position"] == expected
        assert body["ground_track"]["type"] == "FeatureCollection"
        assert body["footprint"]

    async def test_satellite_at_a_moment_includes_look_angles(self, client):
        await self._seed_current(client)
        body = client.get("/api/space/satellite/25544", params={"at": ISS_EPOCH_MS, "lat": 51.5, "lon": -0.1}).json()
        assert {"az", "el"} <= set(body["position"])

    async def test_a_satellite_with_no_tle_at_that_moment_is_404(self, client):
        await self._seed_current(client)
        response = client.get("/api/space/satellite/43013", params={"at": ISS_EPOCH_MS})
        assert response.status_code == 404

    @pytest.mark.parametrize("at", [5, 9_999_999_999_999, "soon"])
    def test_at_must_be_a_plausible_time(self, client, at):
        assert client.get("/api/space/daynight", params={"at": at}).status_code == 422
        assert client.get("/api/space/iss", params={"at": at}).status_code == 422

    def test_daynight_at_a_moment(self, client):
        at = int(datetime(2026, 6, 21, 12, tzinfo=UTC).timestamp() * 1000)
        body = client.get("/api/space/daynight", params={"at": at}).json()
        assert body["properties"] == daynight.compute_terminator(datetime(2026, 6, 21, 12, tzinfo=UTC))["properties"]

    def test_daynight_without_at_is_now(self, client):
        assert client.get("/api/space/daynight").status_code == 200

    def test_history_status_route(self, client):
        body = client.get("/api/space/history/status").json()
        assert body["enabled"] is False
        assert body["tleVersions"] == 0


async def test_the_module_ages_out_versions(monkeypatch):
    events: list[str] = []

    async def start():
        events.append("start")

    async def stop():
        events.append("stop")

    monkeypatch.setattr(tle_history.retention, "start", start)
    monkeypatch.setattr(tle_history.retention, "stop", stop)
    assert space_module.lifecycle.start is not None
    await space_module.lifecycle.start()
    await space_module.lifecycle.stop()
    assert events == ["start", "stop"]


def test_versions_are_pruned_by_when_they_were_recorded():
    (target,) = tle_history.retention.targets
    assert (target.model, target.time_column) == (SpaceTleHistory, "recorded_ms")
