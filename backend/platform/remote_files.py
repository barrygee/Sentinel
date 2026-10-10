"""Serving a section's Module Federation remote (`/remotes/<id>/…`).

Used by the monolith for the sections it hosts (`backend/main.py`) and by a
section running in its own container for its own remote
(`backend/platform/sdk/`), so both answer the same way.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.types import Scope

REMOTE_ENTRY_FILENAME = "remoteEntry.js"


class RemotesStaticFiles(StaticFiles):
    """Serves `/remotes/<id>/…` — each section remote's entry and chunks.

    `remoteEntry.js` is the one unhashed file: it names the hashed chunks, so,
    like the SPA's index.html, it must never be cached, or a browser keeps
    loading a section's previous build after an upgrade. The chunks themselves
    stay cacheable.

    `withheld` names sections whose remotes this process must not serve even
    though their files are in the build: the monolith withholds a section that
    runs in its own container (or isn't deployed), so its remote can only ever
    come from the service that actually serves its API — never a stale copy.
    """

    def __init__(self, *args: Any, withheld: frozenset[str] = frozenset(), **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.withheld = withheld

    def get_path(self, scope: Scope) -> str:
        path = super().get_path(scope)
        section_id = Path(path).parts[0] if Path(path).parts else ""
        if section_id in self.withheld:
            # Raised as Starlette does for any missing file: a plain 404.
            raise HTTPException(status_code=404)
        return path

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
        if Path(full_path).name == REMOTE_ENTRY_FILENAME:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response


def remotes_dir() -> Path:
    """Where the SPA build puts every section's remote (`frontend/spa-dist/remotes`)."""
    return Path(__file__).resolve().parents[2] / "frontend" / "spa-dist" / "remotes"
