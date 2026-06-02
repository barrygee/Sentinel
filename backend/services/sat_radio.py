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
from sqlalchemy.ext.asyncio import AsyncSession

# Single source of truth for the editable radio fields. Mirrors the columns on
# SatelliteCatalogue (models.py) and the body fields accepted by PATCH /tle/radio.
RADIO_FIELDS: tuple[str, ...] = (
    "uplink_hz", "uplink_mode", "downlink_hz", "downlink_mode",
    "ctcss_hz", "transponder_type", "beacon_hz", "packet_info",
    "radio_status", "radio_notes",
)

_NAMESPACE = "space"
_KEY = "satelliteRadio"


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


async def set_radio_for(
    db: AsyncSession,
    norad_id: str,
    fields: dict[str, Any],
) -> dict[str, Any]:
    """Merge `fields` into the stored entry for `norad_id` and persist the map.

    Only keys present in `fields` are touched (matches PATCH semantics). Passing
    an explicit None clears that field. An entry with no remaining non-null
    fields is dropped from the map entirely. Returns the resulting entry.
    """
    norad_id = str(norad_id).strip()
    radio_map = await get_radio_map(db)
    entry = dict(radio_map.get(norad_id, {}))

    for f in RADIO_FIELDS:
        if f not in fields:
            continue
        v = fields[f]
        if v is None or (isinstance(v, str) and v.strip() == ""):
            entry.pop(f, None)
        else:
            entry[f] = v

    if entry:
        radio_map[norad_id] = entry
    else:
        radio_map.pop(norad_id, None)

    await upsert_setting(db, _NAMESPACE, _KEY, radio_map)
    return entry


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
