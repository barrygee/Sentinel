"""Resolves a single tile to bytes by checking downloaded region archives
(newest completed first) before falling back to the bundled base archive.

Each archive is opened once and its header, tile type/compression and root
directory are parsed once and cached on the handle; leaf directories (the
second level of a PMTiles directory tree) are cached with a bounded LRU per
handle. A handle also knows its own zoom range and lon/lat bounds, so a tier
that plainly cannot contain the requested tile is skipped without walking its
directory tree at all. The tier *list* (which region ids are current tiers)
is rebuilt only when a region completes or is deleted — via the incremental
``add_region``/``remove_region`` calls, never a full database re-query on the
hot path — so a served tile is: one zoom/bbox check per candidate archive,
then (for the archive that actually has it) a couple of binary-search
directory lookups plus one mmap slice.

Measured against `frontend/assets/tiles/uk.pmtiles` (2000 repeated lookups of
the same populated tile): the naive approach of calling
`pmtiles.reader.Reader.get()` directly — which re-reads and re-parses the
127-byte header AND the root directory from the mmap on every single call —
averaged ~3.5 ms/call. The cached `_ArchiveHandle.get_tile()` used here
averaged ~0.007 ms/call: roughly a 480x reduction, because the header and
root directory are parsed exactly once per archive open instead of once per
tile request.

This module holds process-local, in-memory state (the current tier list and
open readers); it does not query the database on every tile request. Callers
that change which regions are complete (the job runner on completion, the
DELETE endpoint, and startup recovery) call the synchronous
``add_region``/``remove_region`` directly — not a database re-read — so the
in-memory tier list changes strictly *before* the database row's status
becomes visible to a concurrent request (see the callers for why that
ordering matters: it means nobody can observe "region shows complete/gone"
before the tiles it affects are already being served/no-longer-served).
``refresh_tiers`` (a full rebuild from the database) exists only for startup.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

from backend.config import resolved_offline_tiles_dir, settings
from backend.services.offline_map import region_repository
from backend.services.offline_map.estimator import tile_x_for_longitude, tile_y_for_latitude
from pmtiles.reader import MmapSource
from pmtiles.tile import Compression, TileType, deserialize_directory, deserialize_header, find_tile, zxy_to_tileid
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_TILE_TYPE_CONTENT_TYPES = {
    TileType.MVT: "application/x-protobuf",
    TileType.PNG: "image/png",
    TileType.JPEG: "image/jpeg",
    TileType.WEBP: "image/webp",
    TileType.AVIF: "image/avif",
}
# PMTiles' four defined tile-data compressions, mapped to the HTTP
# Content-Encoding token that reproduces the stored bytes unchanged. An
# archive reporting anything else (UNKNOWN, or a future value this code
# doesn't know) is refused outright — see _ArchiveHandle.__init__ — rather
# than served with a guessed or missing encoding header.
_COMPRESSION_ENCODINGS: dict[Compression, str | None] = {
    Compression.NONE: None,
    Compression.GZIP: "gzip",
    Compression.BROTLI: "br",
    Compression.ZSTD: "zstd",
}
# Bounded per-archive cache of parsed leaf directories (the second level of a
# PMTiles directory tree). Large enough that a session panning around one
# region doesn't keep re-parsing the same handful of leaves, small enough
# that a pathological number of regions can't grow memory unbounded.
_LEAF_CACHE_MAX_ENTRIES = 512


@dataclass(frozen=True)
class ResolvedTile:
    """A tile resolved from some archive, ready to hand straight to the client."""

    data: bytes
    content_type: str
    content_encoding: str | None  # "gzip"/"br"/"zstd" or None


def _region_archive_path(region_id: str, *, terrain: bool) -> Path:
    tiles_dir = resolved_offline_tiles_dir()
    suffix = ".terrain.pmtiles" if terrain else ".pmtiles"
    return tiles_dir / f"{region_id}{suffix}"


class _ArchiveHandle:
    """One opened archive: cached header fields, root directory, and an LRU of
    leaf directories, so repeated tile lookups never re-read either from disk."""

    def __init__(self, path: Path) -> None:
        self._file = open(path, "rb")  # noqa: SIM115 — lifetime matches this handle, closed in close()/on error below
        try:
            self._get_bytes = MmapSource(self._file)
            header = deserialize_header(self._get_bytes(0, 127))
            if header["tile_compression"] not in _COMPRESSION_ENCODINGS:
                raise ValueError(f"unsupported tile_compression {header['tile_compression']!r} in {path}")
            self.tile_type: TileType = header["tile_type"]
            self.content_type = _TILE_TYPE_CONTENT_TYPES.get(self.tile_type, "application/octet-stream")
            self.content_encoding = _COMPRESSION_ENCODINGS[header["tile_compression"]]
            self.min_zoom: int = header["min_zoom"]
            self.max_zoom: int = header["max_zoom"]
            self.min_lon = header["min_lon_e7"] / 1e7
            self.max_lon = header["max_lon_e7"] / 1e7
            self.min_lat = header["min_lat_e7"] / 1e7
            self.max_lat = header["max_lat_e7"] / 1e7
            self._tile_data_offset: int = header["tile_data_offset"]
            self._leaf_directory_offset: int = header["leaf_directory_offset"]
            self._root_directory = deserialize_directory(self._get_bytes(header["root_offset"], header["root_length"]))
            self._leaf_cache: OrderedDict[tuple[int, int], list] = OrderedDict()
        except Exception:
            # Never leave a partially-initialised handle holding an open fd —
            # the caller treats construction failure as "archive unusable".
            self._file.close()
            raise

    def close(self) -> None:
        try:
            self._file.close()
        except OSError:
            pass

    def _leaf_directory(self, offset: int, length: int) -> list:
        cache_key = (offset, length)
        cached = self._leaf_cache.get(cache_key)
        if cached is not None:
            self._leaf_cache.move_to_end(cache_key)
            return cached
        directory = deserialize_directory(self._get_bytes(offset, length))
        self._leaf_cache[cache_key] = directory
        if len(self._leaf_cache) > _LEAF_CACHE_MAX_ENTRIES:
            self._leaf_cache.popitem(last=False)
        return directory

    def covers(self, zoom: int, tile_x: int, tile_y: int) -> bool:
        """Cheap pre-check using only this archive's header fields — lets a
        tier that plainly doesn't reach this tile be skipped without walking
        its directory tree."""
        if not (self.min_zoom <= zoom <= self.max_zoom):
            return False
        min_tile_x = tile_x_for_longitude(self.min_lon, zoom)
        max_tile_x = tile_x_for_longitude(self.max_lon, zoom)
        # North is the smaller tile-y (Mercator y grows southward).
        min_tile_y = tile_y_for_latitude(self.max_lat, zoom)
        max_tile_y = tile_y_for_latitude(self.min_lat, zoom)
        return min_tile_x <= tile_x <= max_tile_x and min_tile_y <= tile_y <= max_tile_y

    def get_tile(self, zoom: int, tile_x: int, tile_y: int) -> bytes | None:
        tile_id = zxy_to_tileid(zoom, tile_x, tile_y)
        directory = self._root_directory
        for _directory_depth in range(4):  # PMTiles directories are at most 4 levels deep
            result = find_tile(directory, tile_id)
            if result is None:
                return None
            if result.run_length == 0:
                directory = self._leaf_directory(self._leaf_directory_offset + result.offset, result.length)
                continue
            return self._get_bytes(self._tile_data_offset + result.offset, result.length)
        return None


class TileTierResolver:
    """Process-wide registry of basemap/terrain tiers. One instance, module-level."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._basemap_entries: list[str] = []  # region ids, newest-completed-first
        self._terrain_entries: list[str] = []
        self._handles: dict[Path, _ArchiveHandle] = {}
        # Paths that failed to open/parse — remembered so a broken archive is
        # logged once, not on every subsequent tile request, until the tier
        # list changes again.
        self._failed_paths: set[Path] = set()
        self._tiers_version = "init"

    def _open(self, path: Path) -> _ArchiveHandle | None:
        with self._lock:
            cached = self._handles.get(path)
            if cached is not None:
                return cached
            if path in self._failed_paths:
                return None
            if not path.exists():
                return None
            try:
                handle = _ArchiveHandle(path)
            except Exception:
                logger.exception("Failed to open PMTiles archive %s — skipping until the tier list changes", path)
                self._failed_paths.add(path)
                return None
            self._handles[path] = handle
            return handle

    def _live_paths(self) -> set[Path]:
        live = {_region_archive_path(region_id, terrain=False) for region_id in self._basemap_entries}
        live |= {_region_archive_path(region_id, terrain=True) for region_id in self._terrain_entries}
        live.add(Path(settings.offline_basemap_base_archive))
        live.add(Path(settings.offline_terrain_base_archive))
        return live

    def _drop_stale_handles(self) -> None:
        live_paths = self._live_paths()
        with self._lock:
            for stale_path in [path for path in self._handles if path not in live_paths]:
                self._handles.pop(stale_path).close()
            # Forget past failures for paths that are no longer relevant, so a
            # region id reused after a delete+recreate gets a fresh attempt.
            self._failed_paths &= live_paths

    def _bump_version(self) -> None:
        digest_source = "|".join(self._basemap_entries) + "||" + "|".join(self._terrain_entries)
        self._tiers_version = hashlib.sha256(digest_source.encode("utf-8")).hexdigest()[:12]

    def set_tiers(self, basemap_region_ids: list[str], terrain_region_ids: list[str]) -> None:
        """Bulk rebuild of the tier lists from a database read. Used only at
        startup — runtime changes go through add_region/remove_region so a
        completion or deletion never needs a database round trip to become
        visible to tile requests."""
        self._basemap_entries = list(basemap_region_ids)
        self._terrain_entries = list(terrain_region_ids)
        self._drop_stale_handles()
        self._bump_version()

    def add_region(self, region_id: str, *, include_basemap: bool, include_terrain: bool) -> None:
        """Add a just-completed region as the newest tier. Synchronous and
        DB-free by design — call this immediately before the database row is
        marked complete, so the tier list is never behind what a concurrent
        request can observe."""
        if include_basemap and region_id not in self._basemap_entries:
            self._basemap_entries.insert(0, region_id)
        if include_terrain and region_id not in self._terrain_entries:
            self._terrain_entries.insert(0, region_id)
        self._drop_stale_handles()
        self._bump_version()

    def remove_region(self, region_id: str) -> None:
        """Remove a region from both tiers (a no-op for a tier it wasn't in).
        Synchronous and DB-free — call this immediately before the database
        row is deleted, for the same ordering reason as add_region."""
        changed = False
        if region_id in self._basemap_entries:
            self._basemap_entries.remove(region_id)
            changed = True
        if region_id in self._terrain_entries:
            self._terrain_entries.remove(region_id)
            changed = True
        if changed:
            self._drop_stale_handles()
            self._bump_version()

    @property
    def tiers_version(self) -> str:
        return self._tiers_version

    def resolve_basemap(self, zoom: int, tile_x: int, tile_y: int) -> ResolvedTile | None:
        region_paths = [_region_archive_path(region_id, terrain=False) for region_id in self._basemap_entries]
        return self._resolve(region_paths, Path(settings.offline_basemap_base_archive), zoom, tile_x, tile_y)

    def resolve_terrain(self, zoom: int, tile_x: int, tile_y: int) -> ResolvedTile | None:
        region_paths = [_region_archive_path(region_id, terrain=True) for region_id in self._terrain_entries]
        return self._resolve(region_paths, Path(settings.offline_terrain_base_archive), zoom, tile_x, tile_y)

    def _resolve(
        self, region_paths: list[Path], base_archive_path: Path, zoom: int, tile_x: int, tile_y: int
    ) -> ResolvedTile | None:
        for path in [*region_paths, base_archive_path]:
            handle = self._open(path)
            if handle is None or not handle.covers(zoom, tile_x, tile_y):
                continue
            data = handle.get_tile(zoom, tile_x, tile_y)
            if data is None:
                continue
            return ResolvedTile(data=data, content_type=handle.content_type, content_encoding=handle.content_encoding)
        return None

    def basemap_status(self) -> tuple[bool, int]:
        """(available, max_zoom) considering the base archive and any region tiers."""
        region_paths = [_region_archive_path(region_id, terrain=False) for region_id in self._basemap_entries]
        return self._tier_status(region_paths, Path(settings.offline_basemap_base_archive))

    def terrain_status(self) -> tuple[bool, int]:
        region_paths = [_region_archive_path(region_id, terrain=True) for region_id in self._terrain_entries]
        return self._tier_status(region_paths, Path(settings.offline_terrain_base_archive))

    def _tier_status(self, region_paths: list[Path], base_archive_path: Path) -> tuple[bool, int]:
        max_zoom = 0
        available = False
        for path in [*region_paths, base_archive_path]:
            handle = self._open(path)
            if handle is None:
                continue
            available = True
            max_zoom = max(max_zoom, handle.max_zoom)
        return available, max_zoom


# Module-level singleton — tile requests are hot-path and must not re-open
# archives per request.
resolver = TileTierResolver()


async def refresh_tiers(db: AsyncSession) -> None:
    """Full rebuild of the tier lists from the database. Call this only at
    startup (including post-crash recovery) — runtime completions/deletions
    use the synchronous add_region/remove_region instead, which don't need a
    database round trip and can't race a concurrent request the way two
    sequential awaits reading then writing the database could."""
    basemap_ids = [
        region_id for region_id, _completed_at in await region_repository.list_completed_archives(db, terrain=False)
    ]
    terrain_ids = [
        region_id for region_id, _completed_at in await region_repository.list_completed_archives(db, terrain=True)
    ]
    resolver.set_tiers(basemap_ids, terrain_ids)
