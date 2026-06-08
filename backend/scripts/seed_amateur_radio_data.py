"""Apply the JSON output from fetch_amateur_radio_data.py to a Sentinel
SQLite database, writing the radio-info columns on satellite_catalogue.

Usage:
    python -m backend.scripts.seed_amateur_radio_data \
        --db backend/sentinel.db \
        --json backend/data/amateur_radio_data.json

Idempotent: re-running overwrites the radio columns with the latest values
in the JSON. Adds the radio columns to the table if they don't exist yet
(matches the migration logic in database.py).
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

_RADIO_FIELDS = (
    "uplink_hz",
    "uplink_mode",
    "downlink_hz",
    "downlink_mode",
    "ctcss_hz",
    "transponder_type",
    "beacon_hz",
    "packet_info",
    "radio_status",
    "radio_notes",
)

_COL_TYPES = {
    "uplink_hz": "INTEGER",
    "uplink_mode": "TEXT",
    "downlink_hz": "INTEGER",
    "downlink_mode": "TEXT",
    "ctcss_hz": "REAL",
    "transponder_type": "TEXT",
    "beacon_hz": "INTEGER",
    "packet_info": "TEXT",
    "radio_status": "TEXT",
    "radio_notes": "TEXT",
}


def _ensure_columns(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(satellite_catalogue)")}
    for col, sql_type in _COL_TYPES.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE satellite_catalogue ADD COLUMN {col} {sql_type}")
            print(f"  + added column {col}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description="Seed radio info into Sentinel DB")
    ap.add_argument("--db", required=True, help="Path to sentinel.db")
    ap.add_argument("--json", required=True, help="Path to amateur_radio_data.json")
    args = ap.parse_args()

    data = json.loads(Path(args.json).read_text())
    conn = sqlite3.connect(args.db)
    try:
        _ensure_columns(conn)
        now_ms = int(time.time() * 1000)
        applied = 0
        skipped = 0
        for norad_id, info in data.items():
            row = conn.execute("SELECT 1 FROM satellite_catalogue WHERE norad_id = ?", (norad_id,)).fetchone()
            if not row:
                print(f"  - skip {norad_id}: not in catalogue", file=sys.stderr)
                skipped += 1
                continue
            sets = []
            values: list = []
            for field in _RADIO_FIELDS:
                if field in info:
                    sets.append(f"{field} = ?")
                    values.append(info[field])
            if not sets:
                continue
            sets.append("updated_at = ?")
            values.append(now_ms)
            values.append(norad_id)
            conn.execute(
                f"UPDATE satellite_catalogue SET {', '.join(sets)} WHERE norad_id = ?",
                values,
            )
            applied += 1
        conn.commit()
        print(f"✓ updated {applied} satellites; skipped {skipped} not in catalogue", file=sys.stderr)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
