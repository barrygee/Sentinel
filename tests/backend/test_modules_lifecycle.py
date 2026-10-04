"""
tests/backend/test_modules_lifecycle.py

Tests for backend/modules/ — each module's lifecycle hooks (B8), which took
over the startup/shutdown sequence that used to live inline in
backend/main.py's lifespan.

The order inside each hook is behaviour (e.g. prune stale settings before the
seeders, release Sentry pollers before tearing down broadcasters), so each
hook is checked against recorders patched in where the module looks them up.
"""

import asyncio
import logging
from typing import Any

import pytest

from backend import modules
from backend.modules import core, land, radio_hub, sdr, sea, space
from backend.services.ais_stream import reader as ais_reader


def recorder(calls: list[str], name: str, *, is_async: bool = True) -> Any:
    if is_async:

        async def record_async(*args: Any, **kwargs: Any) -> None:
            calls.append(name)

        return record_async

    def record(*args: Any, **kwargs: Any) -> None:
        calls.append(name)

    return record


class TestModuleOrder:
    def test_modules_run_core_first_and_sections_after_the_radio_hub(self):
        # prepare: core's schema/settings before section seeders; start: the
        # config file sync (core) before anything resumes radios.
        assert [module.name for module in modules.MODULES] == [
            "core",
            "sdr",
            "space",
            "radio-hub",
            "land",
            "sea",
        ]


class TestCoreModule:
    async def test_prepare_builds_schema_and_settings_in_order(self, monkeypatch):
        calls: list[str] = []
        for name in (
            "create_tables",
            "migrate_sdr_radios_to_settings",
            "prune_removed_settings",
            "seed_default_settings",
            "resolve_retired_auto_modes",
        ):
            monkeypatch.setattr(core, name, recorder(calls, name))

        await core.lifecycle.prepare()

        assert calls == [
            "create_tables",
            "migrate_sdr_radios_to_settings",
            "prune_removed_settings",
            "seed_default_settings",
            "resolve_retired_auto_modes",
        ]

    async def test_start_syncs_the_config_file_before_the_offline_map_runner(
        self, monkeypatch
    ):
        calls: list[str] = []
        monkeypatch.setattr(
            core.app_config_file.sync, "start", recorder(calls, "config.start")
        )
        monkeypatch.setattr(
            core.offline_map_job_runner, "start", recorder(calls, "offline.start")
        )

        await core.lifecycle.start()

        assert calls == ["config.start", "offline.start"]

    async def test_stop_stops_the_offline_runner_then_the_config_file_sync(
        self, monkeypatch
    ):
        calls: list[str] = []
        monkeypatch.setattr(
            core.app_config_file.sync, "stop", recorder(calls, "config.stop")
        )
        monkeypatch.setattr(
            core.offline_map_job_runner, "stop", recorder(calls, "offline.stop")
        )

        await core.lifecycle.stop()

        assert calls == ["offline.stop", "config.stop"]

    def test_wake_wakes_the_offline_map_runner(self):
        assert core.lifecycle.wake == core.offline_map_job_runner.wake


class TestSdrModule:
    async def test_prepare_seeds_frequencies_then_the_band_plan(self, monkeypatch):
        calls: list[str] = []
        monkeypatch.setattr(
            sdr, "seed_sdr_data_from_files", recorder(calls, "frequencies")
        )
        monkeypatch.setattr(
            sdr, "seed_sdr_bandplan_from_file", recorder(calls, "bandplan")
        )

        await sdr.lifecycle.prepare()

        assert calls == ["frequencies", "bandplan"]
        assert sdr.lifecycle.start is None and sdr.lifecycle.stop is None


class TestSpaceModule:
    def test_prepare_backfills_the_satellite_radio_store(self):
        from backend.database import backfill_satellite_radio_store

        assert space.lifecycle.prepare is backfill_satellite_radio_store


class TestRadioHubModule:
    async def test_start_resolves_the_secret_then_resumes_decodes_then_starts_the_poller(
        self, monkeypatch
    ):
        calls: list[str] = []
        monkeypatch.setattr(
            radio_hub.sdr_decode_service,
            "resolve_ingest_secret",
            recorder(calls, "secret", is_async=False),
        )
        monkeypatch.setattr(
            radio_hub.decode_router, "resume_persisted_aprs", recorder(calls, "aprs")
        )
        monkeypatch.setattr(
            radio_hub.decode_router, "resume_persisted_ais", recorder(calls, "ais")
        )
        monkeypatch.setattr(
            radio_hub.fleet_poller, "start_all", recorder(calls, "fleet.start")
        )

        await radio_hub.lifecycle.start()

        assert calls == ["secret", "aprs", "ais", "fleet.start"]

    async def test_stop_stops_the_poller_then_decoders_then_broadcasters(
        self, monkeypatch
    ):
        calls: list[str] = []
        monkeypatch.setattr(
            radio_hub.fleet_poller, "stop_all", recorder(calls, "fleet.stop")
        )
        monkeypatch.setattr(
            radio_hub.sdr_decode_service,
            "shutdown_all_decoders",
            recorder(calls, "decoders"),
        )
        monkeypatch.setattr(
            radio_hub.sdr_service, "shutdown_all", recorder(calls, "broadcasters")
        )

        await radio_hub.lifecycle.stop()

        assert calls == ["fleet.stop", "decoders", "broadcasters"]

    def test_wake_wakes_subscribers_and_decoders(self, monkeypatch):
        calls: list[str] = []
        monkeypatch.setattr(
            radio_hub.sdr_service,
            "wake_all_subscribers",
            recorder(calls, "subscribers", is_async=False),
        )
        monkeypatch.setattr(
            radio_hub.sdr_decode_service,
            "wake_all_decoders",
            recorder(calls, "decoders", is_async=False),
        )

        radio_hub.lifecycle.wake()

        assert calls == ["subscribers", "decoders"]


class TestSeaModule:
    def test_hooks_drive_the_ais_reader(self):
        assert sea.lifecycle.start == ais_reader.start
        assert sea.lifecycle.stop == ais_reader.stop
        assert sea.lifecycle.wake == ais_reader.wake


class TestLandModule:
    @pytest.fixture(autouse=True)
    def no_leftover_task(self, monkeypatch):
        monkeypatch.setattr(land, "_cleanup_task", None)

    async def test_start_runs_cleanup_immediately_and_stop_cancels_the_loop(
        self, monkeypatch
    ):
        ran = asyncio.Event()

        async def cleanup_expired(now_ms: int) -> None:
            ran.set()

        monkeypatch.setattr(land.aprs_store, "cleanup_expired", cleanup_expired)

        await land.lifecycle.start()
        task = land._cleanup_task
        await asyncio.wait_for(ran.wait(), timeout=1)
        # Still alive: it is sleeping until the next daily run.
        assert task is not None and not task.done()

        await land.lifecycle.stop()

        assert task.cancelled()
        assert land._cleanup_task is None

    async def test_a_failed_cleanup_is_logged_and_the_loop_keeps_running(
        self, monkeypatch, caplog
    ):
        ran = asyncio.Event()

        async def cleanup_expired(now_ms: int) -> None:
            ran.set()
            raise RuntimeError("db locked")

        monkeypatch.setattr(land.aprs_store, "cleanup_expired", cleanup_expired)

        with caplog.at_level(logging.ERROR, logger="backend.modules.land"):
            await land.lifecycle.start()
            task = land._cleanup_task
            await asyncio.wait_for(ran.wait(), timeout=1)
            await asyncio.sleep(0)
            assert task is not None and not task.done()
            await land.lifecycle.stop()

        assert "APRS station cleanup failed" in caplog.text

    async def test_stop_without_start_is_a_no_op(self):
        await land.lifecycle.stop()

        assert land._cleanup_task is None
