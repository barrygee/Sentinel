"""Space section lifecycle: its own tables, then the satellite radio store backfill from its data file."""

from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle

from sentinel_space.database import backfill_satellite_radio_store, create_space_tables
from sentinel_space.services import (
    globe_snapshot,  # noqa: F401  (registers the space.globe.snapshot responder, ADR 0009)
)


async def prepare() -> None:
    """Space's schema, then reconcile its radio data file into core's settings.

    Core never creates Space's tables: Space's own service
    (`sentinel_space.service`) and the test suite's in-process app need this.
    """
    await create_space_tables()
    await backfill_satellite_radio_store()


lifecycle = ModuleLifecycle(name="space", prepare=prepare)

manifest = section_manifest("space", display_name="SPACE", nav_order=20, routes=["/api/space/"])
