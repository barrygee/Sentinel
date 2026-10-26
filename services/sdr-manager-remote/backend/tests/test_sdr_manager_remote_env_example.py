"""`.env.example` documents every `SDR_MANAGER_REMOTE_*` setting, commented out at its default.

Run with:  uv run --project backend pytest services/sdr-manager-remote/backend/tests/test_sdr_manager_remote_env_example.py
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from sentinel_sdr_manager_remote.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[4]
ENVIRONMENT_PREFIX = "SDR_MANAGER_REMOTE_"
# A variable line, active or commented out: `NAME=value` or `# NAME=value`.
# Only one space after the `#`, so the indented recipe table at the top of the
# file, which quotes NAME=value pairs, is not taken for a setting.
VARIABLE_LINE = re.compile(rf"^(?P<commented># ?)?(?P<name>{ENVIRONMENT_PREFIX}[A-Z0-9_]+)=(?P<value>.*)$")


def documented_variables() -> list[re.Match[str]]:
    """Every `SDR_MANAGER_REMOTE_*` assignment line in `.env.example`, in file order."""
    lines = (REPO_ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
    return [match for line in lines if (match := VARIABLE_LINE.match(line))]


def test_every_setting_has_exactly_one_line() -> None:
    names = [match["name"] for match in documented_variables()]

    assert sorted(names) == sorted(ENVIRONMENT_PREFIX + field_name.upper() for field_name in Settings.model_fields)


def test_every_line_is_commented_out() -> None:
    # The timings are for tuning, not setup: nothing in a fresh .env sets them.
    assert [match["name"] for match in documented_variables() if not match["commented"]] == []


def test_each_line_shows_the_default(monkeypatch: pytest.MonkeyPatch) -> None:
    for match in documented_variables():
        monkeypatch.setenv(match["name"], match["value"])

    from_example = Settings()
    for match in documented_variables():
        monkeypatch.delenv(match["name"])

    assert from_example.model_dump() == Settings().model_dump()
