"""Sea section lifecycle: the AISStream reader, its warm-start snapshot, and the off-grid AIS receiver."""

import asyncio
import contextlib
import logging

from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.services import sea_ais_receiver
from backend.services.ais_stream import reader as ais_reader

logger = logging.getLogger(__name__)

# Before retrying a startup receiver reconcile that failed. When Sea runs in its
# own container (P6.4) its start can fall while core — which holds the settings
# it reads — or the radio hub is still starting; nothing else would retry it
# until one of those settings next changed.
RECEIVER_RETRY_S = 60

_receiver_retry_task: asyncio.Task[None] | None = None


async def _retry_receiver_reconcile() -> None:
    """Retry the startup reconcile every `RECEIVER_RETRY_S` until it succeeds once."""
    logger.info("Sea: retrying the AIS receiver reconcile every %d s until it succeeds", RECEIVER_RETRY_S)
    while True:
        await asyncio.sleep(RECEIVER_RETRY_S)
        if await sea_ais_receiver.reconcile_now():
            return


async def _start() -> None:
    global _receiver_retry_task
    # Warms the vessel store from the last snapshot and starts the AISStream
    # watchdog (it only opens the socket once the domain is enabled and keyed).
    await ais_reader.start()
    # Off grid with a designated AIS radio, start decoding now rather than when
    # the Sea page is first opened. Runs after the radio hub has started.
    if not await sea_ais_receiver.reconcile_now():
        _receiver_retry_task = asyncio.create_task(_retry_receiver_reconcile(), name="sea-ais-receiver-retry")


async def _stop() -> None:
    global _receiver_retry_task
    if _receiver_retry_task is not None:
        _receiver_retry_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _receiver_retry_task
        _receiver_retry_task = None
    await ais_reader.stop()


lifecycle = ModuleLifecycle(name="sea", start=_start, stop=_stop, wake=ais_reader.wake)

manifest = section_manifest("sea", display_name="SEA", nav_order=30, routes=["/api/sea/"])
