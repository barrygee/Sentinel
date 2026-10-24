"""`sdr-manager-local`'s manifest: the SDR Manager API under the gateway prefix `/api/sdr-manager/local/`.

Its UI remote (`@sentinel/sdr-manager-local`, services/sdr-manager-local/frontend)
adds the THIS MACHINE group to Settings › SDR Manager; it registers no map
section. Core lists the service by kind
(`GET /internal/registry/services?kind=sdr-manager-local`), which is how
`sdr-manager-remote` finds it as "This machine".
"""

from backend.config import settings
from backend.modules.manifest import SECTION_EXPOSES, SENTINEL_VERSION
from backend.platform.service_manifest import ServiceManifest, UiRemote, remote_entry_path

SERVICE_ID = "sdr-manager-local"

# The prefix the gateway routes here, and where `service.py` mounts the API.
GATEWAY_API_PREFIX = "/api/sdr-manager/local"

manifest = ServiceManifest(
    id=SERVICE_ID,
    kind="sdr-manager-local",
    version=SENTINEL_VERSION,
    displayName="SDR MANAGER",
    internalUrl=settings.core_internal_url,
    routes=[f"{GATEWAY_API_PREFIX}/"],
    ui=UiRemote(remoteEntry=remote_entry_path(SERVICE_ID), exposes=SECTION_EXPOSES),
)
