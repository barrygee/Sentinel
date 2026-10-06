"""Core lifecycle: database schema and settings, the live config file, offline maps, the service registry."""

from backend.core.service_registry import registry
from backend.database import (
    create_tables,
    migrate_sdr_radios_to_settings,
    prune_removed_settings,
    resolve_retired_auto_modes,
    seed_default_settings,
)
from backend.platform.lifecycle import ModuleLifecycle
from backend.services import app_config_file
from backend.services.offline_map.job_runner import runner as offline_map_job_runner


async def _prepare() -> None:
    await create_tables()
    await migrate_sdr_radios_to_settings()
    # Drop settings rows left behind by removed features before the seeders run,
    # so a stale key can never be mistaken for a live default.
    await prune_removed_settings()
    await seed_default_settings()
    await resolve_retired_auto_modes()


async def _start() -> None:
    # Live config file: apply an edit made while Sentinel was stopped, write the
    # seeded/migrated settings out, then keep file and database in sync both ways.
    await app_config_file.sync.start()
    # Offline map downloads: recover from an unclean previous shutdown (mark
    # stale queued/running rows failed, drop orphan .part files), rebuild the
    # tile-tier registry, and start the one-job-at-a-time worker.
    await offline_map_job_runner.start()
    # Health-probe the services that registered from other processes.
    registry.start()


async def _stop() -> None:
    await registry.stop()
    await offline_map_job_runner.stop()
    await app_config_file.sync.stop()


lifecycle = ModuleLifecycle(
    name="core",
    prepare=_prepare,
    start=_start,
    stop=_stop,
    # Wakes a running `pmtiles extract` so shutdown doesn't wait on it.
    wake=offline_map_job_runner.wake,
)
