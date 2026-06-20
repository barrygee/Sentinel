"""Trunk channel maps stored as JSON, rendered to the CSV dsd-fme requires.

A trunked DMR system (Capacity-Plus / Connect-Plus / Tier III) assigns voice to
logical channels whose number→frequency mapping lives only in the operator's
config and is never broadcast, so dsd-fme must be given a channel-map CSV to
follow grants (see :mod:`backend.services.sdr_rigctl`). Users manage that data as
structured JSON in Settings (stored in the DB, the same pattern as SDR
frequencies/band-plan); this module is the bridge between that JSON and the CSV
files dsd-fme actually loads via ``-C``.

JSON shape (one entry per system)::

    {
      "channel_maps": [
        {
          "name": "my-dmr-system",
          "channels": [
            {"lsn": 1, "frequency_hz": 858606250},
            {"lsn": 2, "frequency_hz": 859606250}
          ]
        }
      ]
    }

On save the DB JSON is the source of truth and each map is rendered to
``<name>.csv`` in the channel-maps directory; on first read (before anything is
saved) any existing channel-map CSVs in that directory are imported back into the
JSON, so hand-made maps are never lost. Group-list CSVs (a different ``-G`` file
with a different header) are left untouched by both directions.
"""

from __future__ import annotations

import re
from pathlib import Path

# Sane RF bounds for a channel frequency (Hz) — bounds the values accepted from
# the editor so a typo can't write a nonsense frequency dsd-fme would tune to.
MIN_FREQUENCY_HZ = 24_000_000
MAX_FREQUENCY_HZ = 1_800_000_000

# dsd-fme skips the first line of a channel-map CSV on import, so this header must
# always be present (and is what marks a CSV as a channel map vs a group list).
CHANNEL_MAP_HEADER = "LSN(dec),frequency(Hz) (do not delete this line or won't import properly)"

# A map name must reduce to a single safe ``<name>.csv`` filename component so it
# cannot escape the maps directory when written or handed to dsd-fme.
_SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


def safe_map_filename(name: str) -> str:
    """Return the ``<name>.csv`` filename for a map name, validating the name.

    Raises :class:`ValueError` for an empty name or one with characters outside
    ``[A-Za-z0-9._-]`` (which includes any path separator or ``..``).
    """
    candidate = (name or "").strip()
    if not candidate or not _SAFE_NAME.match(candidate):
        raise ValueError(f"invalid channel-map name: {name!r} (use letters, digits, dot, dash, underscore)")
    return f"{candidate}.csv"


def build_channel_map_csv(channels: list[dict]) -> str:
    """Render a map's channels as dsd-fme channel-map CSV text.

    Channels are de-duplicated by LSN (last value wins) and emitted in ascending
    LSN order beneath the required header line.
    """
    frequency_by_lsn: dict[int, int] = {}
    for channel in channels:
        frequency_by_lsn[int(channel["lsn"])] = int(channel["frequency_hz"])
    lines = [CHANNEL_MAP_HEADER]
    for lsn in sorted(frequency_by_lsn):
        lines.append(f"{lsn},{frequency_by_lsn[lsn]}")
    return "\n".join(lines) + "\n"


def parse_channel_map_csv(text: str) -> list[dict]:
    """Parse channel-map CSV text into ``[{lsn, frequency_hz}]``.

    The first line (the header) is skipped. Blank lines and lines that are not a
    valid ``<int>,<int>`` pair are ignored so a slightly irregular hand-made file
    still imports cleanly.
    """
    channels: list[dict] = []
    lines = text.splitlines()
    for raw_line in lines[1:]:
        parts = raw_line.split(",")
        if len(parts) < 2:
            continue
        try:
            lsn = int(parts[0].strip())
            frequency_hz = int(parts[1].strip())
        except (TypeError, ValueError):
            continue
        channels.append({"lsn": lsn, "frequency_hz": frequency_hz})
    return channels


def _looks_like_channel_map(path: Path) -> bool:
    """Whether a CSV file is a channel map (vs a group list) by its header line."""
    try:
        with path.open(encoding="utf-8") as handle:
            first_line = handle.readline()
    except OSError:
        return False
    return first_line.strip().lower().startswith("lsn")


def read_channel_maps_from_dir(maps_dir: Path) -> list[dict]:
    """Import existing channel-map CSVs from ``maps_dir`` into the JSON shape.

    Only files whose header marks them as channel maps are imported; group-list
    CSVs and any other files are skipped. Returns an empty list if the directory
    is absent. Used to seed the editor the first time, before anything is saved,
    so hand-made maps appear in (and survive) the JSON.
    """
    maps: list[dict] = []
    try:
        entries = sorted(maps_dir.iterdir())
    except OSError:
        return maps
    for entry in entries:
        if not entry.is_file() or entry.suffix.lower() != ".csv":
            continue
        try:
            text = entry.read_text(encoding="utf-8")
        except OSError:  # pragma: no cover - defensive: iterdir said this is a readable file
            continue
        lines = text.splitlines()
        # A channel map's first line is the LSN header; anything else (e.g. a
        # group-list CSV, or an empty file) is not a channel map and is skipped.
        if not lines or not lines[0].strip().lower().startswith("lsn"):
            continue
        maps.append({"name": entry.stem, "channels": parse_channel_map_csv(text)})
    return maps


def validate_channel_maps_payload(body: object) -> list[dict]:
    """Validate the editor's JSON payload, returning the normalised map list.

    Raises :class:`ValueError` on a malformed body: not an object, a bad/duplicate
    map name, a missing channel list, or a channel with a non-positive LSN or an
    out-of-range frequency.
    """
    if not isinstance(body, dict) or not isinstance(body.get("channel_maps"), list):
        raise ValueError("body must be a JSON object with a channel_maps array")
    normalised: list[dict] = []
    seen_filenames: set[str] = set()
    for entry in body["channel_maps"]:
        if not isinstance(entry, dict):
            raise ValueError("each channel map must be an object")
        filename = safe_map_filename(entry.get("name", ""))
        if filename.lower() in seen_filenames:
            raise ValueError(f"duplicate channel-map name: {entry.get('name')!r}")
        seen_filenames.add(filename.lower())
        raw_channels = entry.get("channels")
        if not isinstance(raw_channels, list):
            raise ValueError(f"channel map {entry.get('name')!r} must have a channels array")
        channels: list[dict] = []
        for channel in raw_channels:
            if not isinstance(channel, dict):
                raise ValueError("each channel must be an object with lsn and frequency_hz")
            try:
                lsn = int(channel["lsn"])
                frequency_hz = int(channel["frequency_hz"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError("each channel needs an integer lsn and frequency_hz") from exc
            if lsn <= 0:
                raise ValueError(f"lsn must be positive (got {lsn})")
            if not (MIN_FREQUENCY_HZ <= frequency_hz <= MAX_FREQUENCY_HZ):
                raise ValueError(f"frequency_hz out of range: {frequency_hz}")
            channels.append({"lsn": lsn, "frequency_hz": frequency_hz})
        normalised.append({"name": str(entry["name"]).strip(), "channels": channels})
    return normalised


def write_channel_maps_to_dir(maps_dir: Path, maps: list[dict]) -> None:
    """Write each map to ``<name>.csv`` in ``maps_dir`` and prune stale maps.

    The DB JSON is the source of truth: every map is (over)written, and any
    channel-map CSV already in the directory that is no longer in ``maps`` is
    removed so renamed/deleted maps don't linger in the picker. Group-list CSVs
    and other files are never touched.
    """
    maps_dir.mkdir(parents=True, exist_ok=True)
    wanted: set[str] = set()
    for entry in maps:
        filename = safe_map_filename(entry["name"])
        wanted.add(filename)
        (maps_dir / filename).write_text(build_channel_map_csv(entry["channels"]), encoding="utf-8")
    for existing in maps_dir.glob("*.csv"):
        if existing.name not in wanted and _looks_like_channel_map(existing):
            existing.unlink()
