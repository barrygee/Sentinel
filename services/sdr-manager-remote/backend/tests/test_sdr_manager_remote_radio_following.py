"""Tests for mirrored radios tracking their SDR host device, rather than going stale.

A Sentinel radio created from an SDR host's device is a *mirror*: the device
identity is the fact, and the address is a detail the host owns and reassigns.
Replug a dongle into a different USB socket and the host may hand it a different
output port — at which point the mirror points at a port nothing listens on.

Before this, that surfaced as `POST /api/sdr/connect` failing with a bare socket
error naming neither the device nor the reason. Two behaviours prevent it:

* the poller re-points radios at wherever their device now answers;
* an unavailable device is *reported* as such (the hub asks sdr-manager-remote
  for its host snapshot over the bus), so the UI can grey the radio out and a
  connection attempt explains itself.

Run with:  uv run --project backend pytest services/sdr-manager-remote/backend/tests/test_sdr_manager_remote_radio_following.py
"""

from __future__ import annotations

from typing import Any

import pytest
from sentinel_radio.radios import device_availability

from sentinel_sdr_manager_remote.services.host_poller import HostSnapshot, host_poller

HOST_ID = 1
DEVICE_ID = "serial:97710286"


def device(**overrides: Any) -> dict[str, Any]:
    return {
        "device_id": DEVICE_ID,
        "name": "ADSB",
        "present": True,
        "enabled": True,
        "visibility": "public",
        "state": "streaming",
        "output": {"iq_port": 4343, "control_port": 4345, "host": "192.168.5.67"},
        **overrides,
    }


def mirrored_radio(**overrides: Any) -> dict[str, Any]:
    return {
        "id": 1,
        "name": "ADSB",
        "host": "192.168.5.67",
        "port": 4343,
        "sentry_host_id": HOST_ID,
        "sentry_device_id": DEVICE_ID,
        **overrides,
    }


@pytest.fixture
def snapshot_with(monkeypatch: pytest.MonkeyPatch):
    """Install a host snapshot for HOST_ID, as the poller would have cached."""

    def install(*devices: dict[str, Any], reachable: bool = True) -> None:
        snapshot = HostSnapshot(host_id=HOST_ID)
        snapshot.reachable = reachable
        snapshot.status_payload = {"generated_at": 0, "sdrs": list(devices)}
        monkeypatch.setattr(host_poller, "all_snapshots", lambda: [snapshot])

    return install


class TestReportingAvailability:
    async def test_a_live_device_is_available(self, snapshot_with: Any) -> None:
        snapshot_with(device())

        available, reason = await device_availability(mirrored_radio())

        assert available is True
        assert reason == ""

    async def test_an_unplugged_dongle_says_so(self, snapshot_with: Any) -> None:
        snapshot_with(device(present=False))

        available, reason = await device_availability(mirrored_radio())

        assert available is False
        assert "unplugged" in reason

    async def test_a_disabled_device_says_so(self, snapshot_with: Any) -> None:
        snapshot_with(device(enabled=False))

        available, reason = await device_availability(mirrored_radio())

        assert available is False
        assert "disabled" in reason

    async def test_a_device_with_no_port_says_so(self, snapshot_with: Any) -> None:
        # Detected but not yet configured: there is nothing to connect to.
        snapshot_with(device(output=None))

        available, reason = await device_availability(mirrored_radio())

        assert available is False
        assert "output port" in reason

    async def test_a_replugged_device_is_reported_missing(self, snapshot_with: Any) -> None:
        # The exact case that produced the bare 503: the dongle moved USB socket,
        # so it now has a different identity and the mirror's device is gone.
        snapshot_with(device(device_id="usb:1-1.4"))

        available, reason = await device_availability(mirrored_radio())

        assert available is False
        assert "Device not found" in reason

    async def test_an_unreachable_host_is_not_mistaken_for_a_missing_device(self, snapshot_with: Any) -> None:
        # A Pi that is rebooting must not read as "your dongle is gone" — the two
        # need different actions from the operator.
        snapshot_with(device(), reachable=False)

        available, reason = await device_availability(mirrored_radio())

        assert available is False
        assert "not reachable" in reason

    async def test_a_manually_entered_radio_is_always_available(self, snapshot_with: Any) -> None:
        # No SDR host device behind it, so nothing here knows better than the
        # operator did when they typed the address.
        snapshot_with()

        available, reason = await device_availability({"id": 2, "name": "Manual", "host": "10.0.0.9", "port": 1234})

        assert available is True
        assert reason == ""

    async def test_an_unknown_host_is_unavailable_rather_than_assumed_fine(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(host_poller, "all_snapshots", lambda: [])

        available, _ = await device_availability(mirrored_radio())

        assert available is False
