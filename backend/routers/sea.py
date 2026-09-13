"""
Sea domain router — live AIS vessel tracking.

Endpoints:
  GET    /api/sea/vessels                 — Vessel snapshot the Sea map polls (optional bbox / max_rows)
  GET    /api/sea/vessels/{mmsi}/track    — One vessel's recent path (accumulated since it was first heard)
  GET    /api/sea/status                  — Feed status (connection state, silence, retry schedule)
  GET    /api/sea/lanes?bbox=             — Charted shipping routes (TSS, fairways…) as GeoJSON, cell-cached
  GET    /api/sea/ais-key                 — Whether an AISStream key is configured (never the key itself)
  PUT    /api/sea/ais-key                 — Save / replace the AISStream key from Settings › SEA
  DELETE /api/sea/ais-key                 — Forget the saved key (the .env key, if any, applies again)

The vessel picture is owned by :mod:`backend.services.ais_store` and fed by
:mod:`backend.services.ais_stream`; this router only reads it. Every snapshot
request also nudges the feed watchdog (``reader.ensure``) so a reconnect never
has to wait for the background tick when someone is actually looking.
"""

from __future__ import annotations

import re

from backend.config import settings as app_settings
from backend.database import get_db
from backend.db_helpers import get_setting, upsert_setting
from backend.models import UserSettings
from backend.services import ais_store, shipping_lanes
from backend.services.ais_stream import key_fingerprint, reader
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


def _status_headers() -> dict[str, str]:
    cache_state = "LIVE" if reader.status == "live" else "STALE"
    return {"X-Cache": cache_state, "Cache-Control": "no-store"}


@router.get("/vessels")
async def get_vessels(
    bbox: str | None = Query(default=None, description="south,west,north,east in degrees"),
    max_rows: int = Query(default=_DEFAULT_MAX_ROWS, ge=1, le=50_000),
):
    """Return the current vessel picture, newest position first.

    ``bbox`` limits the rows to the map viewport (pass it — a worldwide
    subscription is tens of thousands of vessels). The response always carries
    the feed status so the map can label cached vessels as STALE while the
    upstream is silent or reconnecting, rather than silently drawing old data.
    """
    parsed_bbox = _parse_bbox(bbox)
    await reader.ensure()
    vessels = ais_store.store.vessels(max_rows, parsed_bbox)
    return JSONResponse({"vessels": vessels, **reader.snapshot()}, headers=_status_headers())


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
async def get_feed_status():
    """Feed health for Settings › SEA and the map's status line."""
    await reader.ensure()
    return JSONResponse(reader.snapshot(), headers={"Cache-Control": "no-store"})


@router.get("/lanes")
async def get_shipping_lanes(bbox: str = Query(description="south,west,north,east in degrees")):
    """Charted route structure (separation lanes/zones, routes, fairways) for a bbox.

    Served from the per-cell SQLite cache, fetching missing cells from
    Overpass. ``tooWide`` is true (with no features) when the bbox spans more
    cells than one request may cover — zoom in.
    """
    parsed = _parse_bbox(bbox)
    if parsed is None:
        raise HTTPException(status_code=400, detail="bbox is required")
    collection = await shipping_lanes.lanes_for_bbox(*parsed)
    return JSONResponse(collection, headers={"Cache-Control": "no-store"})


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
