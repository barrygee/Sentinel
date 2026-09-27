"""Tests for backend.scripts.calibrate_tile_sizes: the one-off calibration
script that measures average stored-tile byte sizes from the bundled PMTiles
archives and writes tile_size_table.py.

Covers every function (`_walk`, `_calibrate`, `main`) against small, real
PMTiles fixtures built with the `pmtiles` package's own writer — never the
multi-GB bundled archives. `main()`'s module-level path constants
(`BASEMAP_ARCHIVE`, `TERRAIN_ARCHIVE`, `OUTPUT_PATH`) are monkeypatched to
tmp_path locations so nothing here ever touches the real bundled archives or
overwrites the committed tile_size_table.py.
"""

from __future__ import annotations

import pytest
from pmtiles.tile import Compression

from backend.scripts import calibrate_tile_sizes
from tests.backend.offline_map_test_helpers import write_test_pmtiles_archive


class TestCalibrate:
    def test_unique_average_is_bytes_per_distinct_stored_entry_not_addressed_tile(
        self, tmp_path
    ):
        # Two tiles at zoom 0 and 1 with DIFFERENT content (no dedup): unique
        # and addressed averages should be identical here (each entry has
        # run_length 1, i.e. one addressed tile per stored entry).
        archive_path = tmp_path / "sample.pmtiles"
        write_test_pmtiles_archive(
            archive_path,
            {(0, 0, 0): b"a" * 100, (1, 0, 0): b"b" * 50},
            already_compressed=True,
            compression=Compression.NONE,
        )
        unique_avg, addressed_avg = calibrate_tile_sizes._calibrate(archive_path)
        assert unique_avg == {0: 100, 1: 50}
        assert addressed_avg == {0: 100, 1: 50}

    def test_a_run_length_entry_is_counted_once_per_directory_entry_but_weighted_for_addressed(
        self, tmp_path
    ):
        # Four zoom-1 tiles: three share identical ("ocean") content, one is
        # distinct ("land"). PMTiles' own tile-id order (a Hilbert curve, not
        # row-major) is (0,0)=1, (0,1)=2, (1,1)=3, (1,0)=4 for this quadrant,
        # so two of the three "ocean" tiles (ids 1 and 2) land consecutively
        # and merge into ONE directory entry with run_length=2; "land" (id 3)
        # is its own entry; the third "ocean" tile (id 4) is no longer
        # adjacent to the merged run (the "land" entry sits between them in
        # tile-id order) so it becomes a THIRD entry that separately points
        # back at the same underlying stored bytes (offset dedup) rather than
        # extending the run. Per the module's own docstring, "unique" is
        # averaged **per directory entry** (three of them here), while
        # "addressed" is averaged per addressed tile id (four of them) —
        # this is exactly the case that makes the two numbers genuinely
        # differ, which is the whole reason the estimator uses "unique".
        archive_path = tmp_path / "dedup.pmtiles"
        small_repeated_content = b"ocean" * 2  # 10 bytes
        large_unique_content = b"land" * 250  # 1000 bytes
        write_test_pmtiles_archive(
            archive_path,
            {
                (1, 0, 0): small_repeated_content,
                (1, 0, 1): small_repeated_content,
                (1, 1, 1): large_unique_content,
                (1, 1, 0): small_repeated_content,
            },
            already_compressed=True,
            compression=Compression.NONE,
        )
        unique_avg, addressed_avg = calibrate_tile_sizes._calibrate(archive_path)
        # Three directory entries: lengths [10, 1000, 10] -> mean 340.
        assert unique_avg[1] == round((10 + 1000 + 10) / 3)
        # Four addressed tiles: bytes 10*2 (the run) + 1000*1 + 10*1, over 4 ids.
        assert addressed_avg[1] == round((10 * 2 + 1000 * 1 + 10 * 1) / 4)
        assert unique_avg[1] != addressed_avg[1]

    def test_zero_distinct_entries_at_a_zoom_is_impossible_but_division_never_raises(
        self, tmp_path
    ):
        # Sanity: a single-tile archive never divides by zero.
        archive_path = tmp_path / "one_tile.pmtiles"
        write_test_pmtiles_archive(
            archive_path,
            {(0, 0, 0): b"solo"},
            already_compressed=True,
            compression=Compression.NONE,
        )
        unique_avg, _addressed_avg = calibrate_tile_sizes._calibrate(archive_path)
        assert unique_avg == {0: len(b"solo")}


class TestWalkMultiLevelDirectory:
    def test_walk_descends_into_a_synthetic_leaf_directory(self):
        # A real archive needs an impractically large tile count before
        # PMTiles' own directory-size threshold (~16KB of serialized root
        # bytes) forces a leaf level — its delta/varint encoding is compact
        # enough that even 1200 real, distinctly-sized entries still fit in
        # a 145-byte root directory. So this synthesises a minimal two-level
        # tree directly (root -> one leaf pointer -> one real tile entry),
        # using the same `Entry`/`serialize_directory` primitives the
        # `pmtiles` package itself uses, and a `get_bytes` stand-in that
        # returns the right serialized bytes for each of the two offsets
        # `_walk` is expected to read from.
        from pmtiles.tile import Entry, serialize_directory, zxy_to_tileid

        real_tile_id = zxy_to_tileid(5, 3, 2)
        leaf_directory_bytes = serialize_directory([Entry(real_tile_id, 0, 42, 1)])
        root_directory_bytes = serialize_directory(
            [Entry(real_tile_id, 0, len(leaf_directory_bytes), 0)]
        )

        def fake_get_bytes(offset: int, length: int) -> bytes:
            if offset == 1000:  # the "root" location this test chooses
                return root_directory_bytes
            if offset == 2000 + 0:  # leaf_directory_offset (2000) + entry.offset (0)
                return leaf_directory_bytes
            raise AssertionError(
                f"unexpected get_bytes call: offset={offset}, length={length}"
            )

        header = {"leaf_directory_offset": 2000}
        per_zoom_unique: dict[int, tuple[int, int]] = {}
        per_zoom_addressed: dict[int, tuple[int, int]] = {}
        calibrate_tile_sizes._walk(
            fake_get_bytes,
            header,
            1000,
            len(root_directory_bytes),
            per_zoom_unique,
            per_zoom_addressed,
        )

        assert per_zoom_unique == {5: (42, 1)}
        assert per_zoom_addressed == {5: (42, 1)}


class TestFormatHelpers:
    """`fmt_table`/`fmt_reference` are closures defined inside `main()`, so
    they're exercised via `main()` itself below; these tests instead lock
    down the exact string shape `main()` must produce, since a change to
    that shape would break every downstream reader of tile_size_table.py."""

    def test_output_module_has_the_expected_constant_names_and_shape(
        self, tmp_path, monkeypatch
    ):
        _run_main_against_tiny_archives(tmp_path, monkeypatch)
        output_text = (tmp_path / "tile_size_table.py").read_text(encoding="utf-8")
        assert "BASEMAP_AVG_TILE_BYTES: dict[int, int] = {" in output_text
        assert "TERRAIN_AVG_TILE_BYTES: dict[int, int] = {" in output_text
        assert "GENERATED by ``backend/scripts/calibrate_tile_sizes.py``" in output_text
        assert "z0=" in output_text  # the addressed-tile reference comment


class TestMain:
    def test_main_writes_a_valid_python_module_from_tiny_archives(
        self, tmp_path, monkeypatch, capsys
    ):
        _run_main_against_tiny_archives(tmp_path, monkeypatch)
        output_path = tmp_path / "tile_size_table.py"
        assert output_path.exists()

        # The generated file must itself be valid, importable Python defining
        # exactly the two tables the estimator depends on.
        namespace: dict[str, object] = {}
        exec(
            compile(output_path.read_text(encoding="utf-8"), str(output_path), "exec"),
            namespace,
        )  # noqa: S102 — controlled test fixture
        assert namespace["BASEMAP_AVG_TILE_BYTES"] == {0: len(b"basemap-tile")}
        assert namespace["TERRAIN_AVG_TILE_BYTES"] == {0: len(b"terrain-tile")}

        captured = capsys.readouterr()
        assert "Wrote" in captured.out
        assert "basemap zooms: [0]" in captured.out
        assert "terrain zooms: [0]" in captured.out

    def test_main_raises_system_exit_when_the_bundled_archives_are_missing(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.setattr(
            calibrate_tile_sizes,
            "BASEMAP_ARCHIVE",
            tmp_path / "missing-basemap.pmtiles",
        )
        monkeypatch.setattr(
            calibrate_tile_sizes,
            "TERRAIN_ARCHIVE",
            tmp_path / "missing-terrain.pmtiles",
        )
        with pytest.raises(SystemExit):
            calibrate_tile_sizes.main()

    def test_main_raises_system_exit_when_only_the_terrain_archive_is_missing(
        self, tmp_path, monkeypatch
    ):
        basemap_path = tmp_path / "basemap.pmtiles"
        write_test_pmtiles_archive(
            basemap_path,
            {(0, 0, 0): b"basemap-tile"},
            already_compressed=True,
            compression=Compression.NONE,
        )
        monkeypatch.setattr(calibrate_tile_sizes, "BASEMAP_ARCHIVE", basemap_path)
        monkeypatch.setattr(
            calibrate_tile_sizes,
            "TERRAIN_ARCHIVE",
            tmp_path / "missing-terrain.pmtiles",
        )
        with pytest.raises(SystemExit):
            calibrate_tile_sizes.main()


def _run_main_against_tiny_archives(tmp_path, monkeypatch) -> None:
    basemap_path = tmp_path / "basemap.pmtiles"
    terrain_path = tmp_path / "terrain.pmtiles"
    write_test_pmtiles_archive(
        basemap_path,
        {(0, 0, 0): b"basemap-tile"},
        already_compressed=True,
        compression=Compression.NONE,
    )
    write_test_pmtiles_archive(
        terrain_path,
        {(0, 0, 0): b"terrain-tile"},
        already_compressed=True,
        compression=Compression.NONE,
    )
    monkeypatch.setattr(calibrate_tile_sizes, "BASEMAP_ARCHIVE", basemap_path)
    monkeypatch.setattr(calibrate_tile_sizes, "TERRAIN_ARCHIVE", terrain_path)
    monkeypatch.setattr(
        calibrate_tile_sizes, "OUTPUT_PATH", tmp_path / "tile_size_table.py"
    )
    calibrate_tile_sizes.main()
