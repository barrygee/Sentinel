"""Air section lifecycle: its own tables, then the squawk watcher (server-side emergency alerts); its manifest."""

from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle

from sentinel_air.database import create_air_tables
from sentinel_air.services.adsb_squawk import watcher

# `/api/air/messages` stays core's (notifications); the gateway sends that
# longer prefix to core and the rest of `/api/air/` here. `/api/sdr/adsb/` is
# Air's too (the Sentry dongle behind Off Grid ADS-B, `adsb_source_router.py`)
# despite sitting under the SDR section's `/api/sdr/` — the longer prefix wins.
manifest = section_manifest("air", display_name="AIR", nav_order=10, routes=["/api/air/", "/api/sdr/adsb/"])


async def _start() -> None:
    # Fetches aircraft itself only while no browser is, so emergency squawks
    # raise alerts with no Air page open (docs/plans/adsb-server-alerts.md).
    watcher.start()


async def _stop() -> None:
    await watcher.stop()


# Core no longer creates Air's tables, so in-process Air creates them itself.
lifecycle = ModuleLifecycle(name="air", prepare=create_air_tables, start=_start, stop=_stop)
