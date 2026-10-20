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

import json
import logging
import math
from urllib.parse import urlsplit

import httpx
from backend.cache import is_fresh, is_within_stale, now_ms
from backend.config import settings
from backend.database import get_db
from backend.services.upstream_rate_limit import UpstreamThrottledError
from backend.utils import resolve_domain_urls, resolve_effective_mode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_air.models import AdsbCache, AirTracking
from sentinel_air.services import adsb as adsb_service
from sentinel_air.services import adsb_cache, adsb_source, online_quota
from sentinel_air.services.adsb_squawk import tracker as squawk_tracker

logger = logging.getLogger(__name__)

# ── Request body schemas ───────────────────────────────────────────────────────


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


async def _nearest_recent_row(db: AsyncSession, lat: float, lon: float, radius: int, stale_ms: int) -> AdsbCache | None:
    """Return the closest cached ADS-B row for the same radius, or None.

    Only rows still inside the stale window are considered, and only one whose
    centre lies within half the query radius of (lat, lon) — beyond that the
    borrowed aircraft list would miss too much of the area being asked about.
    """
    oldest_usable = now_ms() - stale_ms
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


def _fresh_response(data: dict, cache_state: str, lifetime_ms: int) -> JSONResponse:
    """A snapshot fetched by this request, meant to stand for `lifetime_ms`."""
    return JSONResponse(
        content=data,
        headers={"X-Cache": cache_state, SNAPSHOT_AGE_HEADER: "0", SNAPSHOT_LIFETIME_HEADER: str(lifetime_ms)},
    )


def _cached_response(row: AdsbCache, cache_state: str) -> JSONResponse:
    """A snapshot from the cache, labelled with how long ago it was fetched and how long it was meant to stand."""
    age_ms = max(0, now_ms() - row.fetched_at)
    lifetime_ms = max(0, row.expires_at - row.fetched_at)
    return JSONResponse(
        content=json.loads(row.payload),
        headers={
            "X-Cache": cache_state,
            SNAPSHOT_AGE_HEADER: str(age_ms),
            SNAPSHOT_LIFETIME_HEADER: str(lifetime_ms),
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
    actually observed rather than when the response arrived.

    Cache strategy:
      - HIT:    fresh row exists (within adsb_ttl_ms; the online refresh
                interval for an online snapshot) → return immediately
      - MISS:   no row or expired → fetch upstream, upsert row, return fresh data
      - RATED:  upstream returned 429 → serve the cache row if within adsb_stale_ms
      - THROTTLED: our own limiter declined the call (see adsb_min_request_interval_ms)
                → serve the cache row if within adsb_stale_ms
      - STALE:  upstream failed (non-429) but row within adsb_stale_ms → serve old data
      (Online, the stale window is adsb_stale_ms plus the online refresh interval.)
      - NEARBY: no row for this exact point and no fresh fetch → serve the nearest
                recent row (the point tracks the map centre, so pans miss the cache)
      - FALLBACK: the primary failed and the fallback answered with no
                aircraft, and nothing cached could stand in — served, not cached
      - 503:    upstream failed and no usable cached entry
    """
    # Any poll, cache hit or not, means a map is open: the squawk watcher stays
    # idle rather than compete with it for the upstream's rate budget.
    squawk_tracker.browser_polled()
    # Off grid the aircraft come from the operator's own receiver, which only
    # hears what is around it, so the area is centred on that receiver rather
    # than on wherever the map is panned (the browser always sends the map
    # centre). Online, the map centre is the area being looked at. With no known
    # receiver position, the map centre stands in.
    if await resolve_effective_mode("air", db) == "offgrid":
        receiver = await adsb_source.receiver_location(db)
        if receiver is not None:
            lat, lon = receiver

    # Build a deterministic cache key from the query parameters

    primary_url, fallback_url = await resolve_domain_urls(
        "air", db, online_default=settings.adsb_upstream_base, offgrid_default=settings.adsb_offgrid_url
    )

    # The online feed has a daily request quota, so it is called once per
    # operator-set refresh interval (Settings › AIR) and its snapshot has to
    # stand in for that long — plus the usual stale window, since an online
    # snapshot is never refreshed sooner.
    sources = [url for url in (primary_url, fallback_url) if url]
    if any(adsb_service.is_online_feed(url) for url in sources):
        online_interval_seconds = await adsb_service.online_refresh_interval_s(db)
    else:
        online_interval_seconds = settings.adsb_online_refresh_interval_s
    online_interval_ms = int(online_interval_seconds * 1000)
    primary_is_online = primary_url is not None and adsb_service.is_online_feed(primary_url)
    stale_ms = settings.adsb_stale_ms + (online_interval_ms if primary_is_online else 0)

    # Look up any existing cache row for this key
    row = await adsb_cache.find_snapshot(db, lat, lon, radius)

    # Return immediately if the cached data is still within its TTL,
    # but only when there is a primary source to fetch from. If primary_url
    # is None (offgrid mode with no offgrid source configured) we skip
    # the cache so callers get a 503 rather than stale data.
    if row and is_fresh(row.expires_at) and primary_url is not None:
        return _cached_response(row, "HIT")

    # offgrid mode with no offgrid source configured — nothing to fetch
    if primary_url is None:
        raise HTTPException(status_code=503, detail="ADS-B upstream unavailable")

    data: dict | None = None
    empty_fallback: dict | None = None
    rate_limited = False
    throttled = False
    fresh_for_ms = settings.adsb_ttl_ms
    for base_url in sources:
        try:
            data = await adsb_service.fetch_aircraft(lat, lon, radius, base_url, online_interval_seconds)
            if adsb_service.is_online_feed(base_url):
                fresh_for_ms = online_interval_ms
            if base_url != primary_url and not data.get("ac"):
                # The fallback is the other mode's source (online, the operator's
                # own decoder), which often has nothing for this area. An empty
                # list from it says nothing about the sky, so it must not
                # replace aircraft already cached; it is the answer only if
                # there is nothing else (below).
                empty_fallback, data = data, None
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
        # Every fresh snapshot feeds the server-side squawk alerts, which is
        # also what keeps their watcher from fetching while a map is open. Own
        # session (on the same engine): an alert write must never disturb this
        # request's cache write.
        async with AsyncSession(db.bind, expire_on_commit=False) as alert_db:
            await squawk_tracker.observe(data, alert_db)
        adsb_cache.store_snapshot(db, row, lat, lon, radius, data, now_ms(), fresh_for_ms)
        # Best-effort cache write: if SQLite is locked beyond busy_timeout we
        # still have fresh upstream data, so serve it rather than 500.
        try:
            await db.commit()
        except OperationalError:
            await db.rollback()
            return _fresh_response(data, "BYPASS", fresh_for_ms)

        return _fresh_response(data, "MISS", fresh_for_ms)

    # No usable row for this exact point: the query point follows the map
    # centre, so every pan (and the map's default centre on load) lands on a
    # new cache key, or on one last fetched hours ago. Borrow the nearest recent
    # row so a throttled/rate-limited/failed fetch shows the aircraft we already
    # have instead of a 503 (and an empty map) until the next online call slot —
    # up to a whole refresh interval away. An expired row must not block this:
    # it is too old to serve below anyway.
    if row is None or not is_within_stale(row.fetched_at, stale_ms):
        nearby_row = await _nearest_recent_row(db, lat, lon, radius, stale_ms)
        if nearby_row is not None:
            return _cached_response(nearby_row, "NEARBY")

    # No fresh snapshot: serve the cached row, but only inside the stale window
    # whatever the reason — rate-limited (RATED), locally throttled (THROTTLED;
    # a refresh is at most one rate-limit interval away) or failed (STALE). An
    # older row would put aircraft on the map minutes after they were last
    # seen there.
    if row and is_within_stale(row.fetched_at, stale_ms):
        cache_state = "RATED" if rate_limited else "THROTTLED" if throttled else "STALE"
        return _cached_response(row, cache_state)
    # Nothing cached to prefer: the fallback's empty list is a truthful
    # answer, better than an outage. Not cached, so the next poll tries the
    # primary again rather than serving it as a fresh HIT.
    if empty_fallback is not None:
        return _fresh_response(empty_fallback, "FALLBACK", settings.adsb_ttl_ms)
    raise HTTPException(status_code=503, detail="ADS-B upstream unavailable")


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
