"""
Space domain router — ISS tracking, ground track, and day/night terminator.

Endpoints:
  GET /api/space/iss           — ISS current position, ground track, and footprint
  GET /api/space/iss/passes    — Predicted passes over a given observer location
  GET /api/space/daynight      — Day/night terminator as GeoJSON polygon
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.services import tle as tle_service
from backend.services import satellite as sat_service
from backend.services import daynight as dn_service

router = APIRouter(prefix="/api/space", tags=["space"])

_ISS_NORAD = "25544"


@router.get("/iss")
async def get_iss(db: AsyncSession = Depends(get_db)):
    """Return the current ISS position, ground track (±2 orbits), and visibility footprint.

    Position is propagated fresh on each request using the cached TLE.
    TLE is refreshed from Celestrak at most once per hour.
    """
    try:
        tle_text = await tle_service.fetch_tle(_ISS_NORAD, db)
        _, line1, line2 = tle_service.parse_tle_lines(tle_text)

        position = sat_service.compute_position(line1, line2)
        ground_track = sat_service.compute_ground_track(line1, line2)
        footprint = sat_service.compute_footprint(
            position["lat"], position["lon"], position["alt_km"]
        )

        return JSONResponse({
            "position": position,
            "ground_track": ground_track,
            "footprint": footprint,
        })

    except RuntimeError as e:
        return JSONResponse({"error": str(e)}, status_code=503)
    except Exception as e:
        return JSONResponse({"error": f"Unexpected error: {e}"}, status_code=500)


@router.get("/iss/passes")
async def get_iss_passes(
    lat: float = Query(..., description="Observer latitude in degrees"),
    lon: float = Query(..., description="Observer longitude in degrees"),
    hours: int = Query(24, ge=1, le=48, description="Lookahead window in hours"),
    min_el: float = Query(0.0, ge=0.0, le=90.0, description="Minimum max-elevation filter (degrees)"),
    db: AsyncSession = Depends(get_db),
):
    """Predict ISS passes visible from an observer location within the next N hours.

    A pass is returned whenever the ISS rises above the observer's horizon (elevation >= 0°).
    Results include AOS/LOS times, duration, and maximum elevation angle.
    """
    try:
        tle_text = await tle_service.fetch_tle(_ISS_NORAD, db)
        _, line1, line2 = tle_service.parse_tle_lines(tle_text)

        passes = sat_service.compute_passes(
            line1, line2,
            obs_lat=lat,
            obs_lon=lon,
            lookahead_hours=hours,
            min_elevation_deg=min_el,
        )

        return JSONResponse({
            "passes":          passes,
            "obs_lat":         lat,
            "obs_lon":         lon,
            "lookahead_hours": hours,
            "computed_at":     datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

    except RuntimeError as e:
        return JSONResponse({"error": str(e)}, status_code=503)
    except Exception as e:
        return JSONResponse({"error": f"Unexpected error: {e}"}, status_code=500)


@router.get("/daynight")
async def get_daynight():
    """Return the current day/night terminator as a GeoJSON Polygon Feature.

    Computed fresh on each request using only the current UTC time.
    """
    try:
        feature = dn_service.compute_terminator()
        return JSONResponse(feature)
    except Exception as e:
        return JSONResponse({"error": f"Terminator computation failed: {e}"}, status_code=500)
