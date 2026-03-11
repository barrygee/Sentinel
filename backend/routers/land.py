"""
Land domain router — vehicle tracking, military exercises, ground assets.

Future endpoints (when data sources are identified):
  GET /api/land/vehicles     — Live ground vehicle positions
  GET /api/land/bases        — Army/NATO base metadata
  GET /api/land/exercises    — Active military exercise zones
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/land", tags=["land"])


@router.get("/status")
async def status():
    return JSONResponse({"status": "not_implemented", "domain": "land"})
