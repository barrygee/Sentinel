"""SDR section lifecycle: its own tables, seeding stored frequencies and the band plan, collecting IQ captures from the radio hub."""

import asyncio
import contextlib
import logging

from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle

from sentinel_sdr.database import create_sdr_tables, seed_sdr_bandplan_from_file, seed_sdr_data_from_files
from sentinel_sdr.services import sdr_iq_capture_transfer

logger = logging.getLogger(__name__)

_reconcile_task: asyncio.Task[None] | None = None


async def seed() -> None:
    """Seed the frequency tables and the band plan from their data files (first run only), then mirror them into core."""
    await seed_sdr_data_from_files()
    await seed_sdr_bandplan_from_file()


async def _prepare() -> None:
    # Core no longer creates the SDR section's tables, so in-process SDR creates them itself.
    await create_sdr_tables()
    await seed()


async def _reconcile_iq_captures_loop() -> None:
    """Retry pending IQ copies and clear the hub's uncollected captures, at startup and then periodically."""
    while True:
        try:
            await sdr_iq_capture_transfer.reconcile_iq_captures()
        except Exception:
            # One bad run (e.g. the database busy) must not end collection for good.
            logger.exception(
                "IQ capture reconcile failed; retrying in %.0f s", sdr_iq_capture_transfer.RECONCILE_INTERVAL_S
            )
        await asyncio.sleep(sdr_iq_capture_transfer.RECONCILE_INTERVAL_S)


async def _start() -> None:
    global _reconcile_task
    # With the radio hub in this process its captures are written in place.
    if sdr_iq_capture_transfer.copies_iq_from_hub():
        _reconcile_task = asyncio.create_task(_reconcile_iq_captures_loop(), name="sdr-iq-capture-reconcile")


async def _stop() -> None:
    # Cancel and await the loop so uvicorn's graceful shutdown doesn't hang
    # waiting on a still-cancelling task.
    global _reconcile_task
    if _reconcile_task is None:
        return
    _reconcile_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await _reconcile_task
    _reconcile_task = None


lifecycle = ModuleLifecycle(name="sdr", prepare=_prepare, start=_start, stop=_stop)

# The rest of `/api/sdr/` (frequencies, groups, search ranges, band plan,
# recordings). The radio hub registers the longer prefixes it owns.
manifest = section_manifest("sdr", display_name="SDR", nav_order=50, routes=["/api/sdr/"])
