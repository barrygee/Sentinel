"""Tests for backend.services.offline_map.estimator: exact Web Mercator tile
counts and the calibrated byte-size estimate built on them."""

from __future__ import annotations

from backend.services.offline_map.estimator import (
    MAX_MERCATOR_LATITUDE,
    TERRAIN_MAX_ZOOM,
    AreaEstimate,
    _avg_bytes_for_zoom,
    estimate_area,
    tile_count_at_zoom,
    tile_count_pyramid,
    tile_x_for_longitude,
    tile_y_for_latitude,
)


class TestTileXForLongitude:
    def test_zoom_zero_always_yields_the_single_tile(self):
        assert tile_x_for_longitude(-180.0, 0) == 0
        assert tile_x_for_longitude(0.0, 0) == 0
        assert tile_x_for_longitude(179.9, 0) == 0

    def test_east_edge_180_degrees_is_clamped_into_the_grid(self):
        # 180.0 maps to grid_size (out of range by one) before clamping; the
        # clamp must pull it back to the last valid column, not overflow.
        zoom = 4
        grid_size = 2**zoom
        assert tile_x_for_longitude(180.0, zoom) == grid_size - 1

    def test_west_edge_negative_180_is_the_first_column(self):
        assert tile_x_for_longitude(-180.0, 5) == 0

    def test_middle_longitude_is_the_middle_column(self):
        # 0 degrees longitude is exactly the midpoint of the grid at any zoom.
        zoom = 6
        grid_size = 2**zoom
        assert tile_x_for_longitude(0.0, zoom) == grid_size // 2


class TestTileYForLatitude:
    def test_equator_is_the_middle_row(self):
        zoom = 6
        grid_size = 2**zoom
        assert tile_y_for_latitude(0.0, zoom) == grid_size // 2

    def test_north_pole_clamped_to_max_mercator_latitude_is_the_first_row(self):
        assert tile_y_for_latitude(MAX_MERCATOR_LATITUDE, 5) == 0

    def test_south_edge_minus_85_0511_is_clamped_into_the_last_row(self):
        zoom = 5
        grid_size = 2**zoom
        assert tile_y_for_latitude(-MAX_MERCATOR_LATITUDE, zoom) == grid_size - 1

    def test_latitude_beyond_the_mercator_limit_is_clamped_not_out_of_range(self):
        # A caller could still hand this function an out-of-projection value
        # (e.g. before Pydantic's own clamp is applied) — it must never index
        # outside the tile grid.
        zoom = 4
        grid_size = 2**zoom
        assert tile_y_for_latitude(89.9, zoom) == 0
        assert tile_y_for_latitude(-89.9, zoom) == grid_size - 1


class TestTileCountAtZoom:
    def test_whole_world_at_zoom_zero_is_exactly_one_tile(self):
        assert tile_count_at_zoom(-180.0, -85.0, 180.0, 85.0, 0) == 1

    def test_whole_world_at_zoom_two_is_the_full_16_tile_grid(self):
        assert tile_count_at_zoom(-180.0, -85.0, 180.0, 85.0, 2) == 16

    def test_a_bbox_confined_to_one_tile_counts_as_one(self):
        # A tiny box well inside a single zoom-3 tile.
        assert tile_count_at_zoom(10.0, 10.0, 10.1, 10.1, 3) == 1

    def test_a_bbox_spanning_two_tiles_horizontally_counts_two(self):
        # Zoom 1 has a 2x2 grid split at the equator/prime-meridian; a box
        # straddling the vertical split but not the horizontal one spans two
        # tiles in x, one in y.
        assert tile_count_at_zoom(-10.0, 1.0, 10.0, 2.0, 1) == 2


class TestTileCountPyramid:
    def test_sums_every_zoom_from_zero_through_max_zoom_inclusive(self):
        west, south, east, north, max_zoom = -180.0, -85.0, 180.0, 85.0, 2
        expected = sum(
            tile_count_at_zoom(west, south, east, north, zoom)
            for zoom in range(max_zoom + 1)
        )
        assert tile_count_pyramid(west, south, east, north, max_zoom) == expected

    def test_max_zoom_zero_is_just_the_single_zoom_zero_tile(self):
        assert tile_count_pyramid(-180.0, -85.0, 180.0, 85.0, 0) == 1


class TestAvgBytesForZoom:
    def test_returns_the_exact_value_when_the_zoom_is_present(self):
        assert _avg_bytes_for_zoom({0: 100, 1: 200}, 1) == 200

    def test_falls_back_to_the_nearest_lower_zoom_when_missing(self):
        assert _avg_bytes_for_zoom({0: 100, 2: 300}, 1) == 100

    def test_falls_back_to_the_nearest_higher_zoom_when_nothing_lower_exists(self):
        assert _avg_bytes_for_zoom({5: 500, 7: 700}, 2) == 500

    def test_returns_zero_for_a_completely_empty_table(self):
        assert _avg_bytes_for_zoom({}, 3) == 0


class TestEstimateArea:
    def test_both_includes_false_produces_all_zero_estimate(self):
        estimate = estimate_area(
            -1.0, -1.0, 1.0, 1.0, 10, include_basemap=False, include_terrain=False
        )
        assert estimate == AreaEstimate(
            basemap_tiles=0, basemap_bytes=0, terrain_tiles=0, terrain_bytes=0
        )
        assert estimate.total_bytes == 0

    def test_basemap_only_leaves_terrain_fields_zero(self):
        estimate = estimate_area(
            -1.0, -1.0, 1.0, 1.0, 6, include_basemap=True, include_terrain=False
        )
        assert estimate.basemap_tiles > 0
        assert estimate.basemap_bytes > 0
        assert estimate.terrain_tiles == 0
        assert estimate.terrain_bytes == 0

    def test_terrain_only_leaves_basemap_fields_zero(self):
        estimate = estimate_area(
            -1.0, -1.0, 1.0, 1.0, 6, include_basemap=False, include_terrain=True
        )
        assert estimate.basemap_tiles == 0
        assert estimate.basemap_bytes == 0
        assert estimate.terrain_tiles > 0
        assert estimate.terrain_bytes > 0

    def test_max_zoom_five_pyramid_matches_direct_tile_count(self):
        west, south, east, north, max_zoom = 5.0, 50.0, 6.0, 51.0, 5
        estimate = estimate_area(
            west,
            south,
            east,
            north,
            max_zoom,
            include_basemap=True,
            include_terrain=False,
        )
        assert estimate.basemap_tiles == tile_count_pyramid(
            west, south, east, north, max_zoom
        )

    def test_max_zoom_fifteen_worth_of_depth_is_still_computed_correctly_at_the_cap(
        self,
    ):
        # The router clamps max_zoom to <= 14 via Pydantic; the estimator
        # itself has no opinion, so a caller passing MAX_MAX_ZOOM (14) must
        # still produce a sane, strictly-increasing-with-depth result.
        west, south, east, north = 5.0, 50.0, 6.0, 51.0
        shallow = estimate_area(
            west, south, east, north, 6, include_basemap=True, include_terrain=False
        )
        deep = estimate_area(
            west, south, east, north, 14, include_basemap=True, include_terrain=False
        )
        assert deep.basemap_tiles > shallow.basemap_tiles
        assert deep.basemap_bytes > shallow.basemap_bytes

    def test_terrain_is_capped_at_terrain_max_zoom_regardless_of_a_deeper_max_zoom(
        self,
    ):
        west, south, east, north = 5.0, 50.0, 6.0, 51.0
        at_cap = estimate_area(
            west,
            south,
            east,
            north,
            TERRAIN_MAX_ZOOM,
            include_basemap=False,
            include_terrain=True,
        )
        beyond_cap = estimate_area(
            west,
            south,
            east,
            north,
            TERRAIN_MAX_ZOOM + 2,
            include_basemap=False,
            include_terrain=True,
        )
        # Extra basemap depth beyond TERRAIN_MAX_ZOOM must not add any more
        # terrain tiles/bytes — both requests should terrain-estimate identically.
        assert beyond_cap.terrain_tiles == at_cap.terrain_tiles
        assert beyond_cap.terrain_bytes == at_cap.terrain_bytes

    def test_total_bytes_is_the_sum_of_basemap_and_terrain_bytes(self):
        estimate = estimate_area(
            -1.0, -1.0, 1.0, 1.0, 6, include_basemap=True, include_terrain=True
        )
        assert estimate.total_bytes == estimate.basemap_bytes + estimate.terrain_bytes
