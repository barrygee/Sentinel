"""
Refresh the bundled UK repeater directory snapshot.

Fetches the RSGB ETCC CSV export from ukrepeater.net, normalises it exactly as
the running backend does (``backend.services.repeaters``) and rewrites
``backend/data/uk_repeaters.json`` — the offline fallback the Land map's
repeater layer serves on an install that has never reached the site.

Run from the repo root::

    uv run --project backend python -m backend.scripts.refresh_repeaters
"""

from __future__ import annotations

import json
import sys

import httpx
from backend.config import settings
from backend.services.repeaters import BUNDLED_JSON_PATH, USER_AGENT, parse_repeater_csv


def main() -> int:
    """Download, parse and write the snapshot; returns a process exit code."""
    response = httpx.get(
        settings.repeaters_upstream_url,
        timeout=settings.repeaters_fetch_timeout_s,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )
    response.raise_for_status()
    stations = parse_repeater_csv(response.text)
    if not stations:
        print("refusing to write an empty snapshot", file=sys.stderr)
        return 1
    BUNDLED_JSON_PATH.write_text(json.dumps({"stations": stations}, indent=2) + "\n", encoding="utf-8")
    channel_count = sum(len(station["channels"]) for station in stations)
    print(f"wrote {len(stations)} stations / {channel_count} channels to {BUNDLED_JSON_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
