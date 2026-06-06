"""Persistent, clear-survivable satellite radio-frequency store.

Radio metadata (uplink/downlink/beacon/CTCSS/transponder/status/notes) is held
as columns on `satellite_catalogue` for fast reads, but those rows are wiped by
the "clear TLE data" command. To make the user-curated frequencies permanent,
the authoritative copy lives in a single `UserSettings` row
(namespace='space', key='satelliteRadio') — a JSON map of:

    norad_id -> { <radio field>: value, ... }

`UserSettings` is never touched by the TLE clear, so the map persists. On every
TLE (re)import, the map is applied back onto the catalogue rows
(see `store_tle_bulk`), repopulating the display columns.

This mirrors the SDR pattern (table mirrored into UserSettings, restored on
re-import) — see backend/database.py:sync_sdr_groups_to_config.
"""
from __future__ import annotations

from typing import Any

from backend.db_helpers import get_setting, upsert_setting
from backend.services.json_store import DATA_DIR, load_json_file, write_json_file
from sqlalchemy.ext.asyncio import AsyncSession

# Single source of truth for the editable radio fields. Mirrors the columns on
# SatelliteCatalogue (models.py) and the entries in the radio JSON file.
RADIO_FIELDS: tuple[str, ...] = (
    "uplink_hz", "uplink_mode", "downlink_hz", "downlink_mode",
    "ctcss_hz", "transponder_type", "beacon_hz", "packet_info",
    "radio_status", "radio_notes",
)

_NAMESPACE = "space"
_KEY = "satelliteRadio"

# Single source of truth on disk: a git-tracked, hand- and UI-editable JSON file
# (norad_id -> radio fields). Seeds the persistent store on startup and is
# written back on every UI edit. Lives next to the other data seeds.
RADIO_FILE = DATA_DIR / "satellite_radio.json"

_FILE_COMMENT = (
    "Single source of truth for satellite radio frequencies. NORAD ID -> radio "
    "fields. Frequencies in Hz (integer). Editable in-app (Settings > Space > "
    "Satellite Frequencies (JSON)) or by hand-editing this file; in-app edits "
    "are written back here."
)


def clean_entry(fields: dict[str, Any]) -> dict[str, Any]:
    """Keep only known radio fields whose value is not None/blank."""
    out: dict[str, Any] = {}
    for f in RADIO_FIELDS:
        v = fields.get(f)
        if v is None:
            continue
        if isinstance(v, str) and v.strip() == "":
            continue
        out[f] = v
    return out


async def get_radio_map(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """Return the persistent norad_id -> radio-fields map (empty if unset)."""
    value = await get_setting(db, _NAMESPACE, _KEY, default={})
    return value if isinstance(value, dict) else {}


def load_radio_file() -> dict[str, dict[str, Any]]:
    """Read the on-disk source of truth as a norad_id -> radio-fields map.

    NORAD IDs are normalised to unpadded strings (matching the catalogue) and
    each entry is run through `clean_entry`. The `_comment` key and any
    non-dict/blank entries are skipped. Returns {} on a missing or unreadable
    file so startup never fails on a bad seed.
    """
    raw = load_json_file(RADIO_FILE)
    if not isinstance(raw, dict):
        return {}

    out: dict[str, dict[str, Any]] = {}
    for nid, entry in raw.items():
        if nid.startswith("_") or not isinstance(entry, dict):
            continue
        cleaned = clean_entry(entry)
        if cleaned:
            out[str(int(nid))] = cleaned
    return out


def write_radio_file(radio_map: dict[str, dict[str, Any]]) -> bool:
    """Atomically write the radio map to the on-disk source of truth.

    Preserves the leading `_comment`, sorts entries by numeric NORAD ID, and
    writes atomically. Returns False (and logs) on a read-only filesystem so
    callers can persist to the DB store and still succeed.
    """
    payload: dict[str, Any] = {"_comment": _FILE_COMMENT}
    for nid in sorted(radio_map, key=lambda x: int(x)):
        payload[nid] = radio_map[nid]
    return write_json_file(RADIO_FILE, payload)


async def replace_radio_map(db: AsyncSession, new_map: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Replace the entire radio map from a bulk edit (the Space textarea).

    Normalises NORAD IDs to unpadded strings, cleans each entry, persists the
    whole map to the store, applies it onto the catalogue display columns, and
    writes the file back. Returns the cleaned map."""
    from backend.models import SatelliteCatalogue  # avoid circular import
    from sqlalchemy import select

    cleaned: dict[str, dict[str, Any]] = {}
    for nid, entry in (new_map or {}).items():
        if str(nid).startswith("_") or not isinstance(entry, dict):
            continue
        try:
            key = str(int(nid))
        except (TypeError, ValueError):
            continue
        ce = clean_entry(entry)
        if ce:
            cleaned[key] = ce

    await upsert_setting(db, _NAMESPACE, _KEY, cleaned)

    # Refresh the catalogue display columns so the change is visible immediately
    # (mirrors what a TLE re-import would do via apply_radio_to_rows).
    rows = (await db.execute(select(SatelliteCatalogue))).scalars().all()
    apply_radio_to_rows(rows, cleaned)
    await db.commit()

    write_radio_file(cleaned)
    return cleaned


def apply_radio_to_rows(rows: list[Any], radio_map: dict[str, dict[str, Any]]) -> None:
    """Copy stored radio fields onto a list of SatelliteCatalogue ORM rows.

    For each row whose norad_id has a stored entry, set its radio columns from
    the store (overwriting), and clear any radio column not present in the store
    so the display cache exactly reflects the persistent record. Rows with no
    stored entry are left untouched.
    """
    for row in rows:
        entry = radio_map.get(str(row.norad_id))
        if entry is None:
            continue
        for f in RADIO_FIELDS:
            setattr(row, f, entry.get(f))
