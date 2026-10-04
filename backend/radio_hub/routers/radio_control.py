"""Radio hub — connection control and the rtl_tcp WebSocket bridge.

REST endpoints:
  POST   /api/sdr/connect                 — open TCP connection to a radio
  POST   /api/sdr/disconnect              — close TCP connection to a radio
  GET    /api/sdr/status/{radio_id}       — connection state for a radio

WebSocket:
  WS     /ws/sdr/{radio_id}              — stream spectrum frames; receive commands
  WS     /ws/sdr/{radio_id}/iq           — stream raw IQ frames
"""

from __future__ import annotations

import asyncio
import json
import logging

from backend.database import get_db
from backend.radio_hub import radios as radio_registry
from backend.radio_hub.services import (
    iq_capture,  # noqa: F401 — registers the hub.iq-capture.* responders (B12)
    sdr_decode,
)
from backend.radio_hub.services import sdr as sdr_svc
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sdr"])


# Bounds for the untrusted ``sweep_state`` control-socket payload (owner → follower
# scan/search overlay mirroring). Cap the group-name list so a malformed/hostile
# client can't push an unbounded blob through the relay to every follower.
MAX_SCAN_GROUPS = 64
MAX_SCAN_GROUP_NAME_LEN = 64


def _sanitize_optional_hz(value: object) -> int | None:
    """Coerce an untrusted sweep-frequency field to a non-negative int, else None.

    Used for the ``sweep_state`` search bounds, which are legitimately null when the
    owner is not searching. Any non-numeric or negative value collapses to None so a
    follower never renders a bogus range.
    """
    if value is None:
        return None
    try:
        parsed = int(value)  # type: ignore[call-overload]
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


class ConnectIn(BaseModel):
    radio_id: int
    frequency_hz: int | None = None  # None = preserve current freq
    mode: str | None = None  # None = preserve current mode
    gain_db: float | None = None  # None = preserve current gain
    gain_auto: bool | None = None  # None = preserve current AGC state
    squelch_dbfs: float = -60.0
    sample_rate: int | None = None  # None = preserve current sample rate


class DisconnectIn(BaseModel):
    radio_id: int


# ── Connection control ────────────────────────────────────────────────────────


@router.post("/api/sdr/connect")
async def connect_radio(body: ConnectIn, db: AsyncSession = Depends(get_db)):
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, body.radio_id)
    if not radio:
        raise HTTPException(404, "Radio not found")
    # Checked before dialling: a mirrored radio whose device has been unplugged
    # or replugged elsewhere would otherwise fail as a bare connection refusal,
    # which tells the operator nothing about what to do.
    available, reason = radio_registry.device_availability(radio)
    if not available:
        raise HTTPException(
            503,
            f"{radio.get('name') or 'This radio'} is unavailable. {reason}",
        )
    try:
        conn = await sdr_svc.get_or_create_connection(radio["host"], radio["port"])
        try:
            if body.sample_rate is not None:
                await conn.set_sample_rate(body.sample_rate)
            if body.frequency_hz is not None:
                await conn.set_frequency(body.frequency_hz)
            if body.gain_auto is not None:
                if body.gain_auto:
                    await conn.set_gain_auto()
                elif body.gain_db is not None:
                    await conn.set_gain_manual(body.gain_db)
        except sdr_svc.ReadOnlyTuningError:
            # Another instance owns the shared tuner: connect as a read-only
            # follower rather than failing. Hardware tuning is left untouched; the
            # follower tracks the owner's tuning via the control channel.
            logger.info("Radio %s connected read-only (another instance owns tuning)", body.radio_id)
        # Demodulation mode is per-instance (it shapes this client's audio, not the
        # shared hardware), so a follower may still set it.
        if body.mode is not None:
            conn.mode = body.mode
    except ConnectionError as exc:
        raise HTTPException(503, str(exc)) from exc
    return JSONResponse(
        {
            "status": "connected",
            "radio_id": body.radio_id,
            "is_owner": conn.is_owner,
            "control_available": conn.control_available,
            "locked": conn.tuner_locked,
        }
    )


@router.post("/api/sdr/disconnect")
async def disconnect_radio(body: DisconnectIn, db: AsyncSession = Depends(get_db)):
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, body.radio_id)
    if not radio:
        raise HTTPException(404, "Radio not found")
    await sdr_svc.close_connection(radio["host"], radio["port"])
    return JSONResponse({"status": "disconnected"})


@router.get("/api/sdr/status/{radio_id}")
async def radio_status(radio_id: int, db: AsyncSession = Depends(get_db)):
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if not radio:
        raise HTTPException(404, "Radio not found")
    status = await sdr_svc.reachability_status(radio["host"], radio["port"])
    return JSONResponse({"radio_id": radio_id, "radio_name": radio["name"], **status})


@router.websocket("/ws/sdr/{radio_id}/iq")
async def sdr_iq_websocket(radio_id: int, websocket: WebSocket):
    """Stream raw IQ binary frames to a single client.

    Binary frame layout (little-endian):
      bytes 0-3  : uint32 sample_rate (Hz)
      bytes 4-7  : uint32 center_hz
      bytes 8+   : uint8 IQ pairs (I, Q, I, Q, …) as received from rtl_tcp

    The client decodes: sample = (byte - 127.5) / 127.5 for each I and Q byte.
    """
    await websocket.accept()

    broadcaster, _radio = await radio_registry.resolve_broadcaster(radio_id, websocket)
    if broadcaster is None:
        return

    queue = broadcaster.subscribe_iq()
    try:
        while True:
            payload = await queue.get()
            if payload is None:  # recording stopped / broadcaster shutdown
                break
            try:
                await websocket.send_bytes(payload)
            except WebSocketDisconnect:
                break
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        broadcaster.unsubscribe_iq(queue)


@router.websocket("/ws/sdr/{radio_id}")
async def sdr_websocket(radio_id: int, websocket: WebSocket):
    """Bridge WebSocket clients to a live rtl_tcp connection.

    The radio must first be configured via POST /api/sdr/connect (or we connect
    on-demand here if a radio with this id exists in the DB).

    Outbound (server→client):
      { type: "spectrum", center_hz, sample_rate, bins, timestamp_ms }
      { type: "status",   connected, radio_id, radio_name, center_hz, mode, gain_db, gain_auto, is_owner, control_available, locked }
      { type: "control",  is_owner, control_available, locked, center_hz, sample_rate, gain_db, gain_auto, mode,
                          offset_hz, bw_hz, scan_active, scan_groups, search_active, search_low_hz, search_high_hz, search_current_hz }
                          — tuning ownership changed: another instance took/released the
                            shared tuner, or this client's retune was refused (read-only).
                            `locked` = the tuner is held by some instance (vs free to claim).
                            The sweep_* fields mirror the owner's scan/search overlay.
      { type: "error",    code, message }

    Inbound (client→server):
      { cmd: "tune",        frequency_hz }
      { cmd: "mode",        mode }
      { cmd: "release" }    — owner hands the shared tuner back (stopped/deselected)
      { cmd: "claim" }      — actively-watching follower auto-takes a freed tuner
      { cmd: "demod",       offset_hz, mode, bw_hz }
                          — owner's within-band demod state (NCO offset, mode, audio
                            bandwidth); forwarded to followers so they mirror the exact
                            channel the owner hears, not just the hardware centre.
      { cmd: "sweep_state", scan_active, scan_groups, search_active,
                            search_low_hz, search_high_hz, search_current_hz }
                          — owner's scanner/search sweep state; forwarded to followers
                            so they render the same "paused during active scan/search"
                            overlay. Search bounds are null when not searching.
      { cmd: "gain",        gain_db }   — null/omit for auto
      { cmd: "squelch",     squelch_dbfs }
      { cmd: "sample_rate", rate_hz }
      { cmd: "fft_size",    bins }       — desired spectrum bin count; backend clamps to a power of two in [1024, 8192]. Shared across subscribers (last writer wins).
      { cmd: "ping" }
    """
    await websocket.accept()

    broadcaster, radio = await radio_registry.resolve_broadcaster(radio_id, websocket)
    if broadcaster is None:
        return

    conn = sdr_svc.get_connection(radio["host"], radio["port"])

    # Send initial status — connected=False until the first spectrum frame confirms
    # data is actually flowing from the physical device
    try:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "status",
                    "connected": False,
                    "radio_id": radio["id"],
                    "radio_name": radio["name"],
                    "center_hz": conn.center_hz,
                    "sample_rate": conn.sample_rate,
                    "mode": conn.mode,
                    "gain_db": conn.gain_db,
                    "gain_auto": conn.gain_auto,
                    "offset_hz": conn.demod_offset_hz,
                    "bw_hz": conn.bw_hz,
                    "is_owner": conn.is_owner,
                    "control_available": conn.control_available,
                    "locked": conn.tuner_locked,
                    "scan_active": conn.scan_active,
                    "scan_groups": conn.scan_groups,
                    "search_active": conn.search_active,
                    "search_low_hz": conn.search_low_hz,
                    "search_high_hz": conn.search_high_hz,
                    "search_current_hz": conn.search_current_hz,
                }
            )
        )
    except WebSocketDisconnect:
        return

    # Subscribe to the broadcaster queue for this client
    queue = broadcaster.subscribe()

    async def _read_commands():
        """Background task: receive JSON commands from browser and apply them."""
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                cmd = msg.get("cmd")
                try:
                    if cmd == "tune":
                        await conn.set_frequency(int(msg["frequency_hz"]))
                    elif cmd == "mode":
                        # Forward the demod mode to read-only followers over the relay
                        # control channel, the same way `tune` forwards the centre
                        # frequency. A follower has no other carrier for the mode (the
                        # spectrum stream conveys only the hardware centre), so without
                        # this it tracks the owner's frequency but stays stuck on its
                        # old mode when the owner switches AM/FM/etc. set_demod stores
                        # the mode locally and only publishes while we own the shared
                        # tuner (a no-op for a single instance / raw rtl_tcp),
                        # preserving the current within-band offset and bandwidth.
                        await conn.set_demod(
                            offset_hz=conn.demod_offset_hz,
                            mode=str(msg.get("mode", conn.mode)),
                            bw_hz=conn.bw_hz,
                        )
                    elif cmd == "release":
                        # Owner is done (stopped/deselected): hand the shared tuner
                        # back so another instance can take over. No-op unless we own it.
                        await conn.release_ownership()
                    elif cmd == "claim":
                        # An actively-watching follower auto-takes a freed tuner so
                        # control passes cleanly to it when the owner stops. The relay
                        # grants it only if the token is free (never steals a live owner).
                        await conn.claim_ownership()
                    elif cmd == "demod":
                        # Owner publishes its demod state (offset within the band,
                        # mode, audio bandwidth) so read-only followers mirror the
                        # exact channel it is listening to, not just the hardware
                        # centre. No-op on hardware; forwarded to the relay only
                        # while this instance owns the tuner (see set_demod).
                        await conn.set_demod(
                            offset_hz=int(msg.get("offset_hz", 0) or 0),
                            mode=str(msg.get("mode", conn.mode)),
                            bw_hz=int(msg.get("bw_hz", 0) or 0),
                        )
                    elif cmd == "sweep_state":
                        # Owner publishes its scanner/search sweep state so read-only
                        # followers render the same "paused during active scan/search"
                        # overlay. Inputs are validated/clamped here (untrusted client
                        # JSON); forwarded to the relay only while we own the tuner.
                        raw_groups = msg.get("scan_groups")
                        scan_groups = (
                            [str(name)[:MAX_SCAN_GROUP_NAME_LEN] for name in raw_groups[:MAX_SCAN_GROUPS]]
                            if isinstance(raw_groups, list)
                            else []
                        )
                        await conn.set_sweep_state(
                            scan_active=bool(msg.get("scan_active")),
                            scan_groups=scan_groups,
                            search_active=bool(msg.get("search_active")),
                            search_low_hz=_sanitize_optional_hz(msg.get("search_low_hz")),
                            search_high_hz=_sanitize_optional_hz(msg.get("search_high_hz")),
                            search_current_hz=_sanitize_optional_hz(msg.get("search_current_hz")),
                        )
                    elif cmd == "gain":
                        gval = msg.get("gain_db")
                        if gval is None:
                            await conn.set_gain_auto()
                        else:
                            await conn.set_gain_manual(float(gval))
                    elif cmd == "sample_rate":
                        await conn.set_sample_rate(int(msg["rate_hz"]))
                    elif cmd == "fft_size":
                        conn.set_fft_size(int(msg["bins"]))
                    elif cmd == "digital_decode":
                        if bool(msg.get("enabled")):
                            bridge = await sdr_decode.get_or_create_bridge(radio["host"], radio["port"], broadcaster)
                            await bridge.start(
                                offset_hz=int(msg.get("offset_hz", 0) or 0),
                                bw_hz=int(msg.get("bw_hz", 0) or 0) or None,
                            )
                        else:
                            await sdr_decode.stop_bridge(radio["host"], radio["port"])
                    elif cmd == "digital_channel":
                        bridge = sdr_decode.get_bridge(radio["host"], radio["port"])
                        if bridge is not None:
                            bridge.set_channel(
                                offset_hz=int(msg.get("offset_hz", 0) or 0),
                                bw_hz=int(msg.get("bw_hz", 0) or 0) or None,
                            )
                    elif cmd == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except sdr_svc.ReadOnlyTuningError:
                    # Another instance owns the shared tuner — the change was not
                    # applied. Tell the browser it is read-only so it can disable
                    # its tuning controls and reflect the owner's real tuning.
                    try:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "control",
                                    "is_owner": False,
                                    "control_available": conn.control_available,
                                    "locked": conn.tuner_locked,
                                    "center_hz": conn.center_hz,
                                    "sample_rate": conn.sample_rate,
                                    "gain_db": conn.gain_db,
                                    "gain_auto": conn.gain_auto,
                                    "mode": conn.mode,
                                    "offset_hz": conn.demod_offset_hz,
                                    "bw_hz": conn.bw_hz,
                                }
                            )
                        )
                    except (WebSocketDisconnect, RuntimeError):
                        pass
                except Exception as exc:
                    logger.warning("SDR command error: %s", exc)
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass

    cmd_task = asyncio.create_task(_read_commands())

    # Stream loop: pull frames from the shared broadcaster queue and forward them
    try:
        while True:
            frame = await queue.get()
            if frame is None:  # broadcaster stopped (server shutdown)
                break
            try:
                await websocket.send_text(json.dumps(frame))
            except (WebSocketDisconnect, RuntimeError):
                break
            if frame.get("type") == "error":
                break

    except (WebSocketDisconnect, RuntimeError, asyncio.CancelledError):
        pass
    finally:
        broadcaster.unsubscribe(queue)
        cmd_task.cancel()
        try:
            await cmd_task
        except asyncio.CancelledError:
            pass
        # A decode session must never outlive its control socket.
        await sdr_decode.stop_bridge(radio["host"], radio["port"])
