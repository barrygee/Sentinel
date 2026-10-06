"""Air section: its manifest, and the squawk watcher (server-side emergency alerts)."""

from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.services.adsb_squawk import watcher

# `/api/air/messages` stays core's (notifications); the gateway sends that
# longer prefix to core and the rest of `/api/air/` here.
manifest = section_manifest("air", display_name="AIR", nav_order=10, routes=["/api/air/"])


async def _start() -> None:
    # Fetches aircraft itself only while no browser is, so emergency squawks
    # raise alerts with no Air page open (docs/plans/adsb-server-alerts.md).
    watcher.start()


async def _stop() -> None:
    await watcher.stop()


lifecycle = ModuleLifecycle(name="air", start=_start, stop=_stop)
