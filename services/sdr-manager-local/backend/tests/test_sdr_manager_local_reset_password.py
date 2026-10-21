"""Tests for `reset_password.py`, the shell recovery path for a forgotten console password.

It must never clear without an explicit yes — the console is open to the whole
network afterwards — and clearing must sign every session out.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_reset_password.py
"""

from __future__ import annotations

import asyncio
import builtins
import runpy

import pytest
from backend import database as core_database
from sqlalchemy.ext.asyncio import AsyncEngine

from sentinel_sdr_manager_local import reset_password
from sentinel_sdr_manager_local.services.console_auth import ConsoleAuthService

PASSWORD = "a good long password"


def _console_auth() -> ConsoleAuthService:
    return ConsoleAuthService(core_database.AsyncSessionLocal)


async def _set_password_and_sign_in() -> str:
    console_auth = _console_auth()
    await console_auth.set_password(PASSWORD, current_password=None)
    return await console_auth.issue_session()


@pytest.mark.parametrize("answer", ["y", "Y", "yes", " YES "])
async def test_a_yes_clears_the_password_and_every_session(seeded_database: AsyncEngine, answer: str) -> None:
    session_before = await _set_password_and_sign_in()
    # `main` runs its own event loop, as the shell command does, so it runs in
    # a thread here; the pool is emptied either side so no connection crosses loops.
    await seeded_database.dispose()

    exit_code = await asyncio.to_thread(reset_password.main, lambda _prompt: answer)

    await seeded_database.dispose()
    assert exit_code == 0
    console_auth = _console_auth()
    assert await console_auth.is_password_set() is False
    assert await console_auth.session_is_valid(session_before) is False


@pytest.mark.parametrize("answer", ["", "n", "no", "maybe"])
async def test_anything_but_yes_leaves_it_set(
    seeded_database: AsyncEngine, answer: str, capsys: pytest.CaptureFixture[str]
) -> None:
    await _set_password_and_sign_in()

    assert reset_password.main(ask=lambda _prompt: answer) == 1

    assert await _console_auth().is_password_set() is True
    assert "Left unchanged." in capsys.readouterr().err


async def test_no_terminal_means_no(seeded_database: AsyncEngine) -> None:
    await _set_password_and_sign_in()

    def no_terminal(_prompt: str) -> str:
        raise EOFError

    assert reset_password.main(ask=no_terminal) == 1
    assert await _console_auth().is_password_set() is True


def test_warns_before_asking(capsys: pytest.CaptureFixture[str]) -> None:
    prompts: list[str] = []

    def record(prompt: str) -> str:
        prompts.append(prompt)
        return "n"

    reset_password.main(ask=record)

    assert "anyone who can reach this machine" in capsys.readouterr().out
    assert prompts == ["  Continue? [y/N] "]


def test_runs_as_a_module(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(builtins, "input", lambda _prompt: "n")

    with pytest.raises(SystemExit) as exited:
        runpy.run_path(reset_password.__file__, run_name="__main__")

    assert exited.value.code == 1
