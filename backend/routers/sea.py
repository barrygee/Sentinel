"""
Sea domain router — live AIS vessel tracking.

Endpoints:
  GET    /api/sea/vessels                 — Vessel snapshot the Sea map polls (optional bbox / max_rows)
  GET    /api/sea/vessels/{mmsi}/track    — One vessel's recent path (accumulated since it was first heard)
  GET    /api/sea/status                  — Active feed status (online upstream, or off-grid SDR decode)
  GET    /api/sea/ais-key                 — Whether an AISStream key is configured (never the key itself)
  PUT    /api/sea/ais-key                 — Save / replace the AISStream key from Settings › SEA
  DELETE /api/sea/ais-key                 — Forget the saved key (the .env key, if any, applies again)

The vessel picture is owned by :mod:`backend.services.ais_store` and fed by
EITHER source, depending on the domain's connectivity mode: online by
:mod:`backend.services.ais_stream` (AISStream.io), off grid by the SDR AIS
decode bridge via :mod:`backend.services.ais_decode`. This router only reads the
store, so its responses are identical either way apart from the ``source`` field
in the feed status. Every snapshot request also nudges the *active* feed so a
reconnect never has to wait for the background tick when someone is looking —
and, crucially, never dials AISStream while off grid.
"""

from __future__ import annotations

import re

from backend.config import settings as app_settings
from backend.database import get_db
from backend.db_helpers import get_setting, upsert_setting
from backend.models import UserSettings
from backend.services import ais_store, sdr_decode
from backend.services.ais_stream import key_fingerprint, reader
from backend.utils import resolve_effective_mode
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/sea", tags=["sea"])

_MMSI_PATTERN = re.compile(r"^\d{5,10}$")
# AISStream keys are hex-ish tokens; anything else is rejected before it can be
# stored or sent upstream.
_API_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_\-]{8,128}$")
_DEFAULT_MAX_ROWS = 12_000


class AisKeyIn(BaseModel):
    """Body for PUT /api/sea/ais-key."""

    key: str = Field(min_length=8, max_length=128)


def _parse_bbox(raw: str | None) -> tuple[float, float, float, float] | None:
    """Parse ``south,west,north,east`` degrees; 400 on anything malformed."""
    if raw is None or raw.strip() == "":
        return None
    parts = raw.split(",")
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="bbox must be south,west,north,east")
    try:
        south, west, north, east = (float(part) for part in parts)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="bbox values must be numbers") from exc
    if not (-90 <= south <= north <= 90) or abs(west) > 180 or abs(east) > 180:
        raise HTTPException(status_code=400, detail="bbox out of range")
    return south, west, north, east


def _offgrid_decode_snapshot() -> dict[str, object]:
    """Feed status for the off-grid source: the SDR AIS decode bridge.

    Shaped like :meth:`AisStreamReader.snapshot` so the map's status line reads
    one contract whichever source is live. "live" requires the sidecar to be
    connected AND the radio to be on channel — a bridge decoding silence because
    something swept the dongle off 162 MHz is reported as degraded, not live,
    since the vessel picture is going stale either way.
    """
    bridge = sdr_decode.get_active_ais_bridge()
    running = bool(bridge and bridge.running)
    on_channel = bool(bridge and bridge.on_channel)
    decoder_reachable = bool(bridge and bridge.decoder_reachable)
    if not running:
        status = "down"
    elif on_channel and decoder_reachable:
        status = "live"
    else:
        status = "degraded"
    return {
        "source": "offgrid",
        "status": status,
        "active": running,
        "decoderReachable": decoder_reachable,
        "onChannel": on_channel,
        "channelAHz": bridge.channel_a_hz if bridge else None,
        "channelBHz": bridge.channel_b_hz if bridge else None,
        "newestPositionMs": ais_store.store.newest_position_ms,
        "vesselCount": len(ais_store.store),
    }


async def _ensure_active_feed(db: AsyncSession) -> dict[str, object]:
    """Nudge whichever feed the Sea domain is configured to use, and describe it.

    Online is the AISStream WebSocket (``reader.ensure`` also serves as the
    "someone is looking" nudge that skips the background tick's wait). Off grid
    it is the SDR decode bridge, which must NOT dial AISStream — the whole point
    of off-grid mode is that there is no internet to reach it on, and an
    unreachable upstream would otherwise burn the reconnect ladder and log auth
    probes forever.
    """
    if await resolve_effective_mode("sea", db) == "offgrid":
        return _offgrid_decode_snapshot()
    await reader.ensure()
    return {"source": "online", **reader.snapshot()}


def _status_headers(feed_status: object = None) -> dict[str, str]:
    """Cache headers labelling the picture LIVE or STALE for the active feed."""
    state = feed_status if isinstance(feed_status, str) else reader.status
    cache_state = "LIVE" if state == "live" else "STALE"
    return {"X-Cache": cache_state, "Cache-Control": "no-store"}


@router.get("/vessels")
async def get_vessels(
    bbox: str | None = Query(default=None, description="south,west,north,east in degrees"),
    max_rows: int = Query(default=_DEFAULT_MAX_ROWS, ge=1, le=50_000),
    db: AsyncSession = Depends(get_db),
):
    """Return the current vessel picture, newest position first.

    ``bbox`` limits the rows to the map viewport (pass it — a worldwide
    subscription is tens of thousands of vessels). The response always carries
    the feed status so the map can label cached vessels as STALE while the
    upstream is silent or reconnecting, rather than silently drawing old data.
    """
    parsed_bbox = _parse_bbox(bbox)
    feed = await _ensure_active_feed(db)
    vessels = ais_store.store.vessels(max_rows, parsed_bbox)
    return JSONResponse({"vessels": vessels, **feed}, headers=_status_headers(feed.get("status")))


@router.get("/vessels/{mmsi}/track")
async def get_vessel_track(mmsi: str):
    """Return one vessel's recent path (oldest fix first) plus its current record.

    404 when the vessel is not in the store — it has never been heard, or it
    fell outside the retention window.
    """
    if not _MMSI_PATTERN.match(mmsi):
        raise HTTPException(status_code=400, detail="mmsi must be 5–10 digits")
    vessel = ais_store.store.get(mmsi)
    if vessel is None:
        raise HTTPException(status_code=404, detail="vessel not found")
    return JSONResponse(
        {"mmsi": mmsi, "vessel": vessel, "samples": ais_store.store.track(mmsi)},
        headers=_status_headers(),
    )


@router.get("/status")
async def get_feed_status(db: AsyncSession = Depends(get_db)):
    """Feed health for Settings › SEA and the map's status line.

    Reports whichever source the domain is set to — the AISStream upstream when
    online, the SDR decode bridge when off grid — under a common shape, with
    ``source`` naming which one.
    """
    feed = await _ensure_active_feed(db)
    return JSONResponse(feed, headers={"Cache-Control": "no-store"})


# ── API key ────────────────────────────────────────────────────────────────────
# The key is a secret, so it never round-trips through the generic settings
# API (which is exported as config JSON): the settings router redacts this key
# on read and refuses it on write, and these endpoints are the only way in.


@router.get("/ais-key")
async def get_ais_key_status(db: AsyncSession = Depends(get_db)):
    """Report whether a key is configured and where it came from — never the key."""
    saved = await get_setting(db, "sea", "aisstreamApiKey", default="")
    if isinstance(saved, str) and saved.strip():
        return JSONResponse({"configured": True, "source": "settings", "fingerprint": key_fingerprint(saved.strip())})
    env_key = app_settings.aisstream_api_key.strip()
    if env_key:
        return JSONResponse({"configured": True, "source": "env", "fingerprint": key_fingerprint(env_key)})
    return JSONResponse({"configured": False, "source": None, "fingerprint": None})


@router.put("/ais-key")
async def put_ais_key(body: AisKeyIn, db: AsyncSession = Depends(get_db)):
    """Save the AISStream key. Takes effect on the next watchdog tick."""
    key = body.key.strip()
    if not _API_KEY_PATTERN.match(key):
        raise HTTPException(status_code=422, detail="key must be 8–128 letters, digits, '-' or '_'")
    await upsert_setting(db, "sea", "aisstreamApiKey", key)
    return JSONResponse({"status": "ok", "fingerprint": key_fingerprint(key)})


@router.delete("/ais-key")
async def delete_ais_key(db: AsyncSession = Depends(get_db)):
    """Forget the saved key; the ``.env`` key (if any) applies again."""
    await db.execute(delete(UserSettings).where(UserSettings.namespace == "sea", UserSettings.key == "aisstreamApiKey"))
    await db.commit()
    return JSONResponse({"status": "ok"})
