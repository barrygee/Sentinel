"""The radio hub as its own service (sentinel_radio/service.py, P6.5): its
schema, its first-boot work, the app it serves, what it imports and answers on
the bus, and the settings it reads and writes in core over HTTP — the radios,
the APRS/AIS decode radios, the APRS channel and this Sentinel's instance id."""

import importlib
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from backend import database
from backend.config import settings
from backend.core import instance_identity
from backend.database import get_db
from backend.platform import settings_client
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from sentinel_radio import database as radio_hub_database
from sentinel_radio import radios as radio_registry
from sentinel_radio.routers import decode

REPO_ROOT = Path(__file__).resolve().parents[4]
CORE_URL = "http://app:8000"
HUB_URL = "http://radio:8000"
RADIO = {"id": 4, "name": "Shack dongle", "host": "dongle.local", "port": 1234}
# Captured before the `core` fixture swaps httpx.AsyncClient for a fake-core client.
RealAsyncClient = httpx.AsyncClient

INTERNAL_IQ_CAPTURES = "/internal/radio-hub/iq-captures/"


# ── schema ────────────────────────────────────────────────────────────────────


@pytest.fixture
async def hub_engine(monkeypatch):
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


class TestCreateRadioHubTables:
    async def test_creates_only_the_sentry_hosts_table(self, hub_engine):
        await radio_hub_database.create_radio_hub_tables()

        # No user_settings: the radios are a setting, kept in core.
        assert set(await table_columns(hub_engine)) == {"sentry_hosts"}

    async def test_matches_the_monoliths_schema_for_it(self, hub_engine):
        await radio_hub_database.create_radio_hub_tables()
        hub_schema = await table_columns(hub_engine)

        monolith = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        try:
            async with monolith.begin() as connection:
                await connection.run_sync(database.Base.metadata.create_all)
            monolith_schema = await table_columns(monolith)
        finally:
            await monolith.dispose()

        assert radio_hub_database.RADIO_HUB_TABLES == ("sentry_hosts",)
        assert hub_schema["sentry_hosts"] == monolith_schema["sentry_hosts"]

    async def test_is_idempotent(self, hub_engine):
        await radio_hub_database.create_radio_hub_tables()
        await radio_hub_database.create_radio_hub_tables()

        assert set(await table_columns(hub_engine)) == {"sentry_hosts"}

    async def test_the_hub_lifecycle_prepare_builds_it_on_an_empty_database(self, hub_engine):
        from sentinel_radio import module as radio_hub_module

        await radio_hub_module.lifecycle.prepare()

        assert set(await table_columns(hub_engine)) == {"sentry_hosts"}

    def test_registers_its_model_itself_in_a_fresh_interpreter(self, tmp_path):
        # Core's backend.models no longer defines SentryHost, so nothing else
        # registers the table with Base before the hub's prepare runs.
        database_file = tmp_path / "radio.db"
        probe = (
            "import asyncio, json, sqlite3, sys\n"
            "from sentinel_radio.database import create_radio_hub_tables\n"
            "assert 'sentinel_radio.models' not in sys.modules\n"
            "asyncio.run(create_radio_hub_tables())\n"
            f"connection = sqlite3.connect({str(database_file)!r})\n"
            "print(json.dumps(sorted(row[0] for row in connection.execute("
            "\"SELECT name FROM sqlite_master WHERE type = 'table'\"))))\n"
        )
        environment = {**os.environ, "PYTHONPATH": str(REPO_ROOT), "DB_PATH": str(database_file)}

        result = subprocess.run(
            [sys.executable, "-c", probe], cwd=REPO_ROOT, env=environment, capture_output=True, text=True, check=True
        )

        assert json.loads(result.stdout.strip().splitlines()[-1]) == ["sentry_hosts"]


# ── a fake core ───────────────────────────────────────────────────────────────


class FakeCore:
    """Core's settings API: GET a namespace, PUT one key. Records every request."""

    def __init__(self) -> None:
        self.namespaces: dict[str, dict] = {}
        self.requests: list[httpx.Request] = []

    def answer(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        segments = request.url.path.removeprefix("/api/settings/").split("/")
        if not request.url.path.startswith("/api/settings/"):
            return httpx.Response(404, json={"detail": "Not Found"})
        if request.method == "GET" and len(segments) == 1:
            return httpx.Response(200, json=self.namespaces.get(segments[0], {}))
        if request.method == "PUT" and len(segments) == 2:
            namespace, key = segments
            self.namespaces.setdefault(namespace, {})[key] = json.loads(request.content)["value"]
            return httpx.Response(200, json={"namespace": namespace, "key": key})
        return httpx.Response(405, json={"detail": "Method Not Allowed"})

    def writes(self) -> list[tuple[str, object]]:
        """Every PUT, as (path, value), in order."""
        return [
            (request.url.path, json.loads(request.content)["value"])
            for request in self.requests
            if request.method == "PUT"
        ]


@pytest.fixture
def core(monkeypatch) -> FakeCore:
    fake = FakeCore()
    real_client = httpx.AsyncClient
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
    monkeypatch.setattr(
        settings_client.httpx,
        "AsyncClient",
        lambda **options: real_client(transport=httpx.MockTransport(fake.answer), **options),
    )
    return fake


@pytest.fixture
def hub_service(monkeypatch):
    """`sentinel_radio.service`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
    monkeypatch.setattr(settings, "service_internal_url", HUB_URL)
    monkeypatch.delitem(sys.modules, "sentinel_radio.service", raising=False)
    module = importlib.import_module("sentinel_radio.service")
    yield module
    sys.modules.pop("sentinel_radio.service", None)


@pytest.fixture
async def hub_client(hub_service, core, test_engine, db_setup):
    """An HTTP client on the hub service's app; its own database is in memory."""
    session_factory = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)

    async def hub_db():
        async with session_factory() as session:
            yield session

    hub_service.app.dependency_overrides[get_db] = hub_db
    transport = httpx.ASGITransport(app=hub_service.app)
    try:
        async with RealAsyncClient(transport=transport, base_url=HUB_URL) as client:
            yield client
    finally:
        hub_service.app.dependency_overrides.clear()


# ── settings over HTTP ────────────────────────────────────────────────────────


class TestRadiosOverHttp:
    """Radio CRUD, served by the hub container: the radios are core's `sdr.radios` setting."""

    async def test_lists_the_radios_core_holds(self, hub_client, core):
        core.namespaces["sdr"] = {"radios": [RADIO]}

        listed = (await hub_client.get("/api/sdr/radios")).json()

        assert [radio["id"] for radio in listed] == [RADIO["id"]]
        assert listed[0]["device_available"] is True

    async def test_a_non_list_value_in_core_is_no_radios(self, hub_client, core):
        core.namespaces["sdr"] = {"radios": {"not": "a list"}}

        assert (await hub_client.get("/api/sdr/radios")).json() == []

    async def test_creating_a_radio_writes_the_whole_list_back_to_core(self, hub_client, core):
        core.namespaces["sdr"] = {"radios": [RADIO]}

        created = await hub_client.post("/api/sdr/radios", json={"name": "New", "host": "10.0.0.2", "port": 1235})

        assert created.status_code == 201
        assert created.json()["id"] == RADIO["id"] + 1
        [(path, radios)] = core.writes()
        assert path == "/api/settings/sdr/radios"
        assert [radio["name"] for radio in radios] == ["Shack dongle", "New"]

    async def test_deleting_a_radio_removes_it_in_core(self, hub_client, core):
        core.namespaces["sdr"] = {"radios": [RADIO]}

        deleted = await hub_client.delete(f"/api/sdr/radios/{RADIO['id']}")

        assert deleted.status_code == 204
        assert core.namespaces["sdr"]["radios"] == []

    async def test_an_unknown_radio_writes_nothing(self, hub_client, core):
        core.namespaces["sdr"] = {"radios": [RADIO]}

        assert (await hub_client.delete("/api/sdr/radios/999")).status_code == 404
        assert core.writes() == []

    async def test_an_unreachable_core_is_an_error_not_an_empty_list(self, hub_service, monkeypatch):
        def refuse(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("core is down", request=request)

        monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
        monkeypatch.setattr(
            settings_client.httpx,
            "AsyncClient",
            lambda **options: RealAsyncClient(transport=httpx.MockTransport(refuse), **options),
        )

        with pytest.raises(settings_client.SettingsUnavailable):
            await radio_registry.get_radios(None)


class FakeBridge:
    def __init__(self) -> None:
        self.radio_id = None
        self.started_with = None

    async def start(self, bw_hz=None) -> None:
        self.started_with = bw_hz


@pytest.fixture
def fake_radio_io(monkeypatch) -> dict:
    """Stands in for the dongle and the decode bridges; records what was created."""
    created: dict = {}

    async def broadcaster(host, port):
        created["broadcaster"] = (host, port)
        return object()

    async def aprs_bridge(host, port, _broadcaster, *, channel_hz):
        created["aprs"] = (host, port, channel_hz)
        created["aprs_bridge"] = FakeBridge()
        return created["aprs_bridge"]

    async def ais_bridge(host, port, _broadcaster):
        created["ais"] = (host, port)
        return FakeBridge()

    async def stop_bridge(host, port):
        created.setdefault("stopped", []).append((host, port))

    monkeypatch.setattr(decode.sdr_svc, "get_or_create_broadcaster", broadcaster)
    monkeypatch.setattr(decode.sdr_decode, "get_or_create_aprs_bridge", aprs_bridge)
    monkeypatch.setattr(decode.sdr_decode, "get_or_create_ais_bridge", ais_bridge)
    monkeypatch.setattr(decode.sdr_decode, "stop_aprs_bridge", stop_bridge)
    monkeypatch.setattr(decode.sdr_decode, "stop_ais_bridge", stop_bridge)
    return created


class TestDecodeRadiosOverHttp:
    """Which radio APRS and AIS decode on is core's setting; the hub persists it there."""

    async def test_starting_aprs_tunes_to_cores_channel_and_records_the_radio_in_core(
        self, hub_client, core, fake_radio_io
    ):
        core.namespaces["sdr"] = {"radios": [RADIO]}
        core.namespaces["land"] = {"aprsChannelHz": 144_390_000}

        started = await hub_client.post("/api/sdr/aprs/start", json={"radio_id": RADIO["id"]})

        assert started.json() == {"status": "ok", "radio_id": RADIO["id"], "active": True}
        assert fake_radio_io["aprs"] == ("dongle.local", 1234, 144_390_000)
        assert fake_radio_io["aprs_bridge"].radio_id == RADIO["id"]
        assert core.writes() == [("/api/settings/sdr/aprs_radio_id", RADIO["id"])]

    async def test_stopping_aprs_clears_the_radio_in_core(self, hub_client, core, fake_radio_io):
        core.namespaces["sdr"] = {"radios": [RADIO], "aprs_radio_id": RADIO["id"]}

        stopped = await hub_client.post("/api/sdr/aprs/stop", json={"radio_id": RADIO["id"]})

        assert stopped.json()["active"] is False
        assert fake_radio_io["stopped"] == [("dongle.local", 1234)]
        assert core.namespaces["sdr"]["aprs_radio_id"] is None

    async def test_starting_ais_records_the_radio_in_core(self, core, fake_radio_io):
        core.namespaces["sdr"] = {"radios": [RADIO]}

        assert await decode.start_ais_on_radio(None, RADIO["id"]) == {"ok": True}

        assert fake_radio_io["ais"] == ("dongle.local", 1234)
        assert core.writes() == [("/api/settings/sdr/ais_radio_id", RADIO["id"])]

    async def test_stopping_ais_clears_the_radio_in_core(self, core, fake_radio_io):
        core.namespaces["sdr"] = {"radios": [RADIO], "ais_radio_id": RADIO["id"]}

        assert await decode.stop_ais_on_radio(None, RADIO["id"]) == {"ok": True}

        assert core.namespaces["sdr"]["ais_radio_id"] is None

    async def test_an_unknown_radio_writes_nothing(self, core, fake_radio_io):
        core.namespaces["sdr"] = {"radios": [RADIO]}

        assert (await decode.stop_ais_on_radio(None, 999))["reason"] == "unknown_radio"
        assert core.writes() == []


class TestResumeAtStartupOverHttp:
    """The hub's start resumes the decodes core says were running."""

    @pytest.fixture
    def resumed(self, monkeypatch) -> list:
        calls: list = []

        async def start_aprs(radios, radio_id, channel_hz):
            calls.append(("aprs", [radio["id"] for radio in radios], radio_id, channel_hz))

        async def start_ais(radios, radio_id):
            calls.append(("ais", [radio["id"] for radio in radios], radio_id))

        monkeypatch.setattr(decode, "_start_aprs_best_effort", start_aprs)
        monkeypatch.setattr(decode, "_start_ais_best_effort", start_ais)
        return calls

    async def test_resumes_aprs_on_cores_radio_and_channel(self, core, resumed):
        core.namespaces["sdr"] = {"radios": [RADIO], "aprs_radio_id": RADIO["id"]}
        core.namespaces["land"] = {"aprsChannelHz": 144_390_000}

        await decode.resume_persisted_aprs()

        assert resumed == [("aprs", [RADIO["id"]], RADIO["id"], 144_390_000)]

    async def test_resumes_ais_on_cores_radio(self, core, resumed):
        core.namespaces["sdr"] = {"radios": [RADIO], "ais_radio_id": RADIO["id"]}

        await decode.resume_persisted_ais()

        assert resumed == [("ais", [RADIO["id"]], RADIO["id"])]

    @pytest.mark.parametrize("stored", [None, "4", 4.5])
    async def test_resumes_nothing_without_a_radio_id_in_core(self, core, resumed, stored):
        core.namespaces["sdr"] = {"radios": [RADIO], "aprs_radio_id": stored, "ais_radio_id": stored}

        await decode.resume_persisted_aprs()
        await decode.resume_persisted_ais()

        assert resumed == []


class TestInstanceIdentity:
    """`app.instanceId` is core's; the hub names itself with it on Sentry reservations."""

    async def test_reads_the_stored_id_from_core(self, core):
        core.namespaces["app"] = {"instanceId": "sentinel:kept"}

        assert await instance_identity.get_instance_id(None) == "sentinel:kept"
        assert core.writes() == []

    @pytest.mark.parametrize("stored", [None, "", 42])
    async def test_generates_and_stores_one_in_core_when_there_is_none(self, core, stored):
        core.namespaces["app"] = {"instanceId": stored}

        generated = await instance_identity.get_instance_id(None)

        assert generated.startswith("sentinel:") and len(generated) > len("sentinel:")
        assert core.writes() == [("/api/settings/app/instanceId", generated)]
        # Stable from then on: the next call reads it back rather than inventing another.
        assert await instance_identity.get_instance_id(None) == generated

    async def test_in_process_it_is_announced_like_any_settings_write(self, db, monkeypatch):
        from backend.platform.bus import bus

        announced: list = []

        async def record(payload):
            announced.append(payload["keys"])

        monkeypatch.setattr(settings, "sentinel_core_url", "")
        unsubscribe = bus.subscribe("settings.changed.app", record)
        try:
            generated = await instance_identity.get_instance_id(db)
        finally:
            unsubscribe()

        assert announced == [["instanceId"]]
        assert await instance_identity.get_instance_id(db) == generated


class TestRadiosInProcess:
    async def test_saving_the_radios_is_announced_like_any_settings_write(self, db, monkeypatch):
        from backend.platform.bus import bus

        announced: list = []

        async def record(payload):
            announced.append(payload["keys"])

        monkeypatch.setattr(settings, "sentinel_core_url", "")
        unsubscribe = bus.subscribe("settings.changed.sdr", record)
        try:
            await radio_registry.save_radios(db, [RADIO])
        finally:
            unsubscribe()

        assert announced == [["radios"]]
        assert await radio_registry.get_radios(db) == [RADIO]


@pytest.fixture
async def db(test_engine, db_setup):
    session_factory = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session


# ── the service app ───────────────────────────────────────────────────────────

HUB_PATHS = {
    "/api/sdr/radios",
    "/api/sdr/radios/{radio_id}",
    "/api/sdr/connect",
    "/api/sdr/disconnect",
    "/api/sdr/status/{radio_id}",
    "/api/sdr/aprs/start",
    "/api/sdr/aprs/ingest",
    "/api/sdr/ais/start",
    "/api/sdr/ais/ingest",
    "/api/sdr/decode/ingest",
    "/api/sdr/decode/config",
    "/api/sdr/decoders",
    "/api/sdr/decoders/register",
    "/api/sdr/sentry-hosts",
    "/ws/sdr/{radio_id}",
    "/ws/sdr/{radio_id}/iq",
    "/ws/sdr/{radio_id}/decode",
    "/ws/sdr/{radio_id}/decode/audio",
    "/health",
}


class TestRadioHubServiceApp:
    def test_serves_every_hub_route_and_its_health(self, hub_service):
        paths = {getattr(route, "path", "") for route in hub_service.app.routes}

        assert HUB_PATHS <= paths

    def test_every_route_sits_under_a_prefix_it_registers(self, hub_service):
        prefixes = tuple(hub_service.app.state.registrar.manifest.routes)
        paths = {getattr(route, "path", "") for route in hub_service.app.routes} - {"/health"}
        # Except the IQ capture handoff, which only the SDR section calls, at the
        # hub's own address — never through the gateway (P7.3).
        public_paths = {path for path in paths if not path.startswith(INTERNAL_IQ_CAPTURES)}

        assert public_paths and all(path.startswith(prefixes) for path in public_paths)

    def test_serves_finished_iq_captures_to_the_sdr_section(self, hub_service):
        paths = {getattr(route, "path", "") for route in hub_service.app.routes}

        assert f"{INTERNAL_IQ_CAPTURES}{{capture_id}}" in paths

    def test_serves_nothing_of_the_sdr_section_other_sections_or_core(self, hub_service):
        paths = [getattr(route, "path", "") for route in hub_service.app.routes]

        assert not any(
            path.startswith(
                (
                    "/api/sdr/groups",
                    "/api/sdr/frequencies",
                    "/api/sdr/recordings",
                    "/api/sdr/adsb",
                    "/api/air",
                    "/api/space",
                    "/api/land",
                    "/api/sea",
                    "/api/settings",
                    "/internal/registry",
                    "/internal/settings",
                    "/remotes",
                )
            )
            for path in paths
        )

    def test_registers_as_the_radio_hub_at_its_own_address_without_a_remote(self, hub_service):
        from sentinel_radio.module import manifest as monolith_manifest

        manifest = hub_service.app.state.registrar.manifest

        assert (manifest.id, manifest.kind) == ("radio", "radio")
        assert manifest.internal_url == HUB_URL
        assert manifest.routes == monolith_manifest.routes
        assert manifest.ui is None


def probe_fresh_interpreter(probe: str) -> list:
    """Run `probe` in a new interpreter configured as the hub container; return its last line as JSON."""
    environment = {
        **os.environ,
        "PYTHONPATH": str(REPO_ROOT),
        "SENTINEL_CORE_URL": CORE_URL,
        "SERVICE_INTERNAL_URL": HUB_URL,
        "SENTINEL_EXTERNAL_SERVICES": "",
    }
    result = subprocess.run(
        [sys.executable, "-c", probe], cwd=REPO_ROOT, env=environment, capture_output=True, text=True, check=True
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


BUS_PATTERNS_PROBE = (
    "import json\n"
    "from backend.platform.bus import bus\n"
    "import sentinel_radio.service\n"
    "print(json.dumps(sorted({s.pattern for s in bus._subscriptions})))\n"
)


class TestWhatTheHubServiceLoads:
    """Checked in a fresh interpreter, where nothing else has imported anything."""

    def test_loads_no_section(self):
        loaded = probe_fresh_interpreter(
            "import json, sys\n"
            "import sentinel_radio.service\n"
            "print(json.dumps(sorted(m for m in sys.modules if m.startswith(('backend.modules.', 'backend.routers.'))"
            " or m.startswith(('backend.services.', 'sentinel_')))))\n"
        )

        assert [module for module in loaded if module.startswith("backend.modules.")] == ["backend.modules.manifest"]
        assert "sentinel_radio.module" in loaded
        assert not [module for module in loaded if module.startswith("backend.routers.")]
        # No section's package: only the hub's own.
        assert not [
            module for module in loaded if module.startswith("sentinel_") and not module.startswith("sentinel_radio")
        ]
        # No section's services: no SDR data (Land's, Air's and Sea's are packages, above).
        assert "sentinel_sdr.services.sdr_data" not in loaded

    def test_answers_every_hub_request_itself(self):
        patterns = set(probe_fresh_interpreter(BUS_PATTERNS_PROBE))

        assert {
            "hub.iq-capture.start",
            "hub.iq-capture.stop",
            "hub.sentry.reservation.acquire",
            "hub.sentry.reservation.release",
            "hub.sentry.device.address",
            "hub.sentry.host.location",
            "hub.decode.ais.start",
            "hub.decode.ais.stop",
            "hub.decode.ais.status",
        } <= patterns

    def test_hears_the_events_core_publishes_for_it_and_no_sections(self):
        patterns = set(probe_fresh_interpreter(BUS_PATTERNS_PROBE))

        assert {"settings.changed.land", "sdr.decode.radio-reassigned"} <= patterns
        # Decoded packets are the sections' to consume, not the hub's.
        assert not {"decode.aprs.*", "decode.ais.*", "settings.changed.sea"} & patterns


# ── lifecycle ─────────────────────────────────────────────────────────────────


class TestRadioHubServiceLifecycle:
    async def test_prepare_builds_the_schema_then_imports_the_sentry_hosts(self, hub_service, monkeypatch):
        calls: list = []

        async def create_radio_hub_tables():
            calls.append("create_radio_hub_tables")

        def import_legacy_tables(target, legacy, tables):
            calls.append(("import", target, legacy, tuple(tables)))
            return {}

        monkeypatch.setattr(settings, "db_path", "/data/radio.db")
        monkeypatch.setattr(settings, "legacy_db_path", "/legacy/sentinel.db")
        monkeypatch.setattr(hub_service, "create_radio_hub_tables", create_radio_hub_tables)
        monkeypatch.setattr(hub_service, "import_legacy_tables", import_legacy_tables)

        await hub_service._prepare()

        assert calls == [
            "create_radio_hub_tables",
            ("import", "/data/radio.db", "/legacy/sentinel.db", ("sentry_hosts",)),
        ]

    async def test_runs_its_schema_then_the_hub_lifecycle_then_registration(self, monkeypatch):
        from backend.platform.lifecycle import ModuleLifecycle
        from backend.platform.sdk.registration import ServiceRegistrar

        from sentinel_radio import module as radio_hub_module

        calls: list[str] = []

        async def hub_start():
            calls.append("radio.start")

        async def hub_stop():
            calls.append("radio.stop")

        async def create_radio_hub_tables():
            calls.append("schema")

        async def registrar_stop(self):
            calls.append("registration.stop")

        monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
        monkeypatch.setattr(settings, "service_internal_url", HUB_URL)
        monkeypatch.setattr(settings, "nats_url", "")
        monkeypatch.setattr(settings, "legacy_db_path", "")
        # The service composes the monolith's hub lifecycle at import, so swap it first.
        monkeypatch.setattr(
            radio_hub_module, "lifecycle", ModuleLifecycle(name="radio", start=hub_start, stop=hub_stop)
        )
        monkeypatch.setattr(ServiceRegistrar, "start", lambda self: calls.append("registration.start"))
        monkeypatch.setattr(ServiceRegistrar, "stop", registrar_stop)
        monkeypatch.delitem(sys.modules, "sentinel_radio.service", raising=False)
        service = importlib.import_module("sentinel_radio.service")
        monkeypatch.setattr(service, "create_radio_hub_tables", create_radio_hub_tables)

        try:
            async with service.app.router.lifespan_context(service.app):
                pass
        finally:
            sys.modules.pop("sentinel_radio.service", None)

        assert calls == ["schema", "radio.start", "registration.start", "registration.stop", "radio.stop"]
