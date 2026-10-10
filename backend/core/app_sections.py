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

from pathlib import Path

from backend.core.service_registry import ServiceRegistry, registry

# RemotesStaticFiles is re-exported: the monolith mounts it at /remotes (backend/main.py).
from backend.platform.remote_files import REMOTE_ENTRY_FILENAME, RemotesStaticFiles  # noqa: F401
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/app", tags=["app"])

SPA_DIR = Path(__file__).resolve().parents[2] / "frontend" / "spa-dist"
REMOTES_DIR = SPA_DIR / "remotes"


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
