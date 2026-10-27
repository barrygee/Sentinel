"""`.env.example` documents every `SDR_MANAGER_LOCAL_*` setting, at its default.

The SDR Manager guides send operators to `.env.example` for this service's
settings, so a field added to `config.py` without a line there is invisible to
them, and a line whose name no field reads silently does nothing.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_env_example.py
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from sentinel_sdr_manager_local.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[4]
ENVIRONMENT_PREFIX = "SDR_MANAGER_LOCAL_"
# A variable line, active or commented out: `NAME=value` or `# NAME=value`.
# Only one space after the `#`, so the indented recipe table at the top of the
# file, which quotes NAME=value pairs, is not taken for a setting.
VARIABLE_LINE = re.compile(rf"^(?P<commented># ?)?(?P<name>{ENVIRONMENT_PREFIX}[A-Z0-9_]+)=(?P<value>.*)$")


def documented_variables() -> list[re.Match[str]]:
    """Every `SDR_MANAGER_LOCAL_*` assignment line in `.env.example`, in file order."""
    lines = (REPO_ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
    return [match for line in lines if (match := VARIABLE_LINE.match(line))]


def field_variable_names() -> set[str]:
    return {ENVIRONMENT_PREFIX + field_name.upper() for field_name in Settings.model_fields}


def test_every_setting_has_a_line() -> None:
    documented_names = {match["name"] for match in documented_variables()}

    assert field_variable_names() - documented_names == set()


def test_every_line_names_a_setting() -> None:
    documented_names = {match["name"] for match in documented_variables()}

    assert documented_names - field_variable_names() == set()


def test_each_setting_is_documented_once() -> None:
    names = [match["name"] for match in documented_variables()]

    assert sorted(name for name in set(names) if names.count(name) > 1) == []


def test_the_active_lines_set_the_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    # Copying .env.example must change nothing until the operator edits a line;
    # the commented-out lines are examples of values to set, so they are skipped.
    active_lines = [match for match in documented_variables() if not match["commented"]]
    assert active_lines, "expected some active SDR_MANAGER_LOCAL_ lines"
    for match in active_lines:
        monkeypatch.setenv(match["name"], match["value"])

    from_example = Settings()
    for match in active_lines:
        monkeypatch.delenv(match["name"])

    assert from_example.model_dump() == Settings().model_dump()
