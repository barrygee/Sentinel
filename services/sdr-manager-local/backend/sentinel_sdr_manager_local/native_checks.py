"""`sdr-manager-local status` and `doctor`: a plain-English check of each part, with a fix for each problem.

`status` checks what an everyday user needs: Homebrew's librtlsdr and tools,
the dongles, the `.env` switch, the LaunchAgent and whether SDR Manager
answers. `doctor` adds what a stuck install needs: the port, Homebrew itself,
the credentials, core and the librtlsdr version (Homebrew's build differs
from Linux's).

Each check is a function of a `CheckContext`, whose probes (launchctl, ioreg,
HTTP, the port) are injectable, so tests run every failure without a Mac's
hardware or a running stack.
"""

from __future__ import annotations

import stat
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import httpx

from sentinel_sdr_manager_local.adapters.ctypes_rtlsdr import CtypesRtlSdrLibrary, RtlSdrLibraryUnavailableError
from sentinel_sdr_manager_local.adapters.macos.homebrew import (
    find_homebrew_executable,
    homebrew_library_directories,
    librtlsdr_version,
)
from sentinel_sdr_manager_local.adapters.macos.ioreg_usb import IoregUsbDiscovery
from sentinel_sdr_manager_local.launch_agent import LaunchAgentState, launch_agent_state, run_launchctl
from sentinel_sdr_manager_local.native import (
    CERTIFICATE_AUTHORITY_FILE,
    CORE_SERVICE_ENTRYPOINT_URL,
    NativePaths,
    http_port,
    missing_credential_files,
    read_env_file,
)
from sentinel_sdr_manager_local.run_server import port_is_free
from sentinel_sdr_manager_local.services.usb_discovery import KNOWN_RTL_SDR_USB_IDS

COMMAND = "uv run --project backend sdr-manager-local"
"""How a user runs this command from the checkout, quoted in every fix."""

HTTP_TIMEOUT_S = 3.0

Outcome = Literal["ok", "warning", "problem"]


@dataclass(frozen=True)
class CheckResult:
    """One line of the report: what was checked, what was found and, for a problem, how to fix it."""

    name: str
    outcome: Outcome
    detail: str
    fix: str = ""


@dataclass
class CheckContext:
    """Everything a check reads, with the system probes injectable for tests."""

    paths: NativePaths
    home: Path
    platform: str = sys.platform
    load_library: Callable[[str | None], CtypesRtlSdrLibrary] = field(
        default=lambda library_path: CtypesRtlSdrLibrary(library_path, homebrew_library_directories())
    )
    find_executable: Callable[[str], str | None] = find_homebrew_executable
    usb_discovery: IoregUsbDiscovery = field(default_factory=IoregUsbDiscovery)
    read_launch_agent: Callable[[Path], LaunchAgentState] = field(
        default=lambda home: launch_agent_state(home, run_launchctl)
    )
    http_get: Callable[[str, Path | None], int] = field(default=lambda url, authority: _http_status(url, authority))
    port_free: Callable[[str, int], bool] = port_is_free

    @property
    def env_values(self) -> dict[str, str]:
        return read_env_file(self.paths)

    @property
    def port(self) -> int:
        return http_port(self.env_values)

    @property
    def library_path(self) -> str | None:
        return self.env_values.get("SDR_MANAGER_LOCAL_LIBRTLSDR_PATH") or None


def _http_status(url: str, certificate_authority: Path | None) -> int:
    """The status `url` answers with, or 0 when nothing answers."""
    verify: bool | str = str(certificate_authority) if certificate_authority else True
    try:
        return httpx.get(url, timeout=HTTP_TIMEOUT_S, verify=verify).status_code
    except (httpx.HTTPError, OSError):
        return 0


def check_platform(context: CheckContext) -> CheckResult:
    if context.platform == "darwin":
        return CheckResult("This computer", "ok", "a Mac")
    return CheckResult(
        "This computer",
        "problem",
        "not a Mac: the native SDR Manager is for macOS only",
        "On Linux, run SDR Manager in its container: set COMPOSE_PROFILES=sdr-manager-local in .env.",
    )


def check_library(context: CheckContext) -> CheckResult:
    try:
        library = context.load_library(context.library_path)
    except RtlSdrLibraryUnavailableError:
        if context.library_path:
            return CheckResult(
                "librtlsdr",
                "problem",
                f"can't load {context.library_path} (SDR_MANAGER_LOCAL_LIBRTLSDR_PATH)",
                "Fix the path in .env, or delete that line to use Homebrew's.",
            )
        return CheckResult("librtlsdr", "problem", "not installed", "Install it: brew install librtlsdr")
    return CheckResult("librtlsdr", "ok", f"loaded from {library.loaded_from}")


def _check_tool(context: CheckContext, tool: str) -> CheckResult:
    found = context.find_executable(tool)
    if found:
        return CheckResult(tool, "ok", found)
    return CheckResult(tool, "problem", "not found", "Install it with librtlsdr: brew install librtlsdr")


def check_rtl_tcp(context: CheckContext) -> CheckResult:
    return _check_tool(context, "rtl_tcp")


def check_rtl_eeprom(context: CheckContext) -> CheckResult:
    return _check_tool(context, "rtl_eeprom")


def check_dongles(context: CheckContext) -> CheckResult:
    dongles = [
        snapshot
        for snapshot in context.usb_discovery.enumerate()
        if (snapshot.vendor_id, snapshot.product_id) in KNOWN_RTL_SDR_USB_IDS
    ]
    if not dongles:
        return CheckResult(
            "RTL-SDRs",
            "warning",
            "none plugged in",
            "Plug one in (straight into the Mac or a powered hub); it shows up within a few seconds.",
        )
    noun = "RTL-SDR" if len(dongles) == 1 else "RTL-SDRs"
    return CheckResult("RTL-SDRs", "ok", f"{len(dongles)} {noun} plugged in")


def check_native_switch(context: CheckContext) -> CheckResult:
    if context.env_values.get("SDR_MANAGER_LOCAL_NATIVE", "").strip() == "1":
        return CheckResult(".env", "ok", "SDR_MANAGER_LOCAL_NATIVE=1")
    return CheckResult(
        ".env",
        "problem",
        "SDR_MANAGER_LOCAL_NATIVE is not 1, so Sentinel doesn't write this Mac's sign-in files",
        "Set SDR_MANAGER_LOCAL_NATIVE=1 in .env, then run: docker compose up -d",
    )


def check_launch_agent(context: CheckContext) -> CheckResult:
    state = context.read_launch_agent(context.home)
    install_fix = f"run {COMMAND} install"
    if not state.installed:
        return CheckResult("Start at login", "problem", "not set up", install_fix)
    if not state.loaded:
        return CheckResult("Start at login", "problem", "set up but not loaded", install_fix)
    if state.process_id is None:
        return CheckResult(
            "Start at login",
            "problem",
            "loaded but not running (it may be failing at start)",
            f"read the log, {context.paths.log_file}",
        )
    return CheckResult("Start at login", "ok", f"running (process {state.process_id})")


def _api_answers(context: CheckContext) -> bool:
    return context.http_get(f"http://127.0.0.1:{context.port}/health", None) == 200


def check_api(context: CheckContext) -> CheckResult:
    if _api_answers(context):
        return CheckResult("SDR Manager", "ok", f"answering on port {context.port}")
    return CheckResult(
        "SDR Manager",
        "problem",
        f"not answering on port {context.port}",
        f"Start it: {COMMAND} install (or {COMMAND} start to run it in this window). Its log: {context.paths.log_file}",
    )


def check_port(context: CheckContext) -> CheckResult:
    if _api_answers(context):
        return CheckResult(f"Port {context.port}", "ok", "used by SDR Manager")
    if context.port_free("0.0.0.0", context.port):
        return CheckResult(f"Port {context.port}", "ok", "free")
    return CheckResult(
        f"Port {context.port}",
        "problem",
        "used by another app",
        f"See which: lsof -nP -iTCP:{context.port} -sTCP:LISTEN. Quit it, or set "
        "SDR_MANAGER_LOCAL_HTTP_PORT in .env to a free port.",
    )


def check_homebrew(context: CheckContext) -> CheckResult:
    brew = context.find_executable("brew")
    if brew:
        return CheckResult("Homebrew", "ok", brew)
    return CheckResult("Homebrew", "problem", "not installed", "Install it from https://brew.sh")


def check_credentials(context: CheckContext) -> CheckResult:
    directory = context.paths.credentials_directory
    missing = missing_credential_files(context.paths)
    if missing:
        return CheckResult(
            "Sign-in files",
            "problem",
            f"missing from {directory}: {', '.join(missing)}",
            "Set SDR_MANAGER_LOCAL_NATIVE=1 in .env, then run: docker compose up -d",
        )
    if stat.S_IMODE(directory.stat().st_mode) & 0o077:
        return CheckResult(
            "Sign-in files", "warning", f"{directory} can be read by other users", f"Run: chmod 700 {directory}"
        )
    return CheckResult("Sign-in files", "ok", str(directory))


def check_core(context: CheckContext) -> CheckResult:
    authority = context.paths.credentials_directory / CERTIFICATE_AUTHORITY_FILE
    status_code = context.http_get(f"{CORE_SERVICE_ENTRYPOINT_URL}/health", authority if authority.is_file() else None)
    if status_code == 200:
        return CheckResult("Sentinel", "ok", f"answering at {CORE_SERVICE_ENTRYPOINT_URL}")
    return CheckResult(
        "Sentinel",
        "problem",
        f"not answering at {CORE_SERVICE_ENTRYPOINT_URL}",
        "Start it: docker compose up -d (Docker Desktop must be running).",
    )


def check_library_version(context: CheckContext) -> CheckResult:
    try:
        library = context.load_library(context.library_path)
    except RtlSdrLibraryUnavailableError:
        return CheckResult("librtlsdr version", "warning", "unknown: librtlsdr isn't installed")
    version = librtlsdr_version(Path(library.loaded_from))
    return CheckResult("librtlsdr version", "ok", version or f"unknown ({library.loaded_from})")


StatusCheck = Callable[[CheckContext], CheckResult]

STATUS_CHECKS: tuple[StatusCheck, ...] = (
    check_platform,
    check_library,
    check_rtl_tcp,
    check_rtl_eeprom,
    check_dongles,
    check_native_switch,
    check_launch_agent,
    check_api,
)
DOCTOR_CHECKS: tuple[StatusCheck, ...] = (
    *STATUS_CHECKS,
    check_port,
    check_homebrew,
    check_credentials,
    check_core,
    check_library_version,
)

_MARKS: dict[Outcome, str] = {"ok": "✓", "warning": "!", "problem": "✗"}


def run_checks(checks: Sequence[StatusCheck], context: CheckContext) -> list[CheckResult]:
    """Run each check; one that crashes is reported as a problem rather than ending the report."""
    results: list[CheckResult] = []
    for check in checks:
        try:
            results.append(check(context))
        except Exception as error:
            results.append(CheckResult(check.__name__.removeprefix("check_"), "problem", f"check failed: {error}"))
    return results


def format_report(results: Sequence[CheckResult]) -> str:
    """The report as printed: one line per check, its fix indented under it, then a summary line."""
    width = max(len(result.name) for result in results)
    lines = ["SDR Manager on this Mac", ""]
    for result in results:
        lines.append(f"  {_MARKS[result.outcome]} {result.name.ljust(width)}  {result.detail}")
        if result.fix and result.outcome != "ok":
            lines.append(f"    {' ' * width}  Fix: {result.fix}")
    problems = sum(result.outcome == "problem" for result in results)
    lines.append("")
    lines.append("Everything looks right." if problems == 0 else f"{problems} to fix (see Fix: above).")
    return "\n".join(lines)
