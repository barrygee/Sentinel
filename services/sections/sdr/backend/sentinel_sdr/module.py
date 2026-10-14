"""SDR section lifecycle: its own tables, seeding frequencies and the band plan, ending abandoned recordings, collecting IQ captures."""

import asyncio
import contextlib
import logging

from backend.modules.manifest import section_manifest
from backend.platform.lifecycle import ModuleLifecycle

from sentinel_sdr.database import create_sdr_tables, seed_sdr_bandplan_from_file, seed_sdr_data_from_files
from sentinel_sdr.services import abandoned_recordings, sdr_iq_capture_transfer

logger = logging.getLogger(__name__)

_reconcile_task: asyncio.Task[None] | None = None


async def seed() -> None:
    """Seed the frequency tables and the band plan from their data files (first run only), then mirror them into core."""
    await seed_sdr_data_from_files()
    await seed_sdr_bandplan_from_file()


async def _prepare() -> None:
    # Core never creates the SDR section's tables; it does, in whatever database its process uses.
    await create_sdr_tables()
    await seed()


async def _reconcile_recordings_loop() -> None:
    """At startup and then periodically: end recordings never stopped, retry pending IQ copies, clear stray captures."""
    while True:
        try:
            await abandoned_recordings.finalise_abandoned_recordings()
        except Exception:
            # One bad run (e.g. the database busy) must not end the loop for good.
            logger.exception(
                "Ending abandoned recordings failed; retrying in %.0f s", sdr_iq_capture_transfer.RECONCILE_INTERVAL_S
            )
        try:
            # A no-op when the radio hub shares this process: its captures are written in place.
            await sdr_iq_capture_transfer.reconcile_iq_captures()
        except Exception:
            logger.exception(
                "IQ capture reconcile failed; retrying in %.0f s", sdr_iq_capture_transfer.RECONCILE_INTERVAL_S
            )
        await asyncio.sleep(sdr_iq_capture_transfer.RECONCILE_INTERVAL_S)


async def _start() -> None:
    global _reconcile_task
    _reconcile_task = asyncio.create_task(_reconcile_recordings_loop(), name="sdr-recordings-reconcile")


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
