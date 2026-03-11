"""
Space domain router — satellite tracking, orbital data, space weather.

Future endpoints (when data sources are identified):
  GET /api/space/satellites  — Live satellite positions (TLE-based, e.g. Celestrak)
  GET /api/space/iss         — ISS position
  GET /api/space/weather     — Space weather / solar wind data
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/space", tags=["space"])


@router.get("/status")
async def status():
    return JSONResponse({"status": "not_implemented", "domain": "space"})
