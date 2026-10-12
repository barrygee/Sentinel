"""Collect finished IQ captures from the radio hub into the SDR section's recordings (plan P7.3).

The radio hub writes a recording's raw IQ (`<id>.u8`). When the SDR section
shares its process (the monolith) the hub writes it straight into the
recordings folder and there is nothing to do here. Otherwise the hub keeps it
in its own staging folder, and this module copies it over HTTP and has the hub
delete it (`backend/radio_hub/services/iq_capture.py`):

- `schedule_collect` starts the copy in the background when a recording stops,
  so the stop request doesn't wait on it (a minute of IQ is ~300 MB). Until it
  lands, the recording's IQ is *pending* (`iq_file_pending`).
- `reconcile_iq_captures` runs every `RECONCILE_INTERVAL_S` from the SDR
  lifecycle and catches up with whatever that missed: it retries a copy that
  failed (hub down, restarted, unreachable), stops a capture whose stop never
  arrived, and has the hub discard captures nobody will collect (the recording
  was deleted, never finished starting, or its copy already landed but the
  hub's delete failed). A capture the hub no longer holds at all is lost, and
  the recording stops claiming an IQ file.

Files are streamed to a `.part` alongside and renamed only once complete, so a
half-copied capture is never served as a recording's IQ.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import httpx
from backend.database import AsyncSessionLocal, sdr_recordings_dir
from backend.models import SdrRecording
from backend.modules import shares_process_with
from backend.platform.bus import bus
from backend.platform.service_credentials import own_token
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Connecting and each read/write may take this long; there is no limit on the
# whole copy, which grows with the recording (~4.8 MB per second at 2.4 MS/s).
TRANSFER_TIMEOUT = httpx.Timeout(60.0, connect=10.0)

# Between reconcile runs. Pending copies are retried this often while the hub
# is unreachable; a normal copy doesn't wait for it (`schedule_collect`).
RECONCILE_INTERVAL_S = 60.0

_CHUNK_BYTES = 1024 * 1024

# Recordings whose copy is running now, so a stop's copy and a reconcile run
# never fetch the same file twice at once.
_collecting: set[int] = set()
# Strong references to background copies (asyncio keeps only weak ones).
_background_copies: set[asyncio.Task[None]] = set()
# Whether the last reconcile run could reach the hub, so an outage is logged
# once when it starts and once when it ends rather than every run.
_hub_reachable = True


class IqCaptureTransferError(Exception):
    """The capture could not be copied from the radio hub."""


def copies_iq_from_hub() -> bool:
    """True when the radio hub runs in another process, so captures are copied rather than written in place."""
    return not shares_process_with("radio-hub")


def iq_path(recording_id: int) -> Path:
    """Where recording `recording_id`'s IQ lives once the SDR section holds it."""
    return sdr_recordings_dir() / f"{recording_id}.u8"


def iq_file_pending(recording: SdrRecording) -> bool:
    """True while a recording's IQ is still on the radio hub, waiting to be copied."""
    return bool(recording.has_iq_file) and copies_iq_from_hub() and not iq_path(recording.id).exists()


async def fetch_iq_capture(download_url: str, destination: Path) -> int:
    """Stream the capture at `download_url` into `destination`, then delete the hub's copy.

    Returns the number of bytes copied. Raises `IqCaptureTransferError` when the
    hub can't be reached, refuses or answers with an error; `destination` is
    left untouched then. A failed delete is only logged: the copy succeeded,
    and the next reconcile run has the hub discard it.
    """
    token = own_token()
    if not token:
        raise IqCaptureTransferError("no HTTP credential: the radio hub's captures can't be reached")
    headers = {"Authorization": f"Bearer {token}"}
    partial = destination.with_name(destination.name + ".part")
    destination.parent.mkdir(parents=True, exist_ok=True)
    copied_bytes = 0
    try:
        async with httpx.AsyncClient(timeout=TRANSFER_TIMEOUT) as client:
            async with client.stream("GET", download_url, headers=headers) as response:
                if not response.is_success:
                    raise IqCaptureTransferError(f"radio hub answered {response.status_code} for {download_url}")
                with partial.open("wb") as capture_file:
                    async for chunk in response.aiter_bytes(_CHUNK_BYTES):
                        capture_file.write(chunk)
                        copied_bytes += len(chunk)
            partial.replace(destination)
            try:
                deleted = await client.delete(download_url, headers=headers)
                # 404: already gone (the recording was deleted while it copied).
                if not deleted.is_success and deleted.status_code != 404:
                    logger.warning("Radio hub kept its copy of %s (HTTP %d)", download_url, deleted.status_code)
            except httpx.HTTPError as error:
                logger.warning("Could not delete the radio hub's copy of %s: %s", download_url, error)
    except httpx.HTTPError as error:
        raise IqCaptureTransferError(f"radio hub unreachable at {download_url}: {error}") from error
    finally:
        partial.unlink(missing_ok=True)
    return copied_bytes


async def collect_capture(recording_id: int) -> None:
    """Copy recording `recording_id`'s IQ from the hub, or settle why it can't be.

    Bus errors (hub or NATS unreachable) and failed copies propagate, leaving
    the recording pending for the next reconcile run.
    """
    if recording_id in _collecting:
        return
    _collecting.add(recording_id)
    try:
        location = await bus.request("hub.iq-capture.locate", {"capture_id": recording_id})
        if location.get("ok"):
            await fetch_iq_capture(location["download_url"], iq_path(recording_id))
        elif location.get("reason") == "capturing":
            # The recording finished but its stop never reached the hub: stop
            # it now; the next run collects the file.
            await bus.request("hub.iq-capture.stop", {"capture_id": recording_id})
            return
        await _settle_recording(recording_id)
    finally:
        _collecting.discard(recording_id)


async def _settle_recording(recording_id: int) -> None:
    """Record the outcome of a collect on the recording's row."""
    path = iq_path(recording_id)
    async with AsyncSessionLocal() as db:
        recording = (await db.execute(select(SdrRecording).where(SdrRecording.id == recording_id))).scalar_one_or_none()
        if recording is None or not recording.has_iq_file:
            # Deleted while the copy ran: don't leave its file behind.
            path.unlink(missing_ok=True)
            return
        if path.exists():
            recording.iq_file_size_bytes = path.stat().st_size
        else:
            logger.warning("Radio hub no longer holds the IQ of recording %d; it is lost", recording_id)
            recording.has_iq_file = False
            recording.iq_file_size_bytes = 0
        await db.commit()


def schedule_collect(recording_id: int) -> None:
    """Copy a just-stopped recording's IQ in the background; a failure is retried by the reconcile loop."""

    async def collect_in_background() -> None:
        try:
            await collect_capture(recording_id)
        except Exception as error:  # noqa: BLE001 - the reconcile loop retries it
            logger.warning("Could not copy IQ recording %d from the radio hub yet: %s", recording_id, error)

    task = asyncio.create_task(collect_in_background(), name=f"sdr-iq-collect-{recording_id}")
    _background_copies.add(task)
    task.add_done_callback(_background_copies.discard)


async def discard_hub_capture(recording_id: int) -> None:
    """Best effort: have the hub drop a capture nobody will collect (the reconcile loop retries)."""
    try:
        await bus.request("hub.iq-capture.discard", {"capture_id": recording_id})
    except Exception as error:  # noqa: BLE001 - reconcile retries it
        logger.info("Radio hub could not discard IQ capture %d yet: %s", recording_id, error)


async def reconcile_iq_captures() -> None:
    """Bring the hub's staged captures and the recordings' IQ files back into line (see the module docstring)."""
    global _hub_reachable
    if not copies_iq_from_hub():
        return
    try:
        held = (await bus.request("hub.iq-capture.list", {})).get("capture_ids", [])
    except Exception as error:  # noqa: BLE001 - hub, NATS or the hub's reply may be down
        if _hub_reachable:
            logger.warning("IQ captures: radio hub unreachable, pending copies wait for it (%s)", error)
            _hub_reachable = False
        return
    if not _hub_reachable:
        logger.info("IQ captures: radio hub reachable again")
        _hub_reachable = True

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(SdrRecording))).scalars().all()
    recordings = {recording.id: recording for recording in rows}

    collected_this_run: set[int] = set()
    for recording in rows:
        if recording.status == "complete" and iq_file_pending(recording):
            collected_this_run.add(recording.id)
            try:
                await collect_capture(recording.id)
            except Exception as error:  # noqa: BLE001 - retried next run
                logger.warning("Could not copy IQ recording %d from the radio hub: %s", recording.id, error)

    for capture_id in held:
        recording = recordings.get(capture_id)
        # A recording still in progress keeps its capture whatever its row says
        # yet: the row is written before the capture starts, `has_iq_file` only
        # once the hub has replied.
        still_wanted = recording is not None and (
            recording.status == "recording" or (recording.has_iq_file and not iq_path(capture_id).exists())
        )
        # A capture collected just now had its hub copy deleted by the copy
        # itself; if that delete failed, the next run discards it.
        if not still_wanted and capture_id not in _collecting and capture_id not in collected_this_run:
            await discard_hub_capture(capture_id)
