"""Shared, non-test helpers for the offline-map-downloads test suite.

Not collected by pytest (no ``test_`` prefix): a place for building small,
real PMTiles fixtures with the ``pmtiles`` package's own writer (rather than
depending on the multi-gigabyte bundled archives), plus the module-singleton
reset helpers the offline-map services need between tests.
"""

from __future__ import annotations

import asyncio
import gzip
from pathlib import Path

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write

from backend.services.offline_map import job_runner as job_runner_module
from backend.services.offline_map import tile_tier_resolver as tile_tier_resolver_module


def write_test_pmtiles_archive(
    path: Path,
    tiles: dict[tuple[int, int, int], bytes],
    *,
    tile_type: TileType = TileType.MVT,
    compression: Compression = Compression.GZIP,
    min_lon: float = -1.0,
    min_lat: float = -1.0,
    max_lon: float = 1.0,
    max_lat: float = 1.0,
    already_compressed: bool = False,
) -> None:
    """Write a small, real PMTiles archive at ``path`` containing ``tiles``
    (a ``{(z, x, y): raw_bytes}`` map). Each tile's raw bytes are gzip-compressed
    before storage unless ``already_compressed`` (or ``compression`` is NONE),
    matching how ``tile_compression`` in the header is meant to be interpreted.

    There is deliberately no ``min_zoom``/``max_zoom`` parameter: the
    ``pmtiles`` package's own ``finalize_header`` always *derives* those two
    header fields from the actual zoom levels of ``tiles`` (see
    ``writer.finalize_header``), overwriting whatever a caller passed in —
    so the zoom range an archive reports is controlled entirely by which
    zoom levels are present in ``tiles``.
    """
    header = {
        "min_lon_e7": int(min_lon * 1e7),
        "min_lat_e7": int(min_lat * 1e7),
        "max_lon_e7": int(max_lon * 1e7),
        "max_lat_e7": int(max_lat * 1e7),
        "center_zoom": 0,
        "center_lon_e7": 0,
        "center_lat_e7": 0,
        "tile_type": tile_type,
        "tile_compression": compression,
    }
    ordered_tiles = sorted(tiles.items(), key=lambda item: zxy_to_tileid(*item[0]))
    with write(str(path)) as writer_obj:
        for (zoom, tile_x, tile_y), raw_bytes in ordered_tiles:
            if compression == Compression.GZIP and not already_compressed:
                stored_bytes = gzip.compress(raw_bytes)
            else:
                stored_bytes = raw_bytes
            writer_obj.write_tile(zxy_to_tileid(zoom, tile_x, tile_y), stored_bytes)
        writer_obj.finalize(header, {})


def reset_tile_tier_resolver_singleton() -> None:
    """Return the module-level `tile_tier_resolver.resolver` singleton to a
    blank slate: close every cached archive handle and forget the tier lists,
    so one test's regions/archives can never leak into the next."""
    resolver = tile_tier_resolver_module.resolver
    for handle in resolver._handles.values():
        handle.close()
    resolver._handles.clear()
    resolver._basemap_entries.clear()
    resolver._terrain_entries.clear()
    resolver._failed_paths.clear()
    resolver._tiers_version = "init"


def reset_job_runner_singleton() -> None:
    """Return the module-level `job_runner.runner` singleton to a blank slate
    between tests: replace its queue and clear per-job state. The worker task
    itself is never started by the ordinary test `client` fixture (it isn't
    run under the app's `lifespan`), so there is normally nothing to cancel —
    this only guards against a test that explicitly started it.

    The queue is *replaced*, not just drained: `asyncio.Queue` binds itself to
    whichever event loop is running the first time it's used, and each test
    function gets its own event loop — reusing the same Queue object across
    tests raises "bound to a different event loop" the moment a later test
    touches it.
    """
    runner = job_runner_module.runner
    runner._queue = asyncio.Queue()
    runner._current_process = None
    runner._current_region_id = None
    runner._pending_abort.clear()
    runner._stopping = False
    if runner._worker_task is not None and not runner._worker_task.done():
        runner._worker_task.cancel()
    runner._worker_task = None
