"""Each module's lifecycle, in the order the app runs them (B8).

The order is load-bearing — see `backend/platform/lifecycle.py`:
  prepare: core (schema, migrations, settings seed) → sdr (frequency + band-plan
           seed) → space (satellite radio backfill)
  start:   bus (NATS, when configured — so every later module publishes onto a
           connected bus) → core (config file sync, offline maps) → radio hub (decode secret,
           resumed APRS/AIS decode, Sentry poller) → land → sea → air (squawk
           watcher; it asks the radio hub where the receiver is)
  stop:    the reverse.

`MANIFESTS` are the services this process hosts, registered in-process with the
service registry at import (`backend/main.py`, plan §3.2).

A service listed in `SENTINEL_EXTERNAL_SERVICES` runs in its own container
(P6), so its lifecycle and manifest are left out here — `hosts_in_process`
says which.
"""

from backend.config import settings
from backend.modules.air import lifecycle as air_lifecycle
from backend.modules.air import manifest as air_manifest
from backend.modules.bus import lifecycle as bus_lifecycle
from backend.modules.core import lifecycle as core_lifecycle
from backend.modules.land import lifecycle as land_lifecycle
from backend.modules.land import manifest as land_manifest
from backend.modules.radio_hub import lifecycle as radio_hub_lifecycle
from backend.modules.radio_hub import manifest as radio_hub_manifest
from backend.modules.sdr import lifecycle as sdr_lifecycle
from backend.modules.sdr import manifest as sdr_manifest
from backend.modules.sea import lifecycle as sea_lifecycle
from backend.modules.sea import manifest as sea_manifest
from backend.modules.space import lifecycle as space_lifecycle
from backend.modules.space import manifest as space_manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.service_manifest import ServiceManifest

# The services that have a standalone entry point (`backend/standalone/`) and
# whose routers `backend/main.py` can leave out. Grows one section at a time
# through P6.
EXTRACTABLE_SERVICES = frozenset({"space"})


def external_services() -> frozenset[str]:
    """The service ids this deployment runs in their own containers, not in this process.

    Raises `ValueError` for an id that can't run on its own yet: leaving it out
    would silently drop a section rather than move it.
    """
    external = frozenset(
        service_id.strip() for service_id in settings.sentinel_external_services.split(",") if service_id.strip()
    )
    unsupported = external - EXTRACTABLE_SERVICES
    if unsupported:
        raise ValueError(
            f"SENTINEL_EXTERNAL_SERVICES lists {sorted(unsupported)}, which can't run as separate services yet "
            f"(supported: {sorted(EXTRACTABLE_SERVICES)})"
        )
    return external


def hosts_in_process(service_id: str) -> bool:
    """True when this process hosts `service_id`'s routers, lifecycle and registration."""
    return service_id not in external_services()


_ALL_MODULES: tuple[ModuleLifecycle, ...] = (
    bus_lifecycle,
    core_lifecycle,
    sdr_lifecycle,
    space_lifecycle,
    radio_hub_lifecycle,
    land_lifecycle,
    sea_lifecycle,
    air_lifecycle,
)

_ALL_MANIFESTS: tuple[ServiceManifest, ...] = (
    air_manifest,
    space_manifest,
    sea_manifest,
    land_manifest,
    sdr_manifest,
    radio_hub_manifest,
)

# Lifecycles are named after the service they belong to; bus and core are never external.
MODULES: tuple[ModuleLifecycle, ...] = tuple(module for module in _ALL_MODULES if hosts_in_process(module.name))
MANIFESTS: tuple[ServiceManifest, ...] = tuple(manifest for manifest in _ALL_MANIFESTS if hosts_in_process(manifest.id))
