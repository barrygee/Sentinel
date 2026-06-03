"""Build / apply the consolidated satellite radio frequency source of truth.

At runtime there is a SINGLE source of truth: backend/data/satellite_radio.json
(a NORAD-keyed map of radio fields), seeded into the persistent store on startup
and written back on every UI edit (see backend/services/sat_radio.py).

This script is the OFFLINE regeneration tool for that file. It merges the two
curated intermediate sources:
  - backend/data/amateur_radio_data.json   (amateur sats, from SatNOGS)
  - backend/data/satellite_radio_extra.json (weather/space-station/science/
                                             cubesat/navigation/military)
into satellite_radio.json (the extra file wins on conflict). NORAD IDs are
normalised to unpadded strings.

Usage:
    # Regenerate the consolidated file from the two curated sources:
    python backend/scripts/apply_satellite_radio.py --rebuild-file

    # (Legacy) directly apply the merge into a DB's store + catalogue columns:
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


_RADIO_FILE = _DATA / "satellite_radio.json"
_FILE_COMMENT = (
    "Single source of truth for satellite radio frequencies. NORAD ID -> radio "
    "fields. Frequencies in Hz (integer). Editable in-app (Settings > Space > "
    "Satellite Radio) or by hand-editing this file; in-app edits are written "
    "back here."
)


def rebuild_file() -> int:
    """Regenerate satellite_radio.json from the two curated intermediate sources."""
    raw = load_sources()
    # Normalise NORAD IDs to unpadded strings (amateur source keys are
    # zero-padded), re-merging any that collide.
    radio_map: dict[str, dict] = {}
    for nid, entry in raw.items():
        key = str(int(nid))
        radio_map[key] = {**radio_map.get(key, {}), **entry}
    payload: dict = {"_comment": _FILE_COMMENT}
    for nid in sorted(radio_map, key=lambda x: int(x)):
        payload[nid] = radio_map[nid]
    _RADIO_FILE.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"✓ wrote {len(radio_map)} satellites to {_RADIO_FILE}", file=sys.stderr)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Build/apply curated satellite radio frequencies")
    ap.add_argument("--db", help="Path to sentinel.db (legacy direct-apply mode)")
    ap.add_argument("--rebuild-file", action="store_true",
                    help="Regenerate backend/data/satellite_radio.json from the curated sources")
    ap.add_argument("--dry-run", action="store_true", help="Report only; write nothing")
    args = ap.parse_args()

    if args.rebuild_file:
        return rebuild_file()
    if not args.db:
        ap.error("one of --rebuild-file or --db is required")

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
