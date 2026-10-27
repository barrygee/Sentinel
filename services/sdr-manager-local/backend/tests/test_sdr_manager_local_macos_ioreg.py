"""Tests for `adapters/macos/ioreg_usb.py`: a Mac's USB devices from `ioreg -p IOUSB -l -a`.

The fixtures under `fixtures/ioreg/` are property lists in the two shapes
macOS prints: an Apple-silicon tree (`IOUSBHostDevice`, both spellings of each
string descriptor, one root dict) and an Intel one (`IOUSBDevice`, only the
`kUSB*` strings, a top-level array).

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_macos_ioreg.py
"""

from __future__ import annotations

import logging
import plistlib
import subprocess
from pathlib import Path
from typing import Any

import pytest

from sentinel_sdr_manager_local.adapters.macos import ioreg_usb
from sentinel_sdr_manager_local.adapters.macos.ioreg_usb import (
    IOREG_COMMAND,
    IOREG_TIMEOUT_S,
    IoregUsbDiscovery,
    parse_ioreg_usb,
    run_ioreg,
    topology_from_location_id,
)
from sentinel_sdr_manager_local.interfaces.types import UsbDeviceSnapshot

FIXTURES = Path(__file__).parent / "fixtures" / "ioreg"
LOGGER_NAME = "sentinel_sdr_manager_local.adapters.macos.ioreg_usb"


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _tree(*devices: dict[str, Any]) -> bytes:
    """A root holding one controller with `devices` under it, as ioreg prints it."""
    return plistlib.dumps(
        {
            "IORegistryEntryName": "Root",
            "IORegistryEntryChildren": [{"locationID": 0x01000000, "IORegistryEntryChildren": list(devices)}],
        }
    )


def _device(**overrides: Any) -> dict[str, Any]:
    entry: dict[str, Any] = {"idVendor": 0x0BDA, "idProduct": 0x2838, "locationID": 0x01100000, "USB Address": 9}
    entry.update(overrides)
    return {key: value for key, value in entry.items() if value is not None}


class TestTopologyFromLocationId:
    def test_controller_byte_then_one_port_per_nibble(self) -> None:
        assert topology_from_location_id(0x20140000) == (32, (1, 4))

    def test_six_tiers_deep(self) -> None:
        assert topology_from_location_id(0x01123456) == (1, (1, 2, 3, 4, 5, 6))

    def test_the_chain_ends_at_the_first_zero_nibble(self) -> None:
        assert topology_from_location_id(0x14102000) == (0x14, (1,))

    def test_controller_zero_is_a_real_controller(self) -> None:
        assert topology_from_location_id(0x00100000) == (0, (1,))

    def test_a_controller_itself_has_no_port(self) -> None:
        assert topology_from_location_id(0x20000000) is None

    @pytest.mark.parametrize("location_id", [-1, 0x1_0000_0000])
    def test_a_value_outside_32_bits_is_rejected(self, location_id: int) -> None:
        assert topology_from_location_id(location_id) is None


class TestParseAppleSilicon:
    def test_every_usb_device_under_every_controller_in_topology_order(self) -> None:
        snapshots = parse_ioreg_usb(_fixture("apple-silicon-two-rtl-sdrs.plist"))

        assert [snapshot.topology_path for snapshot in snapshots] == ["32-1", "32-1.4", "32-3", "33-2"]

    def test_an_rtl_sdr_on_a_hub_port(self) -> None:
        snapshots = parse_ioreg_usb(_fixture("apple-silicon-two-rtl-sdrs.plist"))

        assert snapshots[1] == UsbDeviceSnapshot(
            topology_path="32-1.4",
            bus_number=32,
            port_chain=(1, 4),
            device_address=3,
            vendor_id="0bda",
            product_id="2838",
            serial="00000001",
            manufacturer="Realtek",
            product="RTL2838UHIDIR",
            driver=None,
            sysfs_path="ioreg:locationID=0x20140000",
        )

    def test_a_dongle_without_a_serial_has_none(self) -> None:
        snapshots = parse_ioreg_usb(_fixture("apple-silicon-two-rtl-sdrs.plist"))

        assert snapshots[3].serial is None
        assert snapshots[3].topology_path == "33-2"


class TestParseIntel:
    def test_a_top_level_array_and_the_kusb_string_keys(self) -> None:
        [snapshot] = parse_ioreg_usb(_fixture("intel-kusb-strings.plist"))

        assert snapshot.topology_path == "20-1"
        assert (snapshot.vendor_id, snapshot.product_id) == ("0bda", "2832")
        assert (snapshot.serial, snapshot.manufacturer, snapshot.product) == ("77771111", "Generic", "RTL2832U")
        assert snapshot.device_address == 5


class TestParseEntries:
    def test_the_usb_name_wins_over_the_kusb_name(self) -> None:
        [snapshot] = parse_ioreg_usb(
            _tree(_device(**{"USB Serial Number": "primary", "kUSBSerialNumberString": "secondary"}))
        )

        assert snapshot.serial == "primary"

    def test_a_blank_string_falls_through_to_the_other_name(self) -> None:
        [snapshot] = parse_ioreg_usb(_tree(_device(**{"USB Product Name": "  ", "kUSBProductString": " RTL "})))

        assert snapshot.product == "RTL"

    def test_a_non_string_descriptor_is_absent(self) -> None:
        [snapshot] = parse_ioreg_usb(_tree(_device(**{"USB Vendor Name": 7})))

        assert snapshot.manufacturer is None

    def test_a_missing_usb_address_reads_as_zero(self) -> None:
        [snapshot] = parse_ioreg_usb(_tree(_device(**{"USB Address": None})))

        assert snapshot.device_address == 0

    @pytest.mark.parametrize("missing_key", ["idVendor", "idProduct", "locationID"])
    def test_an_entry_without_an_id_or_location_is_skipped(self, missing_key: str) -> None:
        assert parse_ioreg_usb(_tree(_device(**{missing_key: None}))) == []

    def test_a_boolean_is_never_an_id(self) -> None:
        assert parse_ioreg_usb(_tree(_device(idVendor=True))) == []

    def test_a_device_at_a_controller_location_is_skipped(self) -> None:
        assert parse_ioreg_usb(_tree(_device(locationID=0x01000000))) == []

    def test_children_that_are_not_entries_are_ignored(self) -> None:
        tree = plistlib.dumps({"IORegistryEntryChildren": ["not an entry", _device()]})

        assert [snapshot.topology_path for snapshot in parse_ioreg_usb(tree)] == ["1-1"]

    def test_array_items_that_are_not_entries_are_ignored(self) -> None:
        assert parse_ioreg_usb(plistlib.dumps(["text", 3, _device()]))[0].topology_path == "1-1"


class TestParseBadOutput:
    @pytest.mark.parametrize("output", [b"", b"  \n"])
    def test_no_output_is_no_devices(self, output: bytes) -> None:
        assert parse_ioreg_usb(output) == []

    @pytest.mark.parametrize(
        "output",
        [
            b"+-o Root  <class IORegistryEntry>",  # ioreg's text output, without -a
            b'<?xml version="1.0"?><plist version="1.0"><dict><key>idVendor</key>',  # cut off at the timeout
        ],
    )
    def test_output_that_is_not_a_property_list_is_no_devices(
        self, output: bytes, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
            assert parse_ioreg_usb(output) == []

        assert "isn't a property list" in caplog.text


class TestRunIoreg:
    def test_returns_what_ioreg_prints(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[tuple[Any, dict[str, Any]]] = []

        def fake_run(command: Any, **options: Any) -> subprocess.CompletedProcess[bytes]:
            calls.append((command, options))
            return subprocess.CompletedProcess(command, 0, b"<plist/>", b"")

        monkeypatch.setattr(ioreg_usb.subprocess, "run", fake_run)

        assert run_ioreg() == b"<plist/>"
        assert calls == [(IOREG_COMMAND, {"capture_output": True, "timeout": IOREG_TIMEOUT_S, "check": True})]
        assert IOREG_COMMAND == ("ioreg", "-p", "IOUSB", "-l", "-a")

    @pytest.mark.parametrize(
        "failure",
        [
            FileNotFoundError("ioreg"),
            subprocess.CalledProcessError(1, "ioreg"),
            subprocess.TimeoutExpired("ioreg", IOREG_TIMEOUT_S),
        ],
    )
    def test_a_failure_is_no_output_and_a_warning(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, failure: Exception
    ) -> None:
        def failing_run(*_arguments: Any, **_options: Any) -> None:
            raise failure

        monkeypatch.setattr(ioreg_usb.subprocess, "run", failing_run)

        with caplog.at_level(logging.WARNING, logger=LOGGER_NAME):
            assert run_ioreg() == b""

        assert "ioreg could not list USB devices" in caplog.text


class TestIoregUsbDiscovery:
    def test_enumerates_what_the_reader_returns(self) -> None:
        discovery = IoregUsbDiscovery(lambda: _fixture("intel-kusb-strings.plist"))

        assert [snapshot.topology_path for snapshot in discovery.enumerate()] == ["20-1"]

    def test_reads_ioreg_itself_by_default(self) -> None:
        assert IoregUsbDiscovery()._read_ioreg is run_ioreg
