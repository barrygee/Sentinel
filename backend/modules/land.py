"""Land section lifecycle: the daily APRS-station cleanup loop."""

import asyncio
import logging
import time

from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.services import aprs_store

logger = logging.getLogger(__name__)

_cleanup_task: asyncio.Task[None] | None = None


# Between cleanups, and before retrying one that failed. A failed run is
# retried soon rather than a day later: when Land runs in its own container
# (P6.2) its first run can fall while core — which holds the retention
# setting — is still starting.
CLEANUP_INTERVAL_S = 24 * 60 * 60
CLEANUP_RETRY_S = 60


async def _daily_cleanup_loop() -> None:
    """Run APRS-station cleanup once at startup, then every 24h (a minute after a failure)."""
    while True:
        try:
            await aprs_store.cleanup_expired(int(time.time() * 1000))
        except Exception:
            logger.exception("APRS station cleanup failed; retrying in %d s", CLEANUP_RETRY_S)
            await asyncio.sleep(CLEANUP_RETRY_S)
            continue
        await asyncio.sleep(CLEANUP_INTERVAL_S)


async def _start() -> None:
    global _cleanup_task
    _cleanup_task = asyncio.create_task(_daily_cleanup_loop())


async def _stop() -> None:
    # Cancel and await the loop so uvicorn's graceful shutdown doesn't hang
    # waiting on a still-cancelling task.
    global _cleanup_task
    if _cleanup_task is None:
        return
    _cleanup_task.cancel()
    try:
        await _cleanup_task
    except asyncio.CancelledError:
        pass
    _cleanup_task = None


lifecycle = ModuleLifecycle(name="land", start=_start, stop=_stop)

manifest = section_manifest("land", display_name="LAND", nav_order=40, routes=["/api/land/"])
