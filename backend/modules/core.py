"""Core lifecycle: database schema and settings, the live config file, offline maps, the service registry, the gateway."""

from backend.core import notifications
from backend.core.gateway_sync import gateway_sync
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
    notifications.streams.reopen()
    # Live config file: apply an edit made while Sentinel was stopped, write the
    # seeded/migrated settings out, then keep file and database in sync both ways.
    await app_config_file.sync.start()
    # Offline map downloads: recover from an unclean previous shutdown (mark
    # stale queued/running rows failed, drop orphan .part files), rebuild the
    # tile-tier registry, and start the one-job-at-a-time worker.
    await offline_map_job_runner.start()
    # Health-probe the services that registered from other processes.
    registry.start()
    # Push the registry's routes into the gateway, and keep them there.
    gateway_sync.start()


async def _stop() -> None:
    await gateway_sync.stop()
    await registry.stop()
    await offline_map_job_runner.stop()
    await app_config_file.sync.stop()


def _wake() -> None:
    # Wakes a running `pmtiles extract`, and ends every open alerts stream, so
    # shutdown doesn't wait on either.
    offline_map_job_runner.wake()
    notifications.streams.wake()


lifecycle = ModuleLifecycle(
    name="core",
    prepare=_prepare,
    start=_start,
    stop=_stop,
    wake=_wake,
)
