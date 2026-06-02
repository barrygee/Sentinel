"""Apply curated satellite radio frequencies into a Sentinel database.

Merges two NORAD-keyed JSON sources:
  - backend/data/amateur_radio_data.json   (amateur sats, from SatNOGS)
  - backend/data/satellite_radio_extra.json (weather/space-station/science/
                                             cubesat/navigation/military)

For each NORAD ID present in satellite_catalogue, this writes BOTH:
  1. the persistent, clear-survivable store — UserSettings(space/satelliteRadio),
     a JSON map norad_id -> {radio fields}; and
  2. the satellite_catalogue radio columns (the fast display cache).

Only the known radio fields are written. Entries whose NORAD ID is not in the
catalogue are skipped (reported). Idempotent: re-running overwrites with the
latest curated values.

Usage:
    python backend/scripts/apply_satellite_radio.py --db /app/data/sentinel.db
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

RADIO_FIELDS = (
    "uplink_hz", "uplink_mode", "downlink_hz", "downlink_mode",
    "ctcss_hz", "transponder_type", "beacon_hz", "packet_info",
    "radio_status", "radio_notes",
)

_DATA = Path(__file__).resolve().parent.parent / "data"
_SOURCES = (
    _DATA / "amateur_radio_data.json",
    _DATA / "satellite_radio_extra.json",
)


def _clean(entry: dict) -> dict:
    """Keep only known radio fields with a non-null, non-blank value."""
    out = {}
    for f in RADIO_FIELDS:
        v = entry.get(f)
        if v is None:
            continue
        if isinstance(v, str) and v.strip() == "":
            continue
        # beacon_hz==0 is our 'no public downlink' sentinel — drop it.
        if f.endswith("_hz") and v == 0:
            continue
        out[f] = v
    return out


def load_sources() -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for path in _SOURCES:
        if not path.exists():
            print(f"  ! source missing: {path}", file=sys.stderr)
            continue
        raw = json.loads(path.read_text())
        for nid, entry in raw.items():
            if nid.startswith("_") or not isinstance(entry, dict):
                continue
            cleaned = _clean(entry)
            if not cleaned:
                continue
            # extra file wins over amateur file on conflict (loaded second).
            merged[str(nid)] = {**merged.get(str(nid), {}), **cleaned}
    return merged


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply curated satellite radio frequencies")
    ap.add_argument("--db", required=True, help="Path to sentinel.db")
    ap.add_argument("--dry-run", action="store_true", help="Report only; write nothing")
    args = ap.parse_args()

    radio_map = load_sources()
    print(f"loaded {len(radio_map)} curated satellites from {len(_SOURCES)} sources", file=sys.stderr)

    conn = sqlite3.connect(args.db)
    try:
        catalogue = {r[0] for r in conn.execute("SELECT norad_id FROM satellite_catalogue")}
        present = {nid: e for nid, e in radio_map.items() if nid in catalogue}
        missing = sorted(set(radio_map) - catalogue)

        print(f"  {len(present)} match the catalogue; {len(missing)} not present", file=sys.stderr)
        if missing:
            print(f"  not-in-catalogue (skipped): {', '.join(missing[:20])}"
                  + (" …" if len(missing) > 20 else ""), file=sys.stderr)

        if args.dry_run:
            print("dry-run: no changes written", file=sys.stderr)
            return 0

        now_ms = int(time.time() * 1000)

        # 1) Persistent store — UserSettings(space/satelliteRadio). Merge with any
        #    existing user edits so we never clobber manual entries for other sats.
        row = conn.execute(
            "SELECT value FROM user_settings WHERE namespace='space' AND key='satelliteRadio'"
        ).fetchone()
        store = {}
        if row:
            try:
                store = json.loads(row[0]) or {}
            except (json.JSONDecodeError, TypeError):
                store = {}
        store.update(present)
        store_json = json.dumps(store)
        if row:
            conn.execute(
                "UPDATE user_settings SET value=?, updated_at=? WHERE namespace='space' AND key='satelliteRadio'",
                (store_json, now_ms),
            )
        else:
            conn.execute(
                "INSERT INTO user_settings (namespace, key, value, updated_at) VALUES ('space','satelliteRadio',?,?)",
                (store_json, now_ms),
            )

        # 2) Catalogue display columns.
        applied = 0
        for nid, entry in present.items():
            sets, vals = [], []
            for f in RADIO_FIELDS:
                if f in entry:
                    sets.append(f"{f} = ?")
                    vals.append(entry[f])
            if not sets:
                continue
            sets.append("updated_at = ?")
            vals.append(now_ms)
            vals.append(nid)
            conn.execute(
                f"UPDATE satellite_catalogue SET {', '.join(sets)} WHERE norad_id = ?", vals
            )
            applied += 1

        conn.commit()
        print(f"✓ store now holds {len(store)} sats; updated {applied} catalogue rows", file=sys.stderr)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
