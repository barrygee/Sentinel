"""Dedicated JSON source-of-truth for SDR curated data.

Two files under backend/data/ replace what used to live inside
default_config.json:

  - sdr_frequencies.json : { groups, frequencies, searchRanges }
        Backed by the sdr_frequency_groups / sdr_stored_frequencies /
        sdr_frequency_group_links / sdr_search_ranges tables. The flat
        representation matches what `sync_sdr_groups_to_config` and
        `sync_sdr_search_ranges_to_config` already mirror into UserSettings.
  - sdr_bandplan.json    : { bandPlan }
        Not DB-backed — mirrored into UserSettings(sdr.bandPlan), which the
        waterfall reads.

Each file seeds the DB on startup and is written back on every edit (atomic,
fail-soft) — the same pattern as backend/services/sat_radio.py. The DB /
UserSettings copy stays authoritative at runtime.
"""
from __future__ import annotations

from typing import Any

from backend.db_helpers import get_setting, upsert_setting
from backend.services.json_store import DATA_DIR, load_json_file, write_json_file
from sqlalchemy.ext.asyncio import AsyncSession

FREQUENCIES_FILE = DATA_DIR / "sdr_frequencies.json"
BANDPLAN_FILE = DATA_DIR / "sdr_bandplan.json"

_FREQ_COMMENT = (
    "Source of truth for SDR frequency groups, stored frequencies, and search "
    "ranges. Seeds the database on startup; edited in-app (Settings > SDR > "
    "Frequencies & Groups) or by hand. Frequencies in Hz."
)
_BAND_COMMENT = (
    "Source of truth for the SDR waterfall band plan (coloured band-boundary "
    "strip). Seeds UserSettings(sdr.bandPlan) on startup; edited in-app "
    "(Settings > SDR > Band Plan) or by hand. Frequencies in Hz."
)


# ── sdr_frequencies.json (groups + frequencies + searchRanges) ──────────────

def load_sdr_frequencies_file() -> dict[str, list]:
    """Read sdr_frequencies.json as {groups, frequencies, searchRanges}.

    Returns empty lists for any missing/bad section so startup never fails.
    """
    raw = load_json_file(FREQUENCIES_FILE)
    if not isinstance(raw, dict):
        raw = {}
    out: dict[str, list] = {}
    for key in ("groups", "frequencies", "searchRanges"):
        val = raw.get(key)
        out[key] = val if isinstance(val, list) else []
    return out


async def write_sdr_frequencies_file(db: AsyncSession) -> bool:
    """Re-derive the flat {groups, frequencies, searchRanges} from the DB
    mirror (UserSettings, kept current by the sync_* helpers) and write the
    file. Call right after `sync_sdr_groups_to_config` /
    `sync_sdr_search_ranges_to_config` so the file matches the tables."""
    payload: dict[str, Any] = {
        "_comment": _FREQ_COMMENT,
        "groups": await get_setting(db, "sdr", "groups", default=[]),
        "frequencies": await get_setting(db, "sdr", "frequencies", default=[]),
        "searchRanges": await get_setting(db, "sdr", "searchRanges", default=[]),
    }
    return write_json_file(FREQUENCIES_FILE, payload)


async def reconcile_search_ranges(db: AsyncSession, ranges: list) -> None:
    """Rebuild the sdr_search_ranges table to match the flat config payload.

    The search-range equivalent of `_reconcile_sdr_frequencies`: replaces all
    rows with the supplied list. Skips malformed/invalid entries (low<high,
    step>0) rather than aborting. Does not commit (caller commits)."""
    from backend.cache import now_ms
    from backend.models import SdrSearchRange
    from sqlalchemy import delete

    await db.execute(delete(SdrSearchRange))
    ts = now_ms()
    for idx, entry in enumerate(ranges):
        if not isinstance(entry, dict):
            continue
        try:
            low = int(entry.get("low_hz", 0))
            high = int(entry.get("high_hz", 0))
            step = int(entry.get("step_hz", 12500))
            label = str(entry.get("label", "")).strip()
            if not label or low <= 0 or high <= low or step <= 0:
                continue
            db.add(SdrSearchRange(
                label          = label[:60],
                low_hz         = low,
                high_hz        = high,
                step_hz        = step,
                mode           = str(entry.get("mode", "NFM")),
                threshold_dbfs = float(entry.get("threshold_dbfs", -35.0)),
                dwell_ms       = int(entry.get("dwell_ms", 250)),
                band_name      = str(entry.get("band_name", "")),
                enabled        = bool(entry.get("enabled", True)),
                notes          = str(entry.get("notes", ""))[:500],
                sort_order     = idx,
                created_at     = ts,
            ))
        except (TypeError, ValueError):
            continue


# ── sdr_bandplan.json (bandPlan) ────────────────────────────────────────────

def load_sdr_bandplan_file() -> list:
    """Read sdr_bandplan.json's `bandPlan` array (empty list if missing/bad)."""
    raw = load_json_file(BANDPLAN_FILE)
    if isinstance(raw, dict) and isinstance(raw.get("bandPlan"), list):
        return raw["bandPlan"]
    return []


async def get_bandplan(db: AsyncSession) -> list:
    """Return the persisted bandPlan from UserSettings (empty if unset)."""
    val = await get_setting(db, "sdr", "bandPlan", default=[])
    return val if isinstance(val, list) else []


async def set_bandplan(db: AsyncSession, bandplan: list) -> None:
    """Persist the bandPlan into UserSettings and write the file back."""
    await upsert_setting(db, "sdr", "bandPlan", bandplan)
    write_sdr_bandplan_file(bandplan)


def write_sdr_bandplan_file(bandplan: list) -> bool:
    """Atomically write the bandPlan to sdr_bandplan.json (fail-soft)."""
    return write_json_file(BANDPLAN_FILE, {"_comment": _BAND_COMMENT, "bandPlan": bandplan})
