"""Space section lifecycle: backfill the satellite radio store from its data file."""

from backend.database import backfill_satellite_radio_store
from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle

lifecycle = ModuleLifecycle(name="space", prepare=backfill_satellite_radio_store)

manifest = section_manifest("space", display_name="SPACE", nav_order=20, routes=["/api/space/"])
