"""IQ capture — the radio hub's raw-IQ recording API (plan B12).

The SDR section owns a recording (its row, the browser-uploaded WAV, the
metadata); the hub owns the radio, so it is the hub that taps the broadcaster's
IQ fan-out and writes the raw ``.u8`` file. The SDR section asks over the bus:

  hub.iq-capture.start   {capture_id, radio_id, db}  begin writing <capture_id>.u8
  hub.iq-capture.stop    {capture_id}                stop and flush it

Replies are plain dicts, never exceptions, so the contract survives the move to
a real NATS request/reply: ``{"ok": True}`` on success, otherwise
``{"ok": False, "reason": ...}`` where ``reason`` is ``unknown_radio``,
``not_streaming`` (no broadcaster is running for the radio, so there is no IQ
to capture), ``error`` (the capture could not be opened) or, for stop,
``not_active``.

`db` rides in the start payload, as on every in-process subject (see
`backend/platform/bus.py`).
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from backend.config import settings
from backend.modules import hosts_in_process
from backend.platform.bus import EventPayload, bus
from backend.radio_hub import radios as radio_registry
from backend.radio_hub.services import sdr as sdr_svc

logger = logging.getLogger(__name__)

START_SUBJECT = "hub.iq-capture.start"
STOP_SUBJECT = "hub.iq-capture.stop"

# How long stop waits for the drain task to flush the last queued chunk.
_FLUSH_GRACE_S = 0.2

# capture_id → the broadcaster it taps and its recording queue.
_active_captures: dict[int, tuple[sdr_svc.RadioBroadcaster, asyncio.Queue]] = {}


def iq_capture_dir() -> Path:
    """Where capture files are written: ``<capture dir>/<capture_id>.u8``.

    The folder the SDR section serves recordings from. In the monolith the two
    share it; the hub's own container (P6.5) sets ``IQ_CAPTURE_DIR`` to that
    same folder on the app's volume, so the SDR section still finds the file
    the moment the hub replies to ``stop``. Once the SDR section runs in its
    own container (P6.6) its recordings are on its own volume, which compose
    mounts wherever the hub runs (``SDR_SERVICE_RECORDINGS_DIR``); which of
    the two applies follows ``SENTINEL_EXTERNAL_SERVICES``, so the operator
    sets nothing extra. Hub and SDR must share a host for that — serving
    captures from the hub instead is multi-host work (P7).
    """
    if settings.sdr_service_recordings_dir and not hosts_in_process("sdr"):
        return Path(settings.sdr_service_recordings_dir)
    if settings.iq_capture_dir:
        return Path(settings.iq_capture_dir)
    return Path(settings.db_path).parent / "recordings"


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
        capture_dir = iq_capture_dir()
        capture_dir.mkdir(parents=True, exist_ok=True)
        queue = await broadcaster.start_iq_recording(str(capture_dir / f"{capture_id}.u8"))
    except Exception as exc:  # noqa: BLE001 - a failed capture must not fail the recording
        logger.warning("Could not start IQ capture %s: %s", capture_id, exc)
        return {"ok": False, "reason": "error"}
    _active_captures[capture_id] = (broadcaster, queue)
    return {"ok": True}


async def _on_stop(payload: EventPayload) -> dict[str, Any]:
    capture = _active_captures.pop(payload["capture_id"], None)
    if capture is None:
        return {"ok": False, "reason": "not_active"}
    broadcaster, queue = capture
    broadcaster.stop_iq_recording(queue)
    await asyncio.sleep(_FLUSH_GRACE_S)
    return {"ok": True}


# Registered at import time (not in the app lifespan) so tests — which skip
# lifespan — still get a responder; see backend/platform/bus.py's docstring.
bus.reply(START_SUBJECT, _on_start)
bus.reply(STOP_SUBJECT, _on_stop)
