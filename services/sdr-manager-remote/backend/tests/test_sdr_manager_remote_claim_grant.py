"""sdr-manager-remote telling the radio hub about claims, and answering its snapshot request.

`sentinel_sdr_manager_remote/services/reservations.py`:
  * `sdr-manager.claims.granted` is a request: the claim's retune waits for
    the hub's acknowledgement, so the hub has let go of the tuning first.
    Without one — no hub deployed, the hub too slow, its handler failing, or
    a refusal — the retune still goes ahead and the miss is logged: there is
    then no hub connection to fight it, and Air's claim must not fail because
    the hub is down;
  * `sdr-manager.claims.released` is a plain event, published before the
    host is asked to release;
  * `sdr-manager.remote.hosts.snapshot` answers the hub from the poller's
    memory, keyed by string host id.

The hub's own handling of the grant is in
services/radio/backend/tests/test_radio_claim_events.py; the order on a
working hub is pinned in test_radio_device_claims.py.

Run with:  uv run --project backend pytest services/sdr-manager-remote/backend/tests/test_sdr_manager_remote_claim_grant.py
"""

from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any

import pytest
from backend.platform.bus import bus

from sentinel_sdr_manager_remote.services import reservations
from sentinel_sdr_manager_remote.services.host_poller import HostSnapshot, host_poller

HOST, PORT = "192.168.5.67", 4444
HOST_ID = 1
DEVICE_ID = "usb:1-1.1"
EXPIRES_AT_MS = 123_456_789


class HubBus:
    """The bus as the proxy sees it: the hub's answer to a grant is scripted, everything else is recorded."""

    def __init__(self, order: list[str], *, reply: Any = None, error: BaseException | None = None) -> None:
        self.order = order
        self.reply = {"ok": True} if reply is None and error is None else reply
        self.error = error
        self.requests: list[tuple[str, dict, float | None]] = []
        self.published: list[tuple[str, dict]] = []

    async def request(self, subject: str, payload: dict, timeout: float | None = 5.0) -> Any:
        self.requests.append((subject, payload, timeout))
        self.order.append("granted")
        if self.error is not None:
            raise self.error
        return self.reply

    async def publish(self, subject: str, payload: dict) -> None:
        self.published.append((subject, payload))
        self.order.append("released")


@pytest.fixture
def proxy(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """The proxy with its SDR host, instance id and poller snapshot faked; records the order of events."""
    state = SimpleNamespace(order=[], reservation={"expires_at": EXPIRES_AT_MS})

    class Client:
        async def acquire_reservation(self, device_id: str, **options: Any) -> SimpleNamespace:
            state.order.append("acquire")
            return SimpleNamespace(data=state.reservation)

        async def patch_device(self, device_id: str, changes: dict, holder: str | None = None) -> None:
            state.order.append("retune")

        async def release_reservation(self, device_id: str, holder: str | None = None) -> None:
            state.order.append("release")

    async def client_for_host(db: Any, host_id: int, *, require_enabled: bool) -> Client:
        return Client()

    async def instance_id(db: Any) -> str:
        return "sentinel:test"

    snapshot = SimpleNamespace(
        status_payload={"sdrs": [{"device_id": DEVICE_ID, "output": {"host": HOST, "iq_port": PORT}}]}
    )
    monkeypatch.setattr(reservations, "_client_for_host", client_for_host)
    monkeypatch.setattr(reservations, "get_instance_id", instance_id)
    monkeypatch.setattr(host_poller, "get_snapshot", lambda host_id: snapshot if host_id == HOST_ID else None)

    def hub(**options: Any) -> HubBus:
        fake = HubBus(state.order, **options)
        monkeypatch.setattr(reservations, "bus", fake)
        return fake

    state.hub = hub
    return state


def acquire_payload(**overrides: Any) -> dict[str, Any]:
    return {
        "db": None,
        "host_id": HOST_ID,
        "device_id": DEVICE_ID,
        "label": "AIR",
        "ttl_seconds": 120,
        "patch": {"center_hz": 1_090_000_000},
        **overrides,
    }


class TestTheGrantRequest:
    async def test_asks_the_hub_with_the_address_and_expiry_then_retunes(self, proxy):
        hub = proxy.hub()

        reply = await reservations._on_acquire(acquire_payload())

        assert reply == {"ok": True, "reservation": {"expires_at": EXPIRES_AT_MS}}
        assert hub.requests == [
            (
                "sdr-manager.claims.granted",
                {"host": HOST, "port": PORT, "expires_at": EXPIRES_AT_MS},
                reservations.CLAIM_GRANTED_TIMEOUT_S,
            )
        ]
        assert proxy.order == ["acquire", "granted", "retune"]

    async def test_a_claim_with_nothing_to_retune_still_tells_the_hub(self, proxy):
        proxy.hub()

        await reservations._on_acquire(acquire_payload(patch=None))

        assert proxy.order == ["acquire", "granted"]

    async def test_an_acknowledged_grant_logs_nothing(self, proxy, caplog):
        proxy.hub()

        with caplog.at_level(logging.WARNING, logger=reservations.__name__):
            await reservations._on_acquire(acquire_payload())

        assert caplog.records == []

    @pytest.mark.parametrize(
        "error",
        [
            LookupError("no responder registered for subject 'sdr-manager.claims.granted'"),
            TimeoutError(),
            RuntimeError("the hub's handler failed"),
        ],
        ids=["no hub", "hub too slow", "hub handler failed"],
    )
    async def test_an_unanswered_grant_still_retunes_and_is_logged(self, proxy, caplog, error):
        proxy.hub(error=error)

        with caplog.at_level(logging.WARNING, logger=reservations.__name__):
            reply = await reservations._on_acquire(acquire_payload())

        assert reply["ok"] is True
        assert proxy.order == ["acquire", "granted", "retune"]
        assert f"The radio hub did not acknowledge the claim on {HOST}:{PORT}" in caplog.text

    @pytest.mark.parametrize(
        "hub_reply",
        [{"ok": False, "reason": "bad_claim"}, {}, None, "ok"],
        ids=["refused", "empty", "nothing", "not a dict"],
    )
    async def test_a_refused_grant_still_retunes_and_is_logged(self, proxy, caplog, hub_reply):
        hub = proxy.hub()
        hub.reply = hub_reply

        with caplog.at_level(logging.WARNING, logger=reservations.__name__):
            reply = await reservations._on_acquire(acquire_payload())

        assert reply["ok"] is True
        assert proxy.order == ["acquire", "granted", "retune"]
        assert f"The radio hub refused the claim on {HOST}:{PORT}" in caplog.text

    async def test_any_other_error_is_not_swallowed(self, proxy):
        # Only the bus's own failures mean "no hub"; a bug must still surface.
        proxy.hub(error=ValueError("a bug"))

        with pytest.raises(ValueError, match="a bug"):
            await reservations._on_acquire(acquire_payload())
        assert "retune" not in proxy.order

    async def test_a_failed_claim_tells_the_hub_nothing(self, proxy, monkeypatch):
        hub = proxy.hub()

        async def refusing_client(db: Any, host_id: int, *, require_enabled: bool) -> Any:
            raise reservations._HostUnavailable({"ok": False, "reason": "unknown_host"})

        monkeypatch.setattr(reservations, "_client_for_host", refusing_client)

        assert await reservations._on_acquire(acquire_payload()) == {"ok": False, "reason": "unknown_host"}
        assert hub.requests == []


class TestTheGrantOverTheRealBus:
    async def test_with_the_hub_in_process_the_retune_follows_its_reply(self, proxy, monkeypatch):
        # No fake bus: the hub's real responder (sentinel_radio.services.claim_events) answers.
        from sentinel_radio.services import claim_events, device_claims

        async def recorded_yield(host: str, port: int) -> None:
            proxy.order.append("hub yielded")

        monkeypatch.setattr(claim_events.sdr_svc, "yield_to_claim", recorded_yield)
        device_claims.clear()
        try:
            await bus.request(reservations.ACQUIRE_SUBJECT, acquire_payload(), timeout=None)
            assert proxy.order == ["acquire", "hub yielded", "retune"]
            assert device_claims._claims == {f"{HOST}:{PORT}": EXPIRES_AT_MS}
        finally:
            device_claims.clear()


class TestTheReleaseEvent:
    async def test_published_before_the_host_is_asked_to_release(self, proxy):
        hub = proxy.hub()

        reply = await reservations._on_release({"db": None, "host_id": HOST_ID, "device_id": DEVICE_ID})

        assert reply == {"ok": True}
        assert hub.published == [("sdr-manager.claims.released", {"host": HOST, "port": PORT})]
        assert proxy.order == ["released", "release"]


class TestTheHostsSnapshot:
    @pytest.fixture
    def snapshots(self, monkeypatch: pytest.MonkeyPatch) -> dict[int, HostSnapshot]:
        cached: dict[int, HostSnapshot] = {}
        monkeypatch.setattr(host_poller, "_snapshots", cached)
        return cached

    async def test_every_polled_host_keyed_by_string_id(self, snapshots):
        live = HostSnapshot(host_id=1, reachable=True, status_payload={"sdrs": [{"device_id": DEVICE_ID}]})
        down = HostSnapshot(host_id=2, reachable=False, status_payload={"sdrs": [{"device_id": "stale"}]})
        snapshots.update({1: live, 2: down})

        reply = await bus.request(reservations.HOSTS_SNAPSHOT_SUBJECT, {})

        assert reply == {
            "ok": True,
            "hosts": {
                "1": {"reachable": True, "sdrs": [{"device_id": DEVICE_ID}]},
                # An unreachable host's last device list is stale, so none is sent.
                "2": {"reachable": False, "sdrs": []},
            },
        }

    async def test_a_host_not_yet_polled_has_no_devices(self, snapshots):
        snapshots[5] = HostSnapshot(host_id=5)

        reply = await bus.request(reservations.HOSTS_SNAPSHOT_SUBJECT, {})

        assert reply == {"ok": True, "hosts": {"5": {"reachable": False, "sdrs": []}}}

    async def test_a_reachable_host_without_a_payload_has_no_devices(self, snapshots):
        snapshots[6] = HostSnapshot(host_id=6, reachable=True, status_payload=None)

        reply = await bus.request(reservations.HOSTS_SNAPSHOT_SUBJECT, {})

        assert reply == {"ok": True, "hosts": {"6": {"reachable": True, "sdrs": []}}}

    async def test_no_hosts(self, snapshots):
        assert await bus.request(reservations.HOSTS_SNAPSHOT_SUBJECT, {}) == {"ok": True, "hosts": {}}
