"""Tests for backend.services.offline_map.tile_tier_resolver: tier precedence
(newest completed region first, then the base archive, else None/204),
covers() bbox/zoom quick-rejection, Content-Type/Content-Encoding derived from
the archive header, refusal of an unsupported compression, once-only logging
of a broken archive, and tiers_version bumping on add_region/remove_region.

Every archive here is a small, real PMTiles file built with the `pmtiles`
package's own writer (see offline_map_test_helpers) — never the multi-GB
bundled fixtures.
"""

from __future__ import annotations

import gzip
import logging

import pytest
from pmtiles.tile import Compression, TileType

from backend.config import settings
from backend.services.offline_map import tile_tier_resolver
from tests.backend.offline_map_test_helpers import (
    reset_tile_tier_resolver_singleton,
    write_test_pmtiles_archive,
)


@pytest.fixture(autouse=True)
def isolated_archives(tmp_path, monkeypatch):
    """Point both base-archive settings at empty placeholders under tmp_path
    (created fresh per test) and reset the resolver singleton before and
    after every test, so no test can see another's tiers or cached handles."""
    base_basemap = tmp_path / "base.pmtiles"
    base_terrain = tmp_path / "base-terrain.pmtiles"
    write_test_pmtiles_archive(base_basemap, {(0, 0, 0): b"base-basemap-0-0-0"})
    write_test_pmtiles_archive(base_terrain, {(0, 0, 0): b"base-terrain-0-0-0"})
    monkeypatch.setattr(settings, "offline_basemap_base_archive", str(base_basemap))
    monkeypatch.setattr(settings, "offline_terrain_base_archive", str(base_terrain))
    monkeypatch.setattr(
        tile_tier_resolver, "resolved_offline_tiles_dir", lambda: tmp_path
    )
    reset_tile_tier_resolver_singleton()
    yield tmp_path
    reset_tile_tier_resolver_singleton()


def _region_archive_path(tmp_path, region_id, *, terrain=False):
    suffix = ".terrain.pmtiles" if terrain else ".pmtiles"
    return tmp_path / f"{region_id}{suffix}"


class TestResolveBasemapTierPrecedence:
    def test_falls_back_to_the_base_archive_when_no_region_tier_exists(
        self, isolated_archives
    ):
        resolved = tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        assert resolved is not None
        assert gzip.decompress(resolved.data) == b"base-basemap-0-0-0"

    def test_returns_none_when_nothing_covers_the_requested_tile(
        self, isolated_archives
    ):
        # Zoom 5 tile far outside every archive's min/max zoom (both base
        # archives here only contain a single zoom-0 tile, per `isolated_archives`).
        assert tile_tier_resolver.resolver.resolve_basemap(5, 0, 0) is None

    def test_a_completed_region_shadows_the_base_archive_for_a_shared_tile(
        self, isolated_archives
    ):
        region_id = "11111111-1111-1111-1111-111111111111"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id),
            {(0, 0, 0): b"region-basemap-0-0-0"},
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        resolved = tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        assert gzip.decompress(resolved.data) == b"region-basemap-0-0-0"

    def test_newest_completed_region_wins_over_an_older_one(self, isolated_archives):
        older_id = "22222222-2222-2222-2222-222222222222"
        newer_id = "33333333-3333-3333-3333-333333333333"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, older_id), {(0, 0, 0): b"older"}
        )
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, newer_id), {(0, 0, 0): b"newer"}
        )
        # add_region inserts each as the new front of the list — the newer one
        # completing *after* the older is exactly this call order.
        tile_tier_resolver.resolver.add_region(
            older_id, include_basemap=True, include_terrain=False
        )
        tile_tier_resolver.resolver.add_region(
            newer_id, include_basemap=True, include_terrain=False
        )
        resolved = tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        assert gzip.decompress(resolved.data) == b"newer"

    def test_a_region_missing_the_specific_tile_falls_through_to_the_next_tier(
        self, isolated_archives
    ):
        # This region's header reports min_zoom=1/max_zoom=2 (derived from
        # the two zoom levels actually written) and its bbox spans the
        # requested zoom-1 tile — covers(1, 0, 0) is True — but (1, 0, 0)
        # itself was never stored, only (1, 1, 1) and (2, 0, 0) were.
        # get_tile() must return None for the untracked id, and the resolver
        # must fall through to the next tier rather than treat it as found.
        region_id = "44444444-4444-4444-4444-444444444444"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id),
            {(1, 1, 1): b"region-1-1-1", (2, 0, 0): b"region-2-0-0"},
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        handle = tile_tier_resolver.resolver._open(
            _region_archive_path(isolated_archives, region_id)
        )
        assert handle.covers(1, 0, 0) is True  # bbox/zoom check passes...
        assert (
            handle.get_tile(1, 0, 0) is None
        )  # ...but the tile itself was never stored
        # The base archive only has a zoom-0 tile, so it can't answer a
        # zoom-1 request either — the overall result is a clean miss (204),
        # proving the region's non-match didn't wrongly short-circuit as a hit.
        assert tile_tier_resolver.resolver.resolve_basemap(1, 0, 0) is None


class TestResolveTerrain:
    def test_terrain_tier_precedence_mirrors_basemap(self, isolated_archives):
        region_id = "55555555-5555-5555-5555-555555555555"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id, terrain=True),
            {(0, 0, 0): b"region-terrain-0-0-0"},
            tile_type=TileType.WEBP,
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=False, include_terrain=True
        )
        resolved = tile_tier_resolver.resolver.resolve_terrain(0, 0, 0)
        assert gzip.decompress(resolved.data) == b"region-terrain-0-0-0"
        assert resolved.content_type == "image/webp"

    def test_terrain_falls_back_to_base_terrain_archive(self, isolated_archives):
        resolved = tile_tier_resolver.resolver.resolve_terrain(0, 0, 0)
        assert gzip.decompress(resolved.data) == b"base-terrain-0-0-0"


class TestArchiveHandleClose:
    def test_close_swallows_an_oserror_from_the_underlying_file(
        self, isolated_archives, tmp_path
    ):
        region_id = "13131313-1313-1313-1313-131313131313"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id), {(0, 0, 0): b"x"}
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        handle = tile_tier_resolver.resolver._open(
            _region_archive_path(isolated_archives, region_id)
        )

        def raise_on_close():
            raise OSError("already closed")

        handle._file.close = raise_on_close
        handle.close()  # must not raise


class TestLeafDirectoryCache:
    """Directly exercises `_ArchiveHandle._leaf_directory`'s cache-hit and
    LRU-eviction branches. A real archive small enough to build quickly in a
    test never grows past a single root directory (PMTiles only spills into
    leaf directories once serialized entries exceed ~16KB), so the fixture
    here fakes `_get_bytes` to return an arbitrary valid serialized directory
    for any (offset, length) — the cache logic under test only cares about
    the (offset, length) key, never the directory's own contents.
    """

    def _make_handle(self, isolated_archives, tmp_path):
        region_id = "14141414-1414-1414-1414-141414141414"
        archive_path = _region_archive_path(isolated_archives, region_id)
        write_test_pmtiles_archive(archive_path, {(0, 0, 0): b"x"})
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        return tile_tier_resolver.resolver._open(archive_path)

    def test_a_second_lookup_of_the_same_offset_length_is_served_from_cache(
        self, isolated_archives, tmp_path
    ):
        from pmtiles.tile import Entry, serialize_directory

        handle = self._make_handle(isolated_archives, tmp_path)
        parse_call_count = 0
        real_get_bytes = handle._get_bytes

        def counting_get_bytes(offset, length):
            nonlocal parse_call_count
            parse_call_count += 1
            return serialize_directory([Entry(0, 0, 5, 1)])

        handle._get_bytes = counting_get_bytes
        first = handle._leaf_directory(1000, 25)
        second = handle._leaf_directory(1000, 25)
        assert first == second
        assert parse_call_count == 1  # the second call was served from the cache
        handle._get_bytes = real_get_bytes

    def test_cache_evicts_the_oldest_entry_once_it_exceeds_the_max_size(
        self, isolated_archives, tmp_path
    ):
        from pmtiles.tile import Entry, serialize_directory

        handle = self._make_handle(isolated_archives, tmp_path)
        handle._get_bytes = lambda offset, length: serialize_directory(
            [Entry(0, 0, 5, 1)]
        )

        max_entries = tile_tier_resolver._LEAF_CACHE_MAX_ENTRIES
        for index in range(max_entries):
            handle._leaf_directory(index, 1)
        assert len(handle._leaf_cache) == max_entries
        assert (0, 1) in handle._leaf_cache

        # One more distinct key pushes it over the limit — the oldest
        # (offset=0) must be evicted, not an arbitrary or the newest one.
        handle._leaf_directory(max_entries, 1)
        assert len(handle._leaf_cache) == max_entries
        assert (0, 1) not in handle._leaf_cache
        assert (max_entries, 1) in handle._leaf_cache


class TestGetTileLeafTraversal:
    """Directly exercises `_ArchiveHandle.get_tile`'s leaf-directory descent,
    faking the directory bytes returned for each level so both the
    "descend one leaf level then find the tile" branch and the "run out of
    the 4-level depth budget" defensive branch are reachable without an
    archive large enough to genuinely need multiple directory levels."""

    def _make_handle(self, isolated_archives, tmp_path):
        region_id = "15151515-1515-1515-1515-151515151515"
        archive_path = _region_archive_path(isolated_archives, region_id)
        write_test_pmtiles_archive(archive_path, {(0, 0, 0): b"x"})
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        return tile_tier_resolver.resolver._open(archive_path)

    def test_a_leaf_pointer_is_descended_into_and_the_tile_found_one_level_down(
        self, isolated_archives, tmp_path
    ):
        from pmtiles.tile import Entry, serialize_directory

        handle = self._make_handle(isolated_archives, tmp_path)
        target_tile_id = 42
        # Root directory has exactly one entry: a leaf pointer (run_length=0)
        # for the requested tile id.
        handle._root_directory = [Entry(target_tile_id, 0, 25, 0)]
        leaf_directory = [
            Entry(target_tile_id, 999, 7, 1)
        ]  # a real tile entry, one level down

        def fake_get_bytes(offset, length):
            return serialize_directory(leaf_directory)

        handle._get_bytes = fake_get_bytes
        # get_tile's final `return self._get_bytes(tile_data_offset + offset, length)`
        # is itself routed through the same faked `_get_bytes`, so the
        # returned bytes are simply the (fake) leaf directory bytes again —
        # what matters is that this returns *something* (not None), proving
        # the root's leaf pointer was followed and the tile entry found one
        # level down, rather than the lookup failing.
        result = handle.get_tile(*_zxy_for_tile_id(target_tile_id))
        assert result is not None

    def test_returns_none_after_exhausting_the_four_level_depth_budget(
        self, isolated_archives, tmp_path
    ):
        from pmtiles.tile import Entry, serialize_directory

        handle = self._make_handle(isolated_archives, tmp_path)
        target_tile_id = 7
        # Every level (root, and all 4 fake "leaf" reads) is itself another
        # leaf pointer for the same tile id — an artificial infinite redirect
        # chain, proving get_tile gives up after 4 levels rather than looping
        # forever or raising.
        handle._root_directory = [Entry(target_tile_id, 0, 25, 0)]
        handle._get_bytes = lambda offset, length: serialize_directory(
            [Entry(target_tile_id, 0, 25, 0)]
        )
        assert handle.get_tile(*_zxy_for_tile_id(target_tile_id)) is None


def _zxy_for_tile_id(tile_id: int) -> tuple[int, int, int]:
    from pmtiles.tile import tileid_to_zxy

    return tileid_to_zxy(tile_id)


class TestContentTypeAndEncoding:
    def test_mvt_gzip_archive_reports_protobuf_and_gzip_encoding(
        self, isolated_archives
    ):
        resolved = tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        assert resolved.content_type == "application/x-protobuf"
        assert resolved.content_encoding == "gzip"

    def test_uncompressed_archive_has_no_content_encoding_header(
        self, isolated_archives, tmp_path
    ):
        region_id = "66666666-6666-6666-6666-666666666666"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id),
            {(0, 0, 0): b"raw-bytes"},
            compression=Compression.NONE,
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        resolved = tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        assert resolved.data == b"raw-bytes"
        assert resolved.content_encoding is None

    def test_recognised_but_unsupported_compression_is_refused_by_our_own_check(
        self, isolated_archives, tmp_path, caplog
    ):
        # Compression.UNKNOWN is a real value pmtiles.tile.Compression parses
        # fine, but it is not one of the four this module knows how to map to
        # an HTTP Content-Encoding — _ArchiveHandle.__init__ must raise on it
        # itself (rather than silently guessing an encoding), which the
        # resolver then treats the same as any other unusable archive.
        region_id = "abcabcab-abca-abca-abca-abcabcabcabc"
        archive_path = _region_archive_path(isolated_archives, region_id)
        write_test_pmtiles_archive(
            archive_path,
            {(0, 0, 0): b"whatever"},
            compression=Compression.UNKNOWN,
            already_compressed=True,
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        with caplog.at_level(logging.ERROR):
            resolved = tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        assert resolved is not None
        assert gzip.decompress(resolved.data) == b"base-basemap-0-0-0"

    def test_unknown_compression_archive_is_refused_and_logged_once(
        self, isolated_archives, tmp_path, caplog
    ):
        region_id = "77777777-7777-7777-7777-777777777777"
        archive_path = _region_archive_path(isolated_archives, region_id)
        write_test_pmtiles_archive(
            archive_path, {(0, 0, 0): b"whatever"}, already_compressed=True
        )
        # Corrupt the header's compression byte in place to a raw value that
        # not even pmtiles.tile.Compression can coerce to an enum member —
        # a genuinely garbled/truncated archive, exercising the broad
        # `except Exception` catch-all in _ArchiveHandle.__init__ (as opposed
        # to the module's own explicit "recognised but unsupported" check
        # above).
        header_bytes = bytearray(archive_path.read_bytes())
        # Byte layout (pmtiles.tile.serialize_header): "PMTiles"(7) + version(1)
        # + 9 little-endian uint64 fields (72 bytes) + clustered(1) +
        # internal_compression(1) puts tile_compression at offset 98.
        header_bytes[98] = 99
        archive_path.write_bytes(bytes(header_bytes))

        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        with caplog.at_level(logging.ERROR):
            first_result = tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        # Still resolves — falls through to the base archive since the broken
        # region archive is skipped.
        assert first_result is not None
        assert gzip.decompress(first_result.data) == b"base-basemap-0-0-0"
        first_error_count = sum(
            "Failed to open PMTiles archive" in record.message
            for record in caplog.records
        )
        assert first_error_count == 1

        caplog.clear()
        with caplog.at_level(logging.ERROR):
            tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        # A second request for the same still-broken archive must not log again.
        second_error_count = sum(
            "Failed to open PMTiles archive" in record.message
            for record in caplog.records
        )
        assert second_error_count == 0

    def test_missing_archive_file_is_treated_as_not_covering_without_raising(
        self, isolated_archives
    ):
        region_id = "88888888-8888-8888-8888-888888888888"
        # add_region without ever writing the file at all (e.g. a race where
        # the row completed but somehow the file vanished).
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        resolved = tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        assert gzip.decompress(resolved.data) == b"base-basemap-0-0-0"


class TestCovers:
    def test_covers_rejects_a_zoom_outside_the_archives_own_range(
        self, isolated_archives, tmp_path
    ):
        # Header min_zoom/max_zoom are both 0, derived from the single zoom-0
        # tile actually written.
        region_id = "99999999-9999-9999-9999-999999999999"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id),
            {(0, 0, 0): b"x"},
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        handle = tile_tier_resolver.resolver._open(
            _region_archive_path(isolated_archives, region_id)
        )
        assert handle.covers(0, 0, 0) is True
        assert handle.covers(1, 0, 0) is False

    def test_covers_rejects_a_tile_outside_the_archives_lon_lat_bounds(
        self, isolated_archives, tmp_path
    ):
        # Two tiles at zoom 4 (so the header's max_zoom is 4, not 0) with a
        # tight ~1-degree bbox: a tile at the same zoom but far from lon/lat
        # 0,0 must be rejected on the bbox check specifically, not the zoom
        # check (both z0's (0,0,0) and z4's (4,7,7) — near the bbox centre —
        # are within [min_zoom, max_zoom], isolating the bbox branch).
        region_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id),
            {(0, 0, 0): b"x", (4, 7, 7): b"y"},
            min_lon=-1.0,
            min_lat=-1.0,
            max_lon=1.0,
            max_lat=1.0,
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        handle = tile_tier_resolver.resolver._open(
            _region_archive_path(isolated_archives, region_id)
        )
        assert handle.min_zoom == 0
        assert handle.max_zoom == 4
        # Zoom 4's grid tile far from lon/lat 0,0 (e.g. tile (15,15)) is
        # within the zoom range but outside this archive's ~1-degree bbox.
        assert handle.covers(4, 15, 15) is False
        # Sanity: a tile at the same zoom, near the bbox centre, *is* covered.
        assert handle.covers(4, 7, 7) is True


class TestDropStaleHandles:
    def test_a_cached_handle_for_a_removed_region_is_closed_and_evicted(
        self, isolated_archives, tmp_path
    ):
        region_id = "16161616-1616-1616-1616-161616161616"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id), {(0, 0, 0): b"x"}
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        # Force the handle to be opened and cached.
        tile_tier_resolver.resolver.resolve_basemap(0, 0, 0)
        archive_path = _region_archive_path(isolated_archives, region_id)
        assert archive_path in tile_tier_resolver.resolver._handles

        tile_tier_resolver.resolver.remove_region(region_id)
        assert archive_path not in tile_tier_resolver.resolver._handles


class TestRemoveRegionTerrainOnly:
    def test_removing_a_region_only_present_in_the_terrain_tier_is_reflected_there_only(
        self, isolated_archives, tmp_path
    ):
        region_id = "17171717-1717-1717-1717-171717171717"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id, terrain=True),
            {(0, 0, 0): b"x"},
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=False, include_terrain=True
        )
        assert region_id in tile_tier_resolver.resolver._terrain_entries
        assert region_id not in tile_tier_resolver.resolver._basemap_entries

        tile_tier_resolver.resolver.remove_region(region_id)
        assert region_id not in tile_tier_resolver.resolver._terrain_entries


class TestTiersVersion:
    def test_version_changes_when_a_region_is_added(self, isolated_archives):
        before = tile_tier_resolver.resolver.tiers_version
        region_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id), {(0, 0, 0): b"x"}
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        assert tile_tier_resolver.resolver.tiers_version != before

    def test_version_changes_when_a_region_is_removed(self, isolated_archives):
        region_id = "cccccccc-cccc-cccc-cccc-cccccccccccc"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id), {(0, 0, 0): b"x"}
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        mid = tile_tier_resolver.resolver.tiers_version
        tile_tier_resolver.resolver.remove_region(region_id)
        assert tile_tier_resolver.resolver.tiers_version != mid

    def test_removing_a_region_that_was_never_added_is_a_no_op(self, isolated_archives):
        before = tile_tier_resolver.resolver.tiers_version
        tile_tier_resolver.resolver.remove_region("never-existed")
        assert tile_tier_resolver.resolver.tiers_version == before

    def test_adding_the_same_region_id_twice_does_not_duplicate_the_tier_entry(
        self, isolated_archives
    ):
        region_id = "dddddddd-dddd-dddd-dddd-dddddddddddd"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id), {(0, 0, 0): b"x"}
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        assert tile_tier_resolver.resolver._basemap_entries.count(region_id) == 1


class TestSetTiersAndRefreshTiers:
    def test_set_tiers_replaces_both_lists_and_bumps_the_version(
        self, isolated_archives, tmp_path
    ):
        basemap_id = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
        terrain_id = "ffffffff-ffff-ffff-ffff-ffffffffffff"
        write_test_pmtiles_archive(
            _region_archive_path(tmp_path, basemap_id), {(0, 0, 0): b"x"}
        )
        write_test_pmtiles_archive(
            _region_archive_path(tmp_path, terrain_id, terrain=True), {(0, 0, 0): b"y"}
        )
        before = tile_tier_resolver.resolver.tiers_version
        tile_tier_resolver.resolver.set_tiers([basemap_id], [terrain_id])
        assert tile_tier_resolver.resolver.tiers_version != before
        assert tile_tier_resolver.resolver._basemap_entries == [basemap_id]
        assert tile_tier_resolver.resolver._terrain_entries == [terrain_id]

    async def test_refresh_tiers_rebuilds_from_the_database(
        self, isolated_archives, tmp_path, monkeypatch
    ):
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool

        from backend.database import Base
        from backend.services.offline_map import region_repository

        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        session_factory = sessionmaker(
            bind=engine, class_=AsyncSession, expire_on_commit=False
        )

        async with session_factory() as session:
            region = await region_repository.create_region(
                session,
                region_repository.NewRegionRequest(
                    label="Refresh Region",
                    west=0.0,
                    south=0.0,
                    east=1.0,
                    north=1.0,
                    max_zoom=10,
                    include_basemap=True,
                    include_terrain=False,
                    bytes_estimated=1,
                    tiles_estimated=1,
                    source_url="https://example.com/build.pmtiles",
                ),
            )
            await region_repository.update_region(
                session, region.id, status="complete", completed_at=1000
            )

            await tile_tier_resolver.refresh_tiers(session)
        assert tile_tier_resolver.resolver._basemap_entries == [region.id]
        await engine.dispose()


class TestStatus:
    def test_basemap_status_reports_available_and_the_deepest_max_zoom(
        self, isolated_archives
    ):
        # The base archive fixture in `isolated_archives` only contains a
        # single zoom-0 tile, so its header max_zoom is 0.
        available, max_zoom = tile_tier_resolver.resolver.basemap_status()
        assert available is True
        assert max_zoom == 0

    def test_terrain_status_reports_available_and_max_zoom(self, isolated_archives):
        available, max_zoom = tile_tier_resolver.resolver.terrain_status()
        assert available is True
        assert max_zoom == 0

    def test_basemap_status_max_zoom_is_the_deepest_across_all_tiers(
        self, isolated_archives
    ):
        region_id = "12121212-1212-1212-1212-121212121212"
        write_test_pmtiles_archive(
            _region_archive_path(isolated_archives, region_id),
            {(0, 0, 0): b"x", (3, 0, 0): b"y"},
        )
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=True, include_terrain=False
        )
        available, max_zoom = tile_tier_resolver.resolver.basemap_status()
        assert available is True
        assert max_zoom == 3  # deeper than the base archive's max_zoom of 0

    def test_status_reports_unavailable_when_the_base_archive_does_not_exist(
        self, tmp_path, monkeypatch
    ):
        missing_basemap = tmp_path / "missing.pmtiles"
        missing_terrain = tmp_path / "missing-terrain.pmtiles"
        monkeypatch.setattr(
            settings, "offline_basemap_base_archive", str(missing_basemap)
        )
        monkeypatch.setattr(
            settings, "offline_terrain_base_archive", str(missing_terrain)
        )
        monkeypatch.setattr(
            tile_tier_resolver, "resolved_offline_tiles_dir", lambda: tmp_path
        )
        reset_tile_tier_resolver_singleton()
        available, max_zoom = tile_tier_resolver.resolver.basemap_status()
        assert available is False
        assert max_zoom == 0
