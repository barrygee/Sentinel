"""The sections this deployment includes — what the shell loads at boot.

  GET /api/app/sections — `{"sections": [{"id", "remoteEntry"}, …]}`

Each section's UI is a Module Federation remote built into
`frontend/spa-dist/remotes/<id>/` and served from `/remotes/<id>/` (P4 of
docs/plans/section-containers.md). Until sections register themselves (P5),
the list is simply the remotes that are built: a section is included when its
`remoteEntry.js` exists. The shell fetches this before mounting and registers
every listed remote; a section that is listed but fails to load gets the
shell's "section unavailable" page instead of taking the app down.

The order is the shell's registration order (nav order), mirroring
`SECTION_REGISTRATION_ORDER` in `platform/web/config/federation.ts` — the
vite-preview stand-in for this endpoint — since registries that keep insertion
order (settings sections, footer items) depend on it.
"""

import os
import re
from pathlib import Path

from fastapi import APIRouter
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.responses import Response
from starlette.types import Scope

router = APIRouter(prefix="/api/app", tags=["app"])

SPA_DIR = Path(__file__).resolve().parents[2] / "frontend" / "spa-dist"
REMOTES_DIR = SPA_DIR / "remotes"
REMOTE_ENTRY_FILENAME = "remoteEntry.js"

SECTION_REGISTRATION_ORDER = ("air", "space", "sea", "land", "sdr")

# Same pattern the shell enforces before loading a remote: the id becomes part
# of a URL and a federation container name, so anything else is never listed.
_SECTION_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")


class DeployedSection(BaseModel):
    """One section the shell should load."""

    id: str
    remoteEntry: str  # camelCase: the wire name the shell reads


class DeployedSections(BaseModel):
    """Body of GET /api/app/sections."""

    sections: list[DeployedSection]


def _registration_rank(section_id: str) -> tuple[int, str]:
    """Known sections in nav order, then any others alphabetically."""
    if section_id in SECTION_REGISTRATION_ORDER:
        return (SECTION_REGISTRATION_ORDER.index(section_id), section_id)
    return (len(SECTION_REGISTRATION_ORDER), section_id)


def built_sections(remotes_dir: Path) -> list[DeployedSection]:
    """The section remotes built under `remotes_dir`, in registration order.

    Read on every call rather than cached at startup, so a rebuilt SPA (or a
    section added or removed) shows up on the next page load without a restart.
    """
    if not remotes_dir.is_dir():
        return []
    section_ids = [
        entry.name
        for entry in remotes_dir.iterdir()
        if entry.is_dir() and _SECTION_ID_PATTERN.match(entry.name) and (entry / REMOTE_ENTRY_FILENAME).is_file()
    ]
    return [
        DeployedSection(id=section_id, remoteEntry=f"/remotes/{section_id}/{REMOTE_ENTRY_FILENAME}")
        for section_id in sorted(section_ids, key=_registration_rank)
    ]


@router.get("/sections", response_model=DeployedSections)
async def list_sections() -> DeployedSections:
    """List the sections the shell should load as federation remotes."""
    return DeployedSections(sections=built_sections(REMOTES_DIR))


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
