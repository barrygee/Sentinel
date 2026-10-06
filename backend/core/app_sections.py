"""The sections this deployment includes — what the shell loads at boot.

  GET /api/app/sections — `{"sections": [{"id", "remoteEntry", "available"}, …]}`

Each section's UI is a Module Federation remote served from `/remotes/<id>/`
(P4 of docs/plans/section-containers.md). The list is the service registry's
sections (P5, `backend/core/service_registry.py`), in nav order — the shell's
registration order, which registries that keep insertion order (settings
sections, footer items) depend on. `platform/web/config/federation.ts` mirrors
that order for vite preview, its stand-in for this endpoint.

A section this process hosts is listed only once its remote is built, read on
every request so a rebuilt SPA shows up without a restart. A section running in
its own container serves its remote itself, so it is listed as registered, and
`available` follows its health probes. The shell registers every listed remote;
one that fails to load gets the "section unavailable" page instead of taking
the app down.
"""

import os
from pathlib import Path

from backend.core.service_registry import ServiceRegistry, registry
from fastapi import APIRouter
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.responses import Response
from starlette.types import Scope

router = APIRouter(prefix="/api/app", tags=["app"])

SPA_DIR = Path(__file__).resolve().parents[2] / "frontend" / "spa-dist"
REMOTES_DIR = SPA_DIR / "remotes"
REMOTE_ENTRY_FILENAME = "remoteEntry.js"


class DeployedSection(BaseModel):
    """One section the shell should load."""

    id: str
    remoteEntry: str  # camelCase: the wire name the shell reads
    available: bool


class DeployedSections(BaseModel):
    """Body of GET /api/app/sections."""

    sections: list[DeployedSection]


def deployed_sections(service_registry: ServiceRegistry, remotes_dir: Path) -> list[DeployedSection]:
    """The registered sections with a UI remote the shell can load, in nav order."""
    sections: list[DeployedSection] = []
    for registration in service_registry.services():
        manifest = registration.manifest
        if manifest.kind != "section" or manifest.ui is None:
            continue
        if registration.in_process and not (remotes_dir / manifest.id / REMOTE_ENTRY_FILENAME).is_file():
            continue
        sections.append(
            DeployedSection(id=manifest.id, remoteEntry=manifest.ui.remote_entry, available=registration.available)
        )
    return sections


@router.get("/sections", response_model=DeployedSections)
async def list_sections() -> DeployedSections:
    """List the sections the shell should load as federation remotes."""
    return DeployedSections(sections=deployed_sections(registry, REMOTES_DIR))


class RemotesStaticFiles(StaticFiles):
    """Serves `/remotes/<id>/…` — each section remote's entry and chunks.

    `remoteEntry.js` is the one unhashed file: it names the hashed chunks, so,
    like the SPA's index.html, it must never be cached, or a browser keeps
    loading a section's previous build after an upgrade. The chunks themselves
    stay cacheable.
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
        if Path(full_path).name == REMOTE_ENTRY_FILENAME:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response
