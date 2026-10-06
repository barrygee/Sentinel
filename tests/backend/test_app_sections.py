"""GET /api/app/sections and the /remotes/<id>/ mount (backend/core/app_sections.py).

The shell loads every listed section as a Module Federation remote and runs
whatever its remoteEntry.js contains, so these pin which registered sections
are listed, the order they are listed in, and how the remote files are served.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.core import app_sections
from backend.core.app_sections import (
    REMOTE_ENTRY_FILENAME,
    RemotesStaticFiles,
    deployed_sections,
)
from backend.core.service_registry import ServiceRegistry
from backend.main import app
from backend.platform.service_manifest import ServiceManifest

NO_CACHE = "no-cache, no-store, must-revalidate"


def build_remote(remotes_dir: Path, section_id: str) -> Path:
    """Lays out a built section remote: its entry plus one hashed chunk."""
    section_dir = remotes_dir / section_id
    (section_dir / "spa-assets").mkdir(parents=True)
    (section_dir / REMOTE_ENTRY_FILENAME).write_text("export const init = () => {}\n")
    (section_dir / "spa-assets" / "section-Ab12Cd34.js").write_text(
        "export default 1\n"
    )
    return section_dir


def make_manifest(
    service_id: str, nav_order: int = 100, kind: str = "section", with_ui: bool = True
) -> ServiceManifest:
    body: dict = {
        "id": service_id,
        "kind": kind,
        "version": "1.0.0",
        "navOrder": nav_order,
        "internalUrl": f"http://{service_id}:8000",
        "routes": [f"/api/{service_id}/"],
    }
    if with_ui:
        body["ui"] = {"remoteEntry": f"/remotes/{service_id}/remoteEntry.js"}
    return ServiceManifest.model_validate(body)


def listed(service_registry: ServiceRegistry, remotes_dir: Path) -> list[tuple[str, bool]]:
    return [
        (section.id, section.available)
        for section in deployed_sections(service_registry, remotes_dir)
    ]


class TestDeployedSections:
    def test_an_empty_registry_lists_nothing(self, tmp_path: Path):
        build_remote(tmp_path, "air")

        assert deployed_sections(ServiceRegistry(), tmp_path) == []

    def test_lists_an_in_process_section_once_its_remote_is_built(self, tmp_path: Path):
        service_registry = ServiceRegistry()
        service_registry.register_in_process([make_manifest("sea")], "core")
        assert listed(service_registry, tmp_path) == []

        build_remote(tmp_path, "sea")

        assert [section.model_dump() for section in deployed_sections(service_registry, tmp_path)] == [
            {"id": "sea", "remoteEntry": "/remotes/sea/remoteEntry.js", "available": True}
        ]

    def test_an_in_process_section_needs_its_entry_not_just_a_directory(self, tmp_path: Path):
        service_registry = ServiceRegistry()
        service_registry.register_in_process([make_manifest("air"), make_manifest("space")], "core")
        build_remote(tmp_path, "air")
        (tmp_path / "space" / "spa-assets").mkdir(parents=True)

        assert listed(service_registry, tmp_path) == [("air", True)]

    def test_a_remote_entry_that_is_a_directory_does_not_count(self, tmp_path: Path):
        service_registry = ServiceRegistry()
        service_registry.register_in_process([make_manifest("air")], "core")
        (tmp_path / "air" / REMOTE_ENTRY_FILENAME).mkdir(parents=True)

        assert listed(service_registry, tmp_path) == []

    def test_a_built_remote_nobody_registered_is_not_listed(self, tmp_path: Path):
        service_registry = ServiceRegistry()
        service_registry.register_in_process([make_manifest("air")], "core")
        build_remote(tmp_path, "air")
        build_remote(tmp_path, "weather")

        assert listed(service_registry, tmp_path) == [("air", True)]

    async def test_an_out_of_process_section_is_listed_without_a_local_build(self, tmp_path: Path):
        """Its own container serves its remote, so nothing is built here."""
        service_registry = ServiceRegistry()
        await service_registry.register(make_manifest("weather"), "weather-1")

        assert listed(service_registry, tmp_path) == [("weather", True)]

    async def test_an_unavailable_section_is_listed_as_unavailable(self, tmp_path: Path):
        service_registry = ServiceRegistry()
        await service_registry.register(make_manifest("weather"), "weather-1")
        service_registry.get("weather").available = False

        assert listed(service_registry, tmp_path) == [("weather", False)]

    async def test_skips_services_that_are_not_sections_with_a_ui(self, tmp_path: Path):
        service_registry = ServiceRegistry()
        await service_registry.register(make_manifest("radio-hub", kind="radio-hub", with_ui=False), "hub-1")
        await service_registry.register(make_manifest("headless", with_ui=False), "headless-1")
        await service_registry.register(make_manifest("ais", kind="decoder"), "ais-1")

        assert listed(service_registry, tmp_path) == []

    async def test_lists_in_nav_order_whoever_registered_first(self, tmp_path: Path):
        service_registry = ServiceRegistry()
        await service_registry.register(make_manifest("weather", nav_order=60), "weather-1")
        service_registry.register_in_process(
            [make_manifest("sdr", 50), make_manifest("air", 10)], "core"
        )
        build_remote(tmp_path, "sdr")
        build_remote(tmp_path, "air")

        assert [section_id for section_id, _ in listed(service_registry, tmp_path)] == [
            "air",
            "sdr",
            "weather",
        ]


class TestListSectionsEndpoint:
    def test_lists_this_process_sections_built_under_the_spa_in_nav_order(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(app_sections, "REMOTES_DIR", tmp_path)
        for section_id in ("sdr", "land", "air", "sea", "space"):
            build_remote(tmp_path, section_id)

        response = TestClient(app).get("/api/app/sections")

        assert response.status_code == 200
        assert response.json() == {
            "sections": [
                {"id": section_id, "remoteEntry": f"/remotes/{section_id}/remoteEntry.js", "available": True}
                for section_id in ("air", "space", "sea", "land", "sdr")
            ]
        }

    def test_reads_the_directory_on_every_request(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """A rebuilt SPA is picked up without restarting the backend."""
        monkeypatch.setattr(app_sections, "REMOTES_DIR", tmp_path)
        client = TestClient(app)
        assert client.get("/api/app/sections").json() == {"sections": []}

        build_remote(tmp_path, "sdr")

        assert client.get("/api/app/sections").json() == {
            "sections": [
                {"id": "sdr", "remoteEntry": "/remotes/sdr/remoteEntry.js", "available": True}
            ]
        }

    def test_lists_nothing_before_the_spa_is_built(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(app_sections, "REMOTES_DIR", tmp_path / "missing")

        response = TestClient(app).get("/api/app/sections")

        assert response.status_code == 200
        assert response.json() == {"sections": []}

    async def test_reads_the_live_registry(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        service_registry = ServiceRegistry()
        await service_registry.register(make_manifest("weather"), "weather-1")
        monkeypatch.setattr(app_sections, "registry", service_registry)
        monkeypatch.setattr(app_sections, "REMOTES_DIR", tmp_path)

        response = TestClient(app).get("/api/app/sections")

        assert response.json() == {
            "sections": [
                {"id": "weather", "remoteEntry": "/remotes/weather/remoteEntry.js", "available": True}
            ]
        }

    def test_only_get_is_allowed(self):
        assert TestClient(app).post("/api/app/sections").status_code == 405


@pytest.fixture
def remotes_client(tmp_path: Path) -> TestClient:
    """An app serving `tmp_path` exactly as main.py serves frontend/spa-dist/remotes."""
    remotes_app = FastAPI()
    remotes_app.mount(
        "/remotes",
        RemotesStaticFiles(directory=str(tmp_path), check_dir=False),
        name="remotes",
    )
    build_remote(tmp_path, "air")
    return TestClient(remotes_app)


class TestRemotesStaticFiles:
    def test_serves_the_remote_entry_uncached_as_javascript(
        self, remotes_client: TestClient
    ):
        response = remotes_client.get("/remotes/air/remoteEntry.js")

        assert response.status_code == 200
        assert response.text == "export const init = () => {}\n"
        assert response.headers["cache-control"] == NO_CACHE
        assert response.headers["content-type"].startswith("text/javascript")

    def test_leaves_hashed_chunks_cacheable(self, remotes_client: TestClient):
        response = remotes_client.get("/remotes/air/spa-assets/section-Ab12Cd34.js")

        assert response.status_code == 200
        assert "cache-control" not in response.headers

    def test_a_missing_remote_file_is_a_404(self, remotes_client: TestClient):
        assert remotes_client.get("/remotes/sea/remoteEntry.js").status_code == 404

    def test_serves_nothing_until_the_directory_exists(self, tmp_path: Path):
        """Mounting before the first build neither crashes startup nor answers
        500s: a missing remote is a 404 until the build creates it."""
        late_app = FastAPI()
        remotes_dir = tmp_path / "not-built-yet"
        late_app.mount(
            "/remotes", RemotesStaticFiles(directory=str(remotes_dir), check_dir=False)
        )
        client = TestClient(late_app, raise_server_exceptions=False)
        assert client.get("/remotes/air/remoteEntry.js").status_code == 404

        build_remote(remotes_dir, "air")

        assert client.get("/remotes/air/remoteEntry.js").status_code == 200


class TestRemotesMountInTheApp:
    def test_a_missing_remote_file_is_a_404_not_the_spa_index(self):
        """Falling through to index.html would hand the shell HTML to run as a
        module script — it must be a plain 404 the loader reports as unavailable."""
        response = TestClient(app).get("/remotes/no-such-section/remoteEntry.js")

        assert response.status_code == 404
        assert "text/html" not in response.headers.get("content-type", "")

    def test_remotes_mount_is_registered_before_the_spa_catch_all(self):
        paths = [getattr(route, "path", None) for route in app.routes]

        assert paths.index("/remotes") < paths.index("/{full_path:path}")
