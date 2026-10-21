"""Tests for `adapters/simulated_hardware.py`, behind `SDR_MANAGER_LOCAL_HARDWARE=fake`.

The mock compose file, CI and the SDR Manager API contract suite rely on it
behaving like a real host closely enough for the services above it: devices
the supervisor can resolve to a librtlsdr index, processes that stop when
told to, and an `rtl_eeprom` that finishes.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_simulated_hardware.py
"""

from __future__ import annotations

import asyncio

import pytest

from sentinel_sdr_manager_local.adapters.simulated_hardware import (
    KILLED_EXIT_CODE,
    RTL_SDR_PRODUCT_ID,
    RTL_SDR_VENDOR_ID,
    SIMULATED_DEVICES,
    TERMINATED_EXIT_CODE,
    SimulatedManagedProcess,
    SimulatedProcessSpawner,
    build_simulated_hardware,
)


class TestSimulatedDevices:
    def test_two_rtl_sdrs_are_always_plugged_in(self) -> None:
        hardware = build_simulated_hardware()

        snapshots = hardware.usb_discovery.enumerate()

        assert [snapshot.topology_path for snapshot in snapshots] == ["1-1.1", "1-1.2"]
        assert {(snapshot.vendor_id, snapshot.product_id) for snapshot in snapshots} == {
            (RTL_SDR_VENDOR_ID, RTL_SDR_PRODUCT_ID)
        }
        # Still there on the next sweep: the hotplug reconcile sees no change.
        assert hardware.usb_discovery.enumerate() == snapshots

    def test_the_topology_is_parsed_into_bus_and_ports(self) -> None:
        first, second = build_simulated_hardware().usb_discovery.enumerate()

        assert (first.bus_number, first.port_chain, first.device_address) == (1, (1, 1), 11)
        assert (second.bus_number, second.port_chain, second.device_address) == (1, (1, 2), 12)
        assert first.sysfs_path == "/sys/bus/usb/devices/1-1.1"
        assert first.driver is None

    def test_one_dongle_has_a_unique_serial_and_one_the_factory_default(self) -> None:
        serials = [snapshot.serial for snapshot in build_simulated_hardware().usb_discovery.enumerate()]

        assert serials == ["SIM-ADSB-01", "00000001"]

    def test_librtlsdr_enumerates_the_same_dongles_in_the_same_order(self) -> None:
        hardware = build_simulated_hardware()
        snapshots = hardware.usb_discovery.enumerate()

        assert hardware.rtlsdr_library.is_available() is True
        assert hardware.rtlsdr_library.device_count() == len(SIMULATED_DEVICES)
        for index, snapshot in enumerate(snapshots):
            strings = hardware.rtlsdr_library.usb_strings(index)
            # What the supervisor matches on to find each dongle's `-d` index.
            assert (strings.manufacturer, strings.product, strings.serial) == (
                snapshot.manufacturer,
                snapshot.product,
                snapshot.serial,
            )

    async def test_the_wifi_controller_offers_one_ap_capable_radio(self) -> None:
        controller = build_simulated_hardware().wifi_ap_controller

        (interface,) = controller.interfaces
        assert (interface.name, interface.supports_ap, interface.carries_default_route) == ("wlan0", True, False)

    def test_each_build_is_independent(self) -> None:
        first = build_simulated_hardware()
        second = build_simulated_hardware()

        assert first.process_spawner is not second.process_spawner
        assert first.usb_discovery is not second.usb_discovery


class TestSimulatedProcesses:
    @pytest.mark.parametrize(
        ("stop", "exit_code"),
        [
            pytest.param("terminate", TERMINATED_EXIT_CODE, id="sigterm"),
            pytest.param("kill", KILLED_EXIT_CODE, id="sigkill"),
        ],
    )
    async def test_a_process_ends_when_it_is_told_to(self, stop: str, exit_code: int) -> None:
        process = SimulatedManagedProcess(pid=1000)

        getattr(process, stop)()

        assert await asyncio.wait_for(process.wait(), timeout=1) == exit_code
        assert process.returncode == exit_code

    async def test_a_kill_after_a_terminate_keeps_the_first_exit(self) -> None:
        process = SimulatedManagedProcess(pid=1000)

        process.terminate()
        process.kill()

        assert process.returncode == TERMINATED_EXIT_CODE
        assert process.terminated is True and process.killed is True

    async def test_stopping_an_exited_process_is_harmless(self) -> None:
        process = SimulatedManagedProcess(pid=1000)
        process.complete(0)

        process.terminate()
        process.kill()

        assert process.returncode == 0


class TestSimulatedSpawner:
    async def test_rtl_tcp_and_the_relay_run_until_stopped(self) -> None:
        spawner = SimulatedProcessSpawner()

        rtl_tcp = await spawner.spawn(["/usr/local/bin/rtl_tcp", "-d", "0"], {}, "rtl_tcp")
        relay = await spawner.spawn(["python", "relay.py"], {"RELAY_PORT": "1234"}, "relay")

        assert rtl_tcp.returncode is None and relay.returncode is None
        assert spawner.processes == [rtl_tcp, relay]
        assert all(isinstance(process, SimulatedManagedProcess) for process in spawner.processes)
        assert [spawn.name for spawn in spawner.spawns] == ["rtl_tcp", "relay"]

    async def test_rtl_eeprom_finishes_at_once(self) -> None:
        spawner = SimulatedProcessSpawner()

        process = await spawner.spawn(["/usr/local/bin/rtl_eeprom", "-d", "0", "-s", "NEW"], {}, "rtl_eeprom")

        assert await asyncio.wait_for(process.wait(), timeout=1) == 0
        assert await asyncio.wait_for(process.communicate(), timeout=1) == (b"", b"")

    async def test_pids_are_distinct(self) -> None:
        spawner = SimulatedProcessSpawner()

        pids = [(await spawner.spawn(["rtl_tcp"], {}, f"pair-{index}")).pid for index in range(3)]

        assert len(set(pids)) == 3

    async def test_a_scripted_spawn_failure_still_raises(self) -> None:
        spawner = SimulatedProcessSpawner()
        spawner.raise_on_next_spawn(FileNotFoundError("rtl_tcp"))

        with pytest.raises(FileNotFoundError):
            await spawner.spawn(["rtl_tcp"], {}, "rtl_tcp")
        assert spawner.processes == []

    async def test_an_empty_argv_is_treated_as_long_running(self) -> None:
        process = await SimulatedProcessSpawner().spawn([], {}, "nothing")

        assert process.returncode is None
