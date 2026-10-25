"""The LaunchAgent `uk.sentinel.sdr-manager-local`: starts SDR Manager at login and restarts it if it crashes.

`install` writes `~/Library/LaunchAgents/uk.sentinel.sdr-manager-local.plist`
and loads it into the user's `gui/<uid>` launchd domain; `uninstall` unloads
and deletes it. It runs this checkout's venv Python, so it keeps working
until the checkout moves; `install` again after moving it.

`launchctl` is reached through an injected runner, so tests install into a
temporary home without touching launchd.
"""

from __future__ import annotations

import os
import plistlib
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from sentinel_sdr_manager_local.adapters.macos.homebrew import HOMEBREW_PREFIXES
from sentinel_sdr_manager_local.native import NativePaths

LAUNCH_AGENT_LABEL = "uk.sentinel.sdr-manager-local"
RESTART_THROTTLE_S = 10
"""launchd waits this long before restarting it, so a crash at start can't spin the CPU."""

LAUNCHCTL_UNAVAILABLE = 127
"""The exit code a shell gives a missing command, used when `launchctl` can't be run."""

LaunchctlRunner = Callable[[Sequence[str]], subprocess.CompletedProcess[str]]


def run_launchctl(arguments: Sequence[str]) -> subprocess.CompletedProcess[str]:
    """Run `launchctl` with `arguments`, capturing its output; never raises.

    Without `launchctl` (not a Mac) it answers like a failed command, so
    `status` reports the LaunchAgent as not loaded instead of crashing.
    """
    try:
        return subprocess.run(["launchctl", *arguments], capture_output=True, text=True, check=False)
    except OSError as error:
        return subprocess.CompletedProcess(["launchctl", *arguments], LAUNCHCTL_UNAVAILABLE, "", str(error))


def launch_agent_path(home: Path) -> Path:
    return home / "Library" / "LaunchAgents" / f"{LAUNCH_AGENT_LABEL}.plist"


def launchd_domain() -> str:
    return f"gui/{os.getuid()}"


def launch_agent_plist(paths: NativePaths, python_executable: str = sys.executable) -> bytes:
    """The LaunchAgent's property list.

    launchd starts processes with a bare `PATH`, so Homebrew's `bin/` folders
    go first: `rtl_tcp` and `rtl_eeprom` are found there.
    """
    search_path = [str(prefix / "bin") for prefix in HOMEBREW_PREFIXES] + ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]
    agent = {
        "Label": LAUNCH_AGENT_LABEL,
        "ProgramArguments": [python_executable, "-m", "sentinel_sdr_manager_local.cli", "start"],
        "WorkingDirectory": str(paths.checkout),
        "RunAtLoad": True,
        # Restart after a crash, not after a clean stop (`uninstall`, or a
        # shutdown signal).
        "KeepAlive": {"SuccessfulExit": False},
        "ThrottleInterval": RESTART_THROTTLE_S,
        "StandardOutPath": str(paths.log_file),
        "StandardErrorPath": str(paths.log_file),
        "EnvironmentVariables": {"PATH": ":".join(search_path)},
    }
    return plistlib.dumps(agent)


@dataclass(frozen=True)
class LaunchAgentState:
    installed: bool
    loaded: bool
    process_id: int | None


def install_launch_agent(home: Path, paths: NativePaths, runner: LaunchctlRunner = run_launchctl) -> None:
    """Write the LaunchAgent and (re)load it, so it starts now and at every login.

    Raises `RuntimeError` with launchctl's own message when loading fails.
    """
    plist_path = launch_agent_path(home)
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    paths.log_file.parent.mkdir(parents=True, exist_ok=True)
    # Unload an older copy first: bootstrap refuses a label that is already loaded.
    runner(["bootout", f"{launchd_domain()}/{LAUNCH_AGENT_LABEL}"])
    plist_path.write_bytes(launch_agent_plist(paths))
    loaded = runner(["bootstrap", launchd_domain(), str(plist_path)])
    if loaded.returncode != 0:
        raise RuntimeError(f"launchctl could not load {plist_path}: {(loaded.stderr or loaded.stdout).strip()}")


def uninstall_launch_agent(home: Path, runner: LaunchctlRunner = run_launchctl) -> bool:
    """Stop and remove the LaunchAgent; `False` when it wasn't installed."""
    plist_path = launch_agent_path(home)
    runner(["bootout", f"{launchd_domain()}/{LAUNCH_AGENT_LABEL}"])
    if not plist_path.exists():
        return False
    plist_path.unlink()
    return True


def launch_agent_state(home: Path, runner: LaunchctlRunner = run_launchctl) -> LaunchAgentState:
    """Whether the LaunchAgent is installed, loaded, and the process id it is running as."""
    printed = runner(["print", f"{launchd_domain()}/{LAUNCH_AGENT_LABEL}"])
    process_id: int | None = None
    if printed.returncode == 0:
        for line in printed.stdout.splitlines():
            key, _, value = line.strip().partition(" = ")
            if key == "pid" and value.isdigit():
                process_id = int(value)
                break
    return LaunchAgentState(
        installed=launch_agent_path(home).is_file(),
        loaded=printed.returncode == 0,
        process_id=process_id,
    )
