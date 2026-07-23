"""
Land domain router — APRS stations heard by the SDR APRS decoder.

Endpoints:
  GET  /api/land/aprs/stations   — Recent APRS stations (latest fix per callsign)

The Land map polls the stations snapshot to plot received APRS traffic. Stations
are populated by the APRS decode ingest path (see the SDR router's
``/api/sdr/aprs/ingest``) and stored by :mod:`backend.services.aprs_store`; the
live waterfall panels use the existing per-radio decode WebSocket instead.
"""

from backend.cache import now_ms
from backend.services import aprs_store
from fastapi import APIRouter
from fastapi.responses import JSONResponse

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
