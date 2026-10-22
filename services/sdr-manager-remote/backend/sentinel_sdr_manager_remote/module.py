"""sdr-manager-remote lifecycle and manifest: its own table, the host poller and the "This machine" link."""

from backend.config import settings
from backend.modules.manifest import SENTINEL_VERSION
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.service_manifest import ServiceManifest

from sentinel_sdr_manager_remote.database import create_sdr_manager_remote_tables
from sentinel_sdr_manager_remote.services.host_poller import host_poller
from sentinel_sdr_manager_remote.services.local_link import local_link

SERVICE_ID = "sdr-manager-remote"

# The prefix the gateway routes here, and the hosts router's own prefix.
GATEWAY_API_PREFIX = "/api/sdr-manager/remote"


async def _prepare() -> None:
    # Core never creates this table; the service does, in whatever database its process uses.
    await create_sdr_manager_remote_tables()


async def _start() -> None:
    # One poller task per enabled host, then the link, which starts or stops
    # the "This machine" row's poller as sdr-manager-local comes and goes.
    await host_poller.start_all()
    local_link.start()


async def _stop() -> None:
    await local_link.stop()
    await host_poller.stop_all()


lifecycle = ModuleLifecycle(name=SERVICE_ID, prepare=_prepare, start=_start, stop=_stop)

# No UI remote yet: the REMOTE SDR HOSTS screens are still the SDR section's
# Settings, and move into `@sentinel/sdr-manager-remote` with their own PR.
manifest = ServiceManifest(
    id=SERVICE_ID,
    kind="sdr-manager-remote",
    version=SENTINEL_VERSION,
    displayName="SDR MANAGER",
    internalUrl=settings.core_internal_url,
    routes=[f"{GATEWAY_API_PREFIX}/"],
)
