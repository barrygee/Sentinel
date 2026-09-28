"""Exact Web Mercator tile-count math and the byte-size estimate built on it.

Kept as small pure functions with no I/O so behaviour is easy to reason about
and (per the plan) mirrored in TypeScript for the frontend's live preview —
the two must never disagree, which is also why the calibration table itself is
served verbatim via ``GET /api/offline-map/status`` rather than re-derived.

``tile_x_for_longitude``/``tile_y_for_latitude`` are also reused by
:mod:`backend.services.offline_map.tile_tier_resolver` for its archive-bounds
quick-reject check, so they are public rather than internal to this module.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from backend.services.offline_map.tile_size_table import (
    BASEMAP_AVG_TILE_BYTES,
    TERRAIN_AVG_TILE_BYTES,
)

# Web Mercator's usable latitude range — MapLibre/Leaflet convention. Anything
# outside this is not representable by the projection at any zoom.
MAX_MERCATOR_LATITUDE = 85.05112878

MIN_MAX_ZOOM = 6
MAX_MAX_ZOOM = 14
# Terrain is only extracted (and only served) up to this zoom; MapLibre
# overzooms the DEM beyond it, same as the bundled uk-terrain.pmtiles today.
TERRAIN_MAX_ZOOM = 12


def tile_x_for_longitude(longitude_deg: float, zoom: int) -> int:
    """Web Mercator tile-x for a longitude at a zoom level, clamped to the grid."""
    grid_size = 2**zoom
    tile_x = int((longitude_deg + 180.0) / 360.0 * grid_size)
    return max(0, min(grid_size - 1, tile_x))


def tile_y_for_latitude(latitude_deg: float, zoom: int) -> int:
    """Web Mercator tile-y for a latitude at a zoom level, clamped to the grid."""
    latitude_rad = math.radians(max(-MAX_MERCATOR_LATITUDE, min(MAX_MERCATOR_LATITUDE, latitude_deg)))
    grid_size = 2**zoom
    tile_y = int((1.0 - math.asinh(math.tan(latitude_rad)) / math.pi) / 2.0 * grid_size)
    return max(0, min(grid_size - 1, tile_y))


def tile_count_at_zoom(west: float, south: float, east: float, north: float, zoom: int) -> int:
    """Exact count of tiles covering a bbox at one zoom level (west<east, south<north)."""
    x_min = tile_x_for_longitude(west, zoom)
    x_max = tile_x_for_longitude(east, zoom)
    # North is the *smaller* tile-y (Mercator y grows southward).
    y_min = tile_y_for_latitude(north, zoom)
    y_max = tile_y_for_latitude(south, zoom)
    return (x_max - x_min + 1) * (y_max - y_min + 1)


def tile_count_pyramid(west: float, south: float, east: float, north: float, max_zoom: int) -> int:
    """Exact tile count summed over the full pyramid z=0..max_zoom (inclusive)."""
    return sum(tile_count_at_zoom(west, south, east, north, zoom) for zoom in range(0, max_zoom + 1))


def _avg_bytes_for_zoom(table: dict[int, int], zoom: int) -> int:
    """Calibrated average bytes for a zoom, falling back to the nearest zoom below
    it (tables are always dense from 0, so this only matters if a table were ever
    sparse) and finally to 0 for an empty table."""
    if zoom in table:
        return table[zoom]
    zooms_below = [candidate_zoom for candidate_zoom in table if candidate_zoom <= zoom]
    if zooms_below:
        return table[max(zooms_below)]
    zooms_above = [candidate_zoom for candidate_zoom in table if candidate_zoom > zoom]
    return table[min(zooms_above)] if zooms_above else 0


@dataclass(frozen=True)
class AreaEstimate:
    """Result of estimating one bbox/depth/content selection."""

    basemap_tiles: int
    basemap_bytes: int
    terrain_tiles: int
    terrain_bytes: int

    @property
    def total_bytes(self) -> int:
        return self.basemap_bytes + self.terrain_bytes


def estimate_area(
    west: float,
    south: float,
    east: float,
    north: float,
    max_zoom: int,
    include_basemap: bool,
    include_terrain: bool,
) -> AreaEstimate:
    """Estimate tile counts and byte sizes for a bbox/depth/content selection.

    Mirrors the contract's ``POST /api/offline-map/estimate`` response shape
    (minus ``free_bytes``/``fits``, which the router adds from ``shutil.disk_usage``).
    """
    basemap_tiles = 0
    basemap_bytes = 0
    if include_basemap:
        basemap_tiles = tile_count_pyramid(west, south, east, north, max_zoom)
        basemap_bytes = sum(
            tile_count_at_zoom(west, south, east, north, zoom) * _avg_bytes_for_zoom(BASEMAP_AVG_TILE_BYTES, zoom)
            for zoom in range(0, max_zoom + 1)
        )

    terrain_tiles = 0
    terrain_bytes = 0
    if include_terrain:
        terrain_zoom = min(max_zoom, TERRAIN_MAX_ZOOM)
        terrain_tiles = tile_count_pyramid(west, south, east, north, terrain_zoom)
        terrain_bytes = sum(
            tile_count_at_zoom(west, south, east, north, zoom) * _avg_bytes_for_zoom(TERRAIN_AVG_TILE_BYTES, zoom)
            for zoom in range(0, terrain_zoom + 1)
        )

    return AreaEstimate(
        basemap_tiles=basemap_tiles,
        basemap_bytes=basemap_bytes,
        terrain_tiles=terrain_tiles,
        terrain_bytes=terrain_bytes,
    )
