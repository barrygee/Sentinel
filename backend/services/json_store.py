"""Shared helpers for the git-tracked JSON data files that seed the database.

Curated reference data (satellite radio frequencies, SDR frequencies/groups/
search-ranges, the SDR band plan) lives in dedicated JSON files under
backend/data/. Each file is the source of truth: it seeds the database on
startup and is written back on every edit. These helpers centralise the read
(fail-soft) and atomic-write logic so every data store behaves identically.

The runtime DB / UserSettings copy remains authoritative at runtime, so a
read-only filesystem (a baked-image deploy without the backend bind mount) is
tolerated: writes fail soft (log + return False) rather than raising.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_json_file(path: Path, default: Any = None) -> Any:
    """Parse a JSON data file, returning `default` ({} if unset) on any error.

    Tolerates a missing or malformed file so startup never fails on a bad seed.
    """
    if default is None:
        default = {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("%s unreadable (%s) — treating as empty", path.name, exc)
        return default


def write_json_file(path: Path, payload: Any) -> bool:
    """Atomically write `payload` as pretty JSON to `path`.

    Writes via a temp file + os.replace so a crash never leaves a half-written
    file. Returns False (and logs a warning) on OSError — e.g. a read-only
    filesystem — so callers can keep the DB copy and still succeed.
    """
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, path)
        except BaseException:
            os.unlink(tmp)
            raise
    except OSError as exc:
        logger.warning("could not write %s (%s) — DB copy still updated", path, exc)
        return False
    return True
