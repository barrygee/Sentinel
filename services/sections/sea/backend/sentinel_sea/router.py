"""
Sea domain router — live AIS vessel tracking.

Endpoints:
  GET    /api/sea/vessels                 — Vessel snapshot the Sea map polls (optional bbox / max_rows)
  GET    /api/sea/vessels/{mmsi}/track    — One vessel's recent path (accumulated since it was first heard)
  GET    /api/sea/status                  — Active feed status (online upstream, or off-grid SDR decode)
  GET    /api/sea/ais-key                 — Whether an AISStream key is configured (never the key itself)
  PUT    /api/sea/ais-key                 — Save / replace the AISStream key from Settings › SEA
  DELETE /api/sea/ais-key                 — Forget the saved key (the .env key, if any, applies again)

The vessel picture is owned by :mod:`sentinel_sea.services.ais_store` and fed by
EITHER source, depending on the domain's connectivity mode: online by
:mod:`sentinel_sea.services.ais_stream` (AISStream.io), off grid by the SDR AIS
decode bridge via :mod:`sentinel_sea.services.ais_decode`. This router only reads the
store, so its responses are identical either way apart from the ``source`` field
in the feed status. Every snapshot request also nudges the *active* feed so a
reconnect never has to wait for the background tick when someone is looking —
and, crucially, never dials AISStream while off grid.
"""

from __future__ import annotations

import re

from backend.config import settings as app_settings
from backend.database import get_db
from backend.platform.settings_client import delete_secret, read_secret, write_secret
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

# Imported for its side effect (B2): registers the decode.ais.* bus subscriber
# that upserts off-grid AIS events into ais_store, at module-import time so it
# is in place even in tests, which skip the app lifespan. This router never
# calls ais_decode directly — it only reads ais_store.
from sentinel_sea.services import (
    ais_decode,  # noqa: F401
    ais_store,
    vessel_snapshot,
)
from sentinel_sea.services.ais_stream import key_fingerprint, reader

router = APIRouter(prefix="/api/sea", tags=["sea"])

_MMSI_PATTERN = re.compile(r"^\d{5,10}$")
# AISStream keys are hex-ish tokens; anything else is rejected before it can be
# stored or sent upstream.
_API_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_\-]{8,128}$")
_DEFAULT_MAX_ROWS = 12_000


class AisKeyIn(BaseModel):
    """Body for PUT /api/sea/ais-key."""

    key: str = Field(min_length=8, max_length=128)


def _parse_bbox(raw: str | None) -> vessel_snapshot.Bbox | None:
    """Parse ``south,west,north,east`` degrees; 400 on anything malformed."""
    try:
        return vessel_snapshot.parse_bbox(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
    vessels, feed = await vessel_snapshot.vessel_snapshot(db, max_rows, _parse_bbox(bbox))
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
    feed = await vessel_snapshot.active_feed(db)
    return JSONResponse(feed, headers={"Cache-Control": "no-store"})


# ── API key ────────────────────────────────────────────────────────────────────
# The key is a secret, so it never round-trips through the generic settings
# API (which is exported as config JSON): the settings router redacts this key
# on read and refuses it on write, and these endpoints are the only way in.
# It is still stored in core's user_settings: the settings client's secret calls
# reach it over core's /internal/settings/secrets/ routes, with Sea's own
# credential (P6.4) — or directly, in the test suite's in-process app.


@router.get("/ais-key")
async def get_ais_key_status(db: AsyncSession = Depends(get_db)):
    """Report whether a key is configured and where it came from — never the key."""
    saved = (await read_secret(db, "sea", "aisstreamApiKey")).strip()
    if saved:
        return JSONResponse({"configured": True, "source": "settings", "fingerprint": key_fingerprint(saved)})
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
    await write_secret(db, "sea", "aisstreamApiKey", key)
    return JSONResponse({"status": "ok", "fingerprint": key_fingerprint(key)})


@router.delete("/ais-key")
async def delete_ais_key(db: AsyncSession = Depends(get_db)):
    """Forget the saved key; the ``.env`` key (if any) applies again."""
    await delete_secret(db, "sea", "aisstreamApiKey")
    return JSONResponse({"status": "ok"})
