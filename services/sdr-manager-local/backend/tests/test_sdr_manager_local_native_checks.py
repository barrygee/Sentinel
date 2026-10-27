"""Tests for `native_checks.py`: what `sdr-manager-local status` and `doctor` report, and the fix for each problem.

Every probe (librtlsdr, the tools, ioreg, launchctl, HTTP, the port) is faked
through `CheckContext`, so each failure is reproduced without a Mac's
hardware or a running stack.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_native_checks.py
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
import pytest

from sentinel_sdr_manager_local import native_checks
from sentinel_sdr_manager_local.adapters.ctypes_rtlsdr import RtlSdrLibraryUnavailableError
from sentinel_sdr_manager_local.adapters.macos.homebrew import find_homebrew_executable
from sentinel_sdr_manager_local.adapters.macos.ioreg_usb import IoregUsbDiscovery
from sentinel_sdr_manager_local.interfaces.types import UsbDeviceSnapshot
from sentinel_sdr_manager_local.launch_agent import LaunchAgentState
from sentinel_sdr_manager_local.native import NativePaths, native_paths
from sentinel_sdr_manager_local.native_checks import (
    COMMAND,
    DOCTOR_CHECKS,
    STATUS_CHECKS,
    CheckContext,
    CheckResult,
    check_api,
    check_core,
    check_credentials,
    check_dongles,
    check_homebrew,
    check_launch_agent,
    check_library,
    check_library_version,
    check_native_switch,
    check_platform,
    check_port,
    check_rtl_eeprom,
    check_rtl_tcp,
    format_report,
    run_checks,
)
from sentinel_sdr_manager_local.run_server import port_is_free


class FakeLibrary:
    def __init__(self, loaded_from: str) -> None:
        self.loaded_from = loaded_from


def _no_library(_path: str | None) -> FakeLibrary:
    raise RtlSdrLibraryUnavailableError("no librtlsdr")


def _snapshot(vendor_id: str, product_id: str, topology_path: str) -> UsbDeviceSnapshot:
    return UsbDeviceSnapshot(
        topology_path=topology_path,
        bus_number=32,
        port_chain=(1,),
        device_address=1,
        vendor_id=vendor_id,
        product_id=product_id,
        serial=None,
        manufacturer=None,
        product=None,
        driver=None,
        sysfs_path="ioreg:test",
    )


class FakeDiscovery(IoregUsbDiscovery):
    def __init__(self, *snapshots: UsbDeviceSnapshot) -> None:
        super().__init__(lambda: b"")
        self._snapshots = list(snapshots)

    def enumerate(self) -> list[UsbDeviceSnapshot]:
        return self._snapshots


@pytest.fixture
def paths(tmp_path: Path) -> NativePaths:
    checkout = tmp_path / "Sentinel"
    checkout.mkdir()
    return native_paths(tmp_path / "home", checkout)


def _context(paths: NativePaths, **overrides: Any) -> CheckContext:
    options: dict[str, Any] = {
        "platform": "darwin",
        "load_library": lambda _path: FakeLibrary("/opt/homebrew/lib/librtlsdr.dylib"),
        "find_executable": lambda name: f"/opt/homebrew/bin/{name}",
        "usb_discovery": FakeDiscovery(),
        "read_launch_agent": lambda _home: LaunchAgentState(installed=True, loaded=True, process_id=42),
        "http_get": lambda _url, _authority: 200,
        "port_free": lambda _host, _port: True,
    }
    options.update(overrides)
    return CheckContext(paths, paths.data_directory.parent, **options)


def _write_credentials(paths: NativePaths, mode: int = 0o700) -> None:
    paths.credentials_directory.mkdir()
    for name in ("http-credentials.json", "accepted-callers.json", "certificate-authority.pem"):
        (paths.credentials_directory / name).write_text("x")
    paths.credentials_directory.chmod(mode)


class TestContext:
    def test_reads_its_env_values_port_and_library_path_from_the_checkouts_env(self, paths: NativePaths) -> None:
        paths.env_file.write_text("SDR_MANAGER_LOCAL_HTTP_PORT=9000\nSDR_MANAGER_LOCAL_LIBRTLSDR_PATH=/lib/r.dylib\n")
        context = _context(paths)

        assert context.port == 9000
        assert context.library_path == "/lib/r.dylib"

    def test_a_blank_library_path_is_none(self, paths: NativePaths) -> None:
        paths.env_file.write_text("SDR_MANAGER_LOCAL_LIBRTLSDR_PATH=\n")

        assert _context(paths).library_path is None

    def test_the_default_probes_are_the_real_ones(self, paths: NativePaths, monkeypatch: pytest.MonkeyPatch) -> None:
        loaded: list[tuple[Any, ...]] = []
        monkeypatch.setattr(native_checks, "CtypesRtlSdrLibrary", lambda *arguments: loaded.append(arguments) or "lib")
        monkeypatch.setattr(native_checks, "launch_agent_state", lambda home, runner: (home, runner))
        monkeypatch.setattr(native_checks, "_http_status", lambda url, authority: (url, authority))
        context = CheckContext(paths, Path("/home"))

        assert context.load_library("/x.dylib") == "lib"
        assert loaded == [("/x.dylib", (Path("/opt/homebrew/lib"), Path("/usr/local/lib")))]
        assert context.read_launch_agent(Path("/home")) == (Path("/home"), native_checks.run_launchctl)
        assert context.http_get("http://x", None) == ("http://x", None)
        assert context.find_executable is find_homebrew_executable
        assert context.port_free is port_is_free
        assert isinstance(context.usb_discovery, IoregUsbDiscovery)


class TestHttpStatus:
    def test_the_status_code(self, monkeypatch: pytest.MonkeyPatch) -> None:
        requests: list[tuple[str, dict[str, Any]]] = []

        def fake_get(url: str, **options: Any) -> httpx.Response:
            requests.append((url, options))
            return httpx.Response(503)

        monkeypatch.setattr(native_checks.httpx, "get", fake_get)

        assert native_checks._http_status("http://127.0.0.1:8000/health", None) == 503
        assert requests == [("http://127.0.0.1:8000/health", {"timeout": 3.0, "verify": True})]

    def test_verifies_with_the_deployment_ca_when_given(self, monkeypatch: pytest.MonkeyPatch) -> None:
        verified: list[Any] = []
        monkeypatch.setattr(
            native_checks.httpx,
            "get",
            lambda _url, **options: verified.append(options["verify"]) or httpx.Response(200),
        )

        native_checks._http_status("https://localhost:8443/health", Path("/creds/ca.pem"))

        assert verified == ["/creds/ca.pem"]

    @pytest.mark.parametrize("failure", [httpx.ConnectError("refused"), OSError("unreachable")])
    def test_zero_when_nothing_answers(self, monkeypatch: pytest.MonkeyPatch, failure: Exception) -> None:
        def failing_get(*_arguments: Any, **_options: Any) -> None:
            raise failure

        monkeypatch.setattr(native_checks.httpx, "get", failing_get)

        assert native_checks._http_status("http://127.0.0.1:8000/health", None) == 0


class TestStatusChecks:
    def test_platform(self, paths: NativePaths) -> None:
        assert check_platform(_context(paths)).outcome == "ok"
        linux = check_platform(_context(paths, platform="linux"))
        assert linux.outcome == "problem"
        assert "COMPOSE_PROFILES=sdr-manager-local" in linux.fix

    def test_library_loaded(self, paths: NativePaths) -> None:
        assert check_library(_context(paths)) == CheckResult(
            "librtlsdr", "ok", "loaded from /opt/homebrew/lib/librtlsdr.dylib"
        )

    def test_library_missing(self, paths: NativePaths) -> None:
        assert check_library(_context(paths, load_library=_no_library)) == CheckResult(
            "librtlsdr", "problem", "not installed", "Install it: brew install librtlsdr"
        )

    def test_a_library_path_that_does_not_load_points_at_env(self, paths: NativePaths) -> None:
        paths.env_file.write_text("SDR_MANAGER_LOCAL_LIBRTLSDR_PATH=/wrong.dylib\n")
        tried: list[str | None] = []

        def no_library(path: str | None) -> FakeLibrary:
            tried.append(path)
            raise RtlSdrLibraryUnavailableError("no")

        result = check_library(_context(paths, load_library=no_library))

        assert tried == ["/wrong.dylib"]
        assert (result.outcome, result.detail) == (
            "problem",
            "can't load /wrong.dylib (SDR_MANAGER_LOCAL_LIBRTLSDR_PATH)",
        )
        assert "Fix the path in .env" in result.fix

    def test_tools(self, paths: NativePaths) -> None:
        assert check_rtl_tcp(_context(paths)) == CheckResult("rtl_tcp", "ok", "/opt/homebrew/bin/rtl_tcp")
        assert check_rtl_eeprom(_context(paths)) == CheckResult("rtl_eeprom", "ok", "/opt/homebrew/bin/rtl_eeprom")
        missing = _context(paths, find_executable=lambda _name: None)
        assert check_rtl_tcp(missing) == CheckResult(
            "rtl_tcp", "problem", "not found", "Install it with librtlsdr: brew install librtlsdr"
        )
        assert check_rtl_eeprom(missing).outcome == "problem"

    def test_dongles_count_only_rtl_sdrs(self, paths: NativePaths) -> None:
        discovery = FakeDiscovery(
            _snapshot("0bda", "2838", "32-1"), _snapshot("05ac", "101d", "32-2"), _snapshot("0bda", "2832", "32-3")
        )

        assert check_dongles(_context(paths, usb_discovery=discovery)) == CheckResult(
            "RTL-SDRs", "ok", "2 RTL-SDRs plugged in"
        )

    def test_one_dongle_is_singular(self, paths: NativePaths) -> None:
        discovery = FakeDiscovery(_snapshot("0bda", "2838", "32-1"))

        assert check_dongles(_context(paths, usb_discovery=discovery)).detail == "1 RTL-SDR plugged in"

    def test_no_dongle_is_a_warning_not_a_problem(self, paths: NativePaths) -> None:
        result = check_dongles(_context(paths, usb_discovery=FakeDiscovery(_snapshot("05ac", "101d", "32-2"))))

        assert (result.outcome, result.detail) == ("warning", "none plugged in")

    @pytest.mark.parametrize("line", ["SDR_MANAGER_LOCAL_NATIVE=1\n", "SDR_MANAGER_LOCAL_NATIVE= 1 \n"])
    def test_native_switch_on(self, paths: NativePaths, line: str) -> None:
        paths.env_file.write_text(line)

        assert check_native_switch(_context(paths)).outcome == "ok"

    @pytest.mark.parametrize("content", [None, "SDR_MANAGER_LOCAL_NATIVE=0\n", "SDR_MANAGER_LOCAL_NATIVE=true\n"])
    def test_native_switch_off(self, paths: NativePaths, content: str | None) -> None:
        if content is not None:
            paths.env_file.write_text(content)

        result = check_native_switch(_context(paths))

        assert result.outcome == "problem"
        assert result.fix == "Set SDR_MANAGER_LOCAL_NATIVE=1 in .env, then run: docker compose up -d"

    def test_launch_agent_running(self, paths: NativePaths) -> None:
        assert check_launch_agent(_context(paths)) == CheckResult("Start at login", "ok", "running (process 42)")

    @pytest.mark.parametrize(
        ("state", "detail"),
        [
            (LaunchAgentState(installed=False, loaded=False, process_id=None), "not set up"),
            (LaunchAgentState(installed=True, loaded=False, process_id=None), "set up but not loaded"),
        ],
    )
    def test_launch_agent_not_set_up_or_loaded(self, paths: NativePaths, state: LaunchAgentState, detail: str) -> None:
        result = check_launch_agent(_context(paths, read_launch_agent=lambda _home: state))

        assert (result.outcome, result.detail, result.fix) == ("problem", detail, f"run {COMMAND} install")

    def test_launch_agent_loaded_but_not_running_points_at_the_log(self, paths: NativePaths) -> None:
        state = LaunchAgentState(installed=True, loaded=True, process_id=None)

        result = check_launch_agent(_context(paths, read_launch_agent=lambda _home: state))

        assert result.outcome == "problem"
        assert result.fix == f"read the log, {paths.log_file}"

    def test_api_answering_on_the_configured_port(self, paths: NativePaths) -> None:
        paths.env_file.write_text("SDR_MANAGER_LOCAL_HTTP_PORT=9000\n")
        asked: list[tuple[str, Path | None]] = []

        result = check_api(_context(paths, http_get=lambda url, authority: asked.append((url, authority)) or 200))

        assert result == CheckResult("SDR Manager", "ok", "answering on port 9000")
        assert asked == [("http://127.0.0.1:9000/health", None)]

    @pytest.mark.parametrize("status_code", [0, 503])
    def test_api_not_answering(self, paths: NativePaths, status_code: int) -> None:
        result = check_api(_context(paths, http_get=lambda _url, _authority: status_code))

        assert (result.outcome, result.detail) == ("problem", "not answering on port 8000")
        assert f"{COMMAND} install" in result.fix
        assert str(paths.log_file) in result.fix


class TestDoctorChecks:
    def test_port_used_by_sdr_manager(self, paths: NativePaths) -> None:
        def port_free(_host: str, _port: int) -> bool:
            raise AssertionError("not probed when SDR Manager answers")

        assert check_port(_context(paths, port_free=port_free)) == CheckResult("Port 8000", "ok", "used by SDR Manager")

    def test_port_free(self, paths: NativePaths) -> None:
        probed: list[tuple[str, int]] = []
        context = _context(
            paths, http_get=lambda _url, _authority: 0, port_free=lambda host, port: probed.append((host, port)) or True
        )

        assert check_port(context) == CheckResult("Port 8000", "ok", "free")
        assert probed == [("0.0.0.0", 8000)]

    def test_port_taken_by_another_app(self, paths: NativePaths) -> None:
        context = _context(paths, http_get=lambda _url, _authority: 0, port_free=lambda _host, _port: False)

        result = check_port(context)

        assert (result.outcome, result.detail) == ("problem", "used by another app")
        assert "lsof -nP -iTCP:8000 -sTCP:LISTEN" in result.fix

    def test_homebrew(self, paths: NativePaths) -> None:
        assert check_homebrew(_context(paths)) == CheckResult("Homebrew", "ok", "/opt/homebrew/bin/brew")
        assert check_homebrew(_context(paths, find_executable=lambda _name: None)) == CheckResult(
            "Homebrew", "problem", "not installed", "Install it from https://brew.sh"
        )

    def test_credentials_present_and_private(self, paths: NativePaths) -> None:
        _write_credentials(paths)

        assert check_credentials(_context(paths)) == CheckResult(
            "Sign-in files", "ok", str(paths.credentials_directory)
        )

    def test_credentials_missing(self, paths: NativePaths) -> None:
        result = check_credentials(_context(paths))

        assert result.outcome == "problem"
        assert "http-credentials.json, accepted-callers.json, certificate-authority.pem" in result.detail
        assert "SDR_MANAGER_LOCAL_NATIVE=1" in result.fix

    @pytest.mark.parametrize("mode", [0o750, 0o705])
    def test_credentials_readable_by_others_is_a_warning(self, paths: NativePaths, mode: int) -> None:
        _write_credentials(paths, mode)

        result = check_credentials(_context(paths))

        assert (result.outcome, result.fix) == ("warning", f"Run: chmod 700 {paths.credentials_directory}")

    def test_core_is_checked_with_the_deployment_ca_once_it_exists(self, paths: NativePaths) -> None:
        _write_credentials(paths)
        asked: list[tuple[str, Path | None]] = []

        result = check_core(_context(paths, http_get=lambda url, authority: asked.append((url, authority)) or 200))

        assert result == CheckResult("Sentinel", "ok", "answering at https://localhost:8443")
        assert asked == [("https://localhost:8443/health", paths.credentials_directory / "certificate-authority.pem")]

    def test_core_not_answering_and_no_ca_yet(self, paths: NativePaths) -> None:
        asked: list[Path | None] = []

        result = check_core(_context(paths, http_get=lambda _url, authority: asked.append(authority) or 0))

        assert asked == [None]
        assert (result.outcome, result.fix) == (
            "problem",
            "Start it: docker compose up -d (Docker Desktop must be running).",
        )

    def test_library_version(self, paths: NativePaths, tmp_path: Path) -> None:
        library_file = tmp_path / "librtlsdr.2.0.1.dylib"
        library_file.write_bytes(b"")
        context = _context(paths, load_library=lambda _path: FakeLibrary(str(library_file)))

        assert check_library_version(context) == CheckResult("librtlsdr version", "ok", "2.0.1")

    def test_library_version_unknown(self, paths: NativePaths, tmp_path: Path) -> None:
        unversioned = tmp_path / "librtlsdr.dylib"
        unversioned.write_bytes(b"")
        context = _context(paths, load_library=lambda _path: FakeLibrary(str(unversioned)))

        assert check_library_version(context) == CheckResult("librtlsdr version", "ok", f"unknown ({unversioned})")
        assert check_library_version(_context(paths, load_library=_no_library)).outcome == "warning"


class TestRunAndReport:
    def test_status_and_doctor_lists(self) -> None:
        assert STATUS_CHECKS == (
            check_platform,
            check_library,
            check_rtl_tcp,
            check_rtl_eeprom,
            check_dongles,
            check_native_switch,
            check_launch_agent,
            check_api,
        )
        assert DOCTOR_CHECKS == (
            *STATUS_CHECKS,
            check_port,
            check_homebrew,
            check_credentials,
            check_core,
            check_library_version,
        )

    def test_a_crashing_check_is_reported_and_the_rest_still_run(self, paths: NativePaths) -> None:
        def check_broken(_context: CheckContext) -> CheckResult:
            raise RuntimeError("boom")

        results = run_checks((check_broken, check_platform), _context(paths))

        assert results == [
            CheckResult("broken", "problem", "check failed: boom"),
            CheckResult("This computer", "ok", "a Mac"),
        ]

    def test_report_marks_each_line_and_shows_fixes_only_for_what_is_wrong(self) -> None:
        report = format_report(
            [
                CheckResult("librtlsdr", "ok", "loaded", "never shown"),
                CheckResult("RTL-SDRs", "warning", "none plugged in", "Plug one in."),
                CheckResult("Port 8000", "problem", "used by another app", "Quit it."),
            ]
        )

        assert report.splitlines() == [
            "SDR Manager on this Mac",
            "",
            "  ✓ librtlsdr  loaded",
            "  ! RTL-SDRs   none plugged in",
            "               Fix: Plug one in.",
            "  ✗ Port 8000  used by another app",
            "               Fix: Quit it.",
            "",
            "1 to fix (see Fix: above).",
        ]

    def test_report_with_nothing_to_fix(self) -> None:
        report = format_report([CheckResult("A", "ok", "fine"), CheckResult("B", "warning", "hmm")])

        assert report.endswith("Everything looks right.")
        assert "Fix:" not in report
