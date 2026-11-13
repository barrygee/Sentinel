"""The `sdr-manager-local` command loads with only the installed packages on its path.

`uv run --project backend sdr-manager-local …` starts the console script, whose
path holds the installed packages but not the repo root, so the repo's
`backend` package can't be imported there. A module-level `backend` import
anywhere on the command's import chain (cli → native_checks, run_server →
routers.tls) made every Mac command fail before it began (`install`,
`status`, `doctor`); those imports belong inside the functions that use them.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_cli_import.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_the_command_loads_without_the_repo_on_its_path(tmp_path: Path) -> None:
    # Outside the checkout and with no PYTHONPATH, as the console script runs.
    environment = {name: value for name, value in os.environ.items() if name != "PYTHONPATH"}
    loaded = subprocess.run(
        [sys.executable, "-c", "import sentinel_sdr_manager_local.cli"],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert loaded.returncode == 0, loaded.stderr


def test_the_repo_backend_really_is_out_of_reach_there(tmp_path: Path) -> None:
    """Guards the test above: it only proves something if `backend` can't load there."""
    environment = {name: value for name, value in os.environ.items() if name != "PYTHONPATH"}
    attempted = subprocess.run(
        [sys.executable, "-c", "import backend.platform.tls_fingerprint"],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert attempted.returncode != 0
    assert "No module named 'backend'" in attempted.stderr
