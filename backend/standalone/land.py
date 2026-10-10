"""The Land section as its own service (P6.2): `uvicorn backend.standalone.land:app`.

Owns `aprs_stations` and `repeater_cache` in its own database (`DB_PATH`),
copied from the monolith's on first boot (`LEGACY_DB_PATH`). Decoded APRS
packets reach it as `decode.aprs.*` events from the radio hub over NATS, so
`NATS_URL` must be set for stations to appear; the APRS retention setting stays
in core and is read over HTTP. Starting and stopping APRS decode stays with the
radio hub (`/api/sdr/aprs/*`), which the browser calls directly.
"""

from __future__ import annotations

import asyncio

from backend.config import settings
from backend.database import LAND_TABLES, create_land_tables
from backend.modules.land import lifecycle as land_lifecycle
from backend.modules.land import manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.remote_files import remotes_dir
from backend.platform.sdk import create_service
from backend.platform.sdk.legacy_import import import_legacy_tables
from backend.routers import land


async def _prepare() -> None:
    await create_land_tables()
    await asyncio.to_thread(import_legacy_tables, settings.db_path, settings.legacy_db_path, LAND_TABLES)


app = create_service(
    manifest=manifest,
    routers=[land.router],
    # The monolith's Land lifecycle (the daily APRS cleanup loop), unchanged,
    # after this service's own schema and legacy import.
    lifecycles=[
        ModuleLifecycle(name="land-schema", prepare=_prepare),
        land_lifecycle,
    ],
    remote_dir=remotes_dir() / "land",
)
