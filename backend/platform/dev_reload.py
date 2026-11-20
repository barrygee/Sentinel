"""Dev-overlay uvicorn launcher: `--reload` that exits when its worker dies.

`compose.dev.yaml` runs every backend service with `uvicorn --reload`, which
splits it into a reloader (the container's PID 1, holding the listening socket)
and a worker process that serves requests. uvicorn's reloader only restarts the
worker when a watched file changes — it never checks that the worker is still
alive (uvicorn 0.41 `BaseReload.__next__`). So if the worker crashes or is
killed, PID 1 keeps the port open, every request (health probes included)
connects and hangs, and the container never exits, so `restart: unless-stopped`
never brings it back. That is how Sea served 503s for its remote until it was
restarted by hand.

This module is a drop-in for the `uvicorn` command — it takes the same
arguments — whose reloader also checks the worker on every poll. A dead worker
makes it shut down and exit non-zero, and Docker's restart policy starts a
fresh container. Restarts the reloader makes itself are unaffected: `restart()`
swaps the worker synchronously, so a poll never sees the gap.

Dev only. `docker-compose.yml` (the deployment) runs plain uvicorn without
`--reload`, where a dead worker already ends the process.

    python -m backend.platform.dev_reload sentinel_sea.service:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import importlib
import logging
import sys
from pathlib import Path

from uvicorn.supervisors import ChangeReload

logger = logging.getLogger("uvicorn.error")

# Distinct from 0 so the logs and `docker ps` show the restart was a failure.
WORKER_DIED_EXIT_CODE = 3


class WorkerWatchingReload(ChangeReload):
    """uvicorn's file-change reloader, plus an exit when the worker has died."""

    def __next__(self) -> list[Path] | None:
        worker_process = getattr(self, "process", None)
        if worker_process is not None and not worker_process.is_alive() and not self.should_exit.is_set():
            logger.error(
                "Worker process [%s] died (exit code %s); stopping the reloader so the container restarts.",
                worker_process.pid,
                worker_process.exitcode,
            )
            # shutdown() reaps the dead worker and closes the listening socket,
            # so nothing is left accepting connections it cannot answer.
            self.shutdown()
            sys.exit(WORKER_DIED_EXIT_CODE)
        return super().__next__()


def main() -> None:
    """Run the uvicorn CLI with the worker-watching reloader swapped in."""
    # The uvicorn.main *module* binds ChangeReload at import time, so patch its
    # reference, not uvicorn.supervisors'. Fetch the module by name: the package
    # re-exports the `main` function as `uvicorn.main`, so attribute access
    # would patch the function and silently change nothing.
    uvicorn_main_module = importlib.import_module("uvicorn.main")
    uvicorn_main_module.ChangeReload = WorkerWatchingReload  # type: ignore[attr-defined]  # deliberate swap of uvicorn's reloader class
    uvicorn_main_module.main()


if (
    __name__ == "__main__"
):  # pragma: no cover - run in a subprocess by test_launcher_exits_when_its_real_worker_is_killed
    main()
