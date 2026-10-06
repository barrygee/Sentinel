"""GET /api/app/sections and the /remotes/<id>/ mount (backend/core/app_sections.py).

The shell loads every listed section as a Module Federation remote and runs
whatever its remoteEntry.js contains, so these pin which directories count as
a section, the order they are listed in, and how the remote files are served.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.core import app_sections
from backend.core.app_sections import (
    REMOTE_ENTRY_FILENAME,
    RemotesStaticFiles,
    built_sections,
)
from backend.main import app

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


def listed_ids(remotes_dir: Path) -> list[str]:
    return [section.id for section in built_sections(remotes_dir)]


class TestBuiltSections:
    def test_missing_remotes_directory_lists_nothing(self, tmp_path: Path):
        assert built_sections(tmp_path / "remotes") == []

    def test_remotes_path_that_is_a_file_lists_nothing(self, tmp_path: Path):
        remotes_file = tmp_path / "remotes"
        remotes_file.write_text("not a directory")

        assert built_sections(remotes_file) == []

    def test_empty_remotes_directory_lists_nothing(self, tmp_path: Path):
        (tmp_path / "remotes").mkdir()

        assert built_sections(tmp_path / "remotes") == []

    def test_lists_each_built_remote_with_its_entry_url(self, tmp_path: Path):
        build_remote(tmp_path, "sea")

        sections = built_sections(tmp_path)

        assert [section.model_dump() for section in sections] == [
            {"id": "sea", "remoteEntry": "/remotes/sea/remoteEntry.js"}
        ]

    def test_lists_known_sections_in_nav_order_whatever_the_directory_order(
        self, tmp_path: Path
    ):
        for section_id in ("sdr", "land", "air", "sea", "space"):
            build_remote(tmp_path, section_id)

        assert listed_ids(tmp_path) == ["air", "space", "sea", "land", "sdr"]

    def test_lists_unknown_sections_after_the_known_ones_alphabetically(
        self, tmp_path: Path
    ):
        for section_id in ("weather", "sdr", "hf-2", "air"):
            build_remote(tmp_path, section_id)

        assert listed_ids(tmp_path) == ["air", "sdr", "hf-2", "weather"]

    def test_skips_a_section_directory_without_a_remote_entry(self, tmp_path: Path):
        build_remote(tmp_path, "air")
        (tmp_path / "space" / "spa-assets").mkdir(parents=True)

        assert listed_ids(tmp_path) == ["air"]

    def test_skips_a_remote_entry_that_is_a_directory(self, tmp_path: Path):
        (tmp_path / "air" / REMOTE_ENTRY_FILENAME).mkdir(parents=True)

        assert listed_ids(tmp_path) == []

    def test_skips_plain_files_in_the_remotes_directory(self, tmp_path: Path):
        build_remote(tmp_path, "air")
        (tmp_path / "README.txt").write_text("not a section")

        assert listed_ids(tmp_path) == ["air"]

    @pytest.mark.parametrize(
        "bad_id", ["Air", "1air", ".hidden", "-air", "air_2", "a ir"]
    )
    def test_skips_directories_whose_name_is_not_a_section_id(
        self, tmp_path: Path, bad_id: str
    ):
        build_remote(tmp_path, "space")
        build_remote(tmp_path, bad_id)

        assert listed_ids(tmp_path) == ["space"]


class TestListSectionsEndpoint:
    def test_lists_the_remotes_built_under_the_spa(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(app_sections, "REMOTES_DIR", tmp_path)
        build_remote(tmp_path, "land")
        build_remote(tmp_path, "air")

        response = TestClient(app).get("/api/app/sections")

        assert response.status_code == 200
        assert response.json() == {
            "sections": [
                {"id": "air", "remoteEntry": "/remotes/air/remoteEntry.js"},
                {"id": "land", "remoteEntry": "/remotes/land/remoteEntry.js"},
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
            "sections": [{"id": "sdr", "remoteEntry": "/remotes/sdr/remoteEntry.js"}]
        }

    def test_lists_nothing_before_the_spa_is_built(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(app_sections, "REMOTES_DIR", tmp_path / "missing")

        response = TestClient(app).get("/api/app/sections")

        assert response.status_code == 200
        assert response.json() == {"sections": []}

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
