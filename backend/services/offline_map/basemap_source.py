"""Find the Protomaps planet build that basemap downloads are cut from.

Protomaps publishes a new dated planet build every day
(`https://build.protomaps.com/YYYYMMDD.pmtiles`) and deletes each one after
about a week. There is no stable "latest" alias. A hard-coded date would
therefore break every download a week after it was written, so by default the
address is worked out here:

1. Read Protomaps' build index (`builds.json`). It lists every retained build
   with its basemap schema version. Pick the newest build whose major version
   matches the one our offline styles were written for, and confirm its header
   with `source_probe`.
2. If the index can't be read, fall back to probing the last week's dated
   file names directly, newest first.

A found address is cached for `_RESOLVED_CACHE_TTL_S`. If a later lookup
fails, the last good address is still returned, since a build is kept for
about a week and one found a few hours ago is almost certainly still there.

Setting `OFFLINE_BASEMAP_SOURCE_URL` skips all of this and uses that address
as-is (for a self-hosted copy of a build, say).
"""

from __future__ import annotations

import datetime
import logging
import re
import time

import httpx
from backend.config import settings
from backend.services.offline_map import source_probe

logger = logging.getLogger(__name__)

# Our offline styles (fiord/osm-light.json) target the Protomaps
# Basemap v4 layer schema. A v5 build could rename layers and render blank.
_SUPPORTED_SCHEMA_MAJOR_VERSION = 4
_BUILD_KEY_PATTERN = re.compile(r"^\d{8}\.pmtiles$")
_INDEX_TIMEOUT_S = 10.0
# The index is ~60 entries (a few KB); anything far larger is not the index.
_INDEX_MAX_BYTES = 2_000_000
# How many of the newest matching builds to probe before giving up on the index.
_INDEX_CANDIDATES_TO_PROBE = 3
# Dated builds are kept about a week, so looking further back finds nothing.
_FALLBACK_DAYS_TO_PROBE = 8
_RESOLVED_CACHE_TTL_S = 6 * 60 * 60

# (monotonic timestamp it was found at, address)
_last_resolved: tuple[float, str] | None = None


async def resolve_basemap_source_url() -> str | None:
    """Return the planet build address to extract basemap tiles from, or None
    when no usable build can be found (the caller reports that as a 503).
    Never raises."""
    global _last_resolved

    if settings.offline_basemap_source_url:
        return settings.offline_basemap_source_url

    if _last_resolved is not None and time.monotonic() - _last_resolved[0] < _RESOLVED_CACHE_TTL_S:
        return _last_resolved[1]

    found_url = await _newest_build_from_index() or await _newest_build_by_date_probe()
    if found_url:
        _last_resolved = (time.monotonic(), found_url)
        return found_url

    if _last_resolved is not None:
        logger.warning("Couldn't refresh the Protomaps build address; reusing %s", _last_resolved[1])
        return _last_resolved[1]
    logger.warning("No usable Protomaps basemap build could be found")
    return None


def is_automatic() -> bool:
    """True when the build address is found automatically rather than set by the operator."""
    return not settings.offline_basemap_source_url


def _build_url(build_key: str) -> str:
    return settings.offline_basemap_builds_base_url.rstrip("/") + "/" + build_key


def _schema_major_version(version_text: object) -> int | None:
    if not isinstance(version_text, str):
        return None
    major_text = version_text.split(".", 1)[0]
    return int(major_text) if major_text.isdigit() else None


async def _newest_build_from_index() -> str | None:
    try:
        async with httpx.AsyncClient(timeout=_INDEX_TIMEOUT_S, follow_redirects=True) as client:
            response = await client.get(settings.offline_basemap_builds_index_url)
        if response.status_code != 200 or len(response.content) > _INDEX_MAX_BYTES:
            logger.warning("Protomaps build index unavailable (HTTP %s)", response.status_code)
            return None
        entries = response.json()
    except (httpx.HTTPError, ValueError) as error:
        logger.warning("Couldn't read the Protomaps build index: %s", error)
        return None
    if not isinstance(entries, list):
        return None

    matching_keys = sorted(
        (
            entry["key"]
            for entry in entries
            if isinstance(entry, dict)
            and isinstance(entry.get("key"), str)
            and _BUILD_KEY_PATTERN.match(entry["key"])
            and _schema_major_version(entry.get("version")) == _SUPPORTED_SCHEMA_MAJOR_VERSION
        ),
        reverse=True,
    )
    # The date-stamped keys sort chronologically, so the first is the newest.
    # The index can briefly list a build that is still uploading or was just
    # deleted, which is why a few are probed rather than trusting the first.
    for build_key in matching_keys[:_INDEX_CANDIDATES_TO_PROBE]:
        candidate_url = _build_url(build_key)
        if await source_probe.probe_basemap_source(candidate_url):
            return candidate_url
    return None


async def _newest_build_by_date_probe() -> str | None:
    """Fallback when the index is down. Probing a dated name can't check the
    schema version, so this only helps while v4 is still current."""
    today = datetime.datetime.now(datetime.UTC).date()
    for days_back in range(_FALLBACK_DAYS_TO_PROBE):
        build_date = today - datetime.timedelta(days=days_back)
        candidate_url = _build_url(build_date.strftime("%Y%m%d") + ".pmtiles")
        if await source_probe.probe_basemap_source(candidate_url):
            return candidate_url
    return None
