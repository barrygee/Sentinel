"""The in-app docs as their own service: `uvicorn sentinel_docs.service:app`.

Serves the repo's documentation (`docs/**`, `CONTRIBUTING.md`) to the shell's
`/docs/…` page over `/api/documentation/`. No database and no settings of its
own: it only registers with core, so the gateway routes its prefix to it and
the shell offers Docs. Optional — leave it out with `--scale docs=0` and the
app runs without Docs.
"""

from __future__ import annotations

from backend.platform.sdk import create_service

from sentinel_docs import router as docs
from sentinel_docs.module import manifest

app = create_service(manifest=manifest, routers=[docs.router], lifecycles=[])
