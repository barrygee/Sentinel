"""The docs service's routes (sentinel_docs.router): the library and its images.

The images route takes a path from the URL, so the negative tests here prove it
never serves anything but an image under docs/images/.
"""

import json
from pathlib import Path

import pytest
from backend.config import settings
from fastapi.testclient import TestClient
from tests.in_process_app import app

NAVIGATION = [{"title": "START", "items": [{"title": "Index", "file": "docs/index.md"}]}]


@pytest.fixture
def source_root(tmp_path: Path, monkeypatch) -> Path:
    (tmp_path / "docs" / "images").mkdir(parents=True)
    (tmp_path / "docs" / "nav.json").write_text(json.dumps(NAVIGATION), encoding="utf-8")
    (tmp_path / "docs" / "index.md").write_text("# Index\n", encoding="utf-8")
    (tmp_path / "docs" / "images" / "map.png").write_bytes(b"\x89PNG-bytes")
    (tmp_path / "secret.png").write_bytes(b"secret")
    monkeypatch.setattr(settings, "docs_source_directory", str(tmp_path))
    return tmp_path


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


class TestGetLibrary:
    def test_serves_the_library_revalidated_every_load(self, client, source_root):
        response = client.get("/api/documentation/library")

        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-cache"
        assert response.json() == {
            "navigation": NAVIGATION,
            "documents": {"docs/index.md": "# Index\n"},
            "images": ["docs/images/map.png"],
        }

    def test_answers_503_without_revealing_the_path(self, client, source_root):
        (source_root / "docs" / "nav.json").unlink()

        response = client.get("/api/documentation/library")

        assert response.status_code == 503
        assert response.json() == {"detail": "documentation is not available"}
        assert str(source_root) not in response.text


class TestGetImage:
    def test_serves_an_image(self, client, source_root):
        response = client.get("/api/documentation/images/map.png")

        assert response.status_code == 200
        assert response.content == b"\x89PNG-bytes"
        assert response.headers["content-type"] == "image/png"
        assert response.headers["cache-control"] == "no-cache"

    def test_a_missing_image_is_404(self, client, source_root):
        response = client.get("/api/documentation/images/absent.png")

        assert response.status_code == 404
        assert response.json() == {"detail": "image not found"}

    def test_refuses_an_encoded_traversal(self, client, source_root):
        response = client.get("/api/documentation/images/..%2F..%2Fsecret.png")

        assert response.status_code == 404
        assert b"secret" not in response.content

    def test_refuses_a_file_that_is_not_an_image(self, client, source_root):
        response = client.get("/api/documentation/images/..%2Findex.md")

        assert response.status_code == 404
