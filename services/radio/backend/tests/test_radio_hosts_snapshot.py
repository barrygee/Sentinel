"""The radio hub's view of the SDR hosts (sentinel_radio/radios.py): asked of sdr-manager-remote.

The hub no longer polls SDR hosts; it requests `sdr-manager.remote.hosts.snapshot`
and greys out mirrored radios from the reply. Pinned here:
  * one request answers every listing for `HOSTS_SNAPSHOT_TTL_S`, and a
    missing service is cached too, so it costs one short wait per TTL;
  * no responder, a timeout, a failed responder or an unusable reply all
    fail open — the radio stays usable, with a reason saying the status is
    unknown — rather than greying out radios that may well work;
  * a reply the hub can read is judged per host and per device.

The bus is faked at the module's `bus` reference; the replies the real
sdr-manager-remote sends are covered in its own tests and the contract suite.

Run with:  uv run --project backend pytest services/radio/backend/tests/test_radio_hosts_snapshot.py
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from sentinel_radio import radios

HOST_ID = 3
DEVICE_ID = "serial:97710286"
MIRRORED_RADIO = {"id": 1, "sdr_manager_host_id": HOST_ID, "sdr_manager_device_id": DEVICE_ID}
LIVE_DEVICE = {"device_id": DEVICE_ID, "present": True, "enabled": True, "output": {"iq_port": 4343}}


class FakeBus:
    """Answers snapshot requests with `reply`, or raises `error`; counts and records each request."""

    def __init__(self, reply: Any = None, error: BaseException | None = None) -> None:
        self.reply = reply
        self.error = error
        self.requests: list[tuple[str, dict, float | None]] = []

    async def request(self, subject: str, payload: dict, timeout: float | None = 5.0) -> Any:
        self.requests.append((subject, payload, timeout))
        if self.error is not None:
            raise self.error
        return self.reply


def hosts_reply(*devices: Any, reachable: bool = True) -> dict[str, Any]:
    return {"ok": True, "hosts": {str(HOST_ID): {"reachable": reachable, "sdrs": list(devices)}}}


@pytest.fixture
def install_bus(monkeypatch: pytest.MonkeyPatch):
    def install(**options: Any) -> FakeBus:
        fake = FakeBus(**options)
        monkeypatch.setattr(radios, "bus", fake)
        return fake

    return install


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """The hub's monotonic clock, set by assigning `clock[0]`."""
    now = [1_000.0]
    # Swapped at the module's own reference: patching `time.monotonic` itself
    # would also stop the event loop's clock.
    monkeypatch.setattr(radios, "time", SimpleNamespace(monotonic=lambda: now[0]))
    return now


class TestTheRequest:
    async def test_asks_sdr_manager_remote_with_a_short_timeout(self, install_bus):
        fake = install_bus(reply=hosts_reply(LIVE_DEVICE))

        await radios.device_availability(MIRRORED_RADIO)

        assert fake.requests == [("sdr-manager.remote.hosts.snapshot", {}, radios.HOSTS_SNAPSHOT_TIMEOUT_S)]

    async def test_a_manually_entered_radio_asks_nothing(self, install_bus):
        fake = install_bus(reply=hosts_reply(LIVE_DEVICE))

        assert await radios.device_availability({"id": 2, "host": "10.0.0.9", "port": 1234}) == (True, "")
        assert fake.requests == []


class TestCaching:
    async def test_one_request_answers_every_listing_within_the_ttl(self, install_bus, clock):
        fake = install_bus(reply=hosts_reply(LIVE_DEVICE))

        await radios.device_availability(MIRRORED_RADIO)
        clock[0] += radios.HOSTS_SNAPSHOT_TTL_S - 0.01
        await radios.device_availability(MIRRORED_RADIO)

        assert len(fake.requests) == 1

    async def test_asks_again_once_the_ttl_has_passed(self, install_bus, clock):
        fake = install_bus(reply=hosts_reply(LIVE_DEVICE))
        await radios.device_availability(MIRRORED_RADIO)
        fake.reply = hosts_reply(dict(LIVE_DEVICE, present=False))

        clock[0] += radios.HOSTS_SNAPSHOT_TTL_S
        available, reason = await radios.device_availability(MIRRORED_RADIO)

        assert len(fake.requests) == 2
        assert (available, reason) == (False, "The dongle is unplugged.")

    async def test_a_missing_service_is_cached_too(self, install_bus, clock):
        fake = install_bus(error=TimeoutError())

        await radios.device_availability(MIRRORED_RADIO)
        await radios.device_availability(MIRRORED_RADIO)

        assert len(fake.requests) == 1

    async def test_forgetting_the_snapshot_asks_again(self, install_bus, clock):
        fake = install_bus(reply=hosts_reply(LIVE_DEVICE))
        await radios.device_availability(MIRRORED_RADIO)

        radios.forget_hosts_snapshot()
        await radios.device_availability(MIRRORED_RADIO)

        assert len(fake.requests) == 2


class TestFailingOpen:
    @pytest.mark.parametrize(
        "error",
        [
            LookupError("no responder registered for subject"),
            TimeoutError(),
            RuntimeError("the responder failed"),
        ],
        ids=["not deployed", "timed out", "responder failed"],
    )
    async def test_an_unanswered_request_leaves_the_radio_usable(self, install_bus, error):
        install_bus(error=error)

        assert await radios.device_availability(MIRRORED_RADIO) == (True, radios.UNKNOWN_AVAILABILITY_REASON)

    @pytest.mark.parametrize(
        "reply",
        [
            None,
            "hosts",
            {"ok": False, "reason": "internal"},
            {"ok": True},
            {"ok": True, "hosts": [["3", {"reachable": True}]]},
        ],
        ids=["no reply", "not a dict", "not ok", "no hosts", "hosts not a dict"],
    )
    async def test_an_unusable_reply_leaves_the_radio_usable(self, install_bus, reply):
        install_bus(reply=reply)

        assert await radios.device_availability(MIRRORED_RADIO) == (True, radios.UNKNOWN_AVAILABILITY_REASON)

    async def test_any_other_error_is_not_swallowed(self, install_bus):
        # Only the bus's own failures mean "unknown"; a bug must still surface.
        install_bus(error=ValueError("a bug"))

        with pytest.raises(ValueError, match="a bug"):
            await radios.device_availability(MIRRORED_RADIO)


class TestJudgingTheReply:
    async def test_a_host_missing_from_the_reply_is_not_reachable(self, install_bus):
        # Only enabled hosts are polled, so a disabled host is simply absent.
        install_bus(reply={"ok": True, "hosts": {}})

        assert await radios.device_availability(MIRRORED_RADIO) == (False, "Its SDR host is not reachable.")

    async def test_a_malformed_host_entry_is_not_reachable(self, install_bus):
        install_bus(reply={"ok": True, "hosts": {str(HOST_ID): "up"}})

        assert await radios.device_availability(MIRRORED_RADIO) == (False, "Its SDR host is not reachable.")

    async def test_an_unreachable_host(self, install_bus):
        install_bus(reply=hosts_reply(LIVE_DEVICE, reachable=False))

        assert await radios.device_availability(MIRRORED_RADIO) == (False, "Its SDR host is not reachable.")

    async def test_a_live_device_among_malformed_entries_is_found(self, install_bus):
        install_bus(reply=hosts_reply("garbage", None, {"device_id": "usb:1-1.4"}, LIVE_DEVICE))

        assert await radios.device_availability(MIRRORED_RADIO) == (True, "")

    async def test_a_host_with_no_device_list_has_lost_the_device(self, install_bus):
        install_bus(reply={"ok": True, "hosts": {str(HOST_ID): {"reachable": True, "sdrs": None}}})

        assert await radios.device_availability(MIRRORED_RADIO) == (False, "Device not found.")

    async def test_the_host_id_is_matched_as_a_string_key(self, install_bus):
        # The reply crosses NATS as JSON, where object keys are always strings.
        install_bus(reply={"ok": True, "hosts": {HOST_ID: {"reachable": True, "sdrs": [LIVE_DEVICE]}}})

        assert await radios.device_availability(MIRRORED_RADIO) == (False, "Its SDR host is not reachable.")
