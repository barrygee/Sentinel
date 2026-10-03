"""Land section lifecycle: the daily APRS-station cleanup loop."""

import asyncio
import logging
import time

from backend.platform.lifecycle import ModuleLifecycle
from backend.services import aprs_store

logger = logging.getLogger(__name__)

_cleanup_task: asyncio.Task[None] | None = None


async def _daily_cleanup_loop() -> None:
    """Run APRS-station cleanup once at startup, then every 24h."""
    while True:
        try:
            await aprs_store.cleanup_expired(int(time.time() * 1000))
        except Exception:
            logger.exception("APRS station cleanup failed")
        await asyncio.sleep(24 * 60 * 60)


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
