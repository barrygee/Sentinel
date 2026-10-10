"""The Sea section as its own service (backend/standalone/sea.py, P6.4): its
schema, its first-boot work, the app it serves, what it imports, and its
settings — the AISStream key included — read from core over HTTP."""

import importlib
import json
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
from backend.services import ais_stream, sea_ais_receiver
from backend.services.ais_store import AisVesselStore

REPO_ROOT = Path(__file__).resolve().parents[2]
CORE_URL = "http://app:8000"
JOIN_TOKEN = "service-join-token"
KEY = "abcdef0123456789"
# Captured before the `core` fixture swaps httpx.AsyncClient for a fake-core client.
RealAsyncClient = httpx.AsyncClient


@pytest.fixture
async def sea_engine(monkeypatch):
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


class TestCreateSeaTables:
    async def test_creates_only_the_sea_tables(self, sea_engine):
        await database.create_sea_tables()

        # No user_settings: the AISStream key is a setting, kept in core.
        assert set(await table_columns(sea_engine)) == {"sea_vessel_cache", "sea_vessel_static"}

    async def test_matches_the_monoliths_schema_for_those_tables(self, sea_engine):
        await database.create_sea_tables()
        sea_schema = await table_columns(sea_engine)

        monolith = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        try:
            async with monolith.begin() as connection:
                await connection.run_sync(database.Base.metadata.create_all)
            monolith_schema = await table_columns(monolith)
        finally:
            await monolith.dispose()

        for table in database.SEA_TABLES:
            assert sea_schema[table] == monolith_schema[table]

    async def test_is_idempotent(self, sea_engine):
        await database.create_sea_tables()
        await database.create_sea_tables()

        assert set(await table_columns(sea_engine)) == set(database.SEA_TABLES)


class FakeCore:
    """Core's settings API and its internal secret route; records every request."""

    def __init__(self) -> None:
        self.namespaces: dict[str, dict] = {}
        self.secrets: dict[str, str] = {}
        self.requests: list[httpx.Request] = []

    def answer(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path.startswith("/internal/settings/secrets/"):
            if request.headers.get("Authorization") != f"Bearer {JOIN_TOKEN}":
                return httpx.Response(401, json={"detail": "Invalid join token"})
            secret_path = path.removeprefix("/internal/settings/secrets/")
            if request.method == "GET":
                return httpx.Response(200, json={"value": self.secrets.get(secret_path, "")})
            if request.method == "PUT":
                self.secrets[secret_path] = json.loads(request.content)["value"]
            else:
                self.secrets.pop(secret_path, None)
            return httpx.Response(204)
        if path.startswith("/api/settings/") and request.method == "GET":
            return httpx.Response(200, json=self.namespaces.get(path.rsplit("/", 1)[-1], {}))
        return httpx.Response(404, json={"detail": "Not Found"})


@pytest.fixture
def core(monkeypatch) -> FakeCore:
    fake = FakeCore()
    real_client = httpx.AsyncClient
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
    monkeypatch.setattr(settings, "sentinel_join_token", JOIN_TOKEN)
    monkeypatch.setattr(settings, "aisstream_api_key", "")
    monkeypatch.setattr(
        settings_client.httpx,
        "AsyncClient",
        lambda **options: real_client(transport=httpx.MockTransport(fake.answer), **options),
    )
    return fake


@pytest.fixture
def sea_service(monkeypatch):
    """`backend.standalone.sea`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
    monkeypatch.setattr(settings, "service_internal_url", "http://sea:8000")
    monkeypatch.delitem(sys.modules, "backend.standalone.sea", raising=False)
    module = importlib.import_module("backend.standalone.sea")
    yield module
    sys.modules.pop("backend.standalone.sea", None)


class TestTheAisKeyOverHttp:
    """Settings › SEA's key endpoints, served by the Sea container: the key lives in core."""

    @pytest.fixture
    async def sea_client(self, sea_service, core):
        transport = httpx.ASGITransport(app=sea_service.app)
        async with RealAsyncClient(transport=transport, base_url="http://sea:8000") as client:
            yield client

    async def test_reports_unconfigured_when_core_holds_no_key(self, sea_client):
        response = await sea_client.get("/api/sea/ais-key")

        assert response.json() == {"configured": False, "source": None, "fingerprint": None}

    async def test_saving_stores_the_key_in_core(self, sea_client, core):
        saved = await sea_client.put("/api/sea/ais-key", json={"key": f"  {KEY}  "})

        assert saved.status_code == 200
        assert core.secrets == {"sea/aisstreamApiKey": KEY}
        assert (await sea_client.get("/api/sea/ais-key")).json() == {
            "configured": True,
            "source": "settings",
            "fingerprint": ais_stream.key_fingerprint(KEY),
        }

    async def test_the_response_never_carries_the_key(self, sea_client, core):
        core.secrets["sea/aisstreamApiKey"] = KEY

        assert KEY not in (await sea_client.get("/api/sea/ais-key")).text

    async def test_an_invalid_key_never_reaches_core(self, sea_client, core):
        response = await sea_client.put("/api/sea/ais-key", json={"key": "bad key with spaces"})

        assert response.status_code == 422
        assert core.requests == []

    async def test_forgetting_deletes_it_from_core_and_the_env_key_applies(self, sea_client, core, monkeypatch):
        monkeypatch.setattr(settings, "aisstream_api_key", "env-key-0000000")
        core.secrets["sea/aisstreamApiKey"] = KEY

        assert (await sea_client.delete("/api/sea/ais-key")).status_code == 200

        assert core.secrets == {}
        assert (await sea_client.get("/api/sea/ais-key")).json()["source"] == "env"

    async def test_a_core_that_refuses_the_token_is_an_error_not_a_missing_key(self, sea_client, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_join_token", "stale-token")

        with pytest.raises(settings_client.SettingsUnavailable, match="401"):
            await sea_client.get("/api/sea/ais-key")


class TestTheAisReaderOverHttp:
    async def test_reads_seas_settings_and_its_key_from_core(self, core):
        core.namespaces["sea"] = {
            "enabled": True,
            "sourceOverride": "offgrid",
            "aisBoundingBoxes": [[[50, -2], [52, 2]]],
        }
        core.secrets["sea/aisstreamApiKey"] = KEY

        config = await ais_stream.AisStreamReader(AisVesselStore())._read_config()

        assert config["enabled"] is True
        assert config["api_key"] == KEY
        assert config["bounding_boxes"] == [[[50, -2], [52, 2]]]
        assert config["source_mode"] == "offgrid"
        # Off grid the AISStream URL is only the fallback: no off-grid URL is set.
        assert config["mode"] == "no-source" and config["url"] is None

    async def test_falls_back_to_the_env_key_when_core_holds_none(self, core, monkeypatch):
        monkeypatch.setattr(settings, "aisstream_api_key", " env-key-0000000 ")

        config = await ais_stream.AisStreamReader(AisVesselStore())._read_config()

        assert config["api_key"] == "env-key-0000000"

    async def test_the_global_mode_comes_from_cores_app_settings(self, core):
        core.namespaces["app"] = {"connectivityMode": "offgrid"}

        config = await ais_stream.AisStreamReader(AisVesselStore())._read_config()

        assert config["source_mode"] == "offgrid"

    async def test_one_tick_reads_each_thing_once(self, core):
        """Every read is a round trip to core: the Sea namespace, app's mode, the key."""
        await ais_stream.AisStreamReader(AisVesselStore())._read_config()

        assert sorted(request.url.path for request in core.requests) == [
            "/api/settings/app",
            "/api/settings/sea",
            "/internal/settings/secrets/sea/aisstreamApiKey",
        ]


class TestTheReceiverOverHttp:
    async def test_asks_the_hub_to_decode_the_radio_core_designates_off_grid(self, core, monkeypatch):
        core.namespaces["sea"] = {"aisSdrRadioId": 4, "sourceOverride": "offgrid"}
        requests: list[tuple[str, dict]] = []

        async def request(subject, payload, timeout=5.0):
            requests.append((subject, payload))
            return {"ok": True}

        monkeypatch.setattr(sea_ais_receiver.bus, "request", request)

        assert await sea_ais_receiver.reconcile(None) == {"ok": True}
        assert requests == [("hub.decode.ais.start", {"radio_id": 4, "db": None})]

    async def test_online_it_stops_the_radio_the_hub_reports_decoding(self, core, monkeypatch):
        core.namespaces["sea"] = {"aisSdrRadioId": 4, "sourceOverride": "online"}
        core.namespaces["sdr"] = {"ais_radio_id": 4}
        requests: list[str] = []

        async def request(subject, payload, timeout=5.0):
            requests.append(subject)
            return {"ok": True}

        monkeypatch.setattr(sea_ais_receiver.bus, "request", request)

        await sea_ais_receiver.reconcile(None)

        assert requests == ["hub.decode.ais.stop"]


class TestSeaServiceApp:
    def test_serves_sea_and_its_remote(self, sea_service):
        paths = {getattr(route, "path", "") for route in sea_service.app.routes}

        assert {
            "/api/sea/vessels",
            "/api/sea/vessels/{mmsi}/track",
            "/api/sea/status",
            "/api/sea/ais-key",
            "/remotes/sea",
            "/health",
        } <= paths

    def test_serves_nothing_of_other_sections_or_core(self, sea_service):
        paths = [getattr(route, "path", "") for route in sea_service.app.routes]

        assert not any(
            path.startswith(("/api/air", "/api/space", "/api/land", "/api/sdr", "/api/settings", "/internal"))
            for path in paths
        )

    def test_registers_as_sea_at_its_own_address(self, sea_service):
        manifest = sea_service.app.state.registrar.manifest

        assert manifest.id == "sea"
        assert manifest.internal_url == "http://sea:8000"
        assert manifest.routes == ["/api/sea/"]
        assert manifest.ui is not None and manifest.ui.remote_entry == "/remotes/sea/remoteEntry.js"


def probe_fresh_interpreter(probe: str) -> list:
    """Run `probe` in a new interpreter configured as the Sea container; return its last line as JSON."""
    environment = {
        **os.environ,
        "PYTHONPATH": str(REPO_ROOT),
        "SENTINEL_CORE_URL": CORE_URL,
        "SERVICE_INTERNAL_URL": "http://sea:8000",
        "SENTINEL_EXTERNAL_SERVICES": "",
    }
    result = subprocess.run(
        [sys.executable, "-c", probe], cwd=REPO_ROOT, env=environment, capture_output=True, text=True, check=True
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


class TestWhatTheSeaServiceLoads:
    """Checked in a fresh interpreter, where nothing else has imported anything."""

    def test_loads_no_other_section_and_not_the_radio_hub(self):
        loaded = probe_fresh_interpreter(
            "import json, sys\n"
            "import backend.standalone.sea\n"
            "print(json.dumps(sorted(m for m in sys.modules if m.startswith(('backend.modules.', 'backend.radio_hub')))))\n"
        )

        assert loaded == ["backend.modules.manifest", "backend.modules.sea"]

    def test_answers_no_hub_request_itself_so_they_cross_nats(self):
        patterns = probe_fresh_interpreter(
            "import json\n"
            "from backend.platform.bus import bus\n"
            "import backend.standalone.sea\n"
            "print(json.dumps(sorted({s.pattern for s in bus._subscriptions})))\n"
        )

        assert not [pattern for pattern in patterns if pattern.startswith("hub.")]

    def test_hears_decoded_ais_and_the_settings_its_receiver_follows(self):
        patterns = probe_fresh_interpreter(
            "import json\n"
            "from backend.platform.bus import bus\n"
            "import backend.standalone.sea\n"
            "print(json.dumps(sorted({s.pattern for s in bus._subscriptions})))\n"
        )

        assert {"decode.ais.*", "settings.changed.sea", "settings.changed.app"} <= set(patterns)
        # Nobody else's events: no APRS store, no squawk tracker.
        assert "decode.aprs.*" not in patterns
        assert "air.squawk.changed" not in patterns


class TestSeaServiceLifecycle:
    async def test_prepare_builds_the_schema_then_imports_the_sea_tables(self, sea_service, monkeypatch):
        calls: list = []

        async def create_sea_tables():
            calls.append("create_sea_tables")

        def import_legacy_tables(target, legacy, tables):
            calls.append(("import", target, legacy, tuple(tables)))
            return {}

        monkeypatch.setattr(settings, "db_path", "/data/sea.db")
        monkeypatch.setattr(settings, "legacy_db_path", "/legacy/sentinel.db")
        monkeypatch.setattr(sea_service, "create_sea_tables", create_sea_tables)
        monkeypatch.setattr(sea_service, "import_legacy_tables", import_legacy_tables)

        await sea_service._prepare()

        assert calls == [
            "create_sea_tables",
            ("import", "/data/sea.db", "/legacy/sentinel.db", ("sea_vessel_cache", "sea_vessel_static")),
        ]

    async def test_runs_its_schema_then_the_sea_lifecycle_then_registration(self, monkeypatch):
        from backend.modules import sea as sea_module
        from backend.platform.lifecycle import ModuleLifecycle
        from backend.platform.sdk.registration import ServiceRegistrar

        calls: list[str] = []

        async def sea_start():
            calls.append("sea.start")

        async def sea_stop():
            calls.append("sea.stop")

        async def create_sea_tables():
            calls.append("schema")

        async def registrar_stop(self):
            calls.append("registration.stop")

        monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
        monkeypatch.setattr(settings, "service_internal_url", "http://sea:8000")
        monkeypatch.setattr(settings, "nats_url", "")
        monkeypatch.setattr(settings, "legacy_db_path", "")
        # The service composes the monolith's Sea lifecycle at import, so swap it first.
        monkeypatch.setattr(sea_module, "lifecycle", ModuleLifecycle(name="sea", start=sea_start, stop=sea_stop))
        monkeypatch.setattr(ServiceRegistrar, "start", lambda self: calls.append("registration.start"))
        monkeypatch.setattr(ServiceRegistrar, "stop", registrar_stop)
        monkeypatch.delitem(sys.modules, "backend.standalone.sea", raising=False)
        service = importlib.import_module("backend.standalone.sea")
        monkeypatch.setattr(service, "create_sea_tables", create_sea_tables)

        try:
            async with service.app.router.lifespan_context(service.app):
                pass
        finally:
            sys.modules.pop("backend.standalone.sea", None)

        assert calls == ["schema", "sea.start", "registration.start", "registration.stop", "sea.stop"]

