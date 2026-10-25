"""Tests for the macOS side of the composition root, and for naming the hotplug source honestly.

On a Mac (`HOST_PLATFORM == "darwin"`) `container.py` must pick `ioreg`
discovery, the reconcile sweep, Homebrew's librtlsdr and tools, and no
hotspot; and `GET /api/health` must call a reconcile-only source `reconcile`,
not `udev`.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_macos_container.py
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from sdr_manager_local_fake_clock import FakeClock

from sentinel_sdr_manager_local import container as container_module
from sentinel_sdr_manager_local.adapters.asyncio_process import AsyncioProcessSpawner
from sentinel_sdr_manager_local.adapters.composite_hotplug import CompositeHotplugSource
from sentinel_sdr_manager_local.adapters.fake_wifi_ap import FakeWifiApController
from sentinel_sdr_manager_local.adapters.macos.ioreg_usb import IoregUsbDiscovery
from sentinel_sdr_manager_local.adapters.nmcli_wifi_ap import UnavailableWifiApController
from sentinel_sdr_manager_local.adapters.reconcile_hotplug import ReconcileHotplugSource
from sentinel_sdr_manager_local.adapters.sysfs_usb import SysfsUsbDiscovery
from sentinel_sdr_manager_local.config import Settings
from sentinel_sdr_manager_local.container import (
    MACOS_HOTSPOT_UNAVAILABLE_REASON,
    _build_host_adapters,
    _NullRtlSdrLibrary,
    build_container,
)
from sentinel_sdr_manager_local.services.event_bus import EventBus
from sentinel_sdr_manager_local.services.hotplug import HotplugService
from sentinel_sdr_manager_local.services.usb_discovery import UsbDiscoveryService


def _settings(**overrides: Any) -> Settings:
    return Settings(**overrides)


@pytest.fixture
def built_libraries(monkeypatch: pytest.MonkeyPatch) -> list[tuple[Any, ...]]:
    """Each `_build_rtlsdr_library` call's arguments; the library is the null one."""
    calls: list[tuple[Any, ...]] = []

    def fake_build(*arguments: Any) -> _NullRtlSdrLibrary:
        calls.append(arguments)
        return _NullRtlSdrLibrary()

    monkeypatch.setattr(container_module, "_build_rtlsdr_library", fake_build)
    return calls


@pytest.fixture
def homebrew_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(container_module, "find_homebrew_tool", lambda configured: f"/opt/homebrew/bin/{configured}")


class TestMacAdapters:
    def test_a_mac_uses_ioreg_the_reconcile_sweep_homebrew_and_no_hotspot(
        self, built_libraries: list[tuple[Any, ...]], homebrew_tools: None
    ) -> None:
        adapters = _build_host_adapters(
            _settings(hardware="real", librtlsdr_path="/custom/librtlsdr.dylib"), FakeClock(), platform="darwin"
        )

        assert isinstance(adapters.usb_discovery, IoregUsbDiscovery)
        assert isinstance(adapters.hotplug_source, ReconcileHotplugSource)
        assert adapters.hotplug_source._discovery is adapters.usb_discovery
        assert isinstance(adapters.process_spawner, AsyncioProcessSpawner)
        assert isinstance(adapters.rtlsdr_library, _NullRtlSdrLibrary)
        assert built_libraries == [("/custom/librtlsdr.dylib", (Path("/opt/homebrew/lib"), Path("/usr/local/lib")))]
        assert isinstance(adapters.hotspot_controller, UnavailableWifiApController)
        assert adapters.hotspot_controller._reason == MACOS_HOTSPOT_UNAVAILABLE_REASON
        assert (adapters.rtl_tcp_path, adapters.rtl_eeprom_path) == (
            "/opt/homebrew/bin/rtl_tcp",
            "/opt/homebrew/bin/rtl_eeprom",
        )

    def test_the_reconcile_sweep_runs_at_the_configured_interval(
        self, built_libraries: list[tuple[Any, ...]], homebrew_tools: None
    ) -> None:
        adapters = _build_host_adapters(_settings(reconcile_interval_s=5.0), FakeClock(), platform="darwin")

        assert adapters.hotplug_source._interval_s == 5.0

    def test_the_host_platform_decides_when_none_is_given(
        self, monkeypatch: pytest.MonkeyPatch, built_libraries: list[tuple[Any, ...]], homebrew_tools: None
    ) -> None:
        monkeypatch.setattr(container_module, "HOST_PLATFORM", "darwin")

        assert isinstance(_build_host_adapters(_settings(), FakeClock()).usb_discovery, IoregUsbDiscovery)

    def test_fake_hardware_wins_on_a_mac(self) -> None:
        adapters = _build_host_adapters(_settings(hardware="fake"), FakeClock(), platform="darwin")

        assert isinstance(adapters.hotspot_controller, FakeWifiApController)
        assert adapters.rtl_tcp_path == "rtl_tcp"


class TestLinuxAdapters:
    def test_linux_keeps_sysfs_and_udev_and_passes_the_library_path(
        self, monkeypatch: pytest.MonkeyPatch, built_libraries: list[tuple[Any, ...]], tmp_path: Path
    ) -> None:
        monkeypatch.setattr(container_module.shutil, "which", lambda _path: None)

        adapters = _build_host_adapters(
            _settings(sysfs_root=str(tmp_path), librtlsdr_path="/usr/lib/librtlsdr.so.0", rtl_tcp_path="/bin/rt"),
            FakeClock(),
            platform="linux",
        )

        assert isinstance(adapters.usb_discovery, SysfsUsbDiscovery)
        assert isinstance(adapters.hotplug_source, CompositeHotplugSource)
        assert built_libraries == [("/usr/lib/librtlsdr.so.0",)]
        assert (adapters.rtl_tcp_path, adapters.rtl_eeprom_path) == ("/bin/rt", "rtl_eeprom")


class TestBuildContainerUsesTheResolvedTools:
    def test_the_supervisor_and_eeprom_get_the_platforms_tool_paths(
        self, monkeypatch: pytest.MonkeyPatch, built_libraries: list[tuple[Any, ...]], homebrew_tools: None
    ) -> None:
        monkeypatch.setattr(container_module, "HOST_PLATFORM", "darwin")

        container = build_container(_settings())

        assert container.supervisor._rtl_tcp_path == "/opt/homebrew/bin/rtl_tcp"
        assert container.eeprom_service._rtl_eeprom_path == "/opt/homebrew/bin/rtl_eeprom"


class _DegradingSource:
    def __init__(self, degraded: bool) -> None:
        self.degraded_to_reconcile_only = degraded


class _NamedSource:
    source_name = "reconcile"
    degraded_to_reconcile_only = False


def _hotplug_service(source: Any) -> HotplugService:
    clock = FakeClock()
    return HotplugService(source, UsbDiscoveryService(IoregUsbDiscovery(lambda: b"")), clock, EventBus(clock))


class TestHotplugSourceName:
    def test_a_healthy_udev_source_is_udev(self) -> None:
        assert _hotplug_service(_DegradingSource(degraded=False)).source_name() == "udev"

    def test_a_source_that_degraded_to_the_sweep_is_reconcile(self) -> None:
        service = _hotplug_service(_DegradingSource(degraded=True))

        assert service.source_name() == "reconcile"
        assert service.is_primary_source_healthy() is False

    def test_a_reconcile_only_source_names_itself_and_stays_healthy(self) -> None:
        sweep = ReconcileHotplugSource(IoregUsbDiscovery(lambda: b""), FakeClock(), 2.0)
        service = _hotplug_service(sweep)

        assert sweep.source_name == "reconcile"
        assert service.source_name() == "reconcile"
        assert service.is_primary_source_healthy() is True

    def test_a_named_source_still_reads_reconcile_when_degraded(self) -> None:
        named = _NamedSource()
        named.degraded_to_reconcile_only = True

        assert _hotplug_service(named).source_name() == "reconcile"


class TestHealthNamesTheSource:
    async def test_a_macs_health_says_reconcile_and_ok(self, seeded_database: Any) -> None:
        container = build_container(_settings(hardware="fake"))
        await container.device_registry.load()
        try:
            health = await container.health_service.get_health()
        finally:
            await container.device_registry.close()

        # Simulated hardware, like a Mac, has only the reconcile sweep.
        assert (health.hotplug.source, health.hotplug.healthy, health.status) == ("reconcile", True, "ok")
