"""The Sea section as its own service (P6.4): `uvicorn backend.standalone.sea:app`.

Owns `sea_vessel_cache` and `sea_vessel_static` in its own database
(`DB_PATH`), copied from the monolith's on first boot (`LEGACY_DB_PATH`), and
serves `/api/sea/`. It runs the one AISStream connection the key allows, which
is why the app must not host its own copy as well (`SENTINEL_EXTERNAL_SERVICES`).

Settings stay in core and are read over HTTP, including the AISStream key: it
is a secret the public settings API redacts, so Sea reads and writes it through
core's join-token-gated `/internal/settings/secrets/` routes. Everything else it
needs crosses NATS, so `NATS_URL` must be set: off-grid vessels arrive as
`decode.ais.*` events from the radio hub, Sea asks the hub to start/stop its
designated AIS receiver (`hub.decode.ais.{start,stop}`) and for the bridge's
state (`hub.decode.ais.status`), and it reconciles that receiver whenever core
announces `settings.changed.sea` / `settings.changed.app`.
"""

from __future__ import annotations

import asyncio

from backend.config import settings
from backend.database import SEA_TABLES, create_sea_tables
from backend.modules.sea import lifecycle as sea_lifecycle
from backend.modules.sea import manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.remote_files import remotes_dir
from backend.platform.sdk import create_service
from backend.platform.sdk.legacy_import import import_legacy_tables
from backend.routers import sea


async def _prepare() -> None:
    await create_sea_tables()
    await asyncio.to_thread(import_legacy_tables, settings.db_path, settings.legacy_db_path, SEA_TABLES)


app = create_service(
    manifest=manifest,
    routers=[sea.router],
    # The monolith's Sea lifecycle (the AISStream reader and its warm start,
    # then the off-grid receiver reconcile), unchanged, after this service's
    # own schema and legacy import.
    lifecycles=[
        ModuleLifecycle(name="sea-schema", prepare=_prepare),
        sea_lifecycle,
    ],
    remote_dir=remotes_dir() / "sea",
)
