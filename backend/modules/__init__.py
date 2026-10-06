"""Each module's lifecycle, in the order the app runs them (B8).

The order is load-bearing — see `backend/platform/lifecycle.py`:
  prepare: core (schema, migrations, settings seed) → sdr (frequency + band-plan
           seed) → space (satellite radio backfill)
  start:   bus (NATS, when configured — so every later module publishes onto a
           connected bus) → core (config file sync, offline maps) → radio hub (decode secret,
           resumed APRS/AIS decode, Sentry poller) → land → sea
  stop:    the reverse.

Air has no lifecycle: everything it does is request-driven.

`MANIFESTS` are the services this process hosts, registered in-process with the
service registry at import (`backend/main.py`, plan §3.2).
"""

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

MODULES: tuple[ModuleLifecycle, ...] = (
    bus_lifecycle,
    core_lifecycle,
    sdr_lifecycle,
    space_lifecycle,
    radio_hub_lifecycle,
    land_lifecycle,
    sea_lifecycle,
)

MANIFESTS: tuple[ServiceManifest, ...] = (
    air_manifest,
    space_manifest,
    sea_manifest,
    land_manifest,
    sdr_manifest,
    radio_hub_manifest,
)
