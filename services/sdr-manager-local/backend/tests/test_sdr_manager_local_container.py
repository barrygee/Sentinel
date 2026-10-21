"""Tests for `container.py`, the composition root moved over from Sentry's `main.py`.

Covers what changed in the move — real or simulated adapters, Sentinel's
engine, the location source, startup/shutdown as a lifecycle with a wake hook
— and the background loops that came with it.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_container.py
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from backend import database as core_database
from fastapi import FastAPI
from sdr_manager_local_fake_clock import FakeClock
from sqlalchemy.ext.asyncio import AsyncEngine

from sentinel_sdr_manager_local import container as container_module
from sentinel_sdr_manager_local.adapters.asyncio_process import AsyncioProcessSpawner
from sentinel_sdr_manager_local.adapters.composite_hotplug import CompositeHotplugSource
from sentinel_sdr_manager_local.adapters.ctypes_rtlsdr import RtlSdrLibraryUnavailableError
from sentinel_sdr_manager_local.adapters.fake_wifi_ap import FakeWifiApController
from sentinel_sdr_manager_local.adapters.nmcli_wifi_ap import NmcliWifiApController, UnavailableWifiApController
from sentinel_sdr_manager_local.adapters.reconcile_hotplug import ReconcileHotplugSource
from sentinel_sdr_manager_local.adapters.simulated_hardware import SimulatedProcessSpawner
from sentinel_sdr_manager_local.adapters.sysfs_usb import SysfsUsbDiscovery
from sentinel_sdr_manager_local.config import Settings, get_settings
from sentinel_sdr_manager_local.container import (
    AppContainer,
    _build_host_adapters,
    _build_rtlsdr_library,
    _build_wifi_ap_controller,
    _NullRtlSdrLibrary,
    _reconcile_worker,
    _run_hotplug_forever,
    _run_supervisor_reconcile_loop,
    build_container,
    container_lifecycle,
    start_container,
    stop_container,
)
from sentinel_sdr_manager_local.services.event_bus import EventBus, SseMessage
from sentinel_sdr_manager_local.services.supervisor import SupervisorService

LOGGER_NAME = "sentinel_sdr_manager_local.container"


def _settings(**overrides: Any) -> Settings:
    return Settings(**overrides)


class TestNullRtlSdrLibrary:
    def test_reports_no_library_and_no_devices(self) -> None:
        library = _NullRtlSdrLibrary()

        assert library.is_available() is False
        assert library.device_count() == 0
        with pytest.raises(IndexError, match="index 0"):
            library.usb_strings(0)


class TestBuildRtlSdrLibrary:
    def test_uses_librtlsdr_when_it_loads(self, monkeypatch: pytest.MonkeyPatch) -> None:
        loaded = object()
        monkeypatch.setattr(container_module, "CtypesRtlSdrLibrary", lambda: loaded)

        assert _build_rtlsdr_library() is loaded

    def test_degrades_to_no_devices_without_librtlsdr(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        def unavailable() -> None:
            raise RtlSdrLibraryUnavailableError("no librtlsdr")

        monkeypatch.setattr(container_module, "CtypesRtlSdrLibrary", unavailable)

        with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
            library = _build_rtlsdr_library()

        assert isinstance(library, _NullRtlSdrLibrary)
        assert "SDR_MANAGER_LOCAL_HARDWARE=fake" in caplog.text


class TestBuildWifiApController:
    def test_without_nmcli_the_hotspot_is_unavailable(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setattr(container_module.shutil, "which", lambda _path: None)

        with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
            controller = _build_wifi_ap_controller(_settings(), AsyncioProcessSpawner())

        assert isinstance(controller, UnavailableWifiApController)
        assert "was not found" in caplog.text

    def test_without_the_host_dbus_socket_the_hotspot_is_unavailable(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setattr(container_module.shutil, "which", lambda _path: "/usr/bin/nmcli")
        monkeypatch.setattr(container_module, "DBUS_SYSTEM_BUS_SOCKET", tmp_path / "missing_socket")

        with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
            controller = _build_wifi_ap_controller(_settings(), AsyncioProcessSpawner())

        assert isinstance(controller, UnavailableWifiApController)
        assert "is missing" in caplog.text

    def test_with_nmcli_and_dbus_it_drives_networkmanager(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        socket_path = tmp_path / "system_bus_socket"
        socket_path.touch()
        monkeypatch.setattr(container_module.shutil, "which", lambda _path: "/usr/bin/nmcli")
        monkeypatch.setattr(container_module, "DBUS_SYSTEM_BUS_SOCKET", socket_path)

        controller = _build_wifi_ap_controller(_settings(), AsyncioProcessSpawner())

        assert isinstance(controller, NmcliWifiApController)


class TestBuildHostAdapters:
    def test_fake_hardware_simulates_every_host_facing_adapter(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
            adapters = _build_host_adapters(_settings(hardware="fake"), FakeClock())

        assert len(adapters.usb_discovery.enumerate()) == 2
        assert isinstance(adapters.hotplug_source, ReconcileHotplugSource)
        assert isinstance(adapters.process_spawner, SimulatedProcessSpawner)
        assert adapters.rtlsdr_library.device_count() == 2
        assert isinstance(adapters.hotspot_controller, FakeWifiApController)
        assert "simulating two RTL-SDRs" in caplog.text

    def test_real_hardware_uses_the_host(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.setattr(container_module, "_build_rtlsdr_library", lambda: _NullRtlSdrLibrary())
        monkeypatch.setattr(container_module.shutil, "which", lambda _path: None)

        adapters = _build_host_adapters(_settings(hardware="real", sysfs_root=str(tmp_path)), FakeClock())

        assert isinstance(adapters.usb_discovery, SysfsUsbDiscovery)
        assert isinstance(adapters.hotplug_source, CompositeHotplugSource)
        assert isinstance(adapters.process_spawner, AsyncioProcessSpawner)
        assert isinstance(adapters.rtlsdr_library, _NullRtlSdrLibrary)
        assert isinstance(adapters.hotspot_controller, UnavailableWifiApController)


class TestBuildContainer:
    def test_wires_every_service_on_sentinels_engine(self) -> None:
        container = build_container(_settings(hardware="fake", location_refresh_s=30))

        assert container.session_factory.kw["bind"] is core_database.engine
        assert container.session_factory.kw["expire_on_commit"] is False
        assert container.location_source._refresh_interval_s == 30
        assert isinstance(container.supervisor, SupervisorService)
        assert container.background_tasks == []

    async def test_the_hotspot_answers_only_once_control_is_switched_on(self, seeded_database: AsyncEngine) -> None:
        container = build_container(_settings(hardware="fake"))

        # Simulated Wi-Fi exists, but control is off until switched on: the
        # gate answers with the switched-off controller.
        assert (await container.hotspot_service.get_snapshot()).available is False

        await container.host_control_settings.set_hotspot_control_enabled(True)

        assert (await container.hotspot_service.get_snapshot()).available is True


class _ImmediateClock(FakeClock):
    """A clock whose sleeps return at once, so the debounce does not need driving."""

    async def sleep(self, seconds: float) -> None:
        await asyncio.sleep(0)


def _reconcile_container(supervisor: Any, event_bus: EventBus | None = None) -> Any:
    return SimpleNamespace(clock=_ImmediateClock(), supervisor=supervisor, event_bus=event_bus or EventBus(FakeClock()))


class _CountingSupervisor:
    def __init__(self, fail: bool = False) -> None:
        self.reconciles = 0
        self.fail = fail
        self.reconciled = asyncio.Event()

    async def reconcile(self) -> None:
        self.reconciles += 1
        self.reconciled.set()
        if self.fail:
            raise RuntimeError("reconcile failed")


async def _settle() -> None:
    for _ in range(10):
        await asyncio.sleep(0)


class TestReconcileLoop:
    @pytest.mark.parametrize("event", ["device_changed", "device_removed"])
    async def test_a_registry_change_reconciles_the_supervisor(self, event: str) -> None:
        supervisor = _CountingSupervisor()
        container = _reconcile_container(supervisor)
        loop = asyncio.create_task(_run_supervisor_reconcile_loop(container))
        await _settle()

        container.event_bus.publish(SseMessage(event=event, data=None))
        await asyncio.wait_for(supervisor.reconciled.wait(), timeout=1)

        loop.cancel()
        with pytest.raises(asyncio.CancelledError):
            await loop
        assert supervisor.reconciles == 1

    async def test_other_events_are_ignored(self) -> None:
        supervisor = _CountingSupervisor()
        container = _reconcile_container(supervisor)
        loop = asyncio.create_task(_run_supervisor_reconcile_loop(container))
        await _settle()

        container.event_bus.publish(SseMessage(event="notice", data=None))
        await _settle()

        loop.cancel()
        with pytest.raises(asyncio.CancelledError):
            await loop
        assert supervisor.reconciles == 0

    async def test_the_loop_ends_quietly_when_the_bus_closes(self) -> None:
        container = _reconcile_container(_CountingSupervisor())
        loop = asyncio.create_task(_run_supervisor_reconcile_loop(container))
        await _settle()

        container.event_bus.close()

        await asyncio.wait_for(loop, timeout=1)

    async def test_a_crashing_subscription_is_logged(self, caplog: pytest.LogCaptureFixture) -> None:
        class BrokenBus:
            async def subscribe(self) -> Any:
                raise RuntimeError("bus broke")
                yield  # an async generator, like the real one

        container = SimpleNamespace(clock=_ImmediateClock(), supervisor=_CountingSupervisor(), event_bus=BrokenBus())

        with caplog.at_level(logging.ERROR, logger=LOGGER_NAME):
            await asyncio.wait_for(_run_supervisor_reconcile_loop(container), timeout=1)

        assert "supervisor reconcile loop crashed" in caplog.text


class TestReconcileWorker:
    async def test_a_failed_reconcile_is_logged_and_the_worker_keeps_going(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        supervisor = _CountingSupervisor(fail=True)
        requested = asyncio.Event()
        worker = asyncio.create_task(_reconcile_worker(_reconcile_container(supervisor), requested))

        with caplog.at_level(logging.ERROR, logger=LOGGER_NAME):
            requested.set()
            await asyncio.wait_for(supervisor.reconciled.wait(), timeout=1)
            supervisor.reconciled.clear()
            requested.set()
            await asyncio.wait_for(supervisor.reconciled.wait(), timeout=1)

        worker.cancel()
        with pytest.raises(asyncio.CancelledError):
            await worker
        assert supervisor.reconciles == 2
        assert caplog.text.count("supervisor reconcile crashed") == 2

    async def test_cancelled_during_the_debounce_it_returns(self) -> None:
        class BlockingClock(FakeClock):
            async def sleep(self, seconds: float) -> None:
                await asyncio.Event().wait()

        supervisor = _CountingSupervisor()
        container = SimpleNamespace(clock=BlockingClock(), supervisor=supervisor)
        requested = asyncio.Event()
        requested.set()
        worker = asyncio.create_task(_reconcile_worker(container, requested))
        await _settle()

        worker.cancel()

        assert await asyncio.wait_for(worker, timeout=1) is None
        assert supervisor.reconciles == 0

    async def test_cancelled_during_a_reconcile_it_returns(self) -> None:
        class BlockingSupervisor:
            started = asyncio.Event()

            async def reconcile(self) -> None:
                self.started.set()
                await asyncio.Event().wait()

        supervisor = BlockingSupervisor()
        requested = asyncio.Event()
        requested.set()
        worker = asyncio.create_task(_reconcile_worker(_reconcile_container(supervisor), requested))
        await asyncio.wait_for(supervisor.started.wait(), timeout=1)

        worker.cancel()

        assert await asyncio.wait_for(worker, timeout=1) is None


class TestRunHotplugForever:
    async def test_a_crash_is_logged_not_raised(self, caplog: pytest.LogCaptureFixture) -> None:
        async def crash() -> None:
            raise RuntimeError("netlink gone")

        container = SimpleNamespace(hotplug_service=SimpleNamespace(run=crash))

        with caplog.at_level(logging.ERROR, logger=LOGGER_NAME):
            await _run_hotplug_forever(container)  # type: ignore[arg-type]

        assert "hotplug service crashed" in caplog.text

    async def test_cancellation_propagates(self) -> None:
        async def cancelled() -> None:
            raise asyncio.CancelledError

        container = SimpleNamespace(hotplug_service=SimpleNamespace(run=cancelled))

        with pytest.raises(asyncio.CancelledError):
            await _run_hotplug_forever(container)  # type: ignore[arg-type]


class _Recorder:
    """Stands in for every service `start_container`/`stop_container` touch, recording the order."""

    def __init__(self, failing: set[str] | None = None) -> None:
        self.calls: list[str] = []
        self.failing = failing or set()

    def method(self, name: str, *, blocks: bool = False) -> Any:
        async def call() -> None:
            self.calls.append(name)
            if name in self.failing:
                raise RuntimeError(f"{name} failed")
            if blocks:
                await asyncio.Event().wait()

        return call


def _stub_container(recorder: _Recorder) -> Any:
    return SimpleNamespace(
        device_registry=SimpleNamespace(load=recorder.method("registry.load"), close=recorder.method("registry.close")),
        supervisor=SimpleNamespace(
            reconcile=recorder.method("supervisor.reconcile"), stop_all=recorder.method("supervisor.stop_all")
        ),
        hotplug_service=SimpleNamespace(
            run=recorder.method("hotplug.run", blocks=True), close=recorder.method("hotplug.close")
        ),
        hotspot_service=SimpleNamespace(close=recorder.method("hotspot.close")),
        location_source=SimpleNamespace(run=recorder.method("location.run", blocks=True)),
        event_bus=EventBus(FakeClock()),
        clock=_ImmediateClock(),
        background_tasks=[],
    )


class TestStartAndStop:
    async def test_starts_in_order_and_stops_everything_in_order(self) -> None:
        recorder = _Recorder()
        container = _stub_container(recorder)

        await start_container(container)
        await _settle()
        assert recorder.calls[:2] == ["registry.load", "supervisor.reconcile"]
        assert {"hotplug.run", "location.run"} <= set(recorder.calls)
        assert len(container.background_tasks) == 3

        recorder.calls.clear()
        await stop_container(container)

        # Loops first (nothing keeps mutating the registry), then the processes.
        assert recorder.calls == ["hotplug.close", "supervisor.stop_all", "hotspot.close", "registry.close"]
        assert all(task.done() for task in container.background_tasks)

    async def test_one_failing_step_does_not_stop_the_rest(self, caplog: pytest.LogCaptureFixture) -> None:
        recorder = _Recorder(failing={"hotplug.close", "supervisor.stop_all", "hotspot.close", "registry.close"})
        container = _stub_container(recorder)

        with caplog.at_level(logging.ERROR, logger=LOGGER_NAME):
            await stop_container(container)

        assert recorder.calls == ["hotplug.close", "supervisor.stop_all", "hotspot.close", "registry.close"]
        for message in (
            "error closing hotplug service",
            "error stopping supervised processes",
            "error closing hotspot service",
            "error closing device registry",
        ):
            assert message in caplog.text


class TestContainerLifecycle:
    async def test_prepare_start_wake_stop(
        self, monkeypatch: pytest.MonkeyPatch, sdr_manager_local_database: AsyncEngine
    ) -> None:
        monkeypatch.setenv("SDR_MANAGER_LOCAL_HARDWARE", "fake")
        # The simulated dongles arrive on the first reconcile sweep.
        monkeypatch.setenv("SDR_MANAGER_LOCAL_RECONCILE_INTERVAL_S", "0.01")
        get_settings.cache_clear()
        api_app = FastAPI()
        lifecycle = container_lifecycle(api_app)
        assert lifecycle.name == "sdr-manager-local"

        await lifecycle.prepare()  # type: ignore[misc]
        await lifecycle.start()  # type: ignore[misc]
        container: AppContainer = api_app.state.container
        try:
            subscription = container.event_bus.subscribe()
            stream = asyncio.create_task(anext(subscription, None))
            await _settle()

            lifecycle.wake()  # type: ignore[misc]

            # The wake hook ended the open stream, as a SIGTERM would.
            assert await asyncio.wait_for(stream, timeout=1) is None
            for _ in range(200):
                if len(container.device_registry.list_statuses()) == 2:
                    break
                await asyncio.sleep(0.01)
            assert {status.device_id for status in container.device_registry.list_statuses()} == {
                "serial:SIM-ADSB-01",
                "usb:1-1.2",
            }
        finally:
            await lifecycle.stop()  # type: ignore[misc]

        assert all(task.done() for task in container.background_tasks)
        # A second stop (nothing started any more) is harmless.
        await lifecycle.stop()  # type: ignore[misc]

    def test_wake_before_start_does_nothing(self) -> None:
        lifecycle = container_lifecycle(FastAPI())

        lifecycle.wake()  # type: ignore[misc]
