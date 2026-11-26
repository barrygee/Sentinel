"""The globe's combined feed (ADR 0009).

Endpoint:
  GET /api/globe/objects?layers=air,space,sea,aprs&bbox=s,w,n,e&lat=&lon=&satellites=25544,…

The browser polls this one URL; the globe asks each owning section for its
snapshot over NATS (`sentinel_globe.services.layer_feeds`), only for the layers
asked for, in parallel, through a short per-layer cache
(`sentinel_globe.services.snapshot_cache`). One layer's failure is reported in
that layer and never fails the response.

Every query parameter is validated here, before anything is sent on: layers
from an allow-list, bbox and lat/lon as finite numbers in range, satellites as
at most `SPACE_MAX_SATELLITES` distinct NORAD numbers. A bad request is a 400
with a fixed message.
"""

from __future__ import annotations

import asyncio
import math
from collections.abc import Awaitable, Callable
from typing import Annotated, get_args

from backend.cache import now_ms
from backend.platform.globe_snapshots import SPACE_MAX_SATELLITES
from fastapi import APIRouter, HTTPException, Query

from sentinel_globe.schemas import GlobeObjectsResponse, LayerId, LayerResult
from sentinel_globe.services import layer_feeds
from sentinel_globe.services.snapshot_cache import SnapshotCache

router = APIRouter(prefix="/api/globe", tags=["globe"])

ALL_LAYERS: tuple[LayerId, ...] = get_args(LayerId)
"""Every layer the feed knows, in the order the response lists them."""

_MAX_QUERY_LENGTH = 256
"""Longer than any valid layers, bbox or satellites value; a longer one is refused before parsing."""

_BBOX_STEP_DEGREES = 0.1
"""The view bbox is widened outward to this grid, so tabs looking at nearly the same area share one request."""

_LAYER_CACHES: dict[LayerId, SnapshotCache[LayerResult]] = {
    "air": SnapshotCache(ttl_seconds=10.0),
    "sea": SnapshotCache(ttl_seconds=10.0),
    "aprs": SnapshotCache(ttl_seconds=5.0),
    "space": SnapshotCache(ttl_seconds=5.0),
}
"""One cache per layer, with the spec's TTLs: Air and Sea change no faster than their own refresh."""


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=400, detail=message)


def _parse_layers(raw: str | None) -> tuple[LayerId, ...]:
    """`air,space,...` → the requested layers in canonical order; all when omitted."""
    if raw is None:
        return ALL_LAYERS
    names = {name.strip() for name in raw.split(",") if name.strip()}
    unknown = names - set(ALL_LAYERS)
    if unknown:
        raise _bad_request(f"layers must be from: {','.join(ALL_LAYERS)}")
    return tuple(layer for layer in ALL_LAYERS if layer in names)


def _parse_bbox(raw: str | None) -> layer_feeds.Bbox | None:
    """`south,west,north,east` in degrees, widened outward to `_BBOX_STEP_DEGREES`; None when omitted.

    West greater than east is a box across the antimeridian, as Sea's own
    query allows.
    """
    if raw is None or raw.strip() == "":
        return None
    parts = raw.split(",")
    if len(parts) != 4:
        raise _bad_request("bbox must be south,west,north,east")
    try:
        south, west, north, east = (float(part) for part in parts)
    except ValueError as error:
        raise _bad_request("bbox values must be numbers") from error
    if not all(math.isfinite(value) for value in (south, west, north, east)):
        raise _bad_request("bbox values must be numbers")
    if not (-90 <= south <= north <= 90) or abs(west) > 180 or abs(east) > 180:
        raise _bad_request("bbox out of range")
    step = _BBOX_STEP_DEGREES
    return (
        max(-90.0, round(math.floor(south / step) * step, 1)),
        max(-180.0, round(math.floor(west / step) * step, 1)),
        min(90.0, round(math.ceil(north / step) * step, 1)),
        min(180.0, round(math.ceil(east / step) * step, 1)),
    )


def _parse_satellites(raw: str | None) -> tuple[str, ...]:
    """`25544,…` → at most `SPACE_MAX_SATELLITES` distinct NORAD numbers, in the order given."""
    if raw is None or raw.strip() == "":
        return ()
    parts = [part.strip() for part in raw.split(",")]
    if not all(part.isascii() and part.isdigit() and len(part) <= 9 for part in parts):
        raise _bad_request("satellites must be NORAD catalogue numbers")
    # Normalised as ints, so "025544" and "25544" are the same satellite.
    norad_ids = [str(int(part)) for part in parts]
    if len(norad_ids) > SPACE_MAX_SATELLITES:
        raise _bad_request(f"satellites allows at most {SPACE_MAX_SATELLITES} ids")
    if len(set(norad_ids)) != len(norad_ids):
        raise _bad_request("satellites must not repeat")
    return tuple(norad_ids)


def _parse_home(lat: float | None, lon: float | None) -> tuple[float | None, float | None]:
    """Home as both coordinates or neither; rounded to 4 decimals (about 10 m), as Air keys its cache."""
    if (lat is None) != (lon is None):
        raise _bad_request("lat and lon must be given together")
    if lat is None or lon is None:
        return None, None
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise _bad_request("lat and lon must be numbers")
    return round(lat, 4), round(lon, 4)


@router.get("/objects", response_model=GlobeObjectsResponse)
async def get_globe_objects(
    layers: Annotated[str | None, Query(max_length=_MAX_QUERY_LENGTH, description="air,space,sea,aprs")] = None,
    bbox: Annotated[str | None, Query(max_length=_MAX_QUERY_LENGTH, description="south,west,north,east")] = None,
    lat: Annotated[float | None, Query(ge=-90, le=90, description="Home latitude (aircraft centre)")] = None,
    lon: Annotated[float | None, Query(ge=-180, le=180, description="Home longitude (aircraft centre)")] = None,
    satellites: Annotated[str | None, Query(max_length=_MAX_QUERY_LENGTH, description="NORAD ids")] = None,
) -> GlobeObjectsResponse:
    """Every requested layer's live objects, each with its own status.

    `air` needs `lat`/`lon` (home: the same centre as Air's alerts, so it shares
    Air's cached snapshot); `sea` uses `bbox` (the view; everywhere when
    omitted, capped); `space` uses `satellites` (and `lat`/`lon` for look
    angles); `aprs` takes nothing.
    """
    requested = _parse_layers(layers)
    view_bbox = _parse_bbox(bbox)
    home_lat, home_lon = _parse_home(lat, lon)
    norad_ids = _parse_satellites(satellites)

    loaders: dict[LayerId, tuple[object, Callable[[], Awaitable[LayerResult]]]] = {
        "air": ((home_lat, home_lon), lambda: layer_feeds.load_air(home_lat, home_lon)),
        "space": ((norad_ids, home_lat, home_lon), lambda: layer_feeds.load_space(norad_ids, home_lat, home_lon)),
        "sea": (view_bbox, lambda: layer_feeds.load_sea(view_bbox)),
        "aprs": ((), layer_feeds.load_aprs),
    }
    results = await asyncio.gather(
        *(_LAYER_CACHES[layer].get_or_load(loaders[layer][0], loaders[layer][1]) for layer in requested)
    )
    return GlobeObjectsResponse(generatedAtMs=now_ms(), layers=dict(zip(requested, results, strict=True)))
