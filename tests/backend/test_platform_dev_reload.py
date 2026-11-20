"""Tests for `backend.platform.dev_reload` — the dev overlay's uvicorn launcher.

The unit tests drive `WorkerWatchingReload.__next__` with a stand-in worker
process, so they never start the file watcher. The last test runs the real
launcher in a subprocess, kills its worker and expects the reloader to exit:
the only way to prove the swap reaches uvicorn's CLI (an earlier version
patched the re-exported `uvicorn.main` *function* and changed nothing).
"""

from __future__ import annotations

import importlib
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from pathlib import Path

import pytest

from backend.platform import dev_reload
from backend.platform.dev_reload import WORKER_DIED_EXIT_CODE, WorkerWatchingReload

REPO_ROOT = Path(__file__).resolve().parents[2]
FILE_CHANGES = [Path("/app/backend/changed.py")]


class FakeWorkerProcess:
    """The slice of multiprocessing's process the reloader reads."""

    def __init__(
        self, *, alive: bool, pid: int = 4242, exitcode: int | None = None
    ) -> None:
        self.alive = alive
        self.pid = pid
        self.exitcode = exitcode

    def is_alive(self) -> bool:
        return self.alive


def make_reloader(
    monkeypatch: pytest.MonkeyPatch, worker_process: FakeWorkerProcess | None
) -> WorkerWatchingReload:
    """A reloader built without `__init__`, so no watcher or socket exists.

    `should_restart` (the file watcher) answers FILE_CHANGES and `shutdown`
    only records that it ran, so each test can see which path `__next__` took.
    """
    reloader = object.__new__(WorkerWatchingReload)
    reloader.should_exit = threading.Event()
    if worker_process is not None:
        reloader.process = worker_process  # type: ignore[assignment]  # stand-in for multiprocessing's SpawnProcess
    reloader.shutdown_calls = 0  # type: ignore[attr-defined]  # test-only counter

    def record_shutdown() -> None:
        reloader.shutdown_calls += 1  # type: ignore[attr-defined]

    monkeypatch.setattr(reloader, "shutdown", record_shutdown)
    monkeypatch.setattr(reloader, "should_restart", lambda: FILE_CHANGES)
    return reloader


def test_dead_worker_shuts_down_and_exits_non_zero(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    reloader = make_reloader(
        monkeypatch, FakeWorkerProcess(alive=False, pid=77, exitcode=-9)
    )

    # Attach caplog's handler to the logger itself: once anything applies
    # uvicorn's logging config, the `uvicorn` logger stops propagating to root,
    # where caplog listens by default.
    uvicorn_error_logger = logging.getLogger("uvicorn.error")
    uvicorn_error_logger.addHandler(caplog.handler)
    try:
        with (
            caplog.at_level(logging.ERROR, logger="uvicorn.error"),
            pytest.raises(SystemExit) as raised,
        ):
            next(reloader)
    finally:
        uvicorn_error_logger.removeHandler(caplog.handler)

    assert raised.value.code == WORKER_DIED_EXIT_CODE
    assert WORKER_DIED_EXIT_CODE != 0
    assert reloader.shutdown_calls == 1  # type: ignore[attr-defined]
    assert "Worker process [77] died (exit code -9)" in caplog.text


def test_live_worker_defers_to_the_file_watcher(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reloader = make_reloader(monkeypatch, FakeWorkerProcess(alive=True))

    assert next(reloader) == FILE_CHANGES
    assert reloader.shutdown_calls == 0  # type: ignore[attr-defined]


def test_dead_worker_during_requested_shutdown_is_not_treated_as_a_crash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # SIGTERM sets should_exit and uvicorn's own loop shuts down; a worker that
    # already stopped then must not turn a clean stop into exit code 3.
    reloader = make_reloader(monkeypatch, FakeWorkerProcess(alive=False, exitcode=0))
    reloader.should_exit.set()

    assert next(reloader) == FILE_CHANGES
    assert reloader.shutdown_calls == 0  # type: ignore[attr-defined]


def test_before_the_worker_starts_defers_to_the_file_watcher(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reloader = make_reloader(monkeypatch, worker_process=None)

    assert next(reloader) == FILE_CHANGES
    assert reloader.shutdown_calls == 0  # type: ignore[attr-defined]


def test_main_swaps_the_reloader_in_the_uvicorn_main_module(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uvicorn_main_module = importlib.import_module("uvicorn.main")
    # Registering the current value first makes monkeypatch restore it after.
    monkeypatch.setattr(
        uvicorn_main_module, "ChangeReload", uvicorn_main_module.ChangeReload
    )
    cli_calls: list[type] = []
    monkeypatch.setattr(
        uvicorn_main_module,
        "main",
        lambda: cli_calls.append(uvicorn_main_module.ChangeReload),
    )

    dev_reload.main()

    assert cli_calls == [WorkerWatchingReload]
    assert uvicorn_main_module.ChangeReload is WorkerWatchingReload


APP_SOURCE = """
import os
from pathlib import Path

# Imported by the worker process only, so this records the worker's pid.
Path(os.environ["DEV_RELOAD_TEST_PID_FILE"]).write_text(str(os.getpid()))


async def app(scope, receive, send):
    raise RuntimeError("never called")
"""


def wait_for(predicate: Callable[[], object], timeout_seconds: float) -> bool:
    """Poll `predicate` until it is truthy or `timeout_seconds` pass."""
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.1)
    return False


def test_launcher_exits_when_its_real_worker_is_killed(tmp_path: Path) -> None:
    app_directory = tmp_path / "app"
    app_directory.mkdir()
    (app_directory / "dev_reload_probe_app.py").write_text(APP_SOURCE)
    pid_file = tmp_path / "worker.pid"
    launcher = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "backend.platform.dev_reload",
            "dev_reload_probe_app:app",
            "--app-dir",
            str(app_directory),
            "--reload",
            "--reload-dir",
            str(app_directory),
            "--host",
            "127.0.0.1",
            "--port",
            "0",
        ],
        cwd=REPO_ROOT,
        env={**os.environ, "DEV_RELOAD_TEST_PID_FILE": str(pid_file)},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        assert wait_for(lambda: pid_file.exists() and pid_file.read_text(), 30), (
            "worker never started"
        )
        worker_pid = int(pid_file.read_text())
        assert worker_pid != launcher.pid
        assert launcher.poll() is None, "launcher exited before the worker was killed"

        os.kill(worker_pid, signal.SIGKILL)

        # The watcher yields at least every 5 s, so the check runs well within this.
        exit_code = launcher.wait(timeout=30)
    finally:
        if launcher.poll() is None:
            launcher.kill()
            launcher.wait()
    output = launcher.stdout.read() if launcher.stdout else ""

    assert exit_code == WORKER_DIED_EXIT_CODE, output
    assert f"Worker process [{worker_pid}] died" in output
