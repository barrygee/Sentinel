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
from backend.database import AsyncSessionLocal
from backend.modules import bus as bus_module
from backend.modules import air, core, land, radio_hub, sdr, sea, space
from backend.platform.bus import bus as process_bus
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
        # config file sync (core) before anything resumes radios; the bus
        # connects before (and disconnects after) everything that publishes.
        assert [module.name for module in modules.MODULES] == [
            "bus",
            "core",
            "sdr",
            "space",
            "radio-hub",
            "land",
            "sea",
            "air",
        ]


class TestBusModule:
    @pytest.fixture(autouse=True)
    def no_leftover_transport(self, monkeypatch):
        monkeypatch.setattr(bus_module, "_transport", None)

    async def test_without_a_nats_url_the_bus_stays_in_process(self, monkeypatch):
        monkeypatch.setattr(bus_module.settings, "nats_url", "")

        def unexpected(*args: Any, **kwargs: Any) -> None:
            raise AssertionError("no transport should be built without NATS_URL")

        monkeypatch.setattr(bus_module, "NatsTransport", unexpected)
        await bus_module.lifecycle.start()
        assert bus_module._transport is None
        await bus_module.lifecycle.stop()  # nothing to stop: a no-op

    async def test_with_a_nats_url_it_starts_then_stops_the_transport(self, monkeypatch):
        calls: list[Any] = []

        class FakeTransport:
            def __init__(self, event_bus, url, *, client_name, open_session):
                calls.append(("init", event_bus, url, client_name, open_session))

            async def start(self):
                calls.append("start")

            async def stop(self):
                calls.append("stop")

        monkeypatch.setattr(bus_module.settings, "nats_url", "nats://nats:4222")
        monkeypatch.setattr(bus_module, "NatsTransport", FakeTransport)
        await bus_module.lifecycle.start()
        assert calls == [("init", process_bus, "nats://nats:4222", "sentinel-app", AsyncSessionLocal), "start"]
        assert isinstance(bus_module._transport, FakeTransport)
        await bus_module.lifecycle.stop()
        assert calls[-1] == "stop"
        assert bus_module._transport is None


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

    def test_wake_wakes_the_offline_map_runner_and_ends_alert_streams(self, monkeypatch):
        calls: list[str] = []
        monkeypatch.setattr(core.offline_map_job_runner, "wake", recorder(calls, "offline.wake", is_async=False))
        monkeypatch.setattr(core.notifications.streams, "wake", recorder(calls, "streams.wake", is_async=False))
        core.lifecycle.wake()
        assert calls == ["offline.wake", "streams.wake"]

    async def test_start_reopens_alert_streams_closed_by_a_previous_wake(self, monkeypatch):
        for name in ("start",):
            monkeypatch.setattr(core.app_config_file.sync, name, recorder([], name))
            monkeypatch.setattr(core.offline_map_job_runner, name, recorder([], name))
        monkeypatch.setattr(core.registry, "start", recorder([], "registry", is_async=False))
        core.notifications.streams.wake()
        await core.lifecycle.start()
        assert core.notifications.streams._closing is False


class TestAirModule:
    async def test_start_starts_the_squawk_watcher_and_stop_stops_it(self, monkeypatch):
        calls: list[str] = []
        monkeypatch.setattr(air.watcher, "start", recorder(calls, "watcher.start", is_async=False))
        monkeypatch.setattr(air.watcher, "stop", recorder(calls, "watcher.stop"))
        await air.lifecycle.start()
        await air.lifecycle.stop()
        assert calls == ["watcher.start", "watcher.stop"]

    def test_air_starts_after_the_radio_hub(self):
        # The watcher asks the hub where the off-grid receiver is.
        order = [module.name for module in modules.MODULES]
        assert order.index("radio-hub") < order.index("air")


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
    def test_stop_and_wake_drive_the_ais_reader(self):
        assert sea.lifecycle.stop == ais_reader.stop
        assert sea.lifecycle.wake == ais_reader.wake

    async def test_start_warms_the_reader_then_reconciles_the_ais_receiver(
        self, monkeypatch
    ):
        calls: list[str] = []

        async def reader_start() -> None:
            calls.append("reader")

        async def reconcile_now() -> None:
            calls.append("receiver")

        monkeypatch.setattr(ais_reader, "start", reader_start)
        monkeypatch.setattr(sea.sea_ais_receiver, "reconcile_now", reconcile_now)
        await sea.lifecycle.start()
        assert calls == ["reader", "receiver"]

    def test_sea_starts_after_the_radio_hub(self):
        # The receiver asks the hub to decode, so the hub must be up first.
        order = [module.name for module in modules.MODULES]
        assert order.index("radio-hub") < order.index("sea")


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
