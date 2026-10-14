"""IQ capture — the radio hub's raw-IQ recording API (plan B12, P7.3).

The SDR section owns a recording (its row, the browser-uploaded WAV, the
metadata); the hub owns the radio, so it is the hub that taps the broadcaster's
IQ fan-out and writes the raw ``.u8`` file. The SDR section asks over the bus:

  hub.iq-capture.start    {capture_id, radio_id, db}  begin writing <capture_id>.u8
  hub.iq-capture.stop     {capture_id}                stop and flush it
  hub.iq-capture.locate   {capture_id}                where to download a finished capture
  hub.iq-capture.list     {}                          every capture the hub still holds
  hub.iq-capture.discard  {capture_id}                stop it if running, delete the file

Replies are plain dicts, never exceptions, so the contract survives the move to
a real NATS request/reply: ``{"ok": True, ...}`` on success, otherwise
``{"ok": False, "reason": ...}`` where ``reason`` is ``unknown_radio``,
``not_streaming`` (no broadcaster is running for the radio, so there is no IQ
to capture), ``error`` (the capture could not be opened), ``not_active`` (stop
of a capture that isn't running), ``capturing`` (locate of one still being
written) or ``not_found`` (locate of one the hub doesn't hold).

`db` rides in the start payload, as on every in-process subject (see
`backend/platform/bus.py`).

The capture goes into the hub's own staging folder, ``iq-captures/`` next to
its database, and the SDR section copies it over HTTP from ``download_url``
(``/internal/radio-hub/iq-captures/<capture_id>`` at the hub's registered
address, `routers/iq_captures.py`), then deletes it. That folder holds nothing
but captures waiting to be collected, which is what makes `list` and `discard`
safe for the SDR section to reconcile against. The IQ never rides the bus.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from backend.config import settings
from backend.platform.bus import EventPayload, bus
from backend.platform.recording_limits import recording_max_duration_seconds

from sentinel_radio import radios as radio_registry
from sentinel_radio.services import sdr as sdr_svc
from sentinel_radio.services.decoder_sockets import advertised_hub_url

logger = logging.getLogger(__name__)

START_SUBJECT = "hub.iq-capture.start"
STOP_SUBJECT = "hub.iq-capture.stop"
LOCATE_SUBJECT = "hub.iq-capture.locate"
LIST_SUBJECT = "hub.iq-capture.list"
DISCARD_SUBJECT = "hub.iq-capture.discard"

# How long stop waits for the drain task to flush the last queued chunk.
_FLUSH_GRACE_S = 0.2

# capture_id → the broadcaster it taps and its recording queue.
_active_captures: dict[int, tuple[sdr_svc.RadioBroadcaster, asyncio.Queue]] = {}
# capture_id → the timer that stops it at the recording limit (`sdr.recordingMaxDurationMinutes`).
_capture_time_limits: dict[int, asyncio.TimerHandle] = {}


def iq_capture_dir() -> Path:
    """Where capture files are written: the hub's staging folder, ``<capture dir>/<capture_id>.u8``.

    It holds only captures the SDR section hasn't collected yet.
    """
    return Path(settings.db_path).parent / "iq-captures"


def capture_path(capture_id: int) -> Path:
    """The file capture `capture_id` is (or was) written to."""
    return iq_capture_dir() / f"{capture_id}.u8"


def is_capturing(capture_id: int) -> bool:
    """True while capture `capture_id` is still being written."""
    return capture_id in _active_captures


def download_url(capture_id: int) -> str:
    """Where another service fetches the finished capture from: this hub, as registered."""
    return f"{advertised_hub_url().rstrip('/')}/internal/radio-hub/iq-captures/{capture_id}"


def _stop_capture(capture_id: int) -> bool:
    """Stop writing capture `capture_id`; False when it wasn't running."""
    time_limit = _capture_time_limits.pop(capture_id, None)
    if time_limit is not None:
        time_limit.cancel()
    capture = _active_captures.pop(capture_id, None)
    if capture is None:
        return False
    broadcaster, queue = capture
    broadcaster.stop_iq_recording(queue)
    return True


async def _on_start(payload: EventPayload) -> dict[str, Any]:
    capture_id = payload["capture_id"]
    radios = await radio_registry.get_radios(payload["db"])
    radio = radio_registry.get_radio_by_id(radios, payload["radio_id"])
    if radio is None:
        return {"ok": False, "reason": "unknown_radio"}
    broadcaster = sdr_svc.get_broadcaster(radio["host"], radio["port"])
    if broadcaster is None:
        return {"ok": False, "reason": "not_streaming"}
    try:
        iq_capture_dir().mkdir(parents=True, exist_ok=True)
        queue = await broadcaster.start_iq_recording(str(capture_path(capture_id)))
    except Exception as exc:  # noqa: BLE001 - a failed capture must not fail the recording
        logger.warning("Could not start IQ capture %s: %s", capture_id, exc)
        return {"ok": False, "reason": "error"}
    # Read before the capture is registered, so a slow settings read can't race a stop.
    time_limit_seconds = await recording_max_duration_seconds(payload["db"])
    _active_captures[capture_id] = (broadcaster, queue)
    # The SDR section asks for stop when its recording ends, but a recording
    # whose browser went away never ends: without a limit the capture would
    # write ~4 MB/s until the hub restarts. The file is kept, so the SDR
    # section still collects (or discards) it like any other.
    _capture_time_limits[capture_id] = asyncio.get_running_loop().call_later(
        time_limit_seconds, _stop_at_time_limit, capture_id, time_limit_seconds
    )
    return {"ok": True}


def _stop_at_time_limit(capture_id: int, time_limit_seconds: float) -> None:
    _capture_time_limits.pop(capture_id, None)
    if _stop_capture(capture_id):
        logger.warning(
            "IQ capture %s reached the %.0f s recording limit without a stop; stopped it",
            capture_id,
            time_limit_seconds,
        )


async def _on_stop(payload: EventPayload) -> dict[str, Any]:
    if not _stop_capture(payload["capture_id"]):
        return {"ok": False, "reason": "not_active"}
    await asyncio.sleep(_FLUSH_GRACE_S)
    return {"ok": True}


async def _on_locate(payload: EventPayload) -> dict[str, Any]:
    capture_id = payload["capture_id"]
    if is_capturing(capture_id):
        return {"ok": False, "reason": "capturing"}
    path = capture_path(capture_id)
    if not path.is_file():
        return {"ok": False, "reason": "not_found"}
    return {"ok": True, "download_url": download_url(capture_id), "size_bytes": path.stat().st_size}


async def _on_list(_payload: EventPayload) -> dict[str, Any]:
    held = set(_active_captures)
    capture_dir = iq_capture_dir()
    if capture_dir.is_dir():
        held.update(int(path.stem) for path in capture_dir.glob("*.u8") if path.stem.isdigit())
    return {"ok": True, "capture_ids": sorted(held)}


async def _on_discard(payload: EventPayload) -> dict[str, Any]:
    capture_id = payload["capture_id"]
    if _stop_capture(capture_id):
        await asyncio.sleep(_FLUSH_GRACE_S)
    capture_path(capture_id).unlink(missing_ok=True)
    return {"ok": True}


# Registered at import time (not in the app lifespan) so tests — which skip
# lifespan — still get a responder; see backend/platform/bus.py's docstring.
bus.reply(START_SUBJECT, _on_start)
bus.reply(STOP_SUBJECT, _on_stop)
bus.reply(LOCATE_SUBJECT, _on_locate)
bus.reply(LIST_SUBJECT, _on_list)
bus.reply(DISCARD_SUBJECT, _on_discard)
