"""Space section lifecycle: its own tables, then the satellite radio store backfill from its data file."""

from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle

from sentinel_space.database import backfill_satellite_radio_store, create_space_tables


async def prepare() -> None:
    """Space's schema, then reconcile its radio data file into core's settings.

    Core no longer creates Space's tables, so a core hosting Space in-process
    needs this as much as Space's own service (`sentinel_space.service`).
    """
    await create_space_tables()
    await backfill_satellite_radio_store()


lifecycle = ModuleLifecycle(name="space", prepare=prepare)

manifest = section_manifest("space", display_name="SPACE", nav_order=20, routes=["/api/space/"])
