"""The Globe section as its own service: `uvicorn sentinel_globe.service:app`.

Optional, like the docs service: leave it out with `--scale globe=0` or
`SENTINEL_GLOBE_REPLICAS=0`, and the app runs without GLOBE. It registers with
core, which lists its UI remote (`/remotes/globe/`) to the shell and routes
`/api/globe/` to it in the gateway. The section stays hidden in the nav until
Settings › App Settings › 3D Globe (`globe.enabled`) is turned on.

No database, no lifecycle of its own. It connects to NATS like every service;
the subjects it may request are listed in `backend/platform/nats_permissions.py`.
"""

from __future__ import annotations

from backend.platform.remote_files import remotes_dir
from backend.platform.sdk import create_service

from sentinel_globe.module import manifest

app = create_service(
    manifest=manifest,
    routers=[],
    lifecycles=[],
    remote_dir=remotes_dir() / "globe",
)
