"""Radio hub — decode bridges: voice (dsd-fme), APRS and off-grid AIS (Direwolf).

Owns the decoder contract (secret-authed `/ingest` + `/config`, 409 when no
bridge is active), the background APRS/AIS start/stop/status controls, and the
decoded-event and decoded-audio WebSockets. Ingested APRS/AIS events are
published as `decode.<kind>.<radioId>` for the sections that consume them.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets

from backend.database import get_db
from backend.db_helpers import get_setting, upsert_setting
from backend.platform.aprs_channel import read_aprs_channel_hz
from backend.platform.bus import bus
from backend.radio_hub import radios as radio_registry
from backend.radio_hub.services import manifest_decode, sdr_decode
from backend.radio_hub.services import sdr as sdr_svc
from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sdr"])


class DecodeEventIn(BaseModel):
    """A decoded event POSTed by the dsd-fme sidecar's log parser.

    ``event`` is the decoder-shaped payload (mode, talkgroup, source/dest IDs,
    sync state, …). It is constrained in size so a misbehaving sidecar cannot
    flood the WS subscribers, and is required to be JSON-serialisable. The
    event is routed to the single active decode session, so no radio id is
    needed (only one decoder runs at a time).
    """

    event: dict

    @field_validator("event")
    @classmethod
    def _validate_event(cls, value: dict) -> dict:
        try:
            serialised = json.dumps(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("event must be JSON-serialisable") from exc
        if len(serialised) > 4096:
            raise ValueError("event too large (max 4096 bytes serialised)")
        return value


class PacketDecodeControlIn(BaseModel):
    """Body for starting/stopping a background packet decode on a specific radio.

    Shared by APRS (Land) and off-grid AIS (Sea), which are controlled
    identically. ``bw_hz`` overrides the demod channel bandwidth (0 = the
    bridge's default). There is no offset: these bridges own absolute channels
    (``land``/``aprsChannelHz`` for APRS, the two AIS channels for Sea) and tune
    the radio themselves. Both run in the background independent of the SDR
    view, so they are controlled over HTTP rather than the spectrum WebSocket
    (which tears its bridge down on close).
    """

    radio_id: int
    bw_hz: int = 0


# ── Digital decode (dsd-fme sidecar) ────────────────────────────────────────────


@router.post("/api/sdr/decode/ingest")
async def ingest_decode_event(
    body: DecodeEventIn,
    x_decode_secret: str = Header(default=""),
):
    """Receive a decoded event from the dsd-fme sidecar and fan it to WS clients.

    Authenticated with a shared secret. Fails closed: if no secret is configured,
    ingestion is disabled entirely. The event is routed to the single active
    decode session — only one decoder runs at a time — so the sidecar needs no
    knowledge of which radio is selected. The backend stays decoder-agnostic: it
    only relays validated JSON onto the active bridge's event subscribers.
    """
    secret = sdr_decode.resolve_ingest_secret()
    if not secret:
        raise HTTPException(503, "decode ingestion disabled")
    if not secrets.compare_digest(x_decode_secret, secret):
        raise HTTPException(401, "invalid decode secret")
    bridge = sdr_decode.get_active_bridge()
    if bridge is None:
        raise HTTPException(409, "decode not active")
    # Default the frame type so the frontend can route it; the decoder may
    # override it (e.g. "decode_status") via its own "type" key.
    bridge.publish_event({"type": "decode_event", **body.event})
    return JSONResponse({"status": "ok"})


@router.get("/api/sdr/decode/config")
async def decode_config(x_decode_secret: str = Header(default="")):
    """Report decode-session state to the dsd-fme sidecar supervisor.

    Authenticated with the same shared secret as ingest (fails closed). The
    supervisor polls this before each dsd-fme launch.

    ``active`` reports whether a decode session is actually serving PCM. The
    supervisor gates on it: with no active session the PCM feed isn't listening, so
    launching dsd-fme just makes it fail to connect and spew startup output that the
    ingest endpoint rejects with 409 — a flood of wasted requests. When ``active``
    is false the supervisor idles instead of launching.
    """
    secret = sdr_decode.resolve_ingest_secret()
    if not secret:
        raise HTTPException(503, "decode ingestion disabled")
    if not secrets.compare_digest(x_decode_secret, secret):
        raise HTTPException(401, "invalid decode secret")
    bridge = sdr_decode.get_active_bridge()
    return JSONResponse({"active": bool(bridge and bridge.running)})


# ── APRS decode (Direwolf sidecar) ──────────────────────────────────────────────


@router.post("/api/sdr/aprs/start")
async def aprs_start(body: PacketDecodeControlIn, db: AsyncSession = Depends(get_db)):
    """Start (or retune) background APRS decode on a radio and persist the choice.

    Independent of the SDR view: the APRS bridge subscribes to the radio's IQ
    fan-out (keeping its broadcaster alive) and serves PCM to the Direwolf
    sidecar until explicitly stopped, so it keeps feeding the Land map even when
    another radio is being viewed. The enabled radio is persisted so it resumes
    on restart (see :func:`resume_persisted_aprs`).
    """
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
        broadcaster = await sdr_svc.get_or_create_broadcaster(radio["host"], radio["port"])
    except ConnectionError as exc:
        raise HTTPException(502, f"radio connect failed: {exc}") from exc
    channel_hz = await read_aprs_channel_hz(db)
    bridge = await sdr_decode.get_or_create_aprs_bridge(
        radio["host"], radio["port"], broadcaster, channel_hz=channel_hz
    )
    # Recorded for the ingest endpoint's bus publish (decode.aprs.<radio_id>)
    # below — the bridge has no other way to know which business radio id it
    # was started for (it is keyed internally by host:port).
    bridge.radio_id = body.radio_id
    await bridge.start(bw_hz=body.bw_hz or None)
    await upsert_setting(db, "sdr", "aprs_radio_id", body.radio_id)
    return JSONResponse({"status": "ok", "radio_id": body.radio_id, "active": True})


@router.post("/api/sdr/aprs/stop")
async def aprs_stop(body: PacketDecodeControlIn, db: AsyncSession = Depends(get_db)):
    """Stop background APRS decode on a radio and clear the persisted choice."""
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, body.radio_id)
    if not radio:
        raise HTTPException(404, "Radio not found")
    await sdr_decode.stop_aprs_bridge(radio["host"], radio["port"])
    await upsert_setting(db, "sdr", "aprs_radio_id", None)
    return JSONResponse({"status": "ok", "radio_id": body.radio_id, "active": False})


@router.get("/api/sdr/aprs/status/{radio_id}")
async def aprs_status(radio_id: int, db: AsyncSession = Depends(get_db)):
    """Report whether APRS decode is running for a radio, decoder reachability,
    and whether the radio's captured span currently covers the APRS channel
    (``on_channel`` false = the bridge is decoding silence and will retune)."""
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if not radio:
        raise HTTPException(404, "Radio not found")
    bridge = sdr_decode.get_aprs_bridge(radio["host"], radio["port"])
    return JSONResponse(
        {
            "radio_id": radio_id,
            "active": bool(bridge and bridge.running),
            "decoder_reachable": bool(bridge and bridge.decoder_reachable),
            "channel_hz": bridge.channel_hz if bridge else None,
            "on_channel": bool(bridge and bridge.on_channel),
        }
    )


@router.post("/api/sdr/aprs/ingest")
async def ingest_aprs_event(body: DecodeEventIn, x_decode_secret: str = Header(default="")):
    """Receive a decoded APRS event from the Direwolf sidecar and fan it out.

    Authenticated with the same shared secret as the voice ingest (fails closed).
    Position-bearing packets are upserted into the APRS station store for the
    Land map; every event is also relayed to the active APRS session's WS
    subscribers (the waterfall panels), mirroring the voice ingest contract. Raw
    TNC2 ``log`` events and status frames carry no position and are relay-only.
    """
    # Docstring intentionally unchanged (it feeds the OpenAPI schema the parity
    # golden pins byte-for-byte) even though the station write below has moved:
    # this endpoint keeps the ingest gate (the 409 below) but now publishes the
    # decoded event on decode.aprs.<radio_id> (B2) instead of writing straight
    # into aprs_store itself — backend/services/aprs_store.py subscribes and
    # performs the exact upsert this router used to do directly.
    secret = sdr_decode.resolve_ingest_secret()
    if not secret:
        raise HTTPException(503, "decode ingestion disabled")
    if not secrets.compare_digest(x_decode_secret, secret):
        raise HTTPException(401, "invalid decode secret")
    bridge = sdr_decode.get_active_aprs_bridge()
    if bridge is None:
        raise HTTPException(409, "aprs decode not active")
    # raise_errors=True: before the bus existed this was a direct call, so a
    # store-write failure surfaced as a 500 to the sidecar (which retries) —
    # preserve that rather than swallowing it as a fire-and-forget publish.
    radio_id = getattr(bridge, "radio_id", None)
    await bus.publish(f"decode.aprs.{radio_id}", {"event": body.event, "radio_id": radio_id}, raise_errors=True)
    # Default the frame type to "aprs" so the frontend can route it; the sidecar
    # may override it (e.g. "log", "decode_status") via its own "type" key.
    bridge.publish_event({"type": "aprs", **body.event})
    return JSONResponse({"status": "ok"})


@router.get("/api/sdr/aprs/config")
async def aprs_decode_config(x_decode_secret: str = Header(default="")):
    """Report whether an APRS decode session is serving PCM, for the sidecar.

    Secret-authed twin of the voice ``decode_config``. The Direwolf supervisor
    gates on ``active`` exactly as the dsd-fme supervisor does: with no session
    the PCM port isn't listening, so launching Direwolf would just fail to
    connect and flood ingest with rejected startup output.
    """
    secret = sdr_decode.resolve_ingest_secret()
    if not secret:
        raise HTTPException(503, "decode ingestion disabled")
    if not secrets.compare_digest(x_decode_secret, secret):
        raise HTTPException(401, "invalid decode secret")
    bridge = sdr_decode.get_active_aprs_bridge()
    return JSONResponse({"active": bool(bridge and bridge.running)})


async def _start_aprs_best_effort(radios: list, radio_id: int, channel_hz: int) -> None:
    """Start the APRS bridge on ``radio_id`` at ``channel_hz`` without raising.

    Shared by the startup resume and the config-upload reconciliation: in both
    cases the radio was chosen earlier (persisted), so a missing radio or an
    unreachable dongle is logged and skipped rather than failing the caller.
    """
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if not radio:
        logging.getLogger(__name__).warning("Persisted APRS radio %s not found; skipping start", radio_id)
        return
    try:
        broadcaster = await sdr_svc.get_or_create_broadcaster(radio["host"], radio["port"])
        bridge = await sdr_decode.get_or_create_aprs_bridge(
            radio["host"], radio["port"], broadcaster, channel_hz=channel_hz
        )
        bridge.radio_id = radio_id
        await bridge.start()
    except (ConnectionError, OSError):
        logging.getLogger(__name__).exception("Failed to start APRS decode on radio %s", radio_id)


async def reconcile_aprs_decode(db: AsyncSession, previous_radio_id: object, next_radio_id: object) -> None:
    """Move the running APRS bridge to match a changed ``sdr.aprs_radio_id``.

    Called after the app-config JSON is uploaded, so editing the APRS radio in
    the JSON behaves exactly like choosing it in Settings > LAND: the bridge on
    the old radio is stopped and one is started on the new radio (best-effort,
    like the startup resume). A radio id that is not an int means "no radio".
    """
    radios = await radio_registry.get_radios(db)
    if isinstance(previous_radio_id, int):
        previous = radio_registry.get_radio_by_id(radios, previous_radio_id)
        if previous:
            await sdr_decode.stop_aprs_bridge(previous["host"], previous["port"])
    if isinstance(next_radio_id, int):
        channel_hz = await read_aprs_channel_hz(db)
        await _start_aprs_best_effort(radios, next_radio_id, channel_hz)


async def apply_aprs_channel(channel_hz: int) -> None:
    """Move a running APRS bridge to ``channel_hz`` (the Settings › LAND channel).

    Called after ``land``/``aprsChannelHz`` is written so the change takes
    effect immediately — the bridge retunes the radio if the new channel is
    outside its current span. No-op when APRS decode isn't running.
    """
    bridge = sdr_decode.get_active_aprs_bridge()
    if bridge is not None:
        await bridge.set_channel_hz(channel_hz)


async def resume_persisted_aprs() -> None:
    """Restart APRS decode on the persisted radio at startup, if one was enabled.

    Best-effort: a missing radio or an unreachable dongle is logged and skipped
    so a failed resume never blocks application startup. Called from the app
    lifespan after tables/settings are ready.
    """
    from backend.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        radio_id = await get_setting(db, "sdr", "aprs_radio_id", default=None)
        if not isinstance(radio_id, int):
            return
        radios = await radio_registry.get_radios(db)
        channel_hz = await read_aprs_channel_hz(db)
    await _start_aprs_best_effort(radios, radio_id, channel_hz)


async def _on_land_settings_changed(payload: dict) -> None:
    """Bus subscriber: retune a running APRS bridge when ``land/aprsChannelHz``
    changes, exactly as a direct call to ``apply_aprs_channel`` always has.

    Subscribed to ``settings.changed.land`` — the same event whether the
    channel was written via the Settings PUT endpoint or an app-config
    upload/file-sync, so both paths converge on this one reaction (they used
    to call ``apply_aprs_channel`` separately). Re-reads the channel from
    ``payload["db"]`` (the writer's own, already-committed session) rather
    than trusting a raw value in the payload, matching what the config-upload
    path already did before this migration.
    """
    if "aprsChannelHz" not in payload.get("keys", ()):
        return
    channel_hz = await read_aprs_channel_hz(payload["db"])
    await apply_aprs_channel(channel_hz)


bus.subscribe("settings.changed.land", _on_land_settings_changed)


# ── AIS decode (Direwolf sidecar, off-grid Sea) ─────────────────────────────────
# The Sea twin of the APRS block above. Same control surface, same secret-authed
# ingest/config contract; the differences are that the bridge owns TWO channels
# (it serves them as stereo PCM) and that decoded vessels land in the shared AIS
# vessel store, so off-grid and online AIS produce one picture.


@router.post("/api/sdr/ais/start")
async def ais_start(body: PacketDecodeControlIn, db: AsyncSession = Depends(get_db)):
    """Start background off-grid AIS decode on a radio and persist the choice.

    Independent of the SDR view: the bridge subscribes to the radio's IQ fan-out
    (keeping its broadcaster alive) and serves stereo PCM to the Direwolf sidecar
    until explicitly stopped, so the Sea map keeps its vessel picture even when
    another radio is being viewed or the user has left the Sea section. The
    enabled radio is persisted so it resumes on restart (see
    :func:`resume_persisted_ais`).
    """
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
        broadcaster = await sdr_svc.get_or_create_broadcaster(radio["host"], radio["port"])
    except ConnectionError as exc:
        raise HTTPException(502, f"radio connect failed: {exc}") from exc
    bridge = await sdr_decode.get_or_create_ais_bridge(radio["host"], radio["port"], broadcaster)
    # Recorded for the ingest endpoint's bus publish (decode.ais.<radio_id>)
    # below — the bridge has no other way to know which business radio id it
    # was started for (it is keyed internally by host:port).
    bridge.radio_id = body.radio_id
    await bridge.start(bw_hz=body.bw_hz or None)
    await upsert_setting(db, "sdr", "ais_radio_id", body.radio_id)
    return JSONResponse({"status": "ok", "radio_id": body.radio_id, "active": True})


@router.post("/api/sdr/ais/stop")
async def ais_stop(body: PacketDecodeControlIn, db: AsyncSession = Depends(get_db)):
    """Stop background off-grid AIS decode on a radio and clear the persisted choice."""
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, body.radio_id)
    if not radio:
        raise HTTPException(404, "Radio not found")
    await sdr_decode.stop_ais_bridge(radio["host"], radio["port"])
    await upsert_setting(db, "sdr", "ais_radio_id", None)
    return JSONResponse({"status": "ok", "radio_id": body.radio_id, "active": False})


@router.get("/api/sdr/ais/status/{radio_id}")
async def ais_status(radio_id: int, db: AsyncSession = Depends(get_db)):
    """Report whether off-grid AIS decode is running for a radio, decoder
    reachability, and whether the radio's captured span currently covers BOTH
    AIS channels (``on_channel`` false = the bridge is decoding silence and will
    retune)."""
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if not radio:
        raise HTTPException(404, "Radio not found")
    bridge = sdr_decode.get_ais_bridge(radio["host"], radio["port"])
    return JSONResponse(
        {
            "radio_id": radio_id,
            "active": bool(bridge and bridge.running),
            "decoder_reachable": bool(bridge and bridge.decoder_reachable),
            "channel_a_hz": bridge.channel_a_hz if bridge else None,
            "channel_b_hz": bridge.channel_b_hz if bridge else None,
            "on_channel": bool(bridge and bridge.on_channel),
        }
    )


@router.post("/api/sdr/ais/ingest")
async def ingest_ais_event(body: DecodeEventIn, x_decode_secret: str = Header(default="")):
    """Receive a decoded AIS event from the Direwolf sidecar and fan it out.

    Authenticated with the same shared secret as the voice/APRS ingests (fails
    closed). Position and static-data messages are merged into the shared AIS
    vessel store — the same one AISStream.io feeds — so the Sea map renders
    off-grid vessels exactly as online ones. Every event is also relayed to the
    active session's WS subscribers (the waterfall panels); raw ``log`` lines
    carry no vessel data and are relay-only.
    """
    # Docstring intentionally unchanged (it feeds the OpenAPI schema the parity
    # golden pins byte-for-byte) even though the vessel-store write below has
    # moved: this endpoint keeps the ingest gate (the 409 below) but now
    # publishes the decoded event on decode.ais.<radio_id> (B2) instead of
    # calling ais_decode.ingest_event directly — backend/services/ais_decode.py
    # subscribes and performs the exact same ingest this router used to do.
    secret = sdr_decode.resolve_ingest_secret()
    if not secret:
        raise HTTPException(503, "decode ingestion disabled")
    if not secrets.compare_digest(x_decode_secret, secret):
        raise HTTPException(401, "invalid decode secret")
    bridge = sdr_decode.get_active_ais_bridge()
    if bridge is None:
        raise HTTPException(409, "ais decode not active")
    # raise_errors=True: before the bus existed this was a direct call, so a
    # store-write failure surfaced as a 500 to the sidecar (which retries) —
    # preserve that rather than swallowing it as a fire-and-forget publish.
    radio_id = getattr(bridge, "radio_id", None)
    await bus.publish(f"decode.ais.{radio_id}", {"event": body.event, "radio_id": radio_id}, raise_errors=True)
    # Default the frame type to "ais" so the frontend can route it; the sidecar
    # may override it (e.g. "log", "decode_status") via its own "type" key.
    bridge.publish_event({"type": "ais", **body.event})
    return JSONResponse({"status": "ok"})


@router.get("/api/sdr/ais/config")
async def ais_decode_config(x_decode_secret: str = Header(default="")):
    """Report whether an off-grid AIS decode session is serving PCM, for the sidecar.

    Secret-authed twin of the APRS ``aprs_decode_config``. The Direwolf
    supervisor gates on ``active``: with no session the PCM port isn't
    listening, so launching Direwolf would just fail to connect and flood ingest
    with rejected startup output.
    """
    secret = sdr_decode.resolve_ingest_secret()
    if not secret:
        raise HTTPException(503, "decode ingestion disabled")
    if not secrets.compare_digest(x_decode_secret, secret):
        raise HTTPException(401, "invalid decode secret")
    bridge = sdr_decode.get_active_ais_bridge()
    return JSONResponse({"active": bool(bridge and bridge.running)})


async def _start_ais_best_effort(radios: list, radio_id: int) -> None:
    """Start the off-grid AIS bridge on ``radio_id`` without raising.

    Shared by the startup resume and the config-upload reconciliation: in both
    cases the radio was chosen earlier (persisted), so a missing radio or an
    unreachable dongle is logged and skipped rather than failing the caller.
    """
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if not radio:
        logging.getLogger(__name__).warning("Persisted AIS radio %s not found; skipping start", radio_id)
        return
    try:
        broadcaster = await sdr_svc.get_or_create_broadcaster(radio["host"], radio["port"])
        bridge = await sdr_decode.get_or_create_ais_bridge(radio["host"], radio["port"], broadcaster)
        bridge.radio_id = radio_id
        await bridge.start()
    except (ConnectionError, OSError):
        logging.getLogger(__name__).exception("Failed to start AIS decode on radio %s", radio_id)


async def reconcile_ais_decode(db: AsyncSession, previous_radio_id: object, next_radio_id: object) -> None:
    """Move the running AIS bridge to match a changed ``sdr.ais_radio_id``.

    Called after the app-config JSON is uploaded, so editing the AIS radio in the
    JSON behaves exactly like choosing it in Settings > SEA. A radio id that is
    not an int means "no radio".
    """
    radios = await radio_registry.get_radios(db)
    if isinstance(previous_radio_id, int):
        previous = radio_registry.get_radio_by_id(radios, previous_radio_id)
        if previous:
            await sdr_decode.stop_ais_bridge(previous["host"], previous["port"])
    if isinstance(next_radio_id, int):
        await _start_ais_best_effort(radios, next_radio_id)


async def resume_persisted_ais() -> None:
    """Restart off-grid AIS decode on the persisted radio at startup, if enabled.

    Best-effort: a missing radio or an unreachable dongle is logged and skipped
    so a failed resume never blocks application startup. Called from the app
    lifespan after tables/settings are ready.
    """
    from backend.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        radio_id = await get_setting(db, "sdr", "ais_radio_id", default=None)
        if not isinstance(radio_id, int):
            return
        radios = await radio_registry.get_radios(db)
    await _start_ais_best_effort(radios, radio_id)


async def _on_decode_radio_reassigned(payload: dict) -> None:
    """Bus subscriber: move the APRS/AIS decode bridge when an app-config
    upload or file-sync reassigns its radio, exactly as the direct calls to
    ``reconcile_aprs_decode``/``reconcile_ais_decode`` always have.

    services/app_config.py publishes ``sdr.decode.radio-reassigned`` only when
    ``sdr/aprs_radio_id`` or ``sdr/ais_radio_id`` actually changed, one decoder
    per publish. It is deliberately a separate subject from the generic
    ``settings.changed.sdr`` feed: a plain ``PUT /api/settings/sdr/{key}`` has
    never reconciled a bridge (the dedicated ``/api/sdr/{aprs,ais}/start`` and
    ``/stop`` endpoints start/stop it inline), so it must not reach this.
    """
    reconcile_by_decoder = {"aprs": reconcile_aprs_decode, "ais": reconcile_ais_decode}
    reconcile = reconcile_by_decoder[payload["decoder"]]
    await reconcile(payload["db"], payload["previous"], payload["next"])


bus.subscribe("sdr.decode.radio-reassigned", _on_decode_radio_reassigned)


@router.get("/api/sdr/decode/status/{radio_id}")
async def decode_status(radio_id: int, db: AsyncSession = Depends(get_db)):
    """Report whether digital decode is active for a radio and decoder reachability."""
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if not radio:
        raise HTTPException(404, "Radio not found")
    bridge = sdr_decode.get_bridge(radio["host"], radio["port"])
    return JSONResponse(
        {
            "radio_id": radio_id,
            "active": bridge is not None,
            "decoder_reachable": bool(bridge and bridge.decoder_reachable),
        }
    )


async def _wait_for_bridge(host: str, port: int, timeout: float = 3.0) -> sdr_decode.PcmDecodeBridge | None:
    """Poll briefly for a decode bridge (voice, APRS or AIS) to appear for this radio.

    The bridge is created asynchronously — a voice bridge by the control socket's
    `digital_decode` command (which may race the opening of this socket), an APRS
    bridge by `/api/sdr/aprs/start`, an AIS bridge by `/api/sdr/ais/start`, or a
    manifest-declared kind by `/api/sdr/decoders/{kind}/start`. A radio runs at
    most one kind at a time, so whichever registry has it is the right bridge to
    stream.
    """
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        bridge = (
            sdr_decode.get_bridge(host, port)
            or sdr_decode.get_aprs_bridge(host, port)
            or sdr_decode.get_ais_bridge(host, port)
            or manifest_decode.find_bridge(host, port)
        )
        if bridge is not None:
            return bridge
        await asyncio.sleep(0.1)
    return None


@router.websocket("/ws/sdr/{radio_id}/decode")
async def sdr_decode_websocket(radio_id: int, websocket: WebSocket):
    """Stream decoded events (text JSON) for a radio's active decode session.

    Outbound: { type: "decode_event", … } and { type: "decode_status", decoder_reachable }.
    """
    await websocket.accept()
    broadcaster, radio = await radio_registry.resolve_broadcaster(radio_id, websocket)
    if broadcaster is None:
        return
    bridge = await _wait_for_bridge(radio["host"], radio["port"])
    if bridge is None:
        try:
            await websocket.send_text(
                json.dumps({"type": "decode_status", "active": False, "decoder_reachable": False})
            )
        except Exception:
            pass
        try:
            await websocket.close()
        except RuntimeError:
            pass
        return
    queue = bridge.subscribe_events()
    try:
        while True:
            event = await queue.get()
            if event is None:  # bridge stopped
                break
            try:
                await websocket.send_text(json.dumps(event))
            except (WebSocketDisconnect, RuntimeError):
                break
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        bridge.unsubscribe_events(queue)


@router.websocket("/ws/sdr/{radio_id}/decode/audio")
async def sdr_decode_audio_websocket(radio_id: int, websocket: WebSocket):
    """Stream decoded voice PCM (binary) for a radio's active decode session.

    Frames are the raw PCM datagrams dsd-fme emits over UDP (48 kHz s16 mono).
    """
    await websocket.accept()
    broadcaster, radio = await radio_registry.resolve_broadcaster(radio_id, websocket)
    if broadcaster is None:
        return
    bridge = await _wait_for_bridge(radio["host"], radio["port"])
    # Only the voice bridge produces decoded audio; the packet bridges (APRS,
    # AIS) have no voice stream, so close cleanly if this radio is running one
    # of those instead.
    if not isinstance(bridge, sdr_decode.DigitalDecodeBridge):
        try:
            await websocket.close()
        except RuntimeError:
            pass
        return
    queue = bridge.subscribe_audio()
    try:
        while True:
            payload = await queue.get()
            if payload is None:  # bridge stopped
                break
            try:
                await websocket.send_bytes(payload)
            except (WebSocketDisconnect, RuntimeError):
                break
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        bridge.unsubscribe_audio(queue)
