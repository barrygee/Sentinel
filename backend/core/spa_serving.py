"""Core's static surface: map assets, the built shell, section remotes and the SPA fallback.

Mounted by `create_core_app()` (`backend/core/app.py`) after every API route,
because Starlette matches in registration order and the catch-all must come
last. Every built file has to live under one of these mounts: anything else at
the site root falls through to `index.html` and fails as a module script with a
text/html MIME error.
"""

from __future__ import annotations

from pathlib import Path

from backend.core import spa_csp
from backend.core.app_sections import SPA_DIR
from backend.platform.remote_files import RemotesStaticFiles
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

FRONTEND_ASSETS_DIR = SPA_DIR.parent / "assets"


def mount_spa(app: FastAPI, *, withheld_remotes: frozenset[str]) -> None:
    """Mount the static trees and the SPA catch-all on `app`.

    `withheld_remotes` are sections running in their own containers (or not
    deployed): their remotes are a 404 here, so the shell can only ever load
    them from the service that actually serves their API.
    """
    _add_favicon(app)
    # Map tiles, PMTiles archives, sprites, fonts, favicons.
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS_DIR)), name="assets")
    _mount_shell_bundle(app)
    # Mounted even before the remotes are built (check_dir=False), so a rebuild
    # is served without a restart — and a missing remote file is a 404, never
    # the SPA's index.html, which the shell would otherwise run as a remote entry.
    app.mount(
        "/remotes",
        RemotesStaticFiles(directory=str(SPA_DIR / "remotes"), check_dir=False, withheld=withheld_remotes),
        name="remotes",
    )
    _add_spa_fallback(app, SPA_DIR / "index.html")


def _add_favicon(app: FastAPI) -> None:
    @app.get("/favicon.ico")
    async def favicon_ico():
        return FileResponse(FRONTEND_ASSETS_DIR / "favicon.ico", media_type="image/x-icon")


def _mount_shell_bundle(app: FastAPI) -> None:
    # Vite builds into assetsDir='spa-assets', so the hashed bundle never
    # clashes with the map-tile /assets mount.
    fonts_dir = SPA_DIR / "fonts"
    if fonts_dir.exists():
        app.mount("/fonts", StaticFiles(directory=str(fonts_dir)), name="fonts")
    if SPA_DIR.exists():
        app.mount("/spa-assets", StaticFiles(directory=str(SPA_DIR / "spa-assets")), name="spa-assets")


def _add_spa_fallback(app: FastAPI, index: Path) -> None:
    # Any path no API route or mount matched gets index.html, so vue-router
    # can handle client-side routes.
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if index.exists():
            # The SPA entry must never be cached: it references hash-named
            # JS/CSS assets, so a stale index.html keeps pointing at an old
            # bundle after a rebuild. The hashed assets stay immutably cacheable.
            return FileResponse(
                index,
                media_type="text/html",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    # Pins where the shell (and every section remote it loads)
                    # may run scripts from; see backend/core/spa_csp.py.
                    "Content-Security-Policy": spa_csp.policy_for_index(index),
                },
            )
        return JSONResponse(
            {"detail": "SPA not built. Run: cd frontend/vue && npm run build"},
            status_code=503,
        )
