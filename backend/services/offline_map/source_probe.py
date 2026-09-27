"""Cheap remote validation of the configured basemap source, and local checks
for whether the go-pmtiles binary is available.

The Python `pmtiles` package has no remote reader (see the plan's D1), but a
PMTiles header is a fixed 127 bytes at the start of the file, so an HTTP Range
request is enough to confirm the remote archive looks like what we expect
without downloading anything. The probe streams the response and stops as
soon as it has those 127 bytes — it never buffers a whole response body,
which matters because a server that ignores the Range request (or redirects
somewhere that does) could otherwise hand back the entire multi-gigabyte
archive. Redirects are followed manually, one hop at a time, and only if the
target is still `https://` — CDNs commonly redirect (protomaps' build host
included), but a redirect to plain `http://` would leak nothing sensitive
here (there's no credential on the request) yet is refused anyway as a matter
of not trusting an unexpected downgrade.

Results are cached briefly (`_PROBE_CACHE_TTL_S`) so a burst of requests (or
one slow client retrying) doesn't hammer the upstream on every call.
"""

from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path
from urllib.parse import urljoin

import httpx
from pmtiles.tile import TileType, deserialize_header

logger = logging.getLogger(__name__)

_HEADER_BYTES = 127
_PROBE_TIMEOUT_S = 5.0
_MAX_REDIRECTS = 5
_REDIRECT_STATUS_CODES = (301, 302, 303, 307, 308)
_PROBE_CACHE_TTL_S = 60.0

# url -> (monotonic timestamp the result was cached at, result)
_probe_cache: dict[str, tuple[float, bool]] = {}


async def probe_basemap_source(url: str) -> bool:
    """Best-effort check that `url` is a reachable PMTiles archive with an MVT,
    clustered tile layer (a Protomaps Basemap v4 build's defining traits, per
    the plan's D1). Returns False on any network error, non-206/200 response,
    a header that doesn't look right, or too many/unsafe redirects — never
    raises. Cached for `_PROBE_CACHE_TTL_S` seconds per URL."""
    if not url:
        return False

    cached = _probe_cache.get(url)
    if cached is not None:
        cached_at, cached_result = cached
        if time.monotonic() - cached_at < _PROBE_CACHE_TTL_S:
            return cached_result

    result = await _probe_uncached(url)
    _probe_cache[url] = (time.monotonic(), result)
    return result


async def _probe_uncached(url: str) -> bool:
    current_url = url
    try:
        async with httpx.AsyncClient(timeout=_PROBE_TIMEOUT_S, follow_redirects=False) as client:
            for _redirect_hop in range(_MAX_REDIRECTS):
                async with client.stream(
                    "GET", current_url, headers={"Range": f"bytes=0-{_HEADER_BYTES - 1}"}
                ) as response:
                    if response.status_code in _REDIRECT_STATUS_CODES:
                        location = response.headers.get("location")
                        if not location:
                            return False
                        next_url = urljoin(current_url, location)
                        if not next_url.lower().startswith("https://"):
                            logger.warning("Refusing non-https redirect while probing basemap source: %s", next_url)
                            return False
                        current_url = next_url
                        continue

                    if response.status_code not in (200, 206):
                        return False

                    header_bytes = bytearray()
                    async for chunk in response.aiter_bytes():
                        header_bytes.extend(chunk)
                        if len(header_bytes) >= _HEADER_BYTES:
                            break
                    if len(header_bytes) < _HEADER_BYTES:
                        return False
                    header = deserialize_header(bytes(header_bytes[:_HEADER_BYTES]))
                    return header["tile_type"] == TileType.MVT and bool(header["clustered"])
    except Exception:
        logger.warning("Basemap source probe failed for %s", url, exc_info=True)
        return False
    logger.warning("Too many redirects probing basemap source: %s", url)
    return False


def pmtiles_binary_available(pmtiles_bin: str) -> bool:
    """Whether the configured go-pmtiles binary can actually be launched —
    either an absolute/relative path that exists, or a bare name resolvable
    on PATH."""
    candidate = Path(pmtiles_bin)
    if candidate.is_absolute() or "/" in pmtiles_bin:
        return candidate.exists()
    return shutil.which(pmtiles_bin) is not None
