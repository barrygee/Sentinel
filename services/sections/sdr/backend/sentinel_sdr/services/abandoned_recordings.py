"""Finalise recordings the browser never stopped.

A recording is a row the browser creates on REC (`status="recording"`) and
finalises on stop, uploading its WAV. When the stop never arrives — the tab is
closed or reloaded mid-recording, a satellite pass's LOS restore is skipped, a
restart swallows the request — nothing else would end it: the row stayed
"recording" for ever, hidden from the recordings list (which shows only
complete ones), and the reconcile loop kept its raw-IQ capture as wanted, so
the hub went on writing it (~4 MB/s) until it restarted.

`finalise_abandoned_recordings` ends every recording older than the
`sdr.recordingMaxDurationMinutes` setting (`backend/platform/recording_limits.py`): the row becomes `status="error"` with
no IQ file, and its capture is stopped and deleted — on the hub when it runs
in another process, in the recordings folder when it shares this one. The SDR
lifecycle runs it every `RECONCILE_INTERVAL_S`.
"""

from __future__ import annotations

import datetime
import logging

from backend.cache import now_ms
from backend.database import AsyncSessionLocal
from backend.platform import recording_limits
from backend.platform.bus import bus
from sqlalchemy import select

from sentinel_sdr.models import SdrRecording
from sentinel_sdr.services import sdr_iq_capture_transfer

logger = logging.getLogger(__name__)


async def finalise_abandoned_recordings() -> list[int]:
    """Mark recordings past the maximum duration as failed and drop their IQ captures; returns their ids."""
    async with AsyncSessionLocal() as db:
        # Looked up at call time, so tests can patch the limit.
        max_duration_seconds = await recording_limits.recording_max_duration_seconds(db)
        oldest_allowed_ms = now_ms() - int(max_duration_seconds * 1000)
        abandoned = (
            (
                await db.execute(
                    select(SdrRecording).where(
                        SdrRecording.status == "recording", SdrRecording.created_at < oldest_allowed_ms
                    )
                )
            )
            .scalars()
            .all()
        )
        ended_at = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        for recording in abandoned:
            if recording.has_iq_file:
                await _drop_iq_capture(recording.id)
            recording.status = "error"
            recording.ended_at = ended_at
            recording.has_iq_file = False
            recording.iq_file_size_bytes = 0
        await db.commit()
    for recording in abandoned:
        logger.warning(
            "Recording %d was never stopped (started %s); marked it failed and dropped its IQ capture",
            recording.id,
            recording.started_at,
        )
    return [recording.id for recording in abandoned]


async def _drop_iq_capture(recording_id: int) -> None:
    """Stop and delete an abandoned recording's IQ capture, best effort."""
    # Module lookups at call time, so tests can place the hub in or out of process.
    if sdr_iq_capture_transfer.copies_iq_from_hub():
        # Discard stops a running capture as well. If the hub is unreachable the
        # reconcile loop discards it later: the row no longer wants it.
        await sdr_iq_capture_transfer.discard_hub_capture(recording_id)
        return
    # The hub shares this process and writes into the recordings folder, so the
    # file is the recording's own: stop the capture, then delete it here.
    try:
        await bus.request("hub.iq-capture.stop", {"capture_id": recording_id})
    except Exception as error:  # noqa: BLE001 - a missing responder must not keep the row "recording"
        logger.warning("Could not stop IQ capture %d: %s", recording_id, error)
    sdr_iq_capture_transfer.iq_path(recording_id).unlink(missing_ok=True)
