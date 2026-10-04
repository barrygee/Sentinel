"""Radio hub — decoder kinds declared by a manifest (plan §3.4).

A decoder container registers its manifest, then follows the same contract as
the voice, APRS and AIS sidecars: poll ``config`` until ``active``, connect to
its PCM port, POST decoded events to ``ingest``. Sections start and stop a kind
here or over the bus (``hub.decode.<kind>.*``, see
``radio_hub/services/manifest_decode.py``), and its ingested events are
published as ``decode.<kind>.<radioId>``.

  GET    /api/sdr/decoders                          — registered decoder manifests
  POST   /api/sdr/decoders/register                 — register a manifest (decoder secret)
  POST   /api/sdr/decoders/{kind}/start             — start/retune a kind on a radio
  POST   /api/sdr/decoders/{kind}/stop              — stop a kind on a radio
  GET    /api/sdr/decoders/{kind}/status/{radio_id} — is it decoding, is the decoder connected
  POST   /api/sdr/decoders/{kind}/ingest            — a decoded event (decoder secret)
  GET    /api/sdr/decoders/{kind}/config            — is a session serving PCM (decoder secret)
"""

from __future__ import annotations

import secrets
from typing import Any

from backend.database import get_db
from backend.platform.bus import bus
from backend.radio_hub.routers.decode import DecodeEventIn
from backend.radio_hub.services import manifest_decode, sdr_decode
from backend.radio_hub.services.decoder_manifest import DecoderManifest
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi import Path as PathParam
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["sdr"])

_KIND = PathParam(pattern=r"^[a-z][a-z0-9-]{1,31}$")

# How each failure reason in a manifest_decode reply reads over HTTP.
_REASON_STATUS = {"unknown_kind": 404, "unknown_radio": 404, "unavailable": 503, "connect_failed": 502}
_REASON_DETAIL = {"unknown_kind": "Decoder kind not registered", "unknown_radio": "Radio not found"}


class ManifestDecodeControlIn(BaseModel):
    """Body for starting a manifest-declared decoder kind on a radio.

    ``bw_hz`` overrides the manifest's channel bandwidth (0 = the manifest's).
    ``offset_hz`` places a ``relative`` kind's channel against the radio's centre
    frequency; an ``absolute`` kind tunes to its own channels and ignores it.
    """

    radio_id: int
    bw_hz: int = Field(default=0, ge=0, le=200_000)
    offset_hz: int = Field(default=0, ge=-10_000_000, le=10_000_000)


class ManifestDecodeStopIn(BaseModel):
    radio_id: int


def _require_decode_secret(x_decode_secret: str) -> None:
    """Fail closed, exactly as the voice/APRS/AIS ingest endpoints do."""
    secret = sdr_decode.resolve_ingest_secret()
    if not secret:
        raise HTTPException(503, "decode ingestion disabled")
    if not secrets.compare_digest(x_decode_secret, secret):
        raise HTTPException(401, "invalid decode secret")


def _reply_or_raise(reply: dict[str, Any]) -> JSONResponse:
    if not reply["ok"]:
        reason = reply["reason"]
        raise HTTPException(_REASON_STATUS[reason], reply.get("message") or _REASON_DETAIL[reason])
    body = {key: value for key, value in reply.items() if key != "ok"}
    return JSONResponse({"status": "ok", **body})


@router.get("/api/sdr/decoders")
async def list_decoders():
    """The decoder manifests registered with this hub."""
    return JSONResponse([manifest.model_dump(by_alias=True) for manifest in manifest_decode.registered_manifests()])


@router.post("/api/sdr/decoders/register")
async def register_decoder(body: DecoderManifest, x_decode_secret: str = Header(default="")):
    """Register a decoder container's manifest (idempotent).

    201 the first time a kind is registered, 200 when the same manifest is sent
    again or replaces its own earlier version, 409 when another decoder holds the
    kind, the kind is decoding, or its PCM port is taken.
    """
    _require_decode_secret(x_decode_secret)
    try:
        outcome = manifest_decode.register(body)
    except manifest_decode.RegistrationRejected as exc:
        raise HTTPException(409, {"reason": exc.reason, "message": str(exc)}) from exc
    return JSONResponse(
        {"status": outcome, "kind": body.decoder_kind, "pcm_port": body.pcm.port},
        status_code=201 if outcome == "registered" else 200,
    )


@router.post("/api/sdr/decoders/{kind}/start")
async def start_decoder(body: ManifestDecodeControlIn, kind: str = _KIND, db: AsyncSession = Depends(get_db)):
    """Start (or retune) a decoder kind on a radio; it runs until stopped."""
    reply = await manifest_decode.start_on_radio(
        kind, db, body.radio_id, bw_hz=body.bw_hz or None, offset_hz=body.offset_hz
    )
    return _reply_or_raise(reply)


@router.post("/api/sdr/decoders/{kind}/stop")
async def stop_decoder(body: ManifestDecodeStopIn, kind: str = _KIND, db: AsyncSession = Depends(get_db)):
    """Stop a decoder kind on a radio (a no-op when it isn't running there)."""
    return _reply_or_raise(await manifest_decode.stop_on_radio(kind, db, body.radio_id))


@router.get("/api/sdr/decoders/{kind}/status/{radio_id}")
async def decoder_status(radio_id: int, kind: str = _KIND, db: AsyncSession = Depends(get_db)):
    """Whether a kind is decoding on a radio, decoder reachability, and (for an
    absolute kind) whether the span covers its channels."""
    return _reply_or_raise(await manifest_decode.status_on_radio(kind, db, radio_id))


@router.post("/api/sdr/decoders/{kind}/ingest")
async def ingest_decoder_event(body: DecodeEventIn, kind: str = _KIND, x_decode_secret: str = Header(default="")):
    """Receive a decoded event from a decoder container, publish it, and fan it out.

    Same gate as every other kind: secret-authed (fails closed) and 409 when no
    session is active. The event is published as ``decode.<kind>.<radioId>`` for
    any section, then relayed to the radio's ``/ws/sdr/{id}/decode`` subscribers
    with ``type`` defaulted to the kind.
    """
    _require_decode_secret(x_decode_secret)
    if manifest_decode.get_manifest(kind) is None:
        raise HTTPException(404, "Decoder kind not registered")
    bridge = manifest_decode.get_active_bridge(kind)
    if bridge is None:
        raise HTTPException(409, f"{kind} decode not active")
    # raise_errors=True: a failing consumer surfaces as a 500 the decoder retries,
    # as it does for APRS and AIS.
    await bus.publish(
        f"decode.{kind}.{bridge.radio_id}", {"event": body.event, "radio_id": bridge.radio_id}, raise_errors=True
    )
    bridge.publish_event({"type": kind, **body.event})
    return JSONResponse({"status": "ok"})


@router.get("/api/sdr/decoders/{kind}/config")
async def decoder_config(kind: str = _KIND, x_decode_secret: str = Header(default="")):
    """Whether a session for this kind is serving PCM, for the decoder's supervisor.

    404 for a kind the hub doesn't know — after a hub restart, that is the
    decoder's cue to register again.
    """
    _require_decode_secret(x_decode_secret)
    if manifest_decode.get_manifest(kind) is None:
        raise HTTPException(404, "Decoder kind not registered")
    bridge = manifest_decode.get_active_bridge(kind)
    return JSONResponse({"active": bool(bridge and bridge.running)})
