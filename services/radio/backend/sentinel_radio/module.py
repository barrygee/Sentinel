"""Radio hub lifecycle: its own table, decode bridges, resumed background decodes, the Sentry fleet poller, IQ broadcasters."""

from backend.config import settings
from backend.modules.manifest import SENTINEL_VERSION
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.service_manifest import ServiceManifest

from sentinel_radio.database import create_radio_hub_tables
from sentinel_radio.routers import decode as decode_router
from sentinel_radio.services import manifest_decode
from sentinel_radio.services import sdr as sdr_service
from sentinel_radio.services import sdr_decode as sdr_decode_service
from sentinel_radio.services.sentry_fleet import fleet_poller


async def _prepare() -> None:
    # Core never creates the hub's table; the hub does, in whatever database its process uses.
    await create_radio_hub_tables()


async def _start() -> None:
    # Resume background APRS/AIS decode on the persisted radios (best-effort; a
    # missing radio or unreachable dongle is logged and skipped, never blocking
    # startup).
    await decode_router.resume_persisted_aprs()
    await decode_router.resume_persisted_ais()
    # One poller task per enabled Sentry host (ADR-0009).
    await fleet_poller.start_all()


async def _stop() -> None:
    # Stop every SDR broadcaster/connection: their long-lived tasks would
    # otherwise block shutdown indefinitely.
    await fleet_poller.stop_all()
    await sdr_decode_service.shutdown_all_decoders()
    await manifest_decode.shutdown_all()
    await sdr_service.shutdown_all()


def _wake() -> None:
    # Wake every SDR subscriber queue and decode bridge so blocked WebSocket
    # stream loops exit the instant the signal arrives.
    sdr_service.wake_all_subscribers()
    sdr_decode_service.wake_all_decoders()
    manifest_decode.wake_all()


lifecycle = ModuleLifecycle(name="radio", prepare=_prepare, start=_start, stop=_stop, wake=_wake)

# Everything that touches a physical radio. These prefixes sit inside the SDR
# section's `/api/sdr/`; the gateway's longest-prefix match sends them here.
# No UI remote: the radio panes are part of the SDR section's.
manifest = ServiceManifest(
    id="radio",
    kind="radio",
    version=SENTINEL_VERSION,
    displayName="RADIO HUB",
    internalUrl=settings.core_internal_url,
    routes=[
        "/api/sdr/radios",
        "/api/sdr/connect",
        "/api/sdr/disconnect",
        "/api/sdr/status/",
        "/api/sdr/decode/",
        "/api/sdr/aprs/",
        "/api/sdr/ais/",
        "/api/sdr/decoders",
        "/api/sdr/sentry-hosts",
        "/ws/sdr/",
    ],
)
