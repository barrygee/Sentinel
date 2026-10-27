"""`UsbDiscovery` for a Mac: the USB devices `ioreg -p IOUSB -l -a` lists (ADR 0007).

`ioreg -a` prints the IOUSB plane as a property list, so it is parsed with
`plistlib`, never by scraping text. Each USB device in the tree carries
`idVendor`, `idProduct`, `locationID`, `USB Address` and its string
descriptors; the host controllers above them carry no vendor id and are skipped.

`locationID` is where a device is plugged in: its top byte is the controller
and each following nibble a port, down the hub tree until a zero nibble
(`0x20140000` = controller 0x20, port 1, then port 4). It is rendered as
`32-1.4`, the same `<bus>-<port>.<port>` shape sysfs uses on Linux, so it is
the tier-2 identity just as the sysfs path is. Unlike Linux, a dongle moved
to another USB port gets a new one.
"""

from __future__ import annotations

import logging
import plistlib
import subprocess
from collections.abc import Callable, Iterator
from typing import Any
from xml.parsers.expat import ExpatError

from sentinel_sdr_manager_local.interfaces.types import UsbDeviceSnapshot

_logger = logging.getLogger(__name__)

IOREG_COMMAND = ("ioreg", "-p", "IOUSB", "-l", "-a")
IOREG_TIMEOUT_S = 5.0
_PORT_NIBBLES = 6
"""A 32-bit `locationID` holds the controller byte and then six 4-bit ports."""


def run_ioreg() -> bytes:
    """Run `ioreg` and return its property-list output, or `b""` when it can't run."""
    try:
        completed = subprocess.run(IOREG_COMMAND, capture_output=True, timeout=IOREG_TIMEOUT_S, check=True)
    except (OSError, subprocess.SubprocessError) as error:
        _logger.warning("ioreg could not list USB devices: %s", error)
        return b""
    return completed.stdout


def topology_from_location_id(location_id: int) -> tuple[int, tuple[int, ...]] | None:
    """Split a `locationID` into its controller number and port chain, or `None` with no port.

    `0x20140000` → `(32, (1, 4))`. A controller itself (`0x20000000`) has no
    port and is not a device.
    """
    if location_id < 0 or location_id > 0xFFFFFFFF:
        return None
    controller = location_id >> 24
    ports: list[int] = []
    for nibble_index in range(_PORT_NIBBLES):
        port = (location_id >> (20 - 4 * nibble_index)) & 0xF
        if port == 0:
            break
        ports.append(port)
    if not ports:
        return None
    return controller, tuple(ports)


def _walk(entry: dict[str, Any]) -> Iterator[dict[str, Any]]:
    yield entry
    for child in entry.get("IORegistryEntryChildren", []):
        if isinstance(child, dict):
            yield from _walk(child)


def _string(entry: dict[str, Any], *keys: str) -> str | None:
    """The first non-blank string under any of `keys` (macOS names each descriptor twice)."""
    for key in keys:
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _integer(entry: dict[str, Any], key: str) -> int | None:
    value = entry.get(key)
    # bool is an int subclass; a plist <true/> is never an id.
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _snapshot(entry: dict[str, Any]) -> UsbDeviceSnapshot | None:
    vendor_id = _integer(entry, "idVendor")
    product_id = _integer(entry, "idProduct")
    location_id = _integer(entry, "locationID")
    if vendor_id is None or product_id is None or location_id is None:
        return None
    topology = topology_from_location_id(location_id)
    if topology is None:
        return None
    controller, port_chain = topology
    return UsbDeviceSnapshot(
        topology_path=f"{controller}-{'.'.join(str(port) for port in port_chain)}",
        bus_number=controller,
        port_chain=port_chain,
        device_address=_integer(entry, "USB Address") or 0,
        vendor_id=f"{vendor_id:04x}",
        product_id=f"{product_id:04x}",
        serial=_string(entry, "USB Serial Number", "kUSBSerialNumberString"),
        manufacturer=_string(entry, "USB Vendor Name", "kUSBVendorString"),
        product=_string(entry, "USB Product Name", "kUSBProductString"),
        # macOS binds no kernel driver to an RTL-SDR, so there is never a DVB conflict.
        driver=None,
        sysfs_path=f"ioreg:locationID=0x{location_id:08x}",
    )


def parse_ioreg_usb(plist_output: bytes) -> list[UsbDeviceSnapshot]:
    """Every USB device in `ioreg -p IOUSB -l -a` output; empty for output that isn't a plist.

    `ioreg -a` prints one property list for the root, or an array of them on
    some versions; both are walked. Devices are ordered by topology path, like
    the sysfs adapter's.
    """
    if not plist_output.strip():
        return []
    try:
        parsed = plistlib.loads(plist_output)
    # A truncated XML plist (ioreg killed at its timeout) fails in the XML
    # parser, not as an invalid plist.
    except (plistlib.InvalidFileException, ValueError, ExpatError) as error:
        _logger.warning("ioreg printed something that isn't a property list: %s", error)
        return []
    roots = parsed if isinstance(parsed, list) else [parsed]
    snapshots = [
        snapshot
        for root in roots
        if isinstance(root, dict)
        for entry in _walk(root)
        if (snapshot := _snapshot(entry)) is not None
    ]
    return sorted(snapshots, key=lambda snapshot: snapshot.topology_path)


class IoregUsbDiscovery:
    """`UsbDiscovery` from `ioreg`; `read_ioreg` is injected so tests feed it fixture plists."""

    def __init__(self, read_ioreg: Callable[[], bytes] = run_ioreg) -> None:
        self._read_ioreg = read_ioreg

    def enumerate(self) -> list[UsbDeviceSnapshot]:
        """Every USB device plugged into this Mac right now (an empty list when `ioreg` fails)."""
        return parse_ioreg_usb(self._read_ioreg())
