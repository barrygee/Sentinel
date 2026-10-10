"""The Space section as its own service (P6.1): `uvicorn backend.standalone.space:app`.

Owns `tle_cache` and `satellite_catalogue` in its own database (`DB_PATH`),
copied from the monolith's on first boot (`LEGACY_DB_PATH`). Its settings —
the data source URLs and the satellite radio store — stay in core and are
reached over HTTP.
"""

from __future__ import annotations

import asyncio
import logging

from backend.config import settings
from backend.database import SPACE_TABLES, backfill_satellite_radio_store, create_space_tables
from backend.modules.space import manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.remote_files import remotes_dir
from backend.platform.sdk import create_service
from backend.platform.sdk.legacy_import import import_legacy_tables
from backend.platform.settings_client import SettingsUnavailable
from backend.routers import space

logger = logging.getLogger(__name__)

# How long to wait between attempts while core is still starting.
CORE_RETRY_S = 2.0


async def _backfill_when_core_is_up() -> None:
    # The radio store is core's, so the reconcile has to wait for core; the
    # container usually starts a few seconds before core answers.
    while True:
        try:
            await backfill_satellite_radio_store()
            return
        except SettingsUnavailable as error:
            logger.info("space: waiting for core to backfill the satellite radio store (%s)", error)
            await asyncio.sleep(CORE_RETRY_S)


async def _prepare() -> None:
    await create_space_tables()
    await asyncio.to_thread(import_legacy_tables, settings.db_path, settings.legacy_db_path, SPACE_TABLES)
    await _backfill_when_core_is_up()


app = create_service(
    manifest=manifest,
    routers=[space.router],
    lifecycles=[ModuleLifecycle(name="space", prepare=_prepare)],
    remote_dir=remotes_dir() / "space",
)
