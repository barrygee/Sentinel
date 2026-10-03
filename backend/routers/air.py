"""
Air domain router — ADS-B live tracking.

Endpoints:
  GET    /api/air/adsb/point/{lat}/{lon}/{radius}  — ADS-B aircraft proxy with SQLite cache
  GET    /api/air/messages                         — List air-domain notification messages
  POST   /api/air/messages                         — Create a new air message
  DELETE /api/air/messages/{msg_id}                — Dismiss (soft-delete) a message
  DELETE /api/air/messages                         — Dismiss all messages
  GET    /api/air/tracking                         — List currently tracked aircraft
  POST   /api/air/tracking                         — Add aircraft to tracking
  DELETE /api/air/tracking/{hex}                   — Remove aircraft from tracking
"""

import json
import logging
import math
from urllib.parse import urlsplit

import httpx
from backend.cache import is_fresh, is_within_stale, now_ms
from backend.config import settings
from backend.database import get_db
from backend.models import AdsbCache, AirMessage, AirTracking
from backend.services import adsb as adsb_service
from backend.services.upstream_rate_limit import UpstreamThrottledError
from backend.utils import resolve_domain_urls
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── Request body schemas ───────────────────────────────────────────────────────


class MessageIn(BaseModel):
    """Body for POST /api/air/messages — creates a new notification message."""

    msg_id: str  # client-generated unique id
    type: str  # 'emergency' | 'flight' | 'system' | 'squawk-clr' etc.
    title: str  # short headline shown in the panel
    detail: str = ""  # optional secondary text
    ts: int  # event timestamp, Unix ms


class TrackingIn(BaseModel):
    """Body for POST /api/air/tracking — adds or updates an aircraft in the tracking list."""

    hex: str  # ICAO 24-bit hex identifier
    callsign: str = ""
    follow: bool = False  # whether camera-follow mode is active


router = APIRouter(prefix="/api/air", tags=["air"])


# ── ADS-B proxy ────────────────────────────────────────────────────────────────


# How far (nm) a cached query centre may be from the requested one and still
# stand in for it. Half the query radius keeps most of the requested area
# covered by the borrowed row's own 250 nm circle.
_NEARBY_FRACTION_OF_RADIUS = 0.5


async def _nearest_recent_row(db: AsyncSession, lat: float, lon: float, radius: int) -> AdsbCache | None:
    """Return the closest cached ADS-B row for the same radius, or None.

    Only rows still inside the stale window are considered, and only one whose
    centre lies within half the query radius of (lat, lon) — beyond that the
    borrowed aircraft list would miss too much of the area being asked about.
    """
    oldest_usable = now_ms() - settings.adsb_stale_ms
    lon_scale = math.cos(math.radians(lat))
    # Equirectangular squared distance in degrees: plenty accurate at these ranges,
    # and cheap enough for SQLite to order by.
    squared_distance = (AdsbCache.lat - lat) * (AdsbCache.lat - lat) + ((AdsbCache.lon - lon) * lon_scale) * (
        (AdsbCache.lon - lon) * lon_scale
    )
    result = await db.execute(
        select(AdsbCache)
        .where(AdsbCache.radius_nm == radius, AdsbCache.fetched_at >= oldest_usable)
        .order_by(squared_distance)
        .limit(1)
    )
    nearest = result.scalar_one_or_none()
    if nearest is None:
        return None
    distance_nm = 60 * math.hypot(nearest.lat - lat, (nearest.lon - lon) * lon_scale)
    return nearest if distance_nm <= radius * _NEARBY_FRACTION_OF_RADIUS else None


@router.get("/adsb/point/{lat}/{lon}/{radius}")
async def get_aircraft_near_point(
    lat: float,
    lon: float,
    radius: int = 250,
    db: AsyncSession = Depends(get_db),
):
    """Proxy the upstream /v2/point endpoint with a SQLite write-through cache.

    Cache strategy:
      - HIT:    fresh row exists (within adsb_ttl_ms) → return immediately
      - MISS:   no row or expired → fetch upstream, upsert row, return fresh data
      - RATED:  upstream returned 429 → serve existing cache row regardless of age
      - THROTTLED: our own limiter declined the call (see adsb_min_request_interval_ms)
                → serve existing cache row regardless of age
      - STALE:  upstream failed (non-429) but row within adsb_stale_ms → serve old data
      - NEARBY: no row for this exact point and no fresh fetch → serve the nearest
                recent row (the point tracks the map centre, so pans miss the cache)
      - 503:    upstream failed and no usable cached entry
    """
    # Build a deterministic cache key from the query parameters
    cache_key = f"{lat:.4f}_{lon:.4f}_{radius}"

    primary_url, fallback_url = await resolve_domain_urls(
        "air", db, online_default=settings.adsb_upstream_base, offgrid_default=settings.adsb_offgrid_url
    )

    # Look up any existing cache row for this key
    result = await db.execute(select(AdsbCache).where(AdsbCache.cache_key == cache_key))
    row = result.scalar_one_or_none()

    # Return immediately if the cached data is still within its TTL,
    # but only when there is a primary source to fetch from. If primary_url
    # is None (offgrid mode with no offgrid source configured) we skip
    # the cache so callers get a 503 rather than stale data.
    if row and is_fresh(row.expires_at) and primary_url is not None:
        return JSONResponse(content=json.loads(row.payload), headers={"X-Cache": "HIT"})

    # offgrid mode with no offgrid source configured — nothing to fetch
    if primary_url is None:
        raise HTTPException(status_code=503, detail="ADS-B upstream unavailable")

    data: dict | None = None
    rate_limited = False
    throttled = False
    for base_url in filter(None, [primary_url, fallback_url]):
        try:
            data = await adsb_service.fetch_aircraft(lat, lon, radius, base_url)
            rate_limited = False
            break
        except UpstreamThrottledError:
            # Our own limiter declined the call to stay inside the upstream's
            # published rate limit. Try the other source (it has its own budget)
            # before falling back to cached data.
            throttled = True
            continue
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                # Visible on purpose: the local limiter is meant to keep us
                # under the upstream's threshold, so a 429 means the threshold
                # moved (adsb.lol's limits vary with load) and the configured
                # interval may need raising.
                rate_limited = True
                logger.warning(
                    "ADS-B upstream %s rate limited us (HTTP 429); backing off and serving cached data",
                    urlsplit(base_url).netloc or base_url,
                )
            else:
                # Anything else — an auth failure above all — is indistinguishable
                # from "no aircraft overhead" once we fall through to the next
                # source and return its empty list. Name the source and status so
                # a closed-off upstream shows up here rather than as a blank map.
                logger.warning(
                    "ADS-B upstream %s returned HTTP %s; trying next source",
                    urlsplit(base_url).netloc or base_url,
                    exc.response.status_code,
                )
            continue
        except httpx.HTTPError as exc:
            logger.warning(
                "ADS-B upstream %s unreachable (%s); trying next source",
                urlsplit(base_url).netloc or base_url,
                exc.__class__.__name__,
            )
            continue

    if data is not None:
        payload_str = json.dumps(data)
        ts = now_ms()

        # Upsert: update existing row or insert new one
        if row:
            row.payload = payload_str
            row.ac_count = len(data.get("ac", []))
            row.fetched_at = ts
            row.expires_at = ts + settings.adsb_ttl_ms
        else:
            db.add(
                AdsbCache(
                    cache_key=cache_key,
                    lat=lat,
                    lon=lon,
                    radius_nm=radius,
                    payload=payload_str,
                    ac_count=len(data.get("ac", [])),
                    fetched_at=ts,
                    expires_at=ts + settings.adsb_ttl_ms,
                )
            )
        # Best-effort cache write: if SQLite is locked beyond busy_timeout we
        # still have fresh upstream data, so serve it rather than 500.
        try:
            await db.commit()
        except OperationalError:
            await db.rollback()
            return JSONResponse(content=data, headers={"X-Cache": "BYPASS"})

        return JSONResponse(content=data, headers={"X-Cache": "MISS"})

    # No row for this exact point: the query point follows the map centre, so
    # every pan lands on a fresh cache key. Borrow the nearest recent row so a
    # throttled/rate-limited/failed fetch shows the aircraft we already have
    # instead of a 503 (and a console error) until the next successful poll.
    if row is None:
        nearby_row = await _nearest_recent_row(db, lat, lon, radius)
        if nearby_row is not None:
            return JSONResponse(content=json.loads(nearby_row.payload), headers={"X-Cache": "NEARBY"})

    # Rate-limited: serve whatever we have cached, regardless of age
    if rate_limited and row:
        return JSONResponse(content=json.loads(row.payload), headers={"X-Cache": "RATED"})

    # Locally throttled: a refresh is at most one rate-limit interval away, so
    # serve the cached row rather than reporting an outage the upstream isn't having.
    if throttled and row:
        return JSONResponse(content=json.loads(row.payload), headers={"X-Cache": "THROTTLED"})

    # All upstreams failed — serve stale data if still within the stale window
    if row and is_within_stale(row.fetched_at, settings.adsb_stale_ms):
        return JSONResponse(content=json.loads(row.payload), headers={"X-Cache": "STALE"})
    raise HTTPException(status_code=503, detail="ADS-B upstream unavailable")


# ── Notification messages ──────────────────────────────────────────────────────


@router.get("/messages")
async def list_air_messages(db: AsyncSession = Depends(get_db)):
    """Return all non-dismissed air messages, newest first."""
    result = await db.execute(
        select(AirMessage)
        .where(AirMessage.dismissed == False)  # noqa: E712
        .order_by(AirMessage.ts.desc())
    )
    rows = result.scalars().all()
    # Serialise to plain dicts (omit the dismissed flag — client doesn't need it)
    return JSONResponse(
        [
            {"msg_id": msg.msg_id, "type": msg.type, "title": msg.title, "detail": msg.detail, "ts": msg.ts}
            for msg in rows
        ]
    )


@router.post("/messages", status_code=201)
async def create_air_message(body: MessageIn, db: AsyncSession = Depends(get_db)):
    """Persist a new air message. Idempotent: if msg_id already exists, returns 200 'exists'."""
    existing = await db.execute(select(AirMessage).where(AirMessage.msg_id == body.msg_id))
    if existing.scalar_one_or_none():
        return JSONResponse({"status": "exists"}, status_code=200)  # already stored, no-op

    db.add(
        AirMessage(
            msg_id=body.msg_id,
            type=body.type,
            title=body.title,
            detail=body.detail,
            ts=body.ts,
        )
    )
    await db.commit()
    return JSONResponse({"status": "created"}, status_code=201)


@router.delete("/messages/{msg_id}", status_code=200)
async def dismiss_air_message(msg_id: str, db: AsyncSession = Depends(get_db)):
    """Soft-delete a single message by msg_id (sets dismissed=True). Idempotent: missing row returns 200."""
    result = await db.execute(select(AirMessage).where(AirMessage.msg_id == msg_id))
    row = result.scalar_one_or_none()
    if not row:
        return JSONResponse({"status": "absent"})
    row.dismissed = True
    await db.commit()
    return JSONResponse({"status": "dismissed"})


@router.delete("/messages", status_code=200)
async def dismiss_all_air_messages(db: AsyncSession = Depends(get_db)):
    """Soft-delete all air messages in one query."""
    await db.execute(AirMessage.__table__.update().values(dismissed=True))
    await db.commit()
    return JSONResponse({"status": "cleared"})


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
