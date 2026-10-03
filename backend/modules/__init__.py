"""Each module's lifecycle, in the order the app runs them (B8).

The order is load-bearing — see `backend/platform/lifecycle.py`:
  prepare: core (schema, migrations, settings seed) → sdr (frequency + band-plan
           seed) → space (satellite radio backfill)
  start:   core (config file sync, offline maps) → radio hub (decode secret,
           resumed APRS/AIS decode, Sentry poller) → land → sea
  stop:    the reverse.

Air has no lifecycle: everything it does is request-driven.
"""

from backend.modules.core import lifecycle as core_lifecycle
from backend.modules.land import lifecycle as land_lifecycle
from backend.modules.radio_hub import lifecycle as radio_hub_lifecycle
from backend.modules.sdr import lifecycle as sdr_lifecycle
from backend.modules.sea import lifecycle as sea_lifecycle
from backend.modules.space import lifecycle as space_lifecycle
from backend.platform.lifecycle import ModuleLifecycle

MODULES: tuple[ModuleLifecycle, ...] = (
    core_lifecycle,
    sdr_lifecycle,
    space_lifecycle,
    radio_hub_lifecycle,
    land_lifecycle,
    sea_lifecycle,
)
