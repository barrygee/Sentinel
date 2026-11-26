"""
Air domain router — ADS-B live tracking.

The notification endpoints under /api/air/messages are core, not Air — they
live in backend/core/notifications.py (B5).

Endpoints:
  GET    /api/air/adsb/point/{lat}/{lon}/{radius}  — ADS-B aircraft proxy with SQLite cache
  GET    /api/air/tracking                         — List currently tracked aircraft
  POST   /api/air/tracking                         — Add aircraft to tracking
  DELETE /api/air/tracking/{hex}                   — Remove aircraft from tracking
"""

from backend.cache import now_ms
from backend.database import get_db
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_air.models import AirTracking
from sentinel_air.services import adsb_point, online_quota

# ── Request body schemas ───────────────────────────────────────────────────────


class TrackingIn(BaseModel):
    """Body for POST /api/air/tracking — adds or updates an aircraft in the tracking list."""

    hex: str  # ICAO 24-bit hex identifier
    callsign: str = ""
    follow: bool = False  # whether camera-follow mode is active


router = APIRouter(prefix="/api/air", tags=["air"])


# ── ADS-B proxy ────────────────────────────────────────────────────────────────


# How old the served snapshot is, in ms, as a duration rather than a timestamp:
# the browser subtracts it from its own clock, so a receiver whose clock is
# wrong (an off-grid Pi with no RTC) can't make cached aircraft look live.
SNAPSHOT_AGE_HEADER = "X-Snapshot-Age-Ms"

# How long the snapshot is meant to stand before a newer one is fetched, in ms:
# the online refresh interval for an online snapshot, the cache TTL for the
# local decoder's. The map dims an aircraft only once it has gone unheard for
# this plus its own margin, so the wait between two online refreshes doesn't
# dim every aircraft the last one placed.
SNAPSHOT_LIFETIME_HEADER = "X-Snapshot-Lifetime-Ms"

# Why there was no snapshot to send: `no-source` (off grid with no decoder
# set), `daily-limit` (the online feed's daily call limit is spent; with a
# Retry-After until it resets), `upstream` (the feed failed or the next call
# slot wasn't due, with nothing cached nearby to stand in) or `settings` (core
# didn't answer, so no source is known, with nothing cached nearby either).
UNAVAILABLE_REASON_HEADER = "X-Unavailable-Reason"


def _snapshot_response(snapshot: adsb_point.AdsbPointSnapshot) -> Response:
    """The HTTP form of a point snapshot.

    Nothing to serve is `204 No Content`, not an error. Every poll that found
    nothing used to answer 503, which the browser logs in red in the console
    however the page handles it — a line every 10 s while the daily limit was
    spent. "Nothing new" is the truthful answer: the map keeps the aircraft it
    has and they age out as usual, and the quota banner says why. `Retry-After`
    lets it stop polling until the limit resets.
    """
    if snapshot.aircraft_snapshot is None:
        headers = {"X-Cache": snapshot.cache_state, UNAVAILABLE_REASON_HEADER: snapshot.unavailable_reason or ""}
        if snapshot.retry_after_seconds is not None:
            headers["Retry-After"] = str(snapshot.retry_after_seconds)
        return Response(status_code=204, headers=headers)
    return JSONResponse(
        content=snapshot.aircraft_snapshot,
        headers={
            "X-Cache": snapshot.cache_state,
            SNAPSHOT_AGE_HEADER: str(snapshot.age_ms),
            SNAPSHOT_LIFETIME_HEADER: str(snapshot.lifetime_ms),
        },
    )


@router.get("/adsb/point/{lat}/{lon}/{radius}")
async def get_aircraft_near_point(
    lat: float,
    lon: float,
    radius: int = 250,
    db: AsyncSession = Depends(get_db),
):
    """Proxy the upstream /v2/point endpoint with a SQLite write-through cache.

    Every response says how old its snapshot is in `X-Snapshot-Age-Ms` (0 when
    fetched by this request), so the map can age aircraft by when they were
    actually observed rather than when the response arrived. `X-Cache` names
    the cache state (see `adsb_point.aircraft_near_point`, which the globe's
    `air.globe.snapshot` shares); nothing to serve is a 204 with
    `X-Cache: UNAVAILABLE` and `X-Unavailable-Reason`.
    """
    return _snapshot_response(await adsb_point.aircraft_near_point(db, lat, lon, radius))


@router.get("/adsb/online-quota")
async def get_online_quota():
    """How much of the online feed in use's daily call limit is used: `host`,
    `used`, `limit` and `remaining` (null when the feed has no known limit),
    `limitSource` (`setting` / `feed` / `default`), `state` (`ok` /
    `approaching` / `reached` / `no_limit`) and `resetsInSeconds`. Answered
    from Sentinel's own count — it never calls the feed — so the map can poll
    it freely."""
    host = online_quota.feed_host(await online_quota.online_feed_url())
    status = await online_quota.tracker.status(host)
    return JSONResponse(status.as_json())


# ── Tracking ───────────────────────────────────────────────────────────────────


@router.get("/tracking")
async def list_tracked_aircraft(db: AsyncSession = Depends(get_db)):
    """Return all currently tracked aircraft, most recently added first."""
    result = await db.execute(select(AirTracking).order_by(AirTracking.added_at.desc()))
    rows = result.scalars().all()
    return JSONResponse(
        [
            {
                "hex": aircraft.hex,
                "callsign": aircraft.callsign,
                "follow": aircraft.follow,
                "added_at": aircraft.added_at,
            }
            for aircraft in rows
        ]
    )


@router.post("/tracking", status_code=201)
async def add_tracked_aircraft(body: TrackingIn, db: AsyncSession = Depends(get_db)):
    """Add an aircraft to tracking, or update callsign/follow if it is already tracked."""
    result = await db.execute(select(AirTracking).where(AirTracking.hex == body.hex))
    row = result.scalar_one_or_none()

    if row:
        # Aircraft already tracked — update mutable fields only
        row.callsign = body.callsign
        row.follow = body.follow
        await db.commit()
        return JSONResponse({"status": "updated"}, status_code=200)

    db.add(
        AirTracking(
            hex=body.hex,
            callsign=body.callsign,
            follow=body.follow,
            added_at=now_ms(),
        )
    )
    await db.commit()
    return JSONResponse({"status": "created"}, status_code=201)


@router.delete("/tracking/{hex}", status_code=200)
async def remove_tracked_aircraft(hex: str, db: AsyncSession = Depends(get_db)):
    """Remove an aircraft from tracking by ICAO hex. Returns 404 if not currently tracked."""
    result = await db.execute(select(AirTracking).where(AirTracking.hex == hex))
    row = result.scalar_one_or_none()
    if not row:
        return JSONResponse({"status": "removed"})
    await db.delete(row)
    await db.commit()
    return JSONResponse({"status": "removed"})
