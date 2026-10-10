"""The Space section as its own service (backend/standalone/space.py, P6.1):
its schema, its first-boot work, and the app it serves."""

import importlib
import sys

import pytest
from sqlalchemy import inspect
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from backend import database
from backend.config import settings
from backend.platform import settings_client
from backend.platform.settings_client import SettingsUnavailable


@pytest.fixture
async def space_engine(monkeypatch):
    """An empty in-memory database wired in as `database.engine`."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    monkeypatch.setattr(database, "engine", engine)
    yield engine
    await engine.dispose()


async def table_columns(engine) -> dict[str, set[str]]:
    async with engine.connect() as connection:
        return await connection.run_sync(
            lambda sync: {
                table: {column["name"] for column in inspect(sync).get_columns(table)}
                for table in inspect(sync).get_table_names()
            }
        )


class TestCreateSpaceTables:
    async def test_creates_only_the_space_tables(self, space_engine):
        await database.create_space_tables()

        assert set(await table_columns(space_engine)) == {"tle_cache", "satellite_catalogue"}

    async def test_matches_the_monoliths_schema_for_those_tables(self, space_engine):
        await database.create_space_tables()
        space_schema = await table_columns(space_engine)

        monolith = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        try:
            async with monolith.begin() as connection:
                await connection.run_sync(database.Base.metadata.create_all)
            monolith_schema = await table_columns(monolith)
        finally:
            await monolith.dispose()

        for table in database.SPACE_TABLES:
            assert space_schema[table] == monolith_schema[table]

    async def test_adds_the_later_columns_to_an_old_catalogue(self, space_engine):
        async with space_engine.begin() as connection:
            await connection.execute(
                sa_text("CREATE TABLE satellite_catalogue (norad_id TEXT PRIMARY KEY, name TEXT)")
            )

        await database.create_space_tables()

        columns = (await table_columns(space_engine))["satellite_catalogue"]
        assert {"name_source", "uplink_hz", "downlink_hz", "radio_notes"} <= columns

    async def test_is_idempotent(self, space_engine):
        await database.create_space_tables()
        await database.create_space_tables()

        assert set(await table_columns(space_engine)) == {"tle_cache", "satellite_catalogue"}


class TestBackfillSatelliteRadioStore:
    """The reconcile reads and writes core's store through the settings client —
    so it works the same in the monolith and over HTTP from the Space service."""

    @pytest.fixture
    def store(self, monkeypatch):
        state: dict = {"value": None, "writes": []}

        async def read_setting(db, namespace, key, default=None):
            assert (namespace, key) == ("space", "satelliteRadio")
            return state["value"] if state["value"] is not None else default

        async def write_setting(db, namespace, key, value, **options):
            state["writes"].append((namespace, key, value))

        monkeypatch.setattr(settings_client, "read_setting", read_setting)
        monkeypatch.setattr(settings_client, "write_setting", write_setting)
        return state

    @pytest.fixture
    def radio_file(self, monkeypatch):
        from backend.services import sat_radio

        file_map: dict = {}
        monkeypatch.setattr(sat_radio, "load_radio_file", lambda: file_map)
        return file_map

    async def test_seeds_an_unset_store_from_the_file(self, store, radio_file):
        radio_file["25544"] = {"downlink_hz": 145800000}

        await database.backfill_satellite_radio_store()

        assert store["writes"] == [("space", "satelliteRadio", {"25544": {"downlink_hz": 145800000}})]

    async def test_seeds_an_unset_store_even_from_an_empty_file(self, store, radio_file):
        await database.backfill_satellite_radio_store()

        assert store["writes"] == [("space", "satelliteRadio", {})]

    async def test_writes_nothing_when_already_in_sync(self, store, radio_file):
        radio_file["25544"] = {"downlink_hz": 145800000}
        store["value"] = {"25544": {"downlink_hz": 145800000}}

        await database.backfill_satellite_radio_store()

        assert store["writes"] == []

    async def test_the_file_wins_per_satellite_and_store_only_entries_are_kept(self, store, radio_file):
        radio_file["25544"] = {"downlink_hz": 145800000}
        store["value"] = {"25544": {"downlink_hz": 1}, "40069": {"beacon_hz": 137100000}}

        await database.backfill_satellite_radio_store()

        assert store["writes"] == [
            (
                "space",
                "satelliteRadio",
                {"25544": {"downlink_hz": 145800000}, "40069": {"beacon_hz": 137100000}},
            )
        ]

    async def test_a_corrupt_stored_value_is_replaced(self, store, radio_file):
        radio_file["25544"] = {"downlink_hz": 145800000}
        store["value"] = ["not", "a", "map"]

        await database.backfill_satellite_radio_store()

        assert store["writes"] == [("space", "satelliteRadio", {"25544": {"downlink_hz": 145800000}})]


@pytest.fixture
def space_service(monkeypatch):
    """`backend.standalone.space`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
    monkeypatch.setattr(settings, "service_internal_url", "http://space:8000")
    monkeypatch.delitem(sys.modules, "backend.standalone.space", raising=False)
    module = importlib.import_module("backend.standalone.space")
    yield module
    sys.modules.pop("backend.standalone.space", None)


class TestSpaceServiceApp:
    def test_cannot_start_without_cores_address(self, monkeypatch):
        from backend.platform.sdk import ServiceMisconfigured

        monkeypatch.setattr(settings, "sentinel_core_url", "")
        monkeypatch.delitem(sys.modules, "backend.standalone.space", raising=False)

        with pytest.raises(ServiceMisconfigured):
            importlib.import_module("backend.standalone.space")
        sys.modules.pop("backend.standalone.space", None)

    def test_serves_the_space_api_and_its_remote(self, space_service):
        paths = {getattr(route, "path", "") for route in space_service.app.routes}

        assert "/api/space/iss" in paths
        assert "/api/space/tle/status" in paths
        assert "/remotes/space" in paths
        assert "/health" in paths

    def test_serves_nothing_but_space(self, space_service):
        paths = [getattr(route, "path", "") for route in space_service.app.routes]

        assert not any(path.startswith(("/api/air", "/api/sea", "/api/sdr", "/api/settings")) for path in paths)

    def test_registers_as_space_at_its_own_address(self, space_service):
        manifest = space_service.app.state.registrar.manifest

        assert manifest.id == "space"
        assert manifest.internal_url == "http://space:8000"
        assert manifest.routes == ["/api/space/"]
        assert manifest.ui is not None and manifest.ui.remote_entry == "/remotes/space/remoteEntry.js"


class TestSpaceServicePrepare:
    async def test_builds_the_schema_then_imports_then_backfills(self, space_service, monkeypatch):
        calls: list = []

        async def create_space_tables():
            calls.append("create_space_tables")

        def import_legacy_tables(target, legacy, tables):
            calls.append(("import", target, legacy, tuple(tables)))
            return {}

        async def backfill():
            calls.append("backfill")

        monkeypatch.setattr(settings, "db_path", "/data/space.db")
        monkeypatch.setattr(settings, "legacy_db_path", "/legacy/sentinel.db")
        monkeypatch.setattr(space_service, "create_space_tables", create_space_tables)
        monkeypatch.setattr(space_service, "import_legacy_tables", import_legacy_tables)
        monkeypatch.setattr(space_service, "backfill_satellite_radio_store", backfill)

        await space_service._prepare()

        # The tables must exist before the import fills them.
        assert calls == [
            "create_space_tables",
            ("import", "/data/space.db", "/legacy/sentinel.db", ("tle_cache", "satellite_catalogue")),
            "backfill",
        ]

    async def test_the_backfill_waits_for_core(self, space_service, monkeypatch):
        attempts: list[int] = []

        async def backfill():
            attempts.append(1)
            if len(attempts) < 3:
                raise SettingsUnavailable("core is still starting")

        monkeypatch.setattr(space_service, "CORE_RETRY_S", 0)
        monkeypatch.setattr(space_service, "backfill_satellite_radio_store", backfill)

        await space_service._backfill_when_core_is_up()

        assert len(attempts) == 3

    async def test_other_backfill_errors_are_not_swallowed(self, space_service, monkeypatch):
        async def backfill():
            raise RuntimeError("bad radio file")

        monkeypatch.setattr(space_service, "backfill_satellite_radio_store", backfill)

        with pytest.raises(RuntimeError, match="bad radio file"):
            await space_service._backfill_when_core_is_up()
