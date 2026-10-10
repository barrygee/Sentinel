"""The Space section as its own service (P6.1): `uvicorn backend.standalone.space:app`.

Owns `tle_cache` and `satellite_catalogue` in its own database (`DB_PATH`),
copied from the monolith's on first boot (`LEGACY_DB_PATH`). Its settings —
the data source URLs and the satellite radio store — stay in core and are
reached over HTTP.
"""

from __future__ import annotations

import asyncio

from backend.config import settings
from backend.database import SPACE_TABLES, backfill_satellite_radio_store, create_space_tables
from backend.modules.space import manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.remote_files import remotes_dir
from backend.platform.sdk import create_service
from backend.platform.sdk.legacy_import import import_legacy_tables
from backend.routers import space


async def _prepare() -> None:
    await create_space_tables()
    await asyncio.to_thread(import_legacy_tables, settings.db_path, settings.legacy_db_path, SPACE_TABLES)
    # The radio store is core's; create_service has already waited for core.
    await backfill_satellite_radio_store()


app = create_service(
    manifest=manifest,
    routers=[space.router],
    lifecycles=[ModuleLifecycle(name="space", prepare=_prepare)],
    remote_dir=remotes_dir() / "space",
)
