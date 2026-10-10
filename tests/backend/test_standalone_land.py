"""The Land section as its own service (backend/standalone/land.py, P6.2):
its schema, its first-boot work, the app it serves, and the APRS retention
setting read from core over HTTP."""

import importlib
import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from sqlalchemy import inspect
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import database
from backend.config import settings
from backend.platform import settings_client
from backend.services import aprs_store

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
async def land_engine(monkeypatch):
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


class TestCreateLandTables:
    async def test_creates_only_the_land_tables(self, land_engine):
        await database.create_land_tables()

        assert set(await table_columns(land_engine)) == {"aprs_stations", "repeater_cache"}

    async def test_matches_the_monoliths_schema_for_those_tables(self, land_engine):
        await database.create_land_tables()
        land_schema = await table_columns(land_engine)

        monolith = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        try:
            async with monolith.begin() as connection:
                await connection.run_sync(database.Base.metadata.create_all)
            monolith_schema = await table_columns(monolith)
        finally:
            await monolith.dispose()

        for table in database.LAND_TABLES:
            assert land_schema[table] == monolith_schema[table]

    async def test_is_idempotent_and_keeps_existing_rows(self, land_engine):
        await database.create_land_tables()
        async with land_engine.begin() as connection:
            await connection.execute(
                sa_text("INSERT INTO aprs_stations (callsign, latitude, longitude, last_heard_ms) VALUES ('G0ABC', 1, 2, 3)")
            )

        await database.create_land_tables()

        async with land_engine.connect() as connection:
            assert (await connection.execute(sa_text("SELECT callsign FROM aprs_stations"))).scalars().all() == ["G0ABC"]


class TestCreateSectionTables:
    async def test_runs_the_given_column_migrations(self, land_engine):
        async with land_engine.begin() as connection:
            await connection.execute(sa_text("CREATE TABLE repeater_cache (cache_key TEXT PRIMARY KEY)"))

        await database.create_section_tables(
            ("repeater_cache",), ("ALTER TABLE repeater_cache ADD COLUMN probe_column TEXT",)
        )
        # A second run hits the duplicate-column error, which is ignored.
        await database.create_section_tables(
            ("repeater_cache",), ("ALTER TABLE repeater_cache ADD COLUMN probe_column TEXT",)
        )

        assert "probe_column" in (await table_columns(land_engine))["repeater_cache"]


class TestAprsRetentionOverHttp:
    """With SENTINEL_CORE_URL set, the retention window comes from core's settings API."""

    @pytest.fixture
    def core_land_settings(self, monkeypatch) -> dict:
        land_settings: dict = {}
        real_client = httpx.AsyncClient

        def answer(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/api/settings/land"
            return httpx.Response(200, json=land_settings)

        monkeypatch.setattr(settings, "sentinel_core_url", "http://core.test:8000")
        monkeypatch.setattr(
            settings_client.httpx,
            "AsyncClient",
            lambda **options: real_client(transport=httpx.MockTransport(answer), **options),
        )
        return land_settings

    async def test_reads_the_minutes_from_core(self, core_land_settings):
        core_land_settings["aprsRetentionMinutes"] = 30

        assert await aprs_store._retention_ms(None) == 30 * 60_000

    async def test_unset_in_core_uses_the_default(self, core_land_settings):
        assert await aprs_store._retention_ms(None) == settings.aprs_station_ttl_ms

    async def test_the_station_list_honours_cores_retention(self, core_land_settings, monkeypatch):
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        async with engine.begin() as connection:
            await connection.run_sync(database.Base.metadata.create_all)
        monkeypatch.setattr(
            aprs_store, "AsyncSessionLocal", sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
        )
        now = 10 * 60 * 60_000
        await aprs_store.upsert_station(
            {"callsign": "OLD", "latitude": 1.0, "longitude": 2.0}, now - 20 * 60_000
        )
        await aprs_store.upsert_station({"callsign": "NEW", "latitude": 1.0, "longitude": 2.0}, now - 60_000)
        core_land_settings["aprsRetentionMinutes"] = 10

        try:
            stations = await aprs_store.get_stations(now)
        finally:
            await engine.dispose()

        assert [station["callsign"] for station in stations] == ["NEW"]


@pytest.fixture
def land_service(monkeypatch):
    """`backend.standalone.land`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
    monkeypatch.setattr(settings, "service_internal_url", "http://land:8000")
    monkeypatch.delitem(sys.modules, "backend.standalone.land", raising=False)
    module = importlib.import_module("backend.standalone.land")
    yield module
    sys.modules.pop("backend.standalone.land", None)


class TestLandServiceApp:
    def test_cannot_start_without_its_own_address(self, monkeypatch):
        from backend.platform.sdk import ServiceMisconfigured

        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "service_internal_url", "")
        monkeypatch.delitem(sys.modules, "backend.standalone.land", raising=False)

        with pytest.raises(ServiceMisconfigured):
            importlib.import_module("backend.standalone.land")
        sys.modules.pop("backend.standalone.land", None)

    def test_serves_the_land_api_and_its_remote(self, land_service):
        paths = {getattr(route, "path", "") for route in land_service.app.routes}

        assert {"/api/land/aprs/stations", "/api/land/repeaters", "/remotes/land", "/health"} <= paths

    def test_serves_nothing_but_land(self, land_service):
        paths = [getattr(route, "path", "") for route in land_service.app.routes]

        assert not any(
            path.startswith(("/api/air", "/api/space", "/api/sea", "/api/sdr", "/api/settings")) for path in paths
        )

    def test_registers_as_land_at_its_own_address(self, land_service):
        manifest = land_service.app.state.registrar.manifest

        assert manifest.id == "land"
        assert manifest.internal_url == "http://land:8000"
        assert manifest.routes == ["/api/land/"]
        assert manifest.ui is not None and manifest.ui.remote_entry == "/remotes/land/remoteEntry.js"

    def test_hears_decoded_aprs_packets_from_the_bus(self):
        """Importing the Land service alone subscribes its store to the hub's
        decode.aprs.* events (the SDK's NATS transport then forwards them).
        Checked in a fresh interpreter, where nothing else has imported it."""
        probe = (
            "from backend.platform.bus import bus\n"
            "import backend.standalone.land\n"
            "from backend.services import aprs_store\n"
            "print([s.pattern for s in bus._subscriptions if s.handler is aprs_store._on_decode_event])\n"
        )
        environment = {
            **os.environ,
            "PYTHONPATH": str(REPO_ROOT),
            "SENTINEL_CORE_URL": "http://app:8000",
            "SERVICE_INTERNAL_URL": "http://land:8000",
        }
        result = subprocess.run(
            [sys.executable, "-c", probe], cwd=REPO_ROOT, env=environment, capture_output=True, text=True, check=True
        )

        assert result.stdout.strip().splitlines()[-1] == "['decode.aprs.*']"


class TestLandServiceLifecycle:
    async def test_prepare_builds_the_schema_then_imports_the_land_tables(self, land_service, monkeypatch):
        calls: list = []

        async def create_land_tables():
            calls.append("create_land_tables")

        def import_legacy_tables(target, legacy, tables):
            calls.append(("import", target, legacy, tuple(tables)))
            return {}

        monkeypatch.setattr(settings, "db_path", "/data/land.db")
        monkeypatch.setattr(settings, "legacy_db_path", "/legacy/sentinel.db")
        monkeypatch.setattr(land_service, "create_land_tables", create_land_tables)
        monkeypatch.setattr(land_service, "import_legacy_tables", import_legacy_tables)

        await land_service._prepare()

        assert calls == [
            "create_land_tables",
            ("import", "/data/land.db", "/legacy/sentinel.db", ("aprs_stations", "repeater_cache")),
        ]

    async def test_runs_its_schema_then_the_monoliths_cleanup_loop_then_registration(self, monkeypatch):
        from backend.modules import land as land_module
        from backend.platform.lifecycle import ModuleLifecycle
        from backend.platform.sdk.registration import ServiceRegistrar

        calls: list[str] = []

        async def cleanup_start():
            calls.append("cleanup.start")

        async def cleanup_stop():
            calls.append("cleanup.stop")

        async def create_land_tables():
            calls.append("schema")

        async def registrar_stop(self):
            calls.append("registration.stop")

        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "service_internal_url", "http://land:8000")
        monkeypatch.setattr(settings, "nats_url", "")
        monkeypatch.setattr(settings, "legacy_db_path", "")
        # The service composes the monoliths Land lifecycle at import, so swap it first.
        monkeypatch.setattr(
            land_module, "lifecycle", ModuleLifecycle(name="land", start=cleanup_start, stop=cleanup_stop)
        )
        monkeypatch.setattr(ServiceRegistrar, "start", lambda self: calls.append("registration.start"))
        monkeypatch.setattr(ServiceRegistrar, "stop", registrar_stop)
        monkeypatch.delitem(sys.modules, "backend.standalone.land", raising=False)
        service = importlib.import_module("backend.standalone.land")
        monkeypatch.setattr(service, "create_land_tables", create_land_tables)

        try:
            async with service.app.router.lifespan_context(service.app):
                pass
        finally:
            sys.modules.pop("backend.standalone.land", None)

        # Routed to only once its tables exist and the cleanup loop runs;
        # stops re-registering before the loop is stopped.
        assert calls == ["schema", "cleanup.start", "registration.start", "registration.stop", "cleanup.stop"]


class TestLandServiceRemote:
    async def test_serves_lands_own_remote_build(self, monkeypatch, tmp_path):
        from backend.platform import remote_files

        for section_id in ("land", "space"):
            (tmp_path / section_id).mkdir()
            (tmp_path / section_id / "remoteEntry.js").write_text(f"export const section = '{section_id}'")
        monkeypatch.setattr(remote_files, "remotes_dir", lambda: tmp_path)
        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "service_internal_url", "http://land:8000")
        monkeypatch.delitem(sys.modules, "backend.standalone.land", raising=False)
        service = importlib.import_module("backend.standalone.land")

        try:
            transport = httpx.ASGITransport(app=service.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://land:8000") as client:
                response = await client.get("/remotes/land/remoteEntry.js")
        finally:
            sys.modules.pop("backend.standalone.land", None)

        assert response.status_code == 200
        assert response.text == "export const section = 'land'"
