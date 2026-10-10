"""The Air section as its own service (backend/standalone/air.py, P6.3): its
schema, its first-boot work, the app it serves, and its settings read from
core over HTTP."""

import importlib
import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from backend import database
from backend.config import settings
from backend.platform import settings_client
from backend.services import adsb_source, adsb_squawk
from backend.utils import resolve_effective_mode

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
async def air_engine(monkeypatch):
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


class TestCreateAirTables:
    async def test_creates_only_the_air_tables_not_cores_notifications(self, air_engine):
        await database.create_air_tables()

        # air_messages is core's (notifications), despite the name.
        assert set(await table_columns(air_engine)) == {"adsb_cache", "air_tracking"}

    async def test_matches_the_monoliths_schema_for_those_tables(self, air_engine):
        await database.create_air_tables()
        air_schema = await table_columns(air_engine)

        monolith = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        try:
            async with monolith.begin() as connection:
                await connection.run_sync(database.Base.metadata.create_all)
            monolith_schema = await table_columns(monolith)
        finally:
            await monolith.dispose()

        for table in database.AIR_TABLES:
            assert air_schema[table] == monolith_schema[table]


class FakeCore:
    """Core's settings API: serves namespaces and records writes."""

    def __init__(self) -> None:
        self.namespaces: dict[str, dict] = {}
        self.writes: list[tuple[str, object]] = []

    def answer(self, request: httpx.Request) -> httpx.Response:
        segments = request.url.path.split("/")
        if request.method == "PUT":
            import json

            self.writes.append(("/".join(segments[3:]), json.loads(request.content)["value"]))
            return httpx.Response(200, json={"status": "ok"})
        return httpx.Response(200, json=self.namespaces.get(segments[-1], {}))


@pytest.fixture
def core(monkeypatch) -> FakeCore:
    fake = FakeCore()
    real_client = httpx.AsyncClient
    monkeypatch.setattr(settings, "sentinel_core_url", "http://core.test:8000")
    monkeypatch.setattr(
        settings_client.httpx,
        "AsyncClient",
        lambda **options: real_client(transport=httpx.MockTransport(fake.answer), **options),
    )
    return fake


class TestAirSettingsOverHttp:
    async def test_the_off_grid_source_device_is_read_from_core(self, core):
        core.namespaces["air"] = {"offgridSdrSource": {"sentry_host_id": 3, "sentry_device_id": "dongle-1"}}

        assert await adsb_source.get_source(None) == adsb_source.AdsbSource(host_id=3, device_id="dongle-1")

    async def test_no_source_in_core_is_none(self, core):
        assert await adsb_source.get_source(None) is None

    async def test_picking_a_source_writes_it_to_core(self, core):
        await adsb_source.set_source(None, 3, "dongle-1")

        assert core.writes == [("air/offgridSdrSource", {"sentry_host_id": 3, "sentry_device_id": "dongle-1"})]

    async def test_clearing_the_source_releases_then_writes_null_to_core(self, core, monkeypatch):
        calls: list[str] = []

        async def release(db):
            calls.append("release")
            assert core.writes == []  # released before the setting is cleared

        monkeypatch.setattr(adsb_source, "release", release)

        await adsb_source.clear_source(None)

        assert calls == ["release"]
        assert core.writes == [("air/offgridSdrSource", None)]

    @pytest.mark.parametrize(
        ("air_settings", "app_settings", "expected"),
        [
            ({}, {}, "online"),
            ({}, {"connectivityMode": "offgrid"}, "offgrid"),
            ({"sourceOverride": "online"}, {"connectivityMode": "offgrid"}, "online"),
            ({"sourceOverride": "offgrid"}, {"connectivityMode": "online"}, "offgrid"),
        ],
    )
    async def test_the_effective_mode_follows_cores_settings(self, core, air_settings, app_settings, expected):
        core.namespaces["air"] = air_settings
        core.namespaces["app"] = app_settings

        assert await resolve_effective_mode("air", None) == expected

    async def test_the_squawk_watcher_looks_around_the_location_held_in_core(self, core):
        core.namespaces["app"] = {"connectivityMode": "online", "location": {"latitude": "51.5", "longitude": "-0.12"}}

        assert await adsb_squawk.watch_area(None) == (51.5, -0.12)

    async def test_the_squawk_watcher_idles_while_core_has_no_location(self, core):
        core.namespaces["app"] = {"connectivityMode": "online", "location": {"latitude": "", "longitude": ""}}

        assert await adsb_squawk.watch_area(None) is None


@pytest.fixture
def air_service(monkeypatch):
    """`backend.standalone.air`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
    monkeypatch.setattr(settings, "service_internal_url", "http://air:8000")
    monkeypatch.delitem(sys.modules, "backend.standalone.air", raising=False)
    module = importlib.import_module("backend.standalone.air")
    yield module
    sys.modules.pop("backend.standalone.air", None)


class TestAirServiceApp:
    def test_serves_air_and_the_adsb_source_api_and_its_remote(self, air_service):
        paths = {getattr(route, "path", "") for route in air_service.app.routes}

        assert {
            "/api/air/tracking",
            "/api/air/adsb/point/{lat}/{lon}/{radius}",
            "/api/sdr/adsb/source",
            "/api/sdr/adsb/config",
            "/remotes/air",
            "/health",
        } <= paths

    def test_leaves_notifications_to_core(self, air_service):
        paths = [getattr(route, "path", "") for route in air_service.app.routes]

        assert not any(path.startswith("/api/air/messages") for path in paths)

    def test_serves_nothing_of_other_sections(self, air_service):
        paths = [getattr(route, "path", "") for route in air_service.app.routes]
        sdr_paths = [path for path in paths if path.startswith("/api/sdr/")]

        assert all(path.startswith("/api/sdr/adsb/") for path in sdr_paths)
        assert not any(path.startswith(("/api/space", "/api/sea", "/api/land", "/api/settings")) for path in paths)

    def test_registers_as_air_at_its_own_address(self, air_service):
        manifest = air_service.app.state.registrar.manifest

        assert manifest.id == "air"
        assert manifest.internal_url == "http://air:8000"
        assert manifest.routes == ["/api/air/", "/api/sdr/adsb/"]
        assert manifest.ui is not None and manifest.ui.remote_entry == "/remotes/air/remoteEntry.js"

    def test_its_squawk_tracker_hears_squawk_changes_from_the_bus(self):
        """Importing the Air service alone subscribes its squawk alerts, so a
        change published anywhere on the bus raises an alert. Checked in a
        fresh interpreter, where nothing else has imported it."""
        probe = (
            "from backend.platform.bus import bus\n"
            "import backend.standalone.air\n"
            "from backend.services import adsb_squawk\n"
            "print([s.pattern for s in bus._subscriptions if s.handler is adsb_squawk._on_squawk_changed])\n"
        )
        environment = {
            **os.environ,
            "PYTHONPATH": str(REPO_ROOT),
            "SENTINEL_CORE_URL": "http://app:8000",
            "SERVICE_INTERNAL_URL": "http://air:8000",
        }
        result = subprocess.run(
            [sys.executable, "-c", probe], cwd=REPO_ROOT, env=environment, capture_output=True, text=True, check=True
        )

        assert result.stdout.strip().splitlines()[-1] == "['air.squawk.changed']"

    async def test_serves_airs_own_remote_build(self, monkeypatch, tmp_path):
        from backend.platform import remote_files

        for section_id in ("air", "land"):
            (tmp_path / section_id).mkdir()
            (tmp_path / section_id / "remoteEntry.js").write_text(f"export const section = '{section_id}'")
        monkeypatch.setattr(remote_files, "remotes_dir", lambda: tmp_path)
        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "service_internal_url", "http://air:8000")
        monkeypatch.delitem(sys.modules, "backend.standalone.air", raising=False)
        service = importlib.import_module("backend.standalone.air")

        try:
            transport = httpx.ASGITransport(app=service.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://air:8000") as client:
                response = await client.get("/remotes/air/remoteEntry.js")
        finally:
            sys.modules.pop("backend.standalone.air", None)

        assert response.text == "export const section = 'air'"


class TestAirServiceLifecycle:
    async def test_prepare_builds_the_schema_then_imports_the_air_tables(self, air_service, monkeypatch):
        calls: list = []

        async def create_air_tables():
            calls.append("create_air_tables")

        def import_legacy_tables(target, legacy, tables):
            calls.append(("import", target, legacy, tuple(tables)))
            return {}

        monkeypatch.setattr(settings, "db_path", "/data/air.db")
        monkeypatch.setattr(settings, "legacy_db_path", "/legacy/sentinel.db")
        monkeypatch.setattr(air_service, "create_air_tables", create_air_tables)
        monkeypatch.setattr(air_service, "import_legacy_tables", import_legacy_tables)

        await air_service._prepare()

        assert calls == [
            "create_air_tables",
            ("import", "/data/air.db", "/legacy/sentinel.db", ("adsb_cache", "air_tracking")),
        ]

    async def test_runs_its_schema_then_the_squawk_watcher_then_registration(self, monkeypatch):
        from backend.modules import air as air_module
        from backend.platform.lifecycle import ModuleLifecycle
        from backend.platform.sdk.registration import ServiceRegistrar

        calls: list[str] = []

        async def watcher_start():
            calls.append("watcher.start")

        async def watcher_stop():
            calls.append("watcher.stop")

        async def create_air_tables():
            calls.append("schema")

        async def registrar_stop(self):
            calls.append("registration.stop")

        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "service_internal_url", "http://air:8000")
        monkeypatch.setattr(settings, "nats_url", "")
        monkeypatch.setattr(settings, "legacy_db_path", "")
        # The service composes the monolith's Air lifecycle at import, so swap it first.
        monkeypatch.setattr(air_module, "lifecycle", ModuleLifecycle(name="air", start=watcher_start, stop=watcher_stop))
        monkeypatch.setattr(ServiceRegistrar, "start", lambda self: calls.append("registration.start"))
        monkeypatch.setattr(ServiceRegistrar, "stop", registrar_stop)
        monkeypatch.delitem(sys.modules, "backend.standalone.air", raising=False)
        service = importlib.import_module("backend.standalone.air")
        monkeypatch.setattr(service, "create_air_tables", create_air_tables)

        try:
            async with service.app.router.lifespan_context(service.app):
                pass
        finally:
            sys.modules.pop("backend.standalone.air", None)

        assert calls == ["schema", "watcher.start", "registration.start", "registration.stop", "watcher.stop"]
