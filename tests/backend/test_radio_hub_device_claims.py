"""
tests/backend/test_radio_hub_device_claims.py

"The ADS-B claim wins a shared dongle" — backend/radio_hub/services/device_claims.py
and the three places that honour it:

  * radio connections (sdr.RtlTcpConnection) refuse to retune a claimed dongle
    with the existing ReadOnlyTuningError, and on (re)connect follow its tuning
    instead of asserting their own defaults — the 2.048 MS/s that silently broke
    ADS-B decode;
  * channel-owning decode bridges (AIS, APRS, manifest kinds) pause their retunes
    while it is claimed and resume once it is not;
  * the reservation proxy records the claim with Sentry's expiry and takes
    Sentinel's own connection off the tuning token *before* the claim's retune.
"""

from __future__ import annotations

import asyncio
import logging
import time
from types import SimpleNamespace

import pytest

from backend.platform.bus import bus
from backend.radio_hub.services import device_claims, sentry_reservations
from backend.radio_hub.services import sdr as sdr_svc
from backend.radio_hub.services.sdr_decode import AisDecodeBridge, AprsDecodeBridge

HOST, PORT = "192.168.5.67", 4444
FAR_FUTURE_MS = 10**15


@pytest.fixture(autouse=True)
def _no_claims():
    device_claims.clear()
    yield
    device_claims.clear()


# ── the registry ─────────────────────────────────────────────────────────────


class TestRegistry:
    def test_unclaimed_by_default(self):
        assert device_claims.is_claimed(HOST, PORT) is False

    def test_claimed_until_it_expires(self):
        device_claims.mark_claimed(HOST, PORT, 2_000)
        assert device_claims.is_claimed(HOST, PORT, now_ms=1_999) is True
        assert device_claims.is_claimed(HOST, PORT, now_ms=2_000) is False
        assert device_claims._claims == {}  # the lapsed claim is dropped

    def test_uses_the_wall_clock_by_default(self):
        device_claims.mark_claimed(HOST, PORT, int(time.time() * 1000) + 60_000)
        assert device_claims.is_claimed(HOST, PORT) is True
        device_claims.mark_claimed(HOST, PORT, int(time.time() * 1000) - 1)
        assert device_claims.is_claimed(HOST, PORT) is False

    def test_a_renewal_extends_the_claim(self):
        device_claims.mark_claimed(HOST, PORT, 2_000)
        device_claims.mark_claimed(HOST, PORT, 5_000)
        assert device_claims.is_claimed(HOST, PORT, now_ms=4_000) is True

    def test_release_and_port_type_are_interchangeable(self):
        device_claims.mark_claimed(HOST, "4444", FAR_FUTURE_MS)
        assert device_claims.is_claimed(HOST, 4444) is True
        assert device_claims.is_claimed(HOST, 4445) is False
        device_claims.mark_released(HOST, 4444)
        assert device_claims.is_claimed(HOST, "4444") is False
        device_claims.mark_released(HOST, 4444)  # releasing twice is harmless


# ── radio connections ────────────────────────────────────────────────────────


class _FakeControl:
    """The slice of RelayControlClient a connection drives."""

    def __init__(self, *, owner: bool = False) -> None:
        self.available = True
        self.is_owner = owner
        self.claims = 0
        self.releases = 0
        self.sets: list[dict] = []
        self.center_hz = 1_090_000_000
        self.sample_rate = 2_400_000
        self.gain_db = 49.6
        self.gain_auto = False
        self.offset_hz = self.bw_hz = 0
        self.mode = ""
        self.scan_active = self.search_active = False
        self.scan_groups: list[str] = []
        self.search_low_hz = self.search_high_hz = self.search_current_hz = None

    async def connect(self) -> bool:
        return True

    async def claim(self) -> bool:
        self.claims += 1
        self.is_owner = True
        return True

    async def release(self) -> None:
        self.releases += 1
        self.is_owner = False

    async def set(self, **fields) -> None:
        self.sets.append(fields)


class _FakeWriter:
    def __init__(self) -> None:
        self.sent = bytearray()

    def get_extra_info(self, _name):
        return None

    def write(self, data: bytes) -> None:
        self.sent += data

    async def drain(self) -> None:
        pass


def _relay_connection(*, owner: bool = False) -> sdr_svc.RtlTcpConnection:
    connection = sdr_svc.RtlTcpConnection(host=HOST, port=PORT)
    connection.control = _FakeControl(owner=owner)
    connection.control_available = True
    connection.is_owner = owner
    return connection


def _raw_connection() -> sdr_svc.RtlTcpConnection:
    connection = sdr_svc.RtlTcpConnection(host=HOST, port=PORT)
    connection.connected = True
    connection.writer = _FakeWriter()  # type: ignore[assignment]
    return connection


SETTERS = [
    ("set_frequency", 145_500_000),
    ("set_sample_rate", 2_048_000),
    ("set_gain_manual", 30.0),
    ("set_gain_auto", None),
]


async def _call(connection, setter, value):
    method = getattr(connection, setter)
    return await (method() if value is None else method(value))


class TestRadioConnectionsRespectTheClaim:
    @pytest.mark.parametrize("setter, value", SETTERS)
    async def test_relay_setters_are_refused_without_touching_the_relay(
        self, setter, value
    ):
        device_claims.mark_claimed(HOST, PORT, FAR_FUTURE_MS)
        connection = _relay_connection()
        with pytest.raises(sdr_svc.ReadOnlyTuningError, match="claimed for ADS-B"):
            await _call(connection, setter, value)
        assert connection.control.claims == 0 and connection.control.sets == []

    @pytest.mark.parametrize("setter, value", SETTERS)
    async def test_raw_rtl_tcp_setters_are_refused_without_sending(self, setter, value):
        device_claims.mark_claimed(HOST, PORT, FAR_FUTURE_MS)
        connection = _raw_connection()
        with pytest.raises(sdr_svc.ReadOnlyTuningError):
            await _call(connection, setter, value)
        assert connection.writer.sent == bytearray()

    @pytest.mark.parametrize("setter, value", SETTERS)
    async def test_an_unclaimed_dongle_tunes_as_before(self, setter, value):
        connection = _relay_connection()
        await _call(connection, setter, value)
        assert connection.control.sets
        raw = _raw_connection()
        await _call(raw, setter, value)
        assert raw.writer.sent

    async def test_a_claim_on_another_dongle_does_not_block_this_one(self):
        device_claims.mark_claimed(HOST, 6655, FAR_FUTURE_MS)
        connection = _relay_connection()
        await connection.set_sample_rate(2_048_000)
        assert connection.control.sets == [{"sample_rate": 2_048_000}]


class TestConnectingToAClaimedDongle:
    async def test_first_connect_follows_instead_of_asserting_defaults(
        self, monkeypatch
    ):
        device_claims.mark_claimed(HOST, PORT, FAR_FUTURE_MS)
        control = _FakeControl()
        monkeypatch.setattr(
            sdr_svc, "RelayControlClient", lambda host, port, on_state=None: control
        )
        connection = sdr_svc.RtlTcpConnection(host=HOST, port=PORT)
        await connection._ensure_control()
        assert control.claims == 0 and control.sets == []
        assert connection.is_owner is False
        assert (connection.center_hz, connection.sample_rate) == (
            1_090_000_000,
            2_400_000,
        )  # adopted

    async def test_first_connect_to_an_unclaimed_dongle_still_asserts_defaults(
        self, monkeypatch
    ):
        control = _FakeControl()
        monkeypatch.setattr(
            sdr_svc, "RelayControlClient", lambda host, port, on_state=None: control
        )
        connection = sdr_svc.RtlTcpConnection(host=HOST, port=PORT)
        await connection._ensure_control()
        assert control.claims == 1
        assert control.sets == [
            {"sample_rate": connection.sample_rate, "center_hz": connection.center_hz}
        ]

    async def test_a_reconnect_hands_the_token_back(self):
        device_claims.mark_claimed(HOST, PORT, FAR_FUTURE_MS)
        connection = _relay_connection(owner=True)
        notified = []
        connection.state_change_callback = lambda: notified.append(True)
        await connection._ensure_control()
        assert connection.control.releases == 1 and connection.control.claims == 0
        assert connection.is_owner is False and notified == [True]

    async def test_a_reconnect_as_follower_does_not_release_what_it_does_not_hold(self):
        device_claims.mark_claimed(HOST, PORT, FAR_FUTURE_MS)
        connection = _relay_connection(owner=False)
        await connection._ensure_control()
        assert connection.control.releases == 0 and connection.control.claims == 0

    async def test_raw_rtl_tcp_connect_skips_its_default_tuning_when_claimed(
        self, monkeypatch
    ):
        writer = _FakeWriter()

        class _Reader:
            async def read(self, size: int) -> bytes:
                return b"RTL0" + bytes(8)

        async def _open(host, port):
            return _Reader(), writer

        monkeypatch.setattr(sdr_svc.asyncio, "open_connection", _open)
        monkeypatch.setattr(
            sdr_svc.RtlTcpConnection,
            "_ensure_control",
            lambda self: _set_unavailable(self),
            raising=True,
        )
        device_claims.mark_claimed(HOST, PORT, FAR_FUTURE_MS)
        connection = sdr_svc.RtlTcpConnection(host=HOST, port=PORT)
        await connection.connect()
        assert connection.connected and writer.sent == bytearray()

        device_claims.clear()
        unclaimed = sdr_svc.RtlTcpConnection(host=HOST, port=PORT)
        writer.sent.clear()
        await unclaimed.connect()
        assert writer.sent[:1] == b"\x02"  # sample rate pushed first, as before


async def _set_unavailable(connection) -> None:
    connection.control_available = False


class TestYieldToClaim:
    async def test_releases_the_token_and_tells_watchers(self, monkeypatch):
        connection = _relay_connection(owner=True)
        notified = []
        connection.state_change_callback = lambda: notified.append(True)
        monkeypatch.setitem(sdr_svc._connections, f"{HOST}:{PORT}", connection)
        await sdr_svc.yield_to_claim(HOST, PORT)
        assert connection.control.releases == 1 and connection.is_owner is False
        assert notified == [True]

    async def test_without_a_watcher_callback(self, monkeypatch):
        connection = _relay_connection(owner=True)
        monkeypatch.setitem(sdr_svc._connections, f"{HOST}:{PORT}", connection)
        await sdr_svc.yield_to_claim(HOST, PORT)
        assert connection.is_owner is False

    async def test_no_connection_is_a_no_op(self):
        await sdr_svc.yield_to_claim(HOST, 9999)


# ── channel-owning bridges ───────────────────────────────────────────────────


class _Connection:
    def __init__(self, center_hz: int) -> None:
        self.host, self.port = HOST, PORT
        self.center_hz = center_hz
        self.sample_rate = 1_024_000
        self.tuned: list[int] = []

    async def set_frequency(self, frequency_hz: int) -> None:
        self.tuned.append(frequency_hz)
        self.center_hz = frequency_hz


class _Broadcaster:
    def __init__(self, center_hz: int = 1_090_000_000) -> None:
        self.connection = _Connection(center_hz)

    def subscribe_iq(self) -> asyncio.Queue:
        return asyncio.Queue()

    def unsubscribe_iq(self, queue) -> None:
        pass


class TestBridgesPauseWhileClaimed:
    @pytest.mark.parametrize("bridge_class", [AisDecodeBridge, AprsDecodeBridge])
    async def test_start_leaves_a_claimed_dongle_on_1090(self, bridge_class, caplog):
        device_claims.mark_claimed(HOST, PORT, FAR_FUTURE_MS)
        broadcaster = _Broadcaster()
        bridge = bridge_class(broadcaster, pcm_port=0)
        with caplog.at_level(logging.INFO):
            await bridge.start()
            await bridge._tune_to_channel()  # a later throttled attempt, still claimed
        try:
            assert broadcaster.connection.tuned == []
            assert (
                caplog.text.count("decode paused: the radio is claimed for ADS-B") == 1
            )  # logged once
        finally:
            await bridge.stop()

    async def test_resumes_once_the_claim_ends(self, caplog):
        device_claims.mark_claimed(HOST, PORT, FAR_FUTURE_MS)
        broadcaster = _Broadcaster()
        bridge = AisDecodeBridge(broadcaster, pcm_port=0)
        await bridge.start()
        device_claims.mark_released(HOST, PORT)
        with caplog.at_level(logging.INFO):
            await bridge._tune_to_channel()
            await bridge._tune_to_channel()
        try:
            assert broadcaster.connection.tuned == [162_000_000]
            assert caplog.text.count("decode resuming: the ADS-B claim has ended") == 1
        finally:
            await bridge.stop()

    async def test_an_unclaimed_dongle_is_tuned_as_before(self):
        broadcaster = _Broadcaster()
        bridge = AisDecodeBridge(broadcaster, pcm_port=0)
        await bridge.start()
        try:
            assert broadcaster.connection.tuned == [162_000_000]
        finally:
            await bridge.stop()


# ── the reservation proxy ────────────────────────────────────────────────────


@pytest.fixture()
def proxy(monkeypatch):
    """The proxy with Sentry, the instance id and the fleet snapshot faked."""
    order: list[str] = []
    state = SimpleNamespace(
        order=order,
        reservation={"expires_at": 123_456_789},
        snapshot_sdrs=[
            {"device_id": "usb:1-1.1", "output": {"host": HOST, "iq_port": PORT}},
        ],
    )

    class _Client:
        async def acquire_reservation(self, device_id, **kwargs):
            order.append("acquire")
            return SimpleNamespace(data=state.reservation)

        async def patch_device(self, device_id, patch, holder=None):
            order.append(
                f"patch claimed={device_claims.is_claimed(HOST, PORT, now_ms=0)}"
            )

        async def release_reservation(self, device_id, holder=None):
            order.append("release")

    async def _client_for_host(db, host_id, *, require_enabled):
        return _Client()

    async def _instance_id(db):
        return "sentinel:test"

    async def _yield(host, port):
        order.append(f"yield {host}:{port}")

    monkeypatch.setattr(sentry_reservations, "_client_for_host", _client_for_host)
    monkeypatch.setattr(sentry_reservations, "get_instance_id", _instance_id)
    monkeypatch.setattr(sentry_reservations.sdr_svc, "yield_to_claim", _yield)
    monkeypatch.setattr(
        sentry_reservations.fleet_poller,
        "get_snapshot",
        lambda host_id: (
            SimpleNamespace(status_payload={"sdrs": state.snapshot_sdrs})
            if host_id == 1
            else None
        ),
    )
    return state


def _acquire(**overrides):
    payload = {
        "db": None,
        "host_id": 1,
        "device_id": "usb:1-1.1",
        "label": "AIR",
        "ttl_seconds": 120,
        "patch": {"center_hz": 1_090_000_000, "sample_rate": 2_400_000},
    }
    payload.update(overrides)
    return bus.request(sentry_reservations.ACQUIRE_SUBJECT, payload, timeout=None)


class TestReservationProxyRecordsTheClaim:
    async def test_claims_and_yields_before_the_retune_goes_out(self, proxy):
        assert (await _acquire())["ok"] is True
        assert proxy.order == ["acquire", f"yield {HOST}:{PORT}", "patch claimed=True"]
        assert device_claims._claims == {
            f"{HOST}:{PORT}": 123_456_789
        }  # Sentry's expiry

    async def test_finds_the_claimed_device_among_others_on_the_host(self, proxy):
        proxy.snapshot_sdrs = [
            {"device_id": "serial:97710286", "output": {"host": HOST, "iq_port": 6655}},
            {"device_id": "usb:1-1.1", "output": {"host": HOST, "iq_port": PORT}},
        ]
        await _acquire()
        assert list(device_claims._claims) == [
            f"{HOST}:{PORT}"
        ]  # not the HF dongle on 6655

    async def test_falls_back_to_the_ttl_when_sentry_gives_no_expiry(self, proxy):
        proxy.reservation = {}
        before = int(time.time() * 1000)
        await _acquire(ttl_seconds=120)
        expires_at = device_claims._claims[f"{HOST}:{PORT}"]
        assert before + 120_000 <= expires_at <= int(time.time() * 1000) + 120_000

    @pytest.mark.parametrize(
        "sdrs",
        [
            [],  # device not in the snapshot
            [{"device_id": "usb:1-1.1", "output": {"host": None, "iq_port": 4444}}],
            [{"device_id": "usb:1-1.1", "output": {"host": HOST, "iq_port": None}}],
            [{"device_id": "usb:1-1.1"}],  # no output at all
        ],
    )
    async def test_an_unknown_address_still_claims_but_records_nothing(
        self, proxy, sdrs
    ):
        proxy.snapshot_sdrs = sdrs
        assert (await _acquire())["ok"] is True
        assert device_claims._claims == {}
        assert proxy.order == ["acquire", "patch claimed=False"]

    async def test_a_host_the_poller_has_not_seen_records_nothing(self, proxy):
        assert (await _acquire(host_id=2))["ok"] is True
        assert device_claims._claims == {}

    async def test_release_forgets_the_claim(self, proxy):
        await _acquire()
        reply = await bus.request(
            sentry_reservations.RELEASE_SUBJECT,
            {"db": None, "host_id": 1, "device_id": "usb:1-1.1"},
        )
        assert reply == {"ok": True}
        assert device_claims._claims == {}

    async def test_release_of_an_unknown_address_still_releases_on_sentry(self, proxy):
        proxy.snapshot_sdrs = []
        reply = await bus.request(
            sentry_reservations.RELEASE_SUBJECT,
            {"db": None, "host_id": 1, "device_id": "usb:1-1.1"},
        )
        assert reply == {"ok": True} and proxy.order == ["release"]
