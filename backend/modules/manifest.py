"""The manifests the monolith registers for its own services (section-containers plan §3.1).

Each module in `backend/modules/` declares the manifest its service will send
core once it runs in its own container (P6). Until then the monolith registers
them all in-process at import (`backend/main.py`), all pointing at this process.
"""

from __future__ import annotations

from backend.config import settings
from backend.platform.service_manifest import ServiceManifest, UiRemote, remote_entry_path

# Every in-process service ships with the monolith, so they share its version.
MONOLITH_VERSION = "1.0.0"

# The federation entries every section remote exposes (platform/web/config/federation.ts).
SECTION_EXPOSES = ["./register"]


def section_manifest(section_id: str, *, display_name: str, nav_order: int, routes: list[str]) -> ServiceManifest:
    """A section served by this process, with its UI remote under `/remotes/<id>/`.

    `nav_order` is the shell's registration order — registries that keep
    insertion order (settings sections, footer items) depend on it.
    """
    return ServiceManifest(
        id=section_id,
        kind="section",
        version=MONOLITH_VERSION,
        displayName=display_name,
        navOrder=nav_order,
        internalUrl=settings.core_internal_url,
        routes=routes,
        ui=UiRemote(remoteEntry=remote_entry_path(section_id), exposes=SECTION_EXPOSES),
    )
