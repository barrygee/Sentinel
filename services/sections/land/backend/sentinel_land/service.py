"""The Land section as its own service (P6.2): `uvicorn sentinel_land.service:app`.

Owns `aprs_stations` and `repeater_cache` in its own database (`DB_PATH`),
copied from the monolith's on first boot (`LEGACY_DB_PATH`). Decoded APRS
packets reach it as `decode.aprs.*` events from the radio hub over NATS, so
`NATS_URL` must be set for stations to appear; the APRS retention setting stays
in core and is read over HTTP. Starting and stopping APRS decode stays with the
radio hub (`/api/sdr/aprs/*`), which the browser calls directly.
"""

from __future__ import annotations

import asyncio
import dataclasses

from backend.config import settings
from backend.platform.remote_files import remotes_dir
from backend.platform.sdk import create_service
from backend.platform.sdk.legacy_import import import_legacy_tables

from sentinel_land import router as land
from sentinel_land.database import LAND_TABLES, create_land_tables
from sentinel_land.module import lifecycle as land_lifecycle
from sentinel_land.module import manifest


async def _prepare() -> None:
    await create_land_tables()
    await asyncio.to_thread(import_legacy_tables, settings.db_path, settings.legacy_db_path, LAND_TABLES)


app = create_service(
    manifest=manifest,
    routers=[land.router],
    # Land's own lifecycle (the daily APRS cleanup loop), with a prepare that
    # also copies the legacy tables in once the schema exists.
    lifecycles=[dataclasses.replace(land_lifecycle, prepare=_prepare)],
    remote_dir=remotes_dir() / "land",
)
