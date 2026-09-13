"""Charted shipping routes for the Sea map, from OpenStreetMap via Overpass.

The Sea map draws the *route structure* of a chart — traffic separation
lanes, zones and boundaries, roundabouts, precautionary areas, inshore traffic
zones, two-way / recommended / deep-water routes and fairways — as plain lines
and fills, rather than the full seamark overlay (lights, buoys, fishing areas)
that a raster chart layer would bring with it.

OpenStreetMap carries these as ``seamark:type=*`` ways and relations. They are
fetched through Overpass one coarse grid cell at a time and cached in SQLite
for a long time (a separation scheme changes by IMO resolution, not by the
week), so a view that has been seen once costs nothing and Overpass — a shared
public service with strict rate limits — is asked for each cell exactly once.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
from typing import Any

import httpx
from backend.cache import now_ms
from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.models import SeaLaneCache
from backend.services.upstream_rate_limit import MinimumIntervalRateLimiter
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Route-structure seamark types, and whether each is drawn as an area.
ROUTE_TYPES: dict[str, bool] = {
    "separation_lane": True,
    "separation_zone": True,
    "separation_boundary": False,
    "separation_line": False,
    "separation_roundabout": True,
    "separation_crossing": True,
    "precautionary_area": True,
    "inshore_traffic_zone": True,
    "two-way_route": True,
    "recommended_route": False,
    "recommended_track": False,
    "deep_water_route": True,
    "fairway": True,
}
_TYPE_PATTERN = "^(" + "|".join(ROUTE_TYPES) + ")$"

# Overpass is a shared service: one outbound query at a time, spaced out.
_overpass_limiter = MinimumIntervalRateLimiter(settings.sea_lanes_min_request_interval_ms / 1000)


def grid_cells(south: float, west: float, north: float, east: float) -> list[tuple[int, int]]:
    """The coarse grid cells (lat index, lon index) a bbox touches."""
    size = settings.sea_lanes_cell_deg
    lat_lo, lat_hi = math.floor(south / size), math.floor(min(north, 89.999) / size)
    lon_lo, lon_hi = math.floor(west / size), math.floor(min(east, 179.999) / size)
    return [(lat, lon) for lat in range(lat_lo, lat_hi + 1) for lon in range(lon_lo, lon_hi + 1)]


def cell_bbox(cell: tuple[int, int]) -> tuple[float, float, float, float]:
    """``(south, west, north, east)`` of a grid cell."""
    size = settings.sea_lanes_cell_deg
    return cell[0] * size, cell[1] * size, (cell[0] + 1) * size, (cell[1] + 1) * size


def build_query(south: float, west: float, north: float, east: float) -> str:
    """The Overpass QL for every route-structure seamark inside a bbox."""
    bbox = f"({south:.4f},{west:.4f},{north:.4f},{east:.4f})"
    return (
        f"[out:json][timeout:{settings.sea_lanes_overpass_timeout_s}];"
        f'(way["seamark:type"~"{_TYPE_PATTERN}"]{bbox};'
        f'relation["seamark:type"~"{_TYPE_PATTERN}"]{bbox};);'
        "out geom;"
    )


def overpass_to_features(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Turn an ``out geom`` Overpass answer into GeoJSON features.

    Ways become a Polygon when their type is an area and the way is closed,
    else a LineString. Relations are flattened to one feature per member way
    that carries geometry — a multipolygon's outer ring drawn as its outline is
    exactly what the map wants, and it sidesteps ring assembly entirely.
    """
    features: list[dict[str, Any]] = []
    for element in payload.get("elements", []):
        tags = element.get("tags") or {}
        seamark_type = tags.get("seamark:type", "")
        if seamark_type not in ROUTE_TYPES:
            continue
        properties = {
            "kind": seamark_type,
            "area": ROUTE_TYPES[seamark_type],
            "name": tags.get("seamark:name") or tags.get("name") or "",
            "osmId": f"{element.get('type')}/{element.get('id')}",
        }
        if element.get("type") == "way":
            feature = _way_feature(element.get("geometry") or [], properties)
            if feature:
                features.append(feature)
        elif element.get("type") == "relation":
            for member in element.get("members", []):
                if member.get("type") != "way":
                    continue
                feature = _way_feature(member.get("geometry") or [], {**properties, "role": member.get("role", "")})
                if feature:
                    features.append(feature)
    return features


def _way_feature(geometry: list[dict[str, Any]], properties: dict[str, Any]) -> dict[str, Any] | None:
    coordinates = [[point["lon"], point["lat"]] for point in geometry if "lat" in point and "lon" in point]
    if len(coordinates) < 2:
        return None
    closed = len(coordinates) >= 4 and coordinates[0] == coordinates[-1]
    if properties["area"] and closed:
        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [coordinates]},
            "properties": properties,
        }
    return {"type": "Feature", "geometry": {"type": "LineString", "coordinates": coordinates}, "properties": properties}


async def fetch_cell(cell: tuple[int, int]) -> list[dict[str, Any]]:
    """Ask Overpass for one grid cell's route features (rate limited)."""
    await _overpass_limiter.acquire("overpass", max_wait_seconds=settings.sea_lanes_overpass_timeout_s)
    query = build_query(*cell_bbox(cell))
    async with httpx.AsyncClient(timeout=settings.sea_lanes_overpass_timeout_s + 10) as client:
        response = await client.post(
            settings.sea_lanes_overpass_url,
            data={"data": query},
            # Overpass operators ask for an identifiable client.
            headers={"User-Agent": "Sentinel/1.0 (+https://github.com/barrygee/Sentinel)"},
        )
        response.raise_for_status()
        return overpass_to_features(response.json())


# Cells whose Overpass fetch is running right now, so a burst of requests for
# the same view queues one fetch per cell rather than one per request.
_in_flight: set[str] = set()


def cell_key(cell: tuple[int, int]) -> str:
    return f"{cell[0]}_{cell[1]}"


async def _fetch_and_store(cell: tuple[int, int]) -> None:
    """Background fetch of one cell into ``sea_lane_cache``; failures are logged
    and the cell is left for the next request to try again."""
    key = cell_key(cell)
    try:
        cell_features = await fetch_cell(cell)
    except Exception as exc:  # noqa: BLE001 — any upstream failure just leaves the cell for next time
        logger.warning("Sea: shipping-lane fetch for cell %s failed: %s", key, exc)
        return
    finally:
        _in_flight.discard(key)
    payload = json.dumps(cell_features)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(SeaLaneCache).where(SeaLaneCache.cell == key))
        row = result.scalar_one_or_none()
        if row is None:
            db.add(SeaLaneCache(cell=key, payload=payload, fetched_at=now_ms()))
        else:
            row.payload = payload
            row.fetched_at = now_ms()
        await db.commit()
    logger.info("Sea: cached %d shipping-route features for cell %s", len(cell_features), key)


async def lanes_for_bbox(south: float, west: float, north: float, east: float) -> dict[str, Any]:
    """Route features for a bbox as a GeoJSON FeatureCollection, cell-cached.

    Answers at once with every cell already in ``sea_lane_cache``. Cells that
    are missing (or past the TTL — their stale rows are still served) are
    fetched in the background, one task per cell, and ``partial`` tells the
    map to ask again shortly. Overpass is slow and shared, so a first look at a
    new stretch of coast fills in over a few seconds rather than blocking.
    """
    cells = grid_cells(south, west, north, east)
    if len(cells) > settings.sea_lanes_max_cells:
        return {"type": "FeatureCollection", "features": [], "partial": True, "tooWide": True}
    features: list[dict[str, Any]] = []
    partial = False
    current = now_ms()
    async with AsyncSessionLocal() as db:
        for cell in cells:
            key = cell_key(cell)
            result = await db.execute(select(SeaLaneCache).where(SeaLaneCache.cell == key))
            row = result.scalar_one_or_none()
            if row is not None:
                features.extend(json.loads(row.payload))
            if row is None or row.fetched_at + settings.sea_lanes_ttl_ms <= current:
                partial = True
                if key not in _in_flight:
                    _in_flight.add(key)
                    asyncio.create_task(_fetch_and_store(cell))
    return {"type": "FeatureCollection", "features": features, "partial": partial, "tooWide": False}
