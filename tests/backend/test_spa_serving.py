"""Core's static surface (backend/core/spa_serving.py, P8).

`mount_spa` is mounted on a bare app here, pointed at a built SPA laid out in a
temporary directory, so each case controls exactly which files exist.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.routing import Mount

from backend.core import spa_csp, spa_serving
from backend.platform.remote_files import REMOTE_ENTRY_FILENAME

NO_CACHE = "no-cache, no-store, must-revalidate"
INDEX_HTML = "<!doctype html><html><head><script>window.boot = 1</script></head><body></body></html>"


@pytest.fixture()
def frontend(tmp_path, monkeypatch) -> Path:
    """An empty `frontend/` tree: `spa-dist/` (not created yet) and `assets/` with a favicon."""
    spa_dir = tmp_path / "spa-dist"
    assets_dir = tmp_path / "assets"
    assets_dir.mkdir()
    (assets_dir / "favicon.ico").write_bytes(b"\x00\x00\x01\x00icon")
    (assets_dir / "sprite.png").write_bytes(b"png")
    monkeypatch.setattr(spa_serving, "SPA_DIR", spa_dir)
    monkeypatch.setattr(spa_serving, "FRONTEND_ASSETS_DIR", assets_dir)
    return tmp_path


def build_spa(frontend: Path, *, with_fonts: bool = True) -> Path:
    """Lays out a built SPA: index.html, a hashed bundle, optional fonts, one section remote."""
    spa_dir = frontend / "spa-dist"
    (spa_dir / "spa-assets").mkdir(parents=True)
    (spa_dir / "spa-assets" / "index-Ab12Cd34.js").write_text("export {}\n")
    (spa_dir / "index.html").write_text(INDEX_HTML)
    if with_fonts:
        (spa_dir / "fonts").mkdir()
        (spa_dir / "fonts" / "font.woff2").write_bytes(b"woff2")
    for section_id in ("space", "sea"):
        (spa_dir / "remotes" / section_id).mkdir(parents=True)
        (spa_dir / "remotes" / section_id / REMOTE_ENTRY_FILENAME).write_text(
            "export const init = () => {}\n"
        )
    return spa_dir


def serve(serve_section_remotes: bool = True) -> tuple[FastAPI, TestClient]:
    app = FastAPI()

    @app.get("/api/ping")
    async def ping():
        return {"pong": True}

    spa_serving.mount_spa(app, serve_section_remotes=serve_section_remotes)
    return app, TestClient(app)


def mounted_names(app: FastAPI) -> set[str]:
    return {route.name for route in app.routes if isinstance(route, Mount)}


class TestBuiltSpa:
    @pytest.mark.parametrize("path", ["/", "/sea/", "/sdr/some/deep/link"])
    def test_every_client_route_gets_the_uncached_index_with_its_policy(
        self, frontend, path
    ):
        index = build_spa(frontend) / "index.html"
        _app, client = serve()

        response = client.get(path)

        assert response.status_code == 200
        assert response.text == INDEX_HTML
        assert response.headers["content-type"].startswith("text/html")
        assert response.headers["cache-control"] == NO_CACHE
        assert response.headers["content-security-policy"] == spa_csp.policy_for_index(
            index
        )

    def test_api_routes_mounted_before_it_are_still_matched_first(self, frontend):
        build_spa(frontend)
        app, client = serve()

        assert client.get("/api/ping").json() == {"pong": True}
        assert app.routes[-1].path == "/{full_path:path}"

    def test_serves_the_hashed_bundle_and_fonts(self, frontend):
        build_spa(frontend)
        _app, client = serve()

        assert client.get("/spa-assets/index-Ab12Cd34.js").text == "export {}\n"
        assert client.get("/fonts/font.woff2").content == b"woff2"

    def test_serves_map_assets_and_the_favicon(self, frontend):
        build_spa(frontend)
        _app, client = serve()

        favicon = client.get("/favicon.ico")
        assert favicon.status_code == 200
        assert favicon.headers["content-type"] == "image/x-icon"
        assert favicon.content == b"\x00\x00\x01\x00icon"
        assert client.get("/assets/sprite.png").content == b"png"
        assert client.get("/assets/missing.png").status_code == 404

    def test_serves_built_section_remotes_when_asked(self, frontend):
        build_spa(frontend)
        _app, client = serve()

        assert client.get(f"/remotes/sea/{REMOTE_ENTRY_FILENAME}").status_code == 200

    def test_otherwise_refuses_a_built_section_remote(self, frontend):
        # Core's own app: each section serves its remote from its container.
        build_spa(frontend)
        app, client = serve(serve_section_remotes=False)

        refused = client.get(f"/remotes/sea/{REMOTE_ENTRY_FILENAME}")
        # A 404, never index.html, which the shell would try to run as a remote entry.
        assert refused.status_code == 404
        assert "content-security-policy" not in refused.headers
        assert "remotes" not in mounted_names(app)

    def test_skips_the_fonts_mount_when_the_build_has_no_fonts(self, frontend):
        build_spa(frontend, with_fonts=False)
        app, client = serve()

        assert "fonts" not in mounted_names(app)
        assert "spa-assets" in mounted_names(app)
        # Unmounted, so the path is just another client route.
        assert client.get("/fonts/font.woff2").headers["cache-control"] == NO_CACHE


class TestUnbuiltSpa:
    def test_every_client_route_says_how_to_build_it(self, frontend):
        _app, client = serve()

        response = client.get("/sea/")

        assert response.status_code == 503
        assert response.json() == {
            "detail": "SPA not built. Run: cd frontend/vue && npm run build"
        }

    def test_mounts_neither_the_bundle_nor_fonts_but_still_the_remotes(self, frontend):
        app, client = serve()

        assert mounted_names(app) == {"assets", "remotes"}
        # Remotes are mounted before they are built, so a later build needs no restart.
        assert client.get(f"/remotes/sea/{REMOTE_ENTRY_FILENAME}").status_code == 404
        build_spa(frontend)
        assert client.get(f"/remotes/sea/{REMOTE_ENTRY_FILENAME}").status_code == 200

    def test_a_refused_section_remote_is_a_404_not_the_unbuilt_notice(self, frontend):
        _app, client = serve(serve_section_remotes=False)

        response = client.get(f"/remotes/sea/{REMOTE_ENTRY_FILENAME}")

        assert response.status_code == 404
        assert response.json() == {"detail": "Not Found"}

    def test_a_partial_build_without_index_html_is_still_unbuilt(self, frontend):
        (build_spa(frontend) / "index.html").unlink()
        _app, client = serve()

        assert client.get("/").status_code == 503
