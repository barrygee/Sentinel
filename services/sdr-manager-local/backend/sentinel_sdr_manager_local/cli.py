"""The `sdr-manager-local` command: run SDR Manager as a native Mac process (ADR 0007).

    uv run --project backend sdr-manager-local start       run in the foreground
    uv run --project backend sdr-manager-local install     start now and at every login
    uv run --project backend sdr-manager-local uninstall   stop, and don't start at login
    uv run --project backend sdr-manager-local status      check each part, with a fix for each problem
    uv run --project backend sdr-manager-local doctor      status, plus the port, Homebrew, credentials,
                                                           Sentinel and the librtlsdr version

On Linux SDR Manager runs in its container instead (the `sdr-manager-local`
compose profile); `start` works there too, for development.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from sentinel_sdr_manager_local.launch_agent import install_launch_agent, launch_agent_path, uninstall_launch_agent
from sentinel_sdr_manager_local.native import (
    apply_native_environment,
    missing_credential_files,
    native_paths,
)
from sentinel_sdr_manager_local.native_checks import (
    COMMAND,
    DOCTOR_CHECKS,
    STATUS_CHECKS,
    CheckContext,
    format_report,
    run_checks,
)


def start(home: Path) -> int:
    """Run SDR Manager in the foreground with the native environment, until stopped."""
    paths = native_paths(home)
    # Before anything imports `backend.config`, whose settings are read once at import.
    apply_native_environment(paths)
    if missing := missing_credential_files(paths):
        print(
            f"sdr-manager-local: {', '.join(missing)} missing from {paths.credentials_directory}, so "
            "Sentinel can't see this Mac's SDRs (other machines still can). Set "
            "SDR_MANAGER_LOCAL_NATIVE=1 in .env and run `docker compose up -d`.",
            file=sys.stderr,
        )
    from sentinel_sdr_manager_local.run_server import main as run_server

    run_server()
    return 0


def install(home: Path) -> int:
    paths = native_paths(home)
    try:
        install_launch_agent(home, paths)
    except RuntimeError as error:
        print(f"sdr-manager-local: {error}", file=sys.stderr)
        return 1
    print(f"SDR Manager now starts at login, and is starting now. Log: {paths.log_file}")
    print(f"Check it with: {COMMAND} status")
    return 0


def uninstall(home: Path) -> int:
    if uninstall_launch_agent(home):
        print(f"SDR Manager stopped and removed from login items ({launch_agent_path(home)}).")
    else:
        print("SDR Manager wasn't set up to start at login; nothing to remove.")
    return 0


def report(home: Path, *, doctor: bool) -> int:
    results = run_checks(DOCTOR_CHECKS if doctor else STATUS_CHECKS, CheckContext(native_paths(home), home))
    print(format_report(results))
    return 1 if any(result.outcome == "problem" for result in results) else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sdr-manager-local", description="Run SDR Manager for the RTL-SDRs plugged into this Mac."
    )
    commands = parser.add_subparsers(dest="command", required=True, metavar="command")
    commands.add_parser("start", help="run in the foreground")
    commands.add_parser("install", help="start now and at every login, restarting it if it crashes")
    commands.add_parser("uninstall", help="stop, and don't start at login")
    commands.add_parser("status", help="check each part, with a fix for each problem")
    commands.add_parser("doctor", help="status, plus the port, Homebrew, credentials, Sentinel and librtlsdr")
    return parser


def main(arguments: Sequence[str] | None = None, home: Path | None = None) -> int:
    """Entry point of the `sdr-manager-local` script; returns the exit code."""
    command = build_parser().parse_args(arguments).command
    home = home or Path.home()
    if command == "start":
        return start(home)
    if command == "install":
        return install(home)
    if command == "uninstall":
        return uninstall(home)
    return report(home, doctor=command == "doctor")


def main_with_exit() -> None:
    """The console script: `main()`, exiting with its code."""
    sys.exit(main())


if __name__ == "__main__":
    main_with_exit()
