"""
tests/backend/test_docker_entrypoint.py

The app image's entrypoint (backend/docker-entrypoint.sh, section-containers
plan P7.1): the server process must never run as root.

The real script runs under /bin/sh with stand-ins for the three commands that
need root or touch the system — `id` (reports the effective user id the test
picks), `chown` and `setpriv` (record their arguments instead of acting) — put
first on PATH. `find` is the real one, walking real temporary directories, so
which entries get handed to the runtime user is decided exactly as in a
container. Pinned:
  * started as a non-root user, it runs the command unchanged: no chown, no drop;
  * started as root, it hands every entry not already owned by the runtime
    user/group to it, then drops to that user with setpriv;
  * entries already owned by the runtime user and group are left alone, and a
    group-only mismatch still counts as not owned;
  * missing directories are skipped, and a failing chown (a read-only mount)
    does not stop the drop;
  * the runtime ids default to 1000 and HOME stops pointing at /root.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pytest

ENTRYPOINT_SCRIPT = Path(__file__).resolve().parents[2] / "backend" / "docker-entrypoint.sh"

FAKE_ID_COMMAND = """#!/bin/sh
# Stand-in for `id -u`: the effective user id the test chose.
echo "$FAKE_EFFECTIVE_USER_ID"
"""

FAKE_CHOWN_COMMAND = """#!/bin/sh
# Stand-in for chown: records one line per call, then exits as the test chose.
echo "$*" >> "$CHOWN_CALL_LOG"
exit "${FAKE_CHOWN_EXIT_STATUS:-0}"
"""

FAKE_SETPRIV_COMMAND = """#!/bin/sh
# Stand-in for setpriv: records its arguments and the HOME it was given.
echo "$*" > "$SETPRIV_CALL_LOG"
echo "$HOME" > "$SETPRIV_HOME_LOG"
"""


@dataclass
class EntrypointRun:
    """What one run of the entrypoint did."""

    exit_status: int
    standard_output: str
    chown_calls: list[str]
    setpriv_arguments: str | None
    setpriv_home: str | None


@pytest.fixture
def run_entrypoint(tmp_path: Path):
    """Run the entrypoint with stand-in commands; returns an `EntrypointRun`."""
    stand_in_directory = tmp_path / "stand-in-commands"
    stand_in_directory.mkdir()
    for command_name, script in (
        ("id", FAKE_ID_COMMAND),
        ("chown", FAKE_CHOWN_COMMAND),
        ("setpriv", FAKE_SETPRIV_COMMAND),
    ):
        command_path = stand_in_directory / command_name
        command_path.write_text(script)
        command_path.chmod(0o755)

    chown_call_log = tmp_path / "chown-calls.log"
    setpriv_call_log = tmp_path / "setpriv-call.log"
    setpriv_home_log = tmp_path / "setpriv-home.log"

    def run(
        *,
        effective_user_id: int,
        writable_directories: list[Path],
        command: list[str],
        extra_environment: dict[str, str] | None = None,
    ) -> EntrypointRun:
        environment = {
            "PATH": f"{stand_in_directory}{os.pathsep}{os.environ['PATH']}",
            "HOME": "/root",
            "FAKE_EFFECTIVE_USER_ID": str(effective_user_id),
            "CHOWN_CALL_LOG": str(chown_call_log),
            "SETPRIV_CALL_LOG": str(setpriv_call_log),
            "SETPRIV_HOME_LOG": str(setpriv_home_log),
            "SENTINEL_WRITABLE_DIRECTORIES": " ".join(str(directory) for directory in writable_directories),
            **(extra_environment or {}),
        }
        completed = subprocess.run(
            ["/bin/sh", str(ENTRYPOINT_SCRIPT), *command],
            env=environment,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        return EntrypointRun(
            exit_status=completed.returncode,
            standard_output=completed.stdout,
            chown_calls=chown_call_log.read_text().splitlines() if chown_call_log.exists() else [],
            setpriv_arguments=setpriv_call_log.read_text().strip() if setpriv_call_log.exists() else None,
            setpriv_home=setpriv_home_log.read_text().strip() if setpriv_home_log.exists() else None,
        )

    return run


def _chowned_paths(chown_calls: list[str]) -> set[str]:
    """Every path any chown call was given (find batches several per call)."""
    return {path for call in chown_calls for path in call.split()[1:]}


def _make_data_directory(tmp_path: Path) -> Path:
    data_directory = tmp_path / "data"
    (data_directory / "recordings").mkdir(parents=True)
    (data_directory / "sentinel.db").write_text("")
    (data_directory / "recordings" / "clip.wav").write_text("")
    return data_directory


def test_a_non_root_start_runs_the_command_unchanged(run_entrypoint, tmp_path: Path) -> None:
    data_directory = _make_data_directory(tmp_path)

    result = run_entrypoint(
        effective_user_id=4242,
        writable_directories=[data_directory],
        command=["echo", "server started"],
    )

    assert result.exit_status == 0
    assert result.standard_output == "server started\n"
    assert result.chown_calls == []
    assert result.setpriv_arguments is None


def test_a_root_start_hands_unowned_entries_to_the_runtime_user_then_drops_to_it(
    run_entrypoint, tmp_path: Path
) -> None:
    data_directory = _make_data_directory(tmp_path)
    secret_directory = tmp_path / "secret"
    secret_directory.mkdir()
    (secret_directory / "secret").write_text("")
    # The temporary files belong to whoever runs the tests, never to uid 4242.
    assert os.getuid() != 4242

    result = run_entrypoint(
        effective_user_id=0,
        writable_directories=[data_directory, secret_directory],
        command=["uvicorn", "backend.main:app"],
        extra_environment={"SENTINEL_RUNTIME_USER_ID": "4242", "SENTINEL_RUNTIME_GROUP_ID": "4343"},
    )

    assert result.exit_status == 0
    assert all(call.split()[0] == "4242:4343" for call in result.chown_calls)
    assert _chowned_paths(result.chown_calls) == {
        str(data_directory),
        str(data_directory / "recordings"),
        str(data_directory / "sentinel.db"),
        str(data_directory / "recordings" / "clip.wav"),
        str(secret_directory),
        str(secret_directory / "secret"),
    }
    assert result.setpriv_arguments == "--reuid=4242 --regid=4343 --clear-groups -- uvicorn backend.main:app"
    # The command runs only through setpriv, never directly as root.
    assert result.standard_output == ""


def test_entries_already_owned_by_the_runtime_user_and_group_are_left_alone(run_entrypoint, tmp_path: Path) -> None:
    data_directory = _make_data_directory(tmp_path)

    result = run_entrypoint(
        effective_user_id=0,
        writable_directories=[data_directory],
        command=["uvicorn"],
        extra_environment={
            "SENTINEL_RUNTIME_USER_ID": str(os.getuid()),
            "SENTINEL_RUNTIME_GROUP_ID": str(os.getgid()),
        },
    )

    assert result.exit_status == 0
    assert result.chown_calls == []
    assert result.setpriv_arguments == f"--reuid={os.getuid()} --regid={os.getgid()} --clear-groups -- uvicorn"


def test_an_entry_owned_by_the_runtime_user_but_another_group_is_handed_over(run_entrypoint, tmp_path: Path) -> None:
    data_directory = _make_data_directory(tmp_path)
    other_group_id = os.getgid() + 1

    result = run_entrypoint(
        effective_user_id=0,
        writable_directories=[data_directory],
        command=["uvicorn"],
        extra_environment={
            "SENTINEL_RUNTIME_USER_ID": str(os.getuid()),
            "SENTINEL_RUNTIME_GROUP_ID": str(other_group_id),
        },
    )

    assert _chowned_paths(result.chown_calls) == {
        str(data_directory),
        str(data_directory / "recordings"),
        str(data_directory / "sentinel.db"),
        str(data_directory / "recordings" / "clip.wav"),
    }
    assert all(call.split()[0] == f"{os.getuid()}:{other_group_id}" for call in result.chown_calls)


def test_missing_directories_are_skipped(run_entrypoint, tmp_path: Path) -> None:
    data_directory = _make_data_directory(tmp_path)
    missing_directory = tmp_path / "not-mounted"

    result = run_entrypoint(
        effective_user_id=0,
        writable_directories=[missing_directory, data_directory],
        command=["uvicorn"],
        extra_environment={"SENTINEL_RUNTIME_USER_ID": "4242", "SENTINEL_RUNTIME_GROUP_ID": "4343"},
    )

    assert result.exit_status == 0
    assert not any(str(missing_directory) in call for call in result.chown_calls)
    assert str(data_directory) in _chowned_paths(result.chown_calls)
    assert result.setpriv_arguments is not None


def test_a_failing_chown_does_not_stop_the_drop(run_entrypoint, tmp_path: Path) -> None:
    read_only_mount = _make_data_directory(tmp_path)

    result = run_entrypoint(
        effective_user_id=0,
        writable_directories=[read_only_mount],
        command=["uvicorn"],
        extra_environment={
            "SENTINEL_RUNTIME_USER_ID": "4242",
            "SENTINEL_RUNTIME_GROUP_ID": "4343",
            "FAKE_CHOWN_EXIT_STATUS": "1",
        },
    )

    assert result.chown_calls != []
    assert result.exit_status == 0
    assert result.setpriv_arguments == "--reuid=4242 --regid=4343 --clear-groups -- uvicorn"


def test_the_runtime_user_defaults_to_1000_and_home_leaves_root(run_entrypoint, tmp_path: Path) -> None:
    data_directory = _make_data_directory(tmp_path)

    result = run_entrypoint(
        effective_user_id=0,
        writable_directories=[data_directory],
        command=["uvicorn"],
    )

    assert result.setpriv_arguments == "--reuid=1000 --regid=1000 --clear-groups -- uvicorn"
    assert result.setpriv_home == "/home/sentinel"
    if os.getuid() != 1000:
        assert all(call.split()[0] == "1000:1000" for call in result.chown_calls)
        assert str(data_directory / "sentinel.db") in _chowned_paths(result.chown_calls)
