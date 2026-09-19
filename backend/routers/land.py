"""
Land domain router — APRS stations heard by the SDR APRS decoder.

Endpoints:
  GET  /api/land/aprs/stations   — Recent APRS stations (latest fix per callsign)
  GET  /api/land/repeaters       — UK amateur-radio repeater directory (ukrepeater.net, cached)
  GET  /api/land/repeaters/file  — The directory as an editable JSON document {stations: [...]}
  POST /api/land/repeaters/file  — Replace the directory from an edited JSON document

The Land map polls the stations snapshot to plot received APRS traffic. Stations
are populated by the APRS decode ingest path (see the SDR router's
``/api/sdr/aprs/ingest``) and stored by :mod:`backend.services.aprs_store`; the
live waterfall panels use the existing per-radio decode WebSocket instead.
"""

from backend.cache import now_ms
from backend.database import get_db
from backend.services import aprs_store, repeaters
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/land", tags=["land"])


@router.get("/aprs/stations")
async def list_aprs_stations():
    """Return the latest fix for every APRS station heard within the TTL window.

    Ordered most-recently-heard first, so the map can style or prioritise fresh
    traffic. Expired stations are excluded (and swept by the cleanup loop), so a
    poller always sees the current picture.
    """
    stations = await aprs_store.get_stations(now_ms())
    return JSONResponse({"stations": stations})


@router.get("/repeaters")
async def list_repeaters(db: AsyncSession = Depends(get_db)):
    """Return the UK amateur-radio repeater directory, one station per callsign.

    Served from the daily-refreshed SQLite cache (``X-Cache: HIT``), refetched
    from ukrepeater.net when that has expired (``MISS``), from the last good
    copy when the upstream is down (``STALE``), or from the snapshot shipped
    with the backend on an install that has never been online (``BUNDLED``).
    """
    try:
        payload, cache_state = await repeaters.get_repeaters(db)
    except repeaters.RepeaterDataUnavailable as exc:
        raise HTTPException(status_code=503, detail="repeater directory unavailable") from exc
    return JSONResponse(payload, headers={"X-Cache": cache_state, "Cache-Control": "no-store"})


@router.get("/repeaters/file")
async def get_repeaters_file(db: AsyncSession = Depends(get_db)):
    """The directory as the JSON document Settings › LAND › REPEATERS edits — the
    same shape as the bundled ``backend/data/uk_repeaters.json``."""
    try:
        payload, _cache_state = await repeaters.get_repeaters(db)
    except repeaters.RepeaterDataUnavailable as exc:
        raise HTTPException(status_code=503, detail="repeater directory unavailable") from exc
    return JSONResponse({"stations": payload["stations"]})


@router.post("/repeaters/file")
async def set_repeaters_file(body: dict = Body(...), db: AsyncSession = Depends(get_db)):
    """Replace the directory from an edited ``{stations: [...]}`` document.

    Validated whole — every station needs a callsign, a UK position and at least
    one channel with a band and both frequencies — and refused with the first
    problem named, so a typo never half-applies. The upload is served for
    ``repeaters_manual_ttl_ms`` before the daily upstream refresh resumes.
    """
    if not isinstance(body, dict) or not isinstance(body.get("stations"), list):
        raise HTTPException(status_code=400, detail="Body must be a JSON object with a stations array")
    try:
        count = await repeaters.replace_repeaters(db, body["stations"])
    except repeaters.RepeaterDataInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse({"status": "ok", "stations": count})
