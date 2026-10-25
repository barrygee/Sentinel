"""Tests for `cli.py`: the `sdr-manager-local` command's subcommands, messages and exit codes.

The work behind each subcommand (the native environment, uvicorn, launchd,
the checks) is replaced with recording fakes; `test_sdr_manager_local_native`,
`_launch_agent` and `_native_checks` test those.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_cli.py
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path
from typing import Any

import pytest

from sentinel_sdr_manager_local import cli, run_server
from sentinel_sdr_manager_local.native import NativePaths
from sentinel_sdr_manager_local.native_checks import DOCTOR_CHECKS, STATUS_CHECKS, CheckContext, CheckResult


@pytest.fixture
def home(tmp_path: Path) -> Path:
    return tmp_path / "home"


@pytest.fixture
def checkout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    folder = tmp_path / "Sentinel"
    folder.mkdir()
    monkeypatch.setattr("sentinel_sdr_manager_local.native.find_checkout", lambda: folder)
    return folder


class TestStart:
    @pytest.fixture
    def started(self, monkeypatch: pytest.MonkeyPatch) -> list[str]:
        order: list[str] = []
        monkeypatch.setattr(
            cli, "apply_native_environment", lambda paths: order.append(f"environment {paths.checkout}")
        )
        monkeypatch.setattr(run_server, "main", lambda: order.append("serve"))
        return order

    def test_sets_the_environment_before_serving(
        self, home: Path, checkout: Path, started: list[str], capsys: pytest.CaptureFixture[str]
    ) -> None:
        credentials = checkout / "sdr-manager-local-credentials"
        credentials.mkdir()
        for name in ("http-credentials.json", "accepted-callers.json", "certificate-authority.pem"):
            (credentials / name).write_text("x")

        assert cli.main(["start"], home) == 0

        assert started == [f"environment {checkout}", "serve"]
        assert capsys.readouterr().err == ""

    def test_without_credentials_it_still_serves_but_says_why_sentinel_cant_see_it(
        self, home: Path, checkout: Path, started: list[str], capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert cli.main(["start"], home) == 0

        error = capsys.readouterr().err
        assert "http-credentials.json, accepted-callers.json, certificate-authority.pem missing" in error
        assert "SDR_MANAGER_LOCAL_NATIVE=1" in error
        assert started[-1] == "serve"


class TestInstall:
    def test_installs_and_says_how_to_check(
        self, home: Path, checkout: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        installed: list[tuple[Path, NativePaths]] = []
        monkeypatch.setattr(cli, "install_launch_agent", lambda home, paths: installed.append((home, paths)))

        assert cli.main(["install"], home) == 0

        [(installed_home, paths)] = installed
        assert (installed_home, paths.checkout) == (home, checkout)
        output = capsys.readouterr().out
        assert f"Log: {paths.log_file}" in output
        assert "uv run --project backend sdr-manager-local status" in output

    def test_a_launchd_failure_is_reported_and_exits_1(
        self, home: Path, checkout: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        def failing(_home: Path, _paths: NativePaths) -> None:
            raise RuntimeError("launchctl could not load it")

        monkeypatch.setattr(cli, "install_launch_agent", failing)

        assert cli.main(["install"], home) == 1
        assert capsys.readouterr().err == "sdr-manager-local: launchctl could not load it\n"


class TestUninstall:
    @pytest.mark.parametrize(
        ("was_installed", "message"),
        [(True, "SDR Manager stopped and removed from login items"), (False, "wasn't set up to start at login")],
    )
    def test_says_what_it_did(
        self,
        home: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
        was_installed: bool,
        message: str,
    ) -> None:
        removed: list[Path] = []
        monkeypatch.setattr(cli, "uninstall_launch_agent", lambda home: removed.append(home) or was_installed)

        assert cli.main(["uninstall"], home) == 0
        assert removed == [home]
        assert message in capsys.readouterr().out


class TestReport:
    @pytest.fixture
    def ran(self, monkeypatch: pytest.MonkeyPatch) -> list[tuple[Any, CheckContext]]:
        calls: list[tuple[Any, CheckContext]] = []

        def fake_run_checks(checks: Any, context: CheckContext) -> list[CheckResult]:
            calls.append((checks, context))
            return [CheckResult("librtlsdr", "ok", "loaded")]

        monkeypatch.setattr(cli, "run_checks", fake_run_checks)
        return calls

    def test_status_runs_the_status_checks(
        self, home: Path, checkout: Path, ran: list[tuple[Any, CheckContext]], capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert cli.main(["status"], home) == 0

        [(checks, context)] = ran
        assert checks is STATUS_CHECKS
        assert (context.home, context.paths.checkout) == (home, checkout)
        assert "✓ librtlsdr  loaded" in capsys.readouterr().out

    def test_doctor_runs_the_doctor_checks(
        self, home: Path, checkout: Path, ran: list[tuple[Any, CheckContext]]
    ) -> None:
        cli.main(["doctor"], home)

        assert ran[0][0] is DOCTOR_CHECKS

    @pytest.mark.parametrize(("outcome", "exit_code"), [("warning", 0), ("problem", 1)])
    def test_exits_1_only_for_a_problem(
        self, home: Path, checkout: Path, monkeypatch: pytest.MonkeyPatch, outcome: Any, exit_code: int
    ) -> None:
        monkeypatch.setattr(cli, "run_checks", lambda _checks, _context: [CheckResult("x", outcome, "y")])

        assert cli.main(["status"], home) == exit_code


class TestCommandLine:
    def test_a_subcommand_is_required(self, capsys: pytest.CaptureFixture[str]) -> None:
        with pytest.raises(SystemExit) as exited:
            cli.main([])

        assert exited.value.code == 2
        assert "the following arguments are required: command" in capsys.readouterr().err

    def test_an_unknown_subcommand_is_refused(self) -> None:
        with pytest.raises(SystemExit) as exited:
            cli.main(["restart"])

        assert exited.value.code == 2

    def test_defaults_to_the_users_home(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.setenv("HOME", str(tmp_path))
        homes: list[Path] = []
        monkeypatch.setattr(cli, "uninstall", lambda home: homes.append(home) or 0)

        cli.main(["uninstall"])

        assert homes == [tmp_path]

    def test_the_console_script_exits_with_mains_code(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(cli, "main", lambda: 3)

        with pytest.raises(SystemExit) as exited:
            cli.main_with_exit()

        assert exited.value.code == 3

    def test_runs_as_a_module(self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
        monkeypatch.setattr(sys, "argv", ["sdr-manager-local", "--help"])

        with pytest.raises(SystemExit) as exited:
            runpy.run_module("sentinel_sdr_manager_local.cli", run_name="__main__")

        assert exited.value.code == 0
        assert "start" in capsys.readouterr().out
