"""Shared golden-file machinery for the P0 parity baseline.

These tests record the current, accepted behaviour of the FastAPI monolith
(HTTP contract, settings/config shape, DB schema, WebSocket protocol) as
golden files under `golden/`, so a later container-split refactor can prove
zero behaviour change by re-running the same tests unmodified.

Regenerate a golden after a deliberate, reviewed behaviour change:

    SENTINEL_UPDATE_PARITY=1 uv run --project backend pytest tests/backend/parity

Then re-run without the env var to confirm the suite is green.
"""

from __future__ import annotations

import difflib
import json
import os
from pathlib import Path
from typing import Any

GOLDEN_DIR = Path(__file__).parent / "golden"


def render_json(data: Any, *, sort_keys: bool = True) -> str:
    """Deterministic, stable JSON text for a golden file: 2-space indent,
    optionally key-sorted, trailing newline."""
    return json.dumps(data, indent=2, sort_keys=sort_keys, ensure_ascii=False) + "\n"


def assert_golden(name: str, rendered_text: str, *, allow_update: bool = True) -> None:
    """Compare `rendered_text` against golden/<name>.json.

    With `SENTINEL_UPDATE_PARITY=1` set, (re)writes the golden instead of
    failing — used once to record a baseline or a deliberate change. Failure
    messages show a readable unified diff.

    `allow_update=False` forces the real compare-and-raise path regardless of
    the env var — used by the "validity check" tests, which deliberately feed
    in perturbed data and must still go red even during a golden-recording
    run, or they'd silently corrupt the golden they share with the real test.
    """
    path = GOLDEN_DIR / f"{name}.json"

    if allow_update and os.environ.get("SENTINEL_UPDATE_PARITY") == "1":
        GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered_text, encoding="utf-8")
        return

    if not path.exists():
        raise AssertionError(
            f"Golden file {path} does not exist. Generate it with "
            f"SENTINEL_UPDATE_PARITY=1 uv run --project backend pytest {path.parent.parent}"
        )

    expected = path.read_text(encoding="utf-8")
    if expected != rendered_text:
        diff = "\n".join(
            difflib.unified_diff(
                expected.splitlines(),
                rendered_text.splitlines(),
                fromfile=f"golden/{name}.json (expected)",
                tofile=f"golden/{name}.json (actual)",
                lineterm="",
            )
        )
        raise AssertionError(f"Golden mismatch for {name!r} — parity broken:\n{diff}")
