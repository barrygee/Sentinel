"""The SDR section as its own service (sentinel_sdr.service, P6.6): its
schema and recordings folder, its first-boot import of the tables and the
recordings' files, the app it serves, what it imports and hears on the bus,
and the settings it reads and writes in core over HTTP — the band plan,
`recordRawIq` and the settings mirrors of its tables."""

import importlib
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from backend import database
from backend.config import settings
from backend.database import get_db
from backend.platform import settings_client
from sqlalchemy import create_engine, inspect
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from sentinel_sdr import database as sdr_database
from sentinel_sdr.models import SdrRecording
from sentinel_sdr.services import sdr_data

REPO_ROOT = Path(__file__).resolve().parents[5]
CORE_URL = "http://app:8000"
SDR_URL = "http://sdr:8000"
# Captured before the `core` fixture swaps httpx.AsyncClient for a fake-core client.
RealAsyncClient = httpx.AsyncClient


# ── schema ────────────────────────────────────────────────────────────────────


@pytest.fixture
async def sdr_engine(monkeypatch, tmp_path):
    """An empty in-memory database wired in as `database.engine`, its folder in `tmp_path`."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "data" / "sdr.db"))
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


class TestCreateSdrTables:
    async def test_creates_only_the_sdr_tables(self, sdr_engine):
        await sdr_database.create_sdr_tables()

        # No user_settings: the band plan and the mirrors are settings, kept in core.
        assert set(await table_columns(sdr_engine)) == {
            "sdr_frequency_groups",
            "sdr_stored_frequencies",
            "sdr_frequency_group_links",
            "sdr_search_ranges",
            "sdr_recordings",
        }

    async def test_matches_the_monoliths_schema_for_those_tables(self, sdr_engine):
        await sdr_database.create_sdr_tables()
        sdr_schema = await table_columns(sdr_engine)

        monolith = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        try:
            async with monolith.begin() as connection:
                await connection.run_sync(database.Base.metadata.create_all)
            monolith_schema = await table_columns(monolith)
        finally:
            await monolith.dispose()

        for table in sdr_database.SDR_TABLES:
            assert sdr_schema[table] == monolith_schema[table]

    async def test_lists_parents_before_the_tables_that_refer_to_them(self):
        order = list(sdr_database.SDR_TABLES)

        # A legacy import copies them in this order.
        assert order.index("sdr_frequency_groups") < order.index("sdr_frequency_group_links")
        assert order.index("sdr_stored_frequencies") < order.index("sdr_frequency_group_links")

    async def test_makes_the_recordings_folder_next_to_the_database(self, sdr_engine, tmp_path):
        await sdr_database.create_sdr_tables()

        assert (tmp_path / "data" / "recordings").is_dir()

    async def test_is_idempotent(self, sdr_engine):
        await sdr_database.create_sdr_tables()
        await sdr_database.create_sdr_tables()

        assert set(await table_columns(sdr_engine)) == set(sdr_database.SDR_TABLES)


class TestSdrRecordingsDir:
    def test_is_the_recordings_folder_beside_the_database(self, monkeypatch):
        monkeypatch.setattr(settings, "db_path", "/app/data/sdr.db")

        assert sdr_database.sdr_recordings_dir() == Path("/app/data/recordings")


# ── first boot: the legacy import ─────────────────────────────────────────────


def make_sdr_db(path: Path) -> Path:
    """A database file holding the SDR tables, built from the ORM models."""
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{path}")
    try:
        tables = [database.Base.metadata.tables[name] for name in sdr_database.SDR_TABLES]
        database.Base.metadata.create_all(engine, tables=tables)
    finally:
        engine.dispose()
    return path


def add_recording(path: Path, recording_id: int, *, has_iq_file: bool) -> None:
    engine = create_engine(f"sqlite:///{path}")
    try:
        with Session(engine) as session:
            session.add(
                SdrRecording(
                    id=recording_id,
                    name=f"Recording {recording_id}",
                    frequency_hz=145_500_000,
                    started_at="2026-10-11T12:00:00Z",
                    status="complete",
                    has_iq_file=has_iq_file,
                    created_at=0,
                )
            )
            session.commit()
    finally:
        engine.dispose()


def recording_ids(path: Path) -> list[int]:
    connection = sqlite3.connect(path)
    try:
        return [row[0] for row in connection.execute("SELECT id FROM sdr_recordings ORDER BY id")]
    finally:
        connection.close()


@pytest.fixture
def sdr_service(monkeypatch):
    """`sentinel_sdr.service`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
    monkeypatch.setattr(settings, "service_internal_url", SDR_URL)
    monkeypatch.delitem(sys.modules, "sentinel_sdr.service", raising=False)
    module = importlib.import_module("sentinel_sdr.service")
    yield module
    sys.modules.pop("sentinel_sdr.service", None)


class TestRecordingFileNames:
    def test_names_each_recordings_wav_and_its_raw_iq_only_when_it_has_one(self, sdr_service, tmp_path):
        db_path = make_sdr_db(tmp_path / "sdr.db")
        add_recording(db_path, 3, has_iq_file=True)
        add_recording(db_path, 7, has_iq_file=False)

        assert sdr_service._recording_file_names(str(db_path)) == [
            "3.wav",
            "3.u8",
            "7.wav",
        ]

    def test_names_nothing_without_recordings(self, sdr_service, tmp_path):
        assert sdr_service._recording_file_names(str(make_sdr_db(tmp_path / "sdr.db"))) == []


@pytest.fixture
def boot(monkeypatch, tmp_path):
    """A monolith's data folder with two recordings, and an empty SDR service database."""
    legacy_db = make_sdr_db(tmp_path / "legacy" / "sentinel.db")
    add_recording(legacy_db, 1, has_iq_file=True)
    add_recording(legacy_db, 2, has_iq_file=False)
    legacy_recordings = tmp_path / "legacy" / "recordings"
    legacy_recordings.mkdir()
    (legacy_recordings / "1.wav").write_bytes(b"wav one")
    (legacy_recordings / "1.u8").write_bytes(b"iq one")
    (legacy_recordings / "2.wav").write_bytes(b"wav two")
    # Not a file any recording refers to: it stays behind.
    (legacy_recordings / "99.wav").write_bytes(b"orphan")

    service_db = make_sdr_db(tmp_path / "service" / "sdr.db")
    monkeypatch.setattr(settings, "db_path", str(service_db))
    monkeypatch.setattr(settings, "legacy_db_path", str(legacy_db))
    return {"service_db": service_db, "recordings": tmp_path / "service" / "recordings"}


class TestImportLegacy:
    def test_copies_the_recordings_and_the_files_they_refer_to(self, sdr_service, boot):
        sdr_service._import_legacy()

        assert recording_ids(boot["service_db"]) == [1, 2]
        assert {path.name: path.read_bytes() for path in boot["recordings"].iterdir()} == {
            "1.wav": b"wav one",
            "1.u8": b"iq one",
            "2.wav": b"wav two",
        }

    def test_a_recording_deleted_since_the_import_does_not_come_back(self, sdr_service, boot):
        sdr_service._import_legacy()
        (boot["recordings"] / "2.wav").unlink()
        connection = sqlite3.connect(boot["service_db"])
        connection.execute("DELETE FROM sdr_recordings WHERE id = 2")
        connection.commit()
        connection.close()

        # The next boot: the table already holds data, so no row comes back, and
        # the files to copy are named by this service's rows, not the monolith's.
        sdr_service._import_legacy()

        assert recording_ids(boot["service_db"]) == [1]
        assert sorted(path.name for path in boot["recordings"].iterdir()) == [
            "1.u8",
            "1.wav",
        ]

    def test_copies_no_files_when_the_recordings_table_was_not_imported(self, sdr_service, boot, monkeypatch):
        copy_calls: list = []
        monkeypatch.setattr(
            sdr_service,
            "import_legacy_tables",
            lambda target, legacy, tables: {"sdr_frequency_groups": 2},
        )
        monkeypatch.setattr(
            sdr_service,
            "import_legacy_files",
            lambda *arguments: copy_calls.append(arguments),
        )

        sdr_service._import_legacy()

        assert copy_calls == []

    def test_imports_every_sdr_table(self, sdr_service, boot, monkeypatch):
        imported: list = []
        monkeypatch.setattr(
            sdr_service,
            "import_legacy_tables",
            lambda target, legacy, tables: imported.append((target, legacy, tuple(tables))) or {},
        )

        sdr_service._import_legacy()

        assert imported == [(str(boot["service_db"]), settings.legacy_db_path, sdr_database.SDR_TABLES)]


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

    def written_keys(self) -> list[str]:
        """The path of every PUT, in order."""
        return [request.url.path for request in self.requests if request.method == "PUT"]

    def reads(self) -> list[str]:
        return [request.url.path for request in self.requests if request.method == "GET"]


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
async def session_factory(test_engine, db_setup):
    return sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def sdr_client(sdr_service, core, session_factory):
    """An HTTP client on the SDR service's app; its own database is in memory."""

    async def sdr_db():
        async with session_factory() as session:
            yield session

    sdr_service.app.dependency_overrides[get_db] = sdr_db
    transport = httpx.ASGITransport(app=sdr_service.app)
    try:
        async with RealAsyncClient(transport=transport, base_url=SDR_URL) as client:
            yield client
    finally:
        sdr_service.app.dependency_overrides.clear()


# ── settings over HTTP ────────────────────────────────────────────────────────


class TestTheSettingsMirrorsOverHttp:
    """Every edit rewrites the mirrors of the tables in core, which the live config file shows."""

    async def test_creating_a_group_writes_the_group_and_frequency_mirrors_to_core(self, sdr_client, core):
        response = await sdr_client.post("/api/sdr/groups", json={"name": "Marine"})

        assert response.status_code == 201
        assert core.written_keys() == [
            "/api/settings/sdr/frequencies",
            "/api/settings/sdr/groups",
        ]
        assert core.namespaces["sdr"]["groups"] == [{"name": "Marine", "slug": "marine"}]
        assert core.namespaces["sdr"]["frequencies"] == []

    async def test_the_frequencies_file_is_built_from_one_read_of_core(self, sdr_client, core):
        await sdr_client.post("/api/sdr/groups", json={"name": "Marine"})

        # Each read is a round trip to core: one for all three mirrors.
        assert core.reads() == ["/api/settings/sdr"]
        written = json.loads(sdr_data.FREQUENCIES_FILE.read_text())
        assert written["groups"] == [{"name": "Marine", "slug": "marine"}]

    async def test_the_settings_textarea_shows_cores_mirrors(self, sdr_client, core):
        core.namespaces["sdr"] = {
            "groups": [{"name": "Air", "slug": "air"}],
            "frequencies": [{"name": "Tower", "frequency_hz": 118_000_000}],
            "searchRanges": [{"name": "Airband"}],
            "bandPlan": [{"name": "ignored here"}],
        }

        response = await sdr_client.get("/api/sdr/data/frequencies")

        assert response.json() == {
            "groups": [{"name": "Air", "slug": "air"}],
            "frequencies": [{"name": "Tower", "frequency_hz": 118_000_000}],
            "searchRanges": [{"name": "Airband"}],
        }
        assert core.reads() == ["/api/settings/sdr"]

    async def test_the_settings_textarea_is_empty_when_core_holds_no_mirrors(self, sdr_client, core):
        response = await sdr_client.get("/api/sdr/data/frequencies")

        assert response.json() == {"groups": [], "frequencies": [], "searchRanges": []}

    async def test_saving_the_textarea_writes_all_three_mirrors_to_core(self, sdr_client, core):
        body = {
            "groups": [{"name": "Marine", "slug": "marine"}],
            "frequencies": [
                {
                    "label": "Ch 16",
                    "frequency_hz": 156_800_000,
                    "mode": "NFM",
                    "groups": ["marine"],
                }
            ],
            "searchRanges": [{"label": "Marine VHF", "low_hz": 156_000_000, "high_hz": 162_000_000}],
        }

        response = await sdr_client.post("/api/sdr/data/frequencies", json=body)

        assert response.status_code == 200
        assert set(core.written_keys()) == {
            "/api/settings/sdr/frequencies",
            "/api/settings/sdr/groups",
            "/api/settings/sdr/searchRanges",
        }
        assert [entry["label"] for entry in core.namespaces["sdr"]["frequencies"]] == ["Ch 16"]
        assert [entry["label"] for entry in core.namespaces["sdr"]["searchRanges"]] == ["Marine VHF"]

    async def test_an_unreachable_core_is_an_error_not_a_silent_skip(self, sdr_client, monkeypatch):
        def refuse(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("core is down", request=request)

        monkeypatch.setattr(
            settings_client.httpx,
            "AsyncClient",
            lambda **options: RealAsyncClient(transport=httpx.MockTransport(refuse), **options),
        )

        with pytest.raises(settings_client.SettingsUnavailable):
            await sdr_client.get("/api/sdr/data/frequencies")


class TestTheBandPlanOverHttp:
    async def test_reads_the_band_plan_core_holds(self, sdr_client, core):
        core.namespaces["sdr"] = {"bandPlan": [{"name": "2m", "start_hz": 144_000_000}]}

        response = await sdr_client.get("/api/sdr/data/bandplan")

        assert response.json() == {"bandPlan": [{"name": "2m", "start_hz": 144_000_000}]}

    async def test_a_non_list_band_plan_in_core_is_an_empty_one(self, sdr_client, core):
        core.namespaces["sdr"] = {"bandPlan": "corrupt"}

        assert (await sdr_client.get("/api/sdr/data/bandplan")).json() == {"bandPlan": []}

    async def test_saving_writes_it_to_core_and_the_file(self, sdr_client, core):
        band_plan = [{"name": "70cm", "start_hz": 430_000_000}]

        response = await sdr_client.post("/api/sdr/data/bandplan", json={"bandPlan": band_plan})

        assert response.status_code == 200
        assert core.written_keys() == ["/api/settings/sdr/bandPlan"]
        assert core.namespaces["sdr"]["bandPlan"] == band_plan
        assert json.loads(sdr_data.BANDPLAN_FILE.read_text())["bandPlan"] == band_plan


class TestRawIqOverHttp:
    @pytest.fixture
    def hub_requests(self, monkeypatch) -> list:
        from sentinel_sdr import router as sdr_router

        requests: list = []

        async def request(subject, payload, timeout=5.0):
            requests.append((subject, payload["capture_id"], payload["radio_id"]))
            return {"ok": True}

        monkeypatch.setattr(sdr_router.bus, "request", request)
        return requests

    async def test_asks_the_hub_to_capture_iq_when_core_says_to_record_it(
        self, sdr_client, core, hub_requests, session_factory
    ):
        core.namespaces["sdr"] = {"recordRawIq": True}

        response = await sdr_client.post(
            "/api/sdr/recordings/start",
            json={"frequency_hz": 145_500_000, "radio_id": 4},
        )

        recording_id = response.json()["id"]
        assert hub_requests == [("hub.iq-capture.start", recording_id, 4)]
        async with session_factory() as session:
            assert (await session.get(SdrRecording, recording_id)).has_iq_file is True

    async def test_asks_nothing_of_the_hub_when_core_holds_no_setting(self, sdr_client, core, hub_requests):
        await sdr_client.post(
            "/api/sdr/recordings/start",
            json={"frequency_hz": 145_500_000, "radio_id": 4},
        )

        assert hub_requests == []
        # One read for the recordings folder, one for whether to record raw IQ.
        assert core.reads() == ["/api/settings/sdr", "/api/settings/sdr"]


class TestTheSeedersOverHttp:
    async def test_seeds_the_band_plan_into_core_when_core_holds_none(self, core, monkeypatch, session_factory):
        monkeypatch.setattr(database, "AsyncSessionLocal", session_factory)
        monkeypatch.setattr(sdr_data, "load_sdr_bandplan_file", lambda: [{"name": "seeded"}])

        await sdr_database.seed_sdr_bandplan_from_file()

        assert core.namespaces["sdr"]["bandPlan"] == [{"name": "seeded"}]

    async def test_keeps_the_band_plan_core_already_holds(self, core, monkeypatch, session_factory):
        core.namespaces["sdr"] = {"bandPlan": [{"name": "edited"}]}
        monkeypatch.setattr(database, "AsyncSessionLocal", session_factory)
        monkeypatch.setattr(sdr_data, "load_sdr_bandplan_file", lambda: [{"name": "seeded"}])

        await sdr_database.seed_sdr_bandplan_from_file()

        assert core.written_keys() == []
        assert core.namespaces["sdr"]["bandPlan"] == [{"name": "edited"}]

    async def test_mirrors_the_seeded_search_ranges_into_core(self, core, monkeypatch, session_factory):
        monkeypatch.setattr(database, "AsyncSessionLocal", session_factory)
        sdr_data.FREQUENCIES_FILE.write_text(
            json.dumps(
                {
                    "groups": [],
                    "frequencies": [],
                    "searchRanges": [
                        {
                            "label": "Airband",
                            "low_hz": 118_000_000,
                            "high_hz": 137_000_000,
                        }
                    ],
                }
            )
        )

        await sdr_database.seed_sdr_data_from_files()

        assert [entry["label"] for entry in core.namespaces["sdr"]["searchRanges"]] == ["Airband"]


# ── in process, the mirrors are settings writes like any other ────────────────


class TestTheMirrorsInProcess:
    @pytest.fixture
    def announcements(self, monkeypatch) -> list:
        from backend.platform.bus import bus

        heard: list = []

        async def record(payload):
            heard.append(payload["keys"])

        monkeypatch.setattr(settings, "sentinel_core_url", "")
        unsubscribe = bus.subscribe("settings.changed.sdr", record)
        yield heard
        unsubscribe()

    async def test_writes_the_mirrors_and_announces_each_one(self, session_factory, announcements):
        from backend.db_helpers import get_setting

        async with session_factory() as session:
            await sdr_database.sync_sdr_groups_to_config(session)
            await sdr_database.sync_sdr_search_ranges_to_config(session)

            assert await get_setting(session, "sdr", "groups") == []
            assert await get_setting(session, "sdr", "searchRanges") == []
        assert announcements == [["frequencies"], ["groups"], ["searchRanges"]]

    async def test_the_band_plan_is_read_and_written_in_the_apps_database(self, session_factory, announcements):
        async with session_factory() as session:
            await sdr_data.set_bandplan(session, [{"name": "local"}])

            assert await sdr_data.get_bandplan(session) == [{"name": "local"}]
        assert announcements == [["bandPlan"]]


# ── the service app ───────────────────────────────────────────────────────────

SDR_PATHS = {
    "/api/sdr/groups",
    "/api/sdr/groups/{group_id}",
    "/api/sdr/frequencies",
    "/api/sdr/frequencies/{freq_id}",
    "/api/sdr/search-ranges",
    "/api/sdr/search-ranges/{range_id}",
    "/api/sdr/data/frequencies",
    "/api/sdr/data/bandplan",
    "/api/sdr/recordings",
    "/api/sdr/recordings/start",
    "/api/sdr/recordings/stop",
    "/api/sdr/recordings/{rec_id}",
    "/api/sdr/recordings/{rec_id}/file",
    "/api/sdr/recordings/{rec_id}/iq",
    "/remotes/sdr",
    "/health",
}


class TestSdrServiceApp:
    def test_serves_the_sdr_section_its_remote_and_its_health(self, sdr_service):
        paths = {getattr(route, "path", "") for route in sdr_service.app.routes}

        assert paths == SDR_PATHS

    def test_serves_nothing_of_the_radio_hub_air_or_core(self, sdr_service):
        paths = [getattr(route, "path", "") for route in sdr_service.app.routes]

        assert not any(
            path.startswith(
                (
                    "/api/sdr/radios",
                    "/api/sdr/connect",
                    "/api/sdr/decode",
                    "/api/sdr/adsb",
                    "/ws/",
                    "/api/settings",
                    "/internal",
                )
            )
            for path in paths
        )

    def test_registers_as_the_sdr_section_at_its_own_address_with_its_remote(self, sdr_service):
        manifest = sdr_service.app.state.registrar.manifest

        assert (manifest.id, manifest.kind) == ("sdr", "section")
        assert manifest.internal_url == SDR_URL
        assert manifest.routes == ["/api/sdr/"]
        assert manifest.ui is not None and manifest.ui.remote_entry == "/remotes/sdr/remoteEntry.js"


def probe_fresh_interpreter(probe: str) -> list:
    """Run `probe` in a new interpreter configured as the SDR container; return its last line as JSON."""
    environment = {
        **os.environ,
        "PYTHONPATH": str(REPO_ROOT),
        "SENTINEL_CORE_URL": CORE_URL,
        "SERVICE_INTERNAL_URL": SDR_URL,
    }
    result = subprocess.run(
        [sys.executable, "-c", probe],
        cwd=REPO_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


class TestWhatTheSdrServiceLoads:
    """Checked in a fresh interpreter, where nothing else has imported anything."""

    def test_loads_no_other_section_and_not_the_radio_hub(self):
        loaded = probe_fresh_interpreter(
            "import json, sys\n"
            "import sentinel_sdr.service\n"
            "print(json.dumps(sorted(m for m in sys.modules if m.startswith(('backend.modules.', 'sentinel_radio',"
            " 'backend.routers.', 'sentinel_')))))\n"
        )

        # The SDR section's own package, and of core's modules only the manifest helper.
        assert [module for module in loaded if not module.startswith("sentinel_sdr")] == ["backend.modules.manifest"]
        assert {"sentinel_sdr.module", "sentinel_sdr.router"} <= set(loaded)

    def test_answers_no_hub_request_itself_so_iq_captures_cross_nats(self):
        patterns = probe_fresh_interpreter(
            "import json\n"
            "from backend.platform.bus import bus\n"
            "import sentinel_sdr.service\n"
            "print(json.dumps(sorted({s.pattern for s in bus._subscriptions})))\n"
        )

        assert not [pattern for pattern in patterns if pattern.startswith("hub.")]


# ── lifecycle ─────────────────────────────────────────────────────────────────


class TestSdrServiceLifecycle:
    async def test_prepare_builds_the_schema_then_imports_the_legacy_data_then_seeds(self, sdr_service, monkeypatch):
        calls: list[str] = []

        async def create_sdr_tables():
            calls.append("create_sdr_tables")

        async def seed():
            calls.append("seed")

        monkeypatch.setattr(sdr_service, "create_sdr_tables", create_sdr_tables)
        monkeypatch.setattr(sdr_service, "_import_legacy", lambda: calls.append("import_legacy"))
        monkeypatch.setattr(sdr_service.sdr_module, "seed", seed)

        await sdr_service._prepare()

        assert calls == ["create_sdr_tables", "import_legacy", "seed"]

    async def test_runs_its_schema_and_seeds_then_the_sdr_lifecycle_then_registration(self, monkeypatch):
        from backend.platform.lifecycle import ModuleLifecycle
        from backend.platform.sdk.registration import ServiceRegistrar

        from sentinel_sdr import module as sdr_module

        calls: list[str] = []

        async def sdr_prepare():
            calls.append("sdr.prepare")  # replaced by the service's own prepare: never runs

        async def sdr_start():
            calls.append("sdr.start")

        async def seed():
            calls.append("seed")

        async def schema_prepare():
            calls.append("schema")

        async def registrar_stop(self):
            calls.append("registration.stop")

        monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
        monkeypatch.setattr(settings, "service_internal_url", SDR_URL)
        monkeypatch.setattr(settings, "nats_url", "")
        # The service composes the SDR lifecycle at import, so swap it first.
        monkeypatch.setattr(sdr_module, "lifecycle", ModuleLifecycle(name="sdr", prepare=sdr_prepare, start=sdr_start))
        monkeypatch.setattr(sdr_module, "seed", seed)
        monkeypatch.setattr(ServiceRegistrar, "start", lambda self: calls.append("registration.start"))
        monkeypatch.setattr(ServiceRegistrar, "stop", registrar_stop)
        monkeypatch.delitem(sys.modules, "sentinel_sdr.service", raising=False)
        service = importlib.import_module("sentinel_sdr.service")
        monkeypatch.setattr(service, "create_sdr_tables", schema_prepare)
        monkeypatch.setattr(service, "_import_legacy", lambda: calls.append("import"))

        try:
            async with service.app.router.lifespan_context(service.app):
                pass
        finally:
            sys.modules.pop("sentinel_sdr.service", None)

        # The seeders run after the import, so an imported catalogue is never re-seeded.
        assert calls == [
            "schema",
            "import",
            "seed",
            "sdr.start",
            "registration.start",
            "registration.stop",
        ]
