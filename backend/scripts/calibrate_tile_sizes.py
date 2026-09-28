"""One-off calibration script: measure average stored tile size per zoom level
from the bundled basemap and terrain PMTiles archives, and emit the result as a
committed Python constant (``backend/services/offline_map/tile_size_table.py``).

Why this exists: there is no official per-zoom byte table for either Protomaps
Basemap or Mapterhorn terrain tiles, and the estimator needs *some* real number
to multiply an exact tile count by. Running this script against our own
``uk.pmtiles`` / ``uk-terrain.pmtiles`` is the closest available ground truth,
because they were built by the same pipelines (planetiler Protomaps Basemap,
Mapterhorn Terrarium) that the configured extraction sources use.

Dedup choice (PMTiles run-length entries): a PMTiles directory entry can cover
a *run* of consecutive tile ids that share identical bytes — most commonly
large stretches of open-ocean tiles at low/medium zoom. If we averaged
"total tile-data bytes / addressed tile count" we would massively
under-estimate, because the ocean run's bytes are counted once but the run
covers thousands of addressed tiles. That average would be a good predictor
of *this specific archive's* on-disk size, but a poor predictor of an
arbitrary user-drawn region's extract, whose land/sea mix (and therefore dedup
ratio) is unknown and generally much lower than the full UK archive's.

Instead we average over **unique stored tiles** (one sample per directory
entry, regardless of its run length): bytes of that entry's stored blob,
counted once, divided by the number of such distinct entries at that zoom.
This approximates "the typical size of a tile that actually has to be stored"
and is a conservative-but-reasonable stand-in for a fresh region extract,
which will have its own (usually smaller) amount of internal dedup that we
have no way to predict in advance. The alternative (addressed-tile average)
is left in a comment in the output for reference, since both numbers are
cheap to compute from the same pass.

Run from the repo root:
    uv run --project backend python backend/scripts/calibrate_tile_sizes.py
"""

from __future__ import annotations

from pathlib import Path

from pmtiles.reader import MmapSource
from pmtiles.tile import deserialize_directory, deserialize_header, tileid_to_zxy

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
BASEMAP_ARCHIVE = ROOT_DIR / "frontend" / "assets" / "tiles" / "uk.pmtiles"
TERRAIN_ARCHIVE = ROOT_DIR / "frontend" / "assets" / "tiles" / "uk-terrain.pmtiles"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "services" / "offline_map" / "tile_size_table.py"


def _walk(get_bytes, header, dir_offset: int, dir_length: int, per_zoom_unique: dict, per_zoom_addressed: dict):
    """Recursively walk a PMTiles directory tree, tallying per-zoom stats.

    ``per_zoom_unique[z]`` accumulates (stored_byte_count, distinct_entry_count)
    for every directory entry — counted once no matter its run length.
    ``per_zoom_addressed[z]`` accumulates the same stored byte count but
    weighted by run_length, i.e. spread across every addressed tile id the
    entry covers (kept only for the reference comment in the output table).
    """
    entries = deserialize_directory(get_bytes(dir_offset, dir_length))
    for entry in entries:
        if entry.run_length == 0:
            # Leaf pointer: descend into the child directory instead of a tile.
            _walk(
                get_bytes,
                header,
                header["leaf_directory_offset"] + entry.offset,
                entry.length,
                per_zoom_unique,
                per_zoom_addressed,
            )
            continue
        zoom, _x, _y = tileid_to_zxy(entry.tile_id)
        unique_bytes, unique_count = per_zoom_unique.get(zoom, (0, 0))
        per_zoom_unique[zoom] = (unique_bytes + entry.length, unique_count + 1)
        addressed_bytes, addressed_count = per_zoom_addressed.get(zoom, (0, 0))
        per_zoom_addressed[zoom] = (
            addressed_bytes + entry.length * entry.run_length,
            addressed_count + entry.run_length,
        )


def _calibrate(archive_path: Path) -> tuple[dict[int, int], dict[int, int]]:
    """Return (avg_bytes_by_zoom, addressed_avg_bytes_by_zoom) for one archive."""
    with open(archive_path, "rb") as archive_file:
        get_bytes = MmapSource(archive_file)
        header = deserialize_header(get_bytes(0, 127))
        per_zoom_unique: dict[int, tuple[int, int]] = {}
        per_zoom_addressed: dict[int, tuple[int, int]] = {}
        _walk(get_bytes, header, header["root_offset"], header["root_length"], per_zoom_unique, per_zoom_addressed)

    unique_avg = {
        zoom: round(total_bytes / count) if count else 0 for zoom, (total_bytes, count) in per_zoom_unique.items()
    }
    addressed_avg = {
        zoom: round(total_bytes / count) if count else 0 for zoom, (total_bytes, count) in per_zoom_addressed.items()
    }
    return unique_avg, addressed_avg


def main() -> None:
    if not BASEMAP_ARCHIVE.exists() or not TERRAIN_ARCHIVE.exists():
        raise SystemExit(
            f"Expected both archives to exist for calibration:\n  {BASEMAP_ARCHIVE}\n  {TERRAIN_ARCHIVE}\n"
            "(fresh checkouts without the bundled tiles cannot run this script — the committed "
            "tile_size_table.py is the artifact everyone else builds against)."
        )

    basemap_unique, basemap_addressed = _calibrate(BASEMAP_ARCHIVE)
    terrain_unique, terrain_addressed = _calibrate(TERRAIN_ARCHIVE)

    def fmt_table(values: dict[int, int]) -> str:
        lines = [f"    {zoom}: {values[zoom]}," for zoom in sorted(values)]
        return "\n".join(lines)

    def fmt_reference(values: dict[int, int]) -> str:
        return ", ".join(f"z{zoom}={values[zoom]}" for zoom in sorted(values))

    output = f'''"""Calibrated average stored-tile byte sizes, per zoom, per tier.

GENERATED by ``backend/scripts/calibrate_tile_sizes.py`` against the bundled
``frontend/assets/tiles/uk.pmtiles`` (basemap) and ``uk-terrain.pmtiles``
(terrain) archives. Do not hand-edit — re-run the script and commit the
result if the bundled archives are ever regenerated.

Each table gives the average size in bytes of a *unique stored tile* at that
zoom (see the script's module docstring for why unique-tile averaging, not
addressed-tile averaging, is the sensible estimate for an arbitrary future
region extract). Missing zooms (no tiles present in the source archive at
that level) are omitted; callers should fall back to the nearest available
zoom or a small constant.

For reference only, the addressed-tile-weighted average (i.e. what you would
compute by dividing total tile-data bytes by every addressed tile id,
including deduplicated ocean runs) was also computed during calibration:
  basemap: {fmt_reference(basemap_addressed)}
  terrain: {fmt_reference(terrain_addressed)}
These are dominated by ocean dedup in our specific UK archive and are NOT
used — they would under-estimate a land-heavy or coastal-light selection.
"""

BASEMAP_AVG_TILE_BYTES: dict[int, int] = {{
{fmt_table(basemap_unique)}
}}

TERRAIN_AVG_TILE_BYTES: dict[int, int] = {{
{fmt_table(terrain_unique)}
}}
'''

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(output, encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")
    print(f"basemap zooms: {sorted(basemap_unique)}")
    print(f"terrain zooms: {sorted(terrain_unique)}")


if __name__ == "__main__":
    main()
