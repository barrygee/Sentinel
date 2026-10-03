"""Space section lifecycle: backfill the satellite radio store from its data file."""

from backend.database import backfill_satellite_radio_store
from backend.platform.lifecycle import ModuleLifecycle

lifecycle = ModuleLifecycle(name="space", prepare=backfill_satellite_radio_store)
