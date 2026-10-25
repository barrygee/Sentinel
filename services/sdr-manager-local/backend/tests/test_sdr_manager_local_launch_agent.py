"""Tests for `launch_agent.py`: installing and removing the LaunchAgent `uk.sentinel.sdr-manager-local`.

Every install goes into a temporary home, and `launchctl` is a recording fake,
so launchd is never touched.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_launch_agent.py
"""

from __future__ import annotations

import os
import plistlib
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import pytest

from sentinel_sdr_manager_local import launch_agent
from sentinel_sdr_manager_local.launch_agent import (
    LAUNCH_AGENT_LABEL,
    LAUNCHCTL_UNAVAILABLE,
    install_launch_agent,
    launch_agent_path,
    launch_agent_plist,
    launch_agent_state,
    launchd_domain,
    run_launchctl,
    uninstall_launch_agent,
)
from sentinel_sdr_manager_local.native import NativePaths, native_paths

SERVICE_TARGET = f"gui/{os.getuid()}/{LAUNCH_AGENT_LABEL}"


class FakeLaunchctl:
    """Records each `launchctl` call and answers from a table keyed by subcommand."""

    def __init__(self, answers: dict[str, subprocess.CompletedProcess[str]] | None = None) -> None:
        self.calls: list[list[str]] = []
        self._answers = answers or {}

    def __call__(self, arguments: Sequence[str]) -> subprocess.CompletedProcess[str]:
        self.calls.append(list(arguments))
        return self._answers.get(arguments[0], subprocess.CompletedProcess(list(arguments), 0, "", ""))


def _answer(returncode: int, stdout: str = "", stderr: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(["launchctl"], returncode, stdout, stderr)


@pytest.fixture
def home(tmp_path: Path) -> Path:
    return tmp_path / "home"


@pytest.fixture
def paths(home: Path, tmp_path: Path) -> NativePaths:
    return native_paths(home, tmp_path / "Sentinel")


class TestPlist:
    def test_runs_this_venvs_python_in_the_checkout_at_login(self, paths: NativePaths) -> None:
        agent = plistlib.loads(launch_agent_plist(paths, "/venv/bin/python"))

        assert agent["Label"] == "uk.sentinel.sdr-manager-local"
        assert agent["ProgramArguments"] == ["/venv/bin/python", "-m", "sentinel_sdr_manager_local.cli", "start"]
        assert agent["WorkingDirectory"] == str(paths.checkout)
        assert agent["RunAtLoad"] is True

    def test_restarts_after_a_crash_not_after_a_clean_stop_and_not_in_a_tight_loop(self, paths: NativePaths) -> None:
        agent = plistlib.loads(launch_agent_plist(paths, "/venv/bin/python"))

        assert agent["KeepAlive"] == {"SuccessfulExit": False}
        assert agent["ThrottleInterval"] == 10

    def test_logs_to_the_users_library(self, paths: NativePaths) -> None:
        agent = plistlib.loads(launch_agent_plist(paths, "/venv/bin/python"))

        assert agent["StandardOutPath"] == agent["StandardErrorPath"] == str(paths.log_file)

    def test_homebrews_tools_are_on_its_path(self, paths: NativePaths) -> None:
        agent = plistlib.loads(launch_agent_plist(paths, "/venv/bin/python"))

        assert agent["EnvironmentVariables"]["PATH"].split(":") == [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ]

    def test_this_python_by_default(self, paths: NativePaths) -> None:
        assert plistlib.loads(launch_agent_plist(paths))["ProgramArguments"][0] == sys.executable


class TestInstall:
    def test_writes_the_agent_and_loads_it_into_the_users_domain(self, home: Path, paths: NativePaths) -> None:
        launchctl = FakeLaunchctl()

        install_launch_agent(home, paths, launchctl)

        plist_path = home / "Library" / "LaunchAgents" / "uk.sentinel.sdr-manager-local.plist"
        assert plistlib.loads(plist_path.read_bytes())["Label"] == LAUNCH_AGENT_LABEL
        assert launchctl.calls == [
            ["bootout", SERVICE_TARGET],
            ["bootstrap", f"gui/{os.getuid()}", str(plist_path)],
        ]
        assert paths.log_file.parent.is_dir()

    def test_replaces_an_older_copy(self, home: Path, paths: NativePaths) -> None:
        launch_agent_path(home).parent.mkdir(parents=True)
        launch_agent_path(home).write_bytes(b"old")

        install_launch_agent(home, paths, FakeLaunchctl({"bootout": _answer(3, stderr="No such process")}))

        assert launch_agent_path(home).read_bytes() == launch_agent_plist(paths)

    def test_a_load_failure_raises_launchctls_message(self, home: Path, paths: NativePaths) -> None:
        launchctl = FakeLaunchctl({"bootstrap": _answer(5, stderr="Bootstrap failed: 5: Input/output error\n")})

        with pytest.raises(RuntimeError, match="could not load .*: Bootstrap failed: 5: Input/output error$"):
            install_launch_agent(home, paths, launchctl)

    def test_a_load_failure_without_stderr_uses_stdout(self, home: Path, paths: NativePaths) -> None:
        launchctl = FakeLaunchctl({"bootstrap": _answer(1, stdout="Load failed\n")})

        with pytest.raises(RuntimeError, match="Load failed$"):
            install_launch_agent(home, paths, launchctl)


class TestUninstall:
    def test_unloads_and_deletes_the_agent(self, home: Path, paths: NativePaths) -> None:
        install_launch_agent(home, paths, FakeLaunchctl())
        launchctl = FakeLaunchctl()

        assert uninstall_launch_agent(home, launchctl) is True
        assert not launch_agent_path(home).exists()
        assert launchctl.calls == [["bootout", SERVICE_TARGET]]

    def test_reports_when_nothing_was_installed(self, home: Path) -> None:
        launchctl = FakeLaunchctl()

        assert uninstall_launch_agent(home, launchctl) is False
        # Still unloads, in case a copy was loaded from a plist since deleted by hand.
        assert launchctl.calls == [["bootout", SERVICE_TARGET]]


class TestState:
    def test_installed_loaded_and_running(self, home: Path, paths: NativePaths) -> None:
        install_launch_agent(home, paths, FakeLaunchctl())
        launchctl = FakeLaunchctl({"print": _answer(0, stdout="{\n\tstate = running\n\tpid = 4242\n}\n")})

        state = launch_agent_state(home, launchctl)

        assert (state.installed, state.loaded, state.process_id) == (True, True, 4242)
        assert launchctl.calls == [["print", SERVICE_TARGET]]

    def test_loaded_but_not_running_has_no_process(self, home: Path) -> None:
        state = launch_agent_state(home, FakeLaunchctl({"print": _answer(0, stdout="\tstate = waiting\n")}))

        assert (state.installed, state.loaded, state.process_id) == (False, True, None)

    def test_a_pid_line_without_a_number_is_no_process(self, home: Path) -> None:
        state = launch_agent_state(home, FakeLaunchctl({"print": _answer(0, stdout="\tpid = unknown\n")}))

        assert state.process_id is None

    def test_not_loaded(self, home: Path) -> None:
        state = launch_agent_state(home, FakeLaunchctl({"print": _answer(113, stdout="\tpid = 7\n")}))

        assert (state.loaded, state.process_id) == (False, None)


class TestRunLaunchctl:
    def test_runs_launchctl_capturing_text_and_never_checking(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[tuple[Any, dict[str, Any]]] = []

        def fake_run(command: Any, **options: Any) -> subprocess.CompletedProcess[str]:
            calls.append((command, options))
            return subprocess.CompletedProcess(command, 113, "", "not found")

        monkeypatch.setattr(launch_agent.subprocess, "run", fake_run)

        assert run_launchctl(["print", "gui/1/x"]).returncode == 113
        assert calls == [(["launchctl", "print", "gui/1/x"], {"capture_output": True, "text": True, "check": False})]

    def test_without_launchctl_it_answers_like_a_failed_command(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def missing(*_arguments: Any, **_options: Any) -> None:
            raise FileNotFoundError("launchctl")

        monkeypatch.setattr(launch_agent.subprocess, "run", missing)

        result = run_launchctl(["print", "gui/1/x"])

        assert (result.returncode, result.stdout, result.stderr) == (LAUNCHCTL_UNAVAILABLE, "", "launchctl")


def test_the_domain_is_the_users_gui_session() -> None:
    assert launchd_domain() == f"gui/{os.getuid()}"
