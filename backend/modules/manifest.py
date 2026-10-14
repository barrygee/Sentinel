"""Building blocks of the manifest each service sends core when it registers (section-containers plan §3.1).

Each section's and the radio hub's module (`sentinel_<id>.module`) declares its
manifest with these. `create_service()` (`backend/platform/sdk/`) replaces
`internalUrl` with the address the service advertises before it registers; the
test suite's in-process app registers them unchanged, all pointing at itself.
"""

from __future__ import annotations

from backend.config import settings
from backend.platform.service_manifest import ServiceManifest, UiRemote, remote_entry_path

# Every service ships in the one image, so they share its version.
SENTINEL_VERSION = "1.0.0"

# The federation entries every section remote exposes (platform/web/config/federation.ts).
SECTION_EXPOSES = ["./register"]


def section_manifest(section_id: str, *, display_name: str, nav_order: int, routes: list[str]) -> ServiceManifest:
    """A section's manifest, with its UI remote under `/remotes/<id>/`.

    `nav_order` is the shell's registration order — registries that keep
    insertion order (settings sections, footer items) depend on it.
    """
    return ServiceManifest(
        id=section_id,
        kind="section",
        version=SENTINEL_VERSION,
        displayName=display_name,
        navOrder=nav_order,
        internalUrl=settings.core_internal_url,
        routes=routes,
        ui=UiRemote(remoteEntry=remote_entry_path(section_id), exposes=SECTION_EXPOSES),
    )
