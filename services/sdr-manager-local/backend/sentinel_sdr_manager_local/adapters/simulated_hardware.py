"""Simulated hardware for `SDR_MANAGER_LOCAL_HARDWARE=fake` (ADR 0007).

Lets SDR Manager run with no dongle, no librtlsdr, no NetworkManager and no
privileges — in `compose.sdr-manager-local-mock.yaml`, in CI's gateway smoke
legs and in the SDR Manager API contract suite. It is built from the same
fakes the unit tests use, so the services above it run unchanged: two
RTL-SDRs are always plugged in, every spawned `rtl_tcp`/relay pair "runs"
until it is stopped, and the hotspot is held in memory.

Nothing here streams IQ. A consumer tuning a simulated device gets a
connection refused on its port, which is the honest answer.
"""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from sentinel_sdr_manager_local.adapters.fake_process import FakeManagedProcess, FakeProcessSpawner
from sentinel_sdr_manager_local.adapters.fake_rtlsdr import FakeRtlSdrLibrary
from sentinel_sdr_manager_local.adapters.fake_wifi_ap import FakeWifiApController
from sentinel_sdr_manager_local.adapters.fixture_usb import ScriptedUsbDiscovery
from sentinel_sdr_manager_local.interfaces.types import RtlSdrUsbStrings, UsbDeviceSnapshot, WirelessInterface

# RTL2832U: the vendor/product every RTL-SDR reports.
RTL_SDR_VENDOR_ID = "0bda"
RTL_SDR_PRODUCT_ID = "2838"
SIMULATED_MANUFACTURER = "Realtek"
SIMULATED_PRODUCT = "RTL2838UHIDIR"

# One serial-keyed dongle and one with the factory-default serial, so both
# identity tiers (serial and USB topology) show up in a simulated session.
SIMULATED_DEVICES: tuple[tuple[str, str], ...] = (
    ("1-1.1", "SIM-ADSB-01"),
    ("1-1.2", "00000001"),
)

# Programs that do their work and exit, rather than running until stopped.
SHORT_LIVED_PROGRAMS = frozenset({"rtl_eeprom"})

# The exit codes a real process reports when SIGTERM / SIGKILL end it.
TERMINATED_EXIT_CODE = -15
KILLED_EXIT_CODE = -9


def _simulated_snapshot(topology_path: str, serial: str) -> UsbDeviceSnapshot:
    bus_text, port_text = topology_path.split("-", 1)
    port_chain = tuple(int(port) for port in port_text.split("."))
    return UsbDeviceSnapshot(
        topology_path=topology_path,
        bus_number=int(bus_text),
        port_chain=port_chain,
        device_address=10 + port_chain[-1],
        vendor_id=RTL_SDR_VENDOR_ID,
        product_id=RTL_SDR_PRODUCT_ID,
        serial=serial,
        manufacturer=SIMULATED_MANUFACTURER,
        product=SIMULATED_PRODUCT,
        # Bound to no driver: the DVB driver blacklist is in effect.
        driver=None,
        sysfs_path=f"/sys/bus/usb/devices/{topology_path}",
    )


class SimulatedManagedProcess(FakeManagedProcess):
    """A fake process that ends when it is asked to, as a real one does."""

    def terminate(self) -> None:
        """Record the request and exit as SIGTERM would."""
        super().terminate()
        if self.returncode is None:
            self.complete(TERMINATED_EXIT_CODE)

    def kill(self) -> None:
        """Record the request and exit as SIGKILL would."""
        super().kill()
        if self.returncode is None:
            self.complete(KILLED_EXIT_CODE)


class SimulatedProcessSpawner(FakeProcessSpawner):
    """Starts simulated processes: long-running ones run until stopped, short-lived ones exit 0."""

    async def spawn(
        self,
        argv: Sequence[str],
        env: Mapping[str, str],
        name: str,
        capture_output: bool = False,
    ) -> FakeManagedProcess:
        """Record the call and return a process that behaves like the program it names."""
        recorded = await super().spawn(argv, env, name, capture_output)
        process = SimulatedManagedProcess(pid=recorded.pid)
        self.processes[-1] = process
        if argv and os.path.basename(argv[0]) in SHORT_LIVED_PROGRAMS:
            process.complete(0)
        return process


@dataclass(frozen=True)
class SimulatedHardware:
    """Everything the composition root would otherwise build from the real host."""

    usb_discovery: ScriptedUsbDiscovery
    rtlsdr_library: FakeRtlSdrLibrary
    process_spawner: SimulatedProcessSpawner
    wifi_ap_controller: FakeWifiApController


def build_simulated_hardware() -> SimulatedHardware:
    """Two plugged-in RTL-SDRs, a process spawner that never starts anything, and one Wi-Fi interface."""
    snapshots = [_simulated_snapshot(topology_path, serial) for topology_path, serial in SIMULATED_DEVICES]
    return SimulatedHardware(
        usb_discovery=ScriptedUsbDiscovery([snapshots]),
        rtlsdr_library=FakeRtlSdrLibrary(
            [RtlSdrUsbStrings(SIMULATED_MANUFACTURER, SIMULATED_PRODUCT, serial) for _, serial in SIMULATED_DEVICES]
        ),
        process_spawner=SimulatedProcessSpawner(),
        wifi_ap_controller=FakeWifiApController(
            interfaces=(
                WirelessInterface(
                    name="wlan0",
                    mac_address=None,
                    supports_ap=True,
                    state="disconnected",
                    active_connection_name=None,
                    station_ssid=None,
                    ipv4_addresses=(),
                    carries_default_route=False,
                ),
            )
        ),
    )
