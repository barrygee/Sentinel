"""Serving a section's Module Federation remote (`/remotes/<id>/…`).

Used by a section running in its own container for its own remote
(`backend/platform/sdk/`), and by the test suite's in-process app for every
section (`backend/core/spa_serving.py`), so both answer the same way.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

REMOTE_ENTRY_FILENAME = "remoteEntry.js"

# Vite writes every built JS/CSS/font chunk into a folder of this name, with a
# content hash in its file name (`section-BMGcEBKO.js`).
HASHED_ASSETS_DIRNAME = "spa-assets"

# For a file whose name carries its content hash: a new build gives changed
# content a new name, so a copy can be kept for good and never rechecked.
# Without it, browsers guess a lifetime from Last-Modified — minutes after a
# rebuild — and then re-request or revalidate each of the hundreds of chunks
# the shell and its section remotes load before a map can draw.
IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"

# For the unhashed files that name the hashed ones (index.html, remoteEntry.js):
# a stale copy would keep loading the previous build after an upgrade.
NEVER_CACHE_CONTROL = "no-cache, no-store, must-revalidate"


class HashedAssetsStaticFiles(StaticFiles):
    """Serves a folder of content-hashed build output (`/spa-assets/…`) as immutable."""

    def file_response(
        self,
        full_path: os.PathLike[str] | str,
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        response = super().file_response(full_path, stat_result, scope, status_code)
        response.headers["Cache-Control"] = IMMUTABLE_CACHE_CONTROL
        return response


class RemotesStaticFiles(StaticFiles):
    """Serves `/remotes/<id>/…` — each section remote's entry and chunks.

    `remoteEntry.js` is the one unhashed file: it names the hashed chunks, so,
    like the SPA's index.html, it must never be cached, or a browser keeps
    loading a section's previous build after an upgrade. The chunks under
    `spa-assets/` carry their content hash and are cached for good.
    """

    async def check_config(self) -> None:
        # Before the SPA is built there is no remotes/ directory, and Starlette
        # answers every request with a 500. Nothing is deployed yet, so a
        # missing remote is just a 404 until the build creates it.
        if self.directory is not None and not Path(self.directory).is_dir():
            return
        await super().check_config()

    def file_response(
        self,
        full_path: os.PathLike[str] | str,
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        response = super().file_response(full_path, stat_result, scope, status_code)
        served_file = Path(full_path)
        if served_file.name == REMOTE_ENTRY_FILENAME:
            response.headers["Cache-Control"] = NEVER_CACHE_CONTROL
        elif served_file.parent.name == HASHED_ASSETS_DIRNAME:
            response.headers["Cache-Control"] = IMMUTABLE_CACHE_CONTROL
        return response


def remotes_dir() -> Path:
    """Where the SPA build puts every section's remote (`frontend/spa-dist/remotes`)."""
    return Path(__file__).resolve().parents[2] / "frontend" / "spa-dist" / "remotes"
