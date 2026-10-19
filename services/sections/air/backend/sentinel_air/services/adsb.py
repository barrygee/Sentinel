from math import asin, cos, radians, sin, sqrt
from urllib.parse import urlsplit

import httpx
from backend.config import settings
from backend.platform.settings_client import read_setting
from backend.services.upstream_rate_limit import MinimumIntervalRateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

# Process-wide gate on outbound ADS-B traffic. Shared by every caller so the
# wire rate stays within the upstream's published limit regardless of how many
# distinct cache keys (map panes, tabs, clients) expire at the same moment.
_adsb_rate_limiter = MinimumIntervalRateLimiter(settings.adsb_min_request_interval_ms / 1000)

ONLINE_REFRESH_INTERVAL_SETTING = "onlineRefreshIntervalSec"
"""The `air` setting holding the gap between calls to the online feed."""

MIN_ONLINE_REFRESH_INTERVAL_S = 5.0
"""Matches the local decoder's spacing; faster gets a client banned from the public feeds."""

MAX_ONLINE_REFRESH_INTERVAL_S = 280.0
"""Under the map's 5-minute feed-silence limit (`FEED_SILENCE_LIMIT_MS`), past
which it removes every aircraft between two refreshes."""


async def online_refresh_interval_s(db: AsyncSession) -> float:
    """Seconds between calls to the online feed: Settings › AIR's value, clamped.

    Clamped rather than ignored when out of range, so a hand-edited config file
    asking for 1 s or 900 s gets the nearest value Sentinel can honour, not the
    default. Anything that isn't a number falls back to the config default.
    """
    value = await read_setting(db, "air", ONLINE_REFRESH_INTERVAL_SETTING)
    if isinstance(value, bool) or not isinstance(value, int | float):
        return settings.adsb_online_refresh_interval_s
    return min(max(float(value), MIN_ONLINE_REFRESH_INTERVAL_S), MAX_ONLINE_REFRESH_INTERVAL_S)


def is_online_feed(base_url: str) -> bool:
    """Whether this source is the online point API rather than a local readsb decoder."""
    return not _is_readsb(base_url)


async def fetch_aircraft(
    lat: float,
    lon: float,
    radius: int,
    base_url: str,
    online_interval_seconds: float | None = None,
) -> dict:
    """Fetch live aircraft data from the configured ADS-B upstream endpoint.

    Outbound calls are rate limited per upstream host: one per
    `online_interval_seconds` to the online feed (its daily quota), one per
    `adsb_min_request_interval_ms` to a local decoder. A call that would have to
    wait too long for a free slot is refused locally rather than queued, so the
    caller can serve cached data instead. If the upstream answers 429 the host
    is put in a cooldown (`_cooldown_seconds`) so the next poll is refused
    locally rather than repeating the breach.

    Args:
        lat: Centre latitude of the search area.
        lon: Centre longitude of the search area.
        radius: Search radius in nautical miles.
        base_url: Base URL for the ADS-B API (read from user settings).
        online_interval_seconds: Gap before the next call to the online feed
            (`online_refresh_interval_s`); the config default when omitted.

    Returns:
        Raw JSON dict from the API, shape: {"ac": [...], ...}

    Raises:
        UpstreamThrottledError: If the local rate limiter refused the call.
        httpx.HTTPError: If the upstream request fails or returns a non-2xx status.
    """
    # Host, not full URL: the limit belongs to the provider, and the same host
    # may be reached through differing base paths.
    upstream_host = urlsplit(base_url).netloc or base_url
    if is_online_feed(base_url):
        interval_seconds = (
            settings.adsb_online_refresh_interval_s if online_interval_seconds is None else online_interval_seconds
        )
    else:
        interval_seconds = None
    await _adsb_rate_limiter.acquire(
        upstream_host,
        max_wait_seconds=settings.adsb_rate_limit_max_wait_ms / 1000,
        interval_seconds=interval_seconds,
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if _is_readsb(base_url):
                payload = await _get_json(client, _readsb_url(base_url))
                return _readsb_to_airplanes(payload, lat, lon, radius)
            url = f"{base_url}/point/{lat}/{lon}/{radius}"
            return await _get_json(client, url)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                # The upstream has told us we are over its (undocumented,
                # load-dependent) limit. Suspend calls to this host so the
                # retry a few seconds later does not compound the breach.
                await _adsb_rate_limiter.penalize(
                    upstream_host,
                    _cooldown_seconds(
                        exc.response.headers.get("retry-after"),
                        _quota_reset_header(exc.response.headers),
                    ),
                )
            raise


def _quota_reset_header(headers: httpx.Headers) -> str | None:
    """adsb.lol's `X-RateLimit-Reset` (seconds until it accepts calls again), when its budget is spent.

    adsb.lol sends no `Retry-After`, only `X-RateLimit-Remaining` / `-Reset`.
    The reset is used only when nothing remains: with budget left, a 429 is a
    short-window breach and the reset may name a longer window's.
    """
    if headers.get("x-ratelimit-remaining", "").strip() != "0":
        return None
    return headers.get("x-ratelimit-reset")


def _cooldown_seconds(retry_after_header: str | None, quota_reset_header: str | None = None) -> float:
    """How long to stop calling a host that answered 429.

    Prefers the upstream's own `Retry-After` when it gives one as a delay in
    seconds, since that is the only authoritative statement of when it will
    accept traffic again; then its quota reset (`_quota_reset_header`). Anything
    else — absent, an HTTP-date, or unparseable — falls back to the configured
    default rather than guessing, and the value is clamped so a wild header
    cannot take the feed offline indefinitely.
    """
    default_seconds = settings.adsb_rate_limit_penalty_ms / 1000
    max_seconds = settings.adsb_rate_limit_max_penalty_ms / 1000
    if retry_after_header is None:
        retry_after_header = quota_reset_header
    if retry_after_header is None:
        return default_seconds
    try:
        requested_seconds = float(retry_after_header.strip())
    except ValueError:
        return default_seconds
    if requested_seconds <= 0:
        return default_seconds
    return min(requested_seconds, max_seconds)


async def _get_json(client: httpx.AsyncClient, url: str) -> dict:
    """GET `url` and return its parsed body, raising on any non-2xx."""
    response = await client.get(
        url,
        headers={
            "User-Agent": "SENTINEL/1.0",
            "Accept": "application/json",
        },
    )
    response.raise_for_status()  # raises HTTPStatusError on 4xx/5xx
    result: dict = response.json()
    return result


def _is_readsb(base_url: str) -> bool:
    """Whether this source is a local readsb/tar1090 rather than the online ADS-B API.

    Keyed on the URL ending in `.json`, or naming readsb's well-known
    `/data/aircraft.json`, because that is the one thing the two sources cannot
    share: the online feed is a query API addressed as
    `/point/{lat}/{lon}/{radius}`, while readsb writes a single static file
    holding everything its aerial can currently hear.

    Deliberately not auto-detected by probing. A probe costs an extra request on
    every cold start, has to cache its answer somewhere, and — worse — guesses
    silently when a source is merely down, so a decoder that was restarting
    would be remembered as the wrong flavour until the process restarted.
    """
    lowered = base_url.lower().rstrip("/")
    return lowered.endswith(".json") or lowered.endswith("/data")


def _readsb_url(base_url: str) -> str:
    """Resolve the aircraft file's URL, accepting either the file or its directory."""
    trimmed = base_url.rstrip("/")
    if trimmed.lower().endswith(".json"):
        return trimmed
    return f"{trimmed}/aircraft.json"


def _readsb_to_airplanes(payload: dict, lat: float, lon: float, radius: int) -> dict:
    """Map readsb's `aircraft.json` onto the v2 shape the app reads.

    The two are closer than they look — the v2 feeds derive their own data from
    readsb, so the per-aircraft fields (`hex`, `flight`, `lat`, `lon`,
    `alt_baro`, `gs`, `track`, `squawk`, `category`, `r`, `t`) already match.
    Two things do not, and both are handled here.

    **The list is named `aircraft`, not `ac`.** Renaming it here rather than
    teaching the frontend a second shape keeps every consumer — map, labels,
    overhead alerts — reading one format.

    **readsb does not filter by radius.** It reports everything its aerial hears,
    which is the whole receiver's range rather than the map pane being asked
    about, so the filter the upstream API would have applied is applied here
    instead. Aircraft with no position yet (heard, but not yet located) are
    dropped: they cannot be plotted, and passing them through would inflate the
    count the UI shows against an empty map.
    """
    aircraft = payload.get("aircraft")
    if not isinstance(aircraft, list):
        aircraft = []

    within_radius = [
        entry for entry in aircraft if isinstance(entry, dict) and _is_within_radius(entry, lat, lon, radius)
    ]

    return {
        "ac": within_radius,
        "total": len(within_radius),
        # readsb reports `now` in seconds; the app's other source reports
        # milliseconds, and a timestamp that silently changes unit between
        # sources would read as data from 1970.
        "now": int(float(payload.get("now", 0)) * 1000),
        "msg": "readsb",
    }


def _is_within_radius(aircraft: dict, lat: float, lon: float, radius_nm: int) -> bool:
    """Whether one readsb aircraft entry sits inside the requested circle."""
    aircraft_lat = aircraft.get("lat")
    aircraft_lon = aircraft.get("lon")
    if not isinstance(aircraft_lat, (int, float)) or not isinstance(aircraft_lon, (int, float)):
        return False
    return _distance_nm(lat, lon, float(aircraft_lat), float(aircraft_lon)) <= radius_nm


def _distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in nautical miles.

    Haversine rather than a flat approximation: an equirectangular shortcut is
    fine near the equator and increasingly wrong towards the poles, and the
    receiver this serves sits at 55°N where the longitude error is already
    large enough to admit or exclude the wrong aircraft at the edge of a pane.
    """
    earth_radius_nm = 3440.065
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)
    haversine = sin(delta_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(delta_lon / 2) ** 2
    return 2 * earth_radius_nm * asin(sqrt(haversine))
