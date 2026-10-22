"""The Air section as its own service (P6.3): `uvicorn sentinel_air.service:app`.

Owns `adsb_cache` and `air_tracking` in its own database (`DB_PATH`), copied
from the monolith's on first boot (`LEGACY_DB_PATH`), and serves `/api/air/`
plus `/api/sdr/adsb/` (the Sentry dongle behind Off Grid ADS-B). Core keeps
`/api/air/messages` — notifications are core's — and the gateway sends that
longer prefix to core.

Everything Air needs from elsewhere already crosses processes: sdr-manager-remote
answers its reservation and receiver-location requests over the bus,
and its squawk watcher raises alerts by publishing `notifications.raise`, which
core stores and streams — so `NATS_URL` must be set. Settings (data sources,
the Off Grid source device, the user's location) stay in core and are read over
HTTP. Off Grid aircraft come from `ADSB_OFFGRID_URL` (the adsb-decoder).
"""

from __future__ import annotations

import asyncio
import dataclasses

from backend.config import settings
from backend.platform.remote_files import remotes_dir
from backend.platform.sdk import create_service
from backend.platform.sdk.legacy_import import import_legacy_tables

from sentinel_air import adsb_source_router
from sentinel_air import router as air
from sentinel_air.database import AIR_TABLES, create_air_tables
from sentinel_air.module import lifecycle as air_lifecycle
from sentinel_air.module import manifest


async def _prepare() -> None:
    await create_air_tables()
    await asyncio.to_thread(import_legacy_tables, settings.db_path, settings.legacy_db_path, AIR_TABLES)


app = create_service(
    manifest=manifest,
    routers=[air.router, adsb_source_router.router],
    # Air's own lifecycle (the idle-only squawk watcher), with a prepare that
    # also copies the legacy tables in once the schema exists.
    lifecycles=[dataclasses.replace(air_lifecycle, prepare=_prepare)],
    remote_dir=remotes_dir() / "air",
)
