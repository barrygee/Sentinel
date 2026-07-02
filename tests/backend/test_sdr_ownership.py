"""Tests for the SDR tuning-ownership coordination in backend.services.sdr and
backend.routers.sdr.

Two Sentinel backends sharing one dongle through the fan-out relay coordinate a
single tuning owner over the relay's NDJSON control channel; the others are
read-only followers. Covered here:

  * RelayControlClient — claim/follow/set/close against an in-memory fake relay.
  * RtlTcpConnection — routing tuning through the control channel (claim-if-free,
    read-only, fallback to direct rtl_tcp), the tuner_locked property, and the
    connect-time control handshake.
  * connection_status ownership fields and the broadcaster's control frame.
  * The WebSocket status/control frames and the follower connect path.
"""

from __future__ import annotations

import asyncio
import contextlib
import json

import pytest

from backend.config import settings
from backend.routers import sdr as sdr_router
from backend.services import sdr as sdr_svc


async def _wait_until(predicate, timeout: float = 1.0) -> None:
    """Poll predicate() until true or the timeout elapses (for async state pushes)."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("condition not met within timeout")


# ── In-memory fake relay control server ───────────────────────────────────────


class FakeRelayServer:
    """Minimal NDJSON control-channel server standing in for the real relay.

    ``grant`` decides whether a claim succeeds (the token is free) or is refused
    (another instance owns it). Records every op received so the client's outbound
    protocol can be asserted, and echoes ``state`` after each op.
    """

    def __init__(self, *, grant: bool = True) -> None:
        self.grant = grant
        self.state = {
            "center_hz": 88_000_000,
            "sample_rate": 1_024_000,
            "gain_db": 12.0,
            "gain_auto": False,
        }
        self.received: list[dict] = []
        self.owner = False
        self.locked = not grant  # if the claim would be refused, someone else owns it
        self._server: asyncio.AbstractServer | None = None
        self.port = 0
        self.swallow_claim = False  # for the claim-timeout test: never answer a claim
        self._handlers: set[asyncio.Task] = set()

    async def start(self) -> None:
        self._server = await asyncio.start_server(self._handle, "127.0.0.1", 0)
        self.port = self._server.sockets[0].getsockname()[1]

    async def stop(self) -> None:
        # Cancel any parked connection handlers first: Python 3.12's wait_closed()
        # waits for active connections, so it would hang on a handler blocked in
        # readline() otherwise.
        for task in list(self._handlers):
            task.cancel()
        if self._handlers:
            await asyncio.gather(*self._handlers, return_exceptions=True)
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()

    def _state_line(self) -> bytes:
        message = {
            "event": "state",
            "owner": self.owner,
            "locked": self.locked,
            **self.state,
        }
        return (json.dumps(message) + "\n").encode("utf-8")

    async def _handle(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        self._handlers.add(asyncio.current_task())
        try:
            writer.write(self._state_line())  # initial push on connect
            await writer.drain()
            while True:
                line = await reader.readline()
                if not line:
                    break
                message = json.loads(line)
                self.received.append(message)
                operation = message.get("op")
                if operation == "claim":
                    if self.swallow_claim:
                        continue
                    if self.grant:
                        self.owner = True
                        self.locked = True
                elif operation == "set":
                    for key in ("center_hz", "sample_rate", "gain_db", "gain_auto"):
                        if message.get(key) is not None:
                            self.state[key] = message[key]
                elif operation == "release":
                    self.owner = False
                    self.locked = False
                writer.write(self._state_line())
                await writer.drain()
        except (asyncio.CancelledError, ConnectionError, OSError):
            pass
        finally:
            with contextlib.suppress(OSError):
                writer.close()


@pytest.fixture()
async def relay():
    server = FakeRelayServer()
    await server.start()
    yield server
    await server.stop()


# ── RelayControlClient ────────────────────────────────────────────────────────


async def test_control_client_connect_seeds_state(relay):
    client = sdr_svc.RelayControlClient("127.0.0.1", relay.port)
    assert await client.connect() is True
    assert client.available is True
    await _wait_until(lambda: client.center_hz == 88_000_000)
    assert client.sample_rate == 1_024_000
    await client.close()


async def test_control_client_claim_grants_ownership(relay):
    client = sdr_svc.RelayControlClient("127.0.0.1", relay.port)
    await client.connect()
    assert await client.claim() is True
    assert client.is_owner is True
    assert client.locked is True
    await client.close()


async def test_control_client_claim_denied_makes_follower():
    server = FakeRelayServer(grant=False)
    await server.start()
    try:
        client = sdr_svc.RelayControlClient("127.0.0.1", server.port)
        await client.connect()
        assert await client.claim() is False
        assert client.is_owner is False
        assert client.locked is True  # another instance holds the token
        await client.close()
    finally:
        await server.stop()


async def test_control_client_claim_returns_false_when_unavailable():
    client = sdr_svc.RelayControlClient("127.0.0.1", 0)
    assert client.available is False
    assert await client.claim() is False


async def test_control_client_set_sends_op_and_tracks_echo(relay):
    client = sdr_svc.RelayControlClient("127.0.0.1", relay.port)
    await client.connect()
    await client.claim()
    await client.set(center_hz=101_100_000)
    await _wait_until(lambda: client.center_hz == 101_100_000)
    assert {"op": "set", "center_hz": 101_100_000} in relay.received
    await client.close()


async def test_control_client_set_noop_when_unavailable(relay):
    client = sdr_svc.RelayControlClient("127.0.0.1", relay.port)
    # Never connected → available False → set must not raise or send anything.
    await client.set(center_hz=1)
    assert relay.received == []


async def test_control_client_on_state_callback_invoked(relay):
    seen: list[dict] = []
    client = sdr_svc.RelayControlClient("127.0.0.1", relay.port, on_state=seen.append)
    await client.connect()
    await client.claim()
    await _wait_until(lambda: len(seen) >= 1)
    assert seen[-1]["event"] == "state"
    await client.close()


async def test_control_client_ignores_malformed_and_foreign_lines():
    """A garbage line or a non-state event must not drop the connection."""

    handler_tasks: list[asyncio.Task] = []

    async def handle(reader, writer):
        handler_tasks.append(asyncio.current_task())
        try:
            writer.write(b"not json\n")
            writer.write(b'{"event":"other"}\n')
            writer.write(
                (
                    json.dumps(
                        {
                            "event": "state",
                            "owner": True,
                            "locked": True,
                            "center_hz": 5,
                            "sample_rate": 6,
                            "gain_db": 1.0,
                            "gain_auto": True,
                        }
                    )
                    + "\n"
                ).encode()
            )
            await writer.drain()
            with contextlib.suppress(asyncio.CancelledError, ConnectionError, OSError):
                await reader.read()  # keep the connection open until the client closes
        finally:
            with contextlib.suppress(OSError):
                writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        client = sdr_svc.RelayControlClient("127.0.0.1", port)
        await client.connect()
        await _wait_until(lambda: client.center_hz == 5)
        assert client.is_owner is True
        await client.close()
    finally:
        # Cancel the parked handler before wait_closed (3.12 waits for connections).
        for task in handler_tasks:
            task.cancel()
        server.close()
        await server.wait_closed()


async def test_control_client_connect_unavailable_on_refused_port():
    # A closed port → connect fails fast → available False, returns False.
    probe = await asyncio.start_server(lambda r, w: None, "127.0.0.1", 0)
    port = probe.sockets[0].getsockname()[1]
    probe.close()
    await probe.wait_closed()
    client = sdr_svc.RelayControlClient("127.0.0.1", port)
    assert await client.connect() is False
    assert client.available is False


async def test_control_client_claim_times_out_without_reply(monkeypatch):
    monkeypatch.setattr(settings, "sdr_relay_control_timeout_s", 0.1)
    server = FakeRelayServer()
    server.swallow_claim = True
    await server.start()
    try:
        client = sdr_svc.RelayControlClient("127.0.0.1", server.port)
        await client.connect()
        assert await client.claim() is False  # no state reply within the timeout
        await client.close()
    finally:
        await server.stop()


async def test_control_client_close_releases(relay):
    client = sdr_svc.RelayControlClient("127.0.0.1", relay.port)
    await client.connect()
    await client.claim()
    await client.close()
    assert client.available is False
    assert client.is_owner is False
    await _wait_until(lambda: any(m.get("op") == "release" for m in relay.received))


async def test_control_client_close_is_safe_without_connect():
    client = sdr_svc.RelayControlClient("127.0.0.1", 0)
    await client.close()  # no reader/writer/task → must not raise


# ── RtlTcpConnection: control routing ─────────────────────────────────────────


class FakeControl:
    """Injected stand-in for RelayControlClient on an RtlTcpConnection."""

    def __init__(
        self,
        host: str = "h",
        port: int = 0,
        on_state=None,
        *,
        available: bool = True,
        owner: bool = True,
        locked: bool = True,
        claim_result: bool | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.on_state = on_state
        self.available = available
        self.is_owner = owner
        self.locked = locked
        self._claim_result = owner if claim_result is None else claim_result
        self.center_hz = 95_000_000
        self.sample_rate = 1_024_000
        self.gain_db = 20.0
        self.gain_auto = True
        self.sets: list[dict] = []
        self.claims = 0
        self.closed = False

    async def connect(self) -> bool:
        return self.available

    async def claim(self) -> bool:
        self.claims += 1
        self.is_owner = self._claim_result
        self.locked = self.locked or self.is_owner
        return self.is_owner

    async def set(self, **fields) -> None:
        self.sets.append(fields)

    async def close(self) -> None:
        self.closed = True
        self.available = False
        self.is_owner = False


class FakeWriter:
    def __init__(self) -> None:
        self.buf = bytearray()
        self.closed = False

    def get_extra_info(self, _name: str):
        return None  # no real socket → keepalive helper early-returns

    def write(self, data: bytes) -> None:
        self.buf += data

    async def drain(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        pass


def _control_conn(**control_kwargs) -> sdr_svc.RtlTcpConnection:
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.control = FakeControl(**control_kwargs)
    conn.control_available = True
    conn.is_owner = conn.control.is_owner
    return conn


def _legacy_conn() -> sdr_svc.RtlTcpConnection:
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.connected = True
    conn.writer = FakeWriter()  # type: ignore[assignment]
    return conn


def test_control_port_uses_configured_offset(monkeypatch):
    monkeypatch.setattr(settings, "sdr_relay_control_port_offset", 3)
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    assert conn.control_port == 1237


def test_tuner_locked_property():
    plain = sdr_svc.RtlTcpConnection(host="h", port=1234)
    assert plain.tuner_locked is False  # no control channel
    owned = _control_conn(locked=True)
    assert owned.tuner_locked is True


async def test_set_frequency_owner_routes_through_control():
    conn = _control_conn(owner=True)
    await conn.set_frequency(102_000_000)
    assert conn.control.sets == [{"center_hz": 102_000_000}]
    assert conn.center_hz == 102_000_000
    assert conn.control.claims == 0  # already owner, no re-claim


async def test_set_frequency_claims_when_token_is_free():
    conn = _control_conn(owner=False, locked=False, claim_result=True)
    await conn.set_frequency(103_000_000)
    assert conn.control.claims == 1
    assert conn.control.sets == [{"center_hz": 103_000_000}]
    assert conn.center_hz == 103_000_000


async def test_set_frequency_read_only_raises_when_another_owns():
    conn = _control_conn(owner=False, locked=True, claim_result=False)
    with pytest.raises(sdr_svc.ReadOnlyTuningError):
        await conn.set_frequency(104_000_000)
    assert conn.control.sets == []  # nothing sent to the hardware


async def test_set_frequency_fallback_direct_command():
    conn = _legacy_conn()  # control_available stays False
    await conn.set_frequency(105_000_000)
    assert conn.writer.buf == bytes([0x01]) + (105_000_000).to_bytes(4, "big")
    assert conn.center_hz == 105_000_000


async def test_set_sample_rate_control_and_fallback():
    conn = _control_conn(owner=True)
    await conn.set_sample_rate(2_400_000)
    assert conn.control.sets == [{"sample_rate": 2_400_000}]
    assert conn.sample_rate == 2_400_000

    legacy = _legacy_conn()
    await legacy.set_sample_rate(1_800_000)
    assert legacy.writer.buf == bytes([0x02]) + (1_800_000).to_bytes(4, "big")


async def test_set_gain_auto_control_and_fallback():
    conn = _control_conn(owner=True)
    await conn.set_gain_auto()
    assert conn.control.sets == [{"gain_auto": True}]
    assert conn.gain_auto is True

    legacy = _legacy_conn()
    await legacy.set_gain_auto()
    assert legacy.writer.buf == bytes([0x03, 0, 0, 0, 0, 0x08, 0, 0, 0, 1])
    assert legacy.gain_auto is True


async def test_set_gain_manual_control_and_fallback():
    conn = _control_conn(owner=True)
    await conn.set_gain_manual(24.0)
    assert conn.control.sets == [{"gain_auto": False, "gain_db": 24.0}]
    assert conn.gain_db == 24.0 and conn.gain_auto is False

    legacy = _legacy_conn()
    await legacy.set_gain_manual(10.0)
    # gain mode manual (0x03,1), AGC off (0x08,0), gain 100 tenths (0x04,100)
    assert legacy.writer.buf == (
        bytes([0x03, 0, 0, 0, 1])
        + bytes([0x08, 0, 0, 0, 0])
        + bytes([0x04])
        + (100).to_bytes(4, "big")
    )


def test_adopt_control_state_copies_fields():
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    control = FakeControl(available=True, owner=False)
    control.center_hz = 77_000_000
    control.sample_rate = 960_000
    control.gain_db = 8.0
    control.gain_auto = True
    conn._adopt_control_state(control)
    assert conn.center_hz == 77_000_000
    assert conn.sample_rate == 960_000
    assert conn.gain_db == 8.0
    assert conn.gain_auto is True


def test_on_control_state_updates_and_notifies():
    conn = _control_conn(owner=True)
    conn.control.center_hz = 66_000_000
    calls: list[bool] = []
    conn.state_change_callback = lambda: calls.append(True)
    conn._on_control_state({"event": "state"})
    assert conn.center_hz == 66_000_000
    assert calls == [True]


def test_on_control_state_noop_without_control():
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    calls: list[bool] = []
    conn.state_change_callback = lambda: calls.append(True)
    conn._on_control_state({"event": "state"})  # control is None → early return
    assert calls == []


async def test_ensure_control_owner_asserts_tuning(monkeypatch):
    monkeypatch.setattr(
        sdr_svc,
        "RelayControlClient",
        lambda host, port, on_state=None: FakeControl(host, port, on_state, owner=True),
    )
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    await conn._ensure_control()
    assert conn.control_available is True
    assert conn.is_owner is True
    assert conn.control.sets == [
        {"sample_rate": conn.sample_rate, "center_hz": conn.center_hz}
    ]


async def test_ensure_control_follower_adopts(monkeypatch):
    def _make(host, port, on_state=None):
        follower = FakeControl(
            host, port, on_state, owner=False, claim_result=False, locked=True
        )
        follower.center_hz = 55_000_000
        return follower

    monkeypatch.setattr(sdr_svc, "RelayControlClient", _make)
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    await conn._ensure_control()
    assert conn.is_owner is False
    assert conn.center_hz == 55_000_000  # adopted the owner's tuning
    assert conn.control.sets == []


async def test_ensure_control_unavailable_falls_back(monkeypatch):
    monkeypatch.setattr(
        sdr_svc,
        "RelayControlClient",
        lambda host, port, on_state=None: FakeControl(
            host, port, on_state, available=False
        ),
    )
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    await conn._ensure_control()
    assert conn.control_available is False


async def test_ensure_control_idempotent():
    conn = _control_conn(owner=True)
    existing = conn.control
    await conn._ensure_control()  # already available → early return
    assert conn.control is existing


async def test_close_control_releases_and_resets():
    conn = _control_conn(owner=True)
    control = conn.control
    await conn.close_control()
    assert control.closed is True
    assert conn.control is None
    assert conn.control_available is False
    assert conn.is_owner is False


async def test_close_control_without_channel_is_safe():
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    await conn.close_control()  # no control → must not raise
    assert conn.control_available is False


async def test_connect_with_control_skips_iq_tuning_commands(monkeypatch):
    async def fake_open(host, port):
        reader = type("R", (), {"read": staticmethod(lambda n: _coro(b"\x00" * n))})()
        return reader, FakeWriter()

    def _coro(value):
        async def _inner():
            return value

        return _inner()

    monkeypatch.setattr(sdr_svc.asyncio, "open_connection", fake_open)
    monkeypatch.setattr(
        sdr_svc,
        "RelayControlClient",
        lambda host, port, on_state=None: FakeControl(host, port, on_state, owner=True),
    )
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    await conn.connect()
    # The relay drives the dongle, so nothing is sent over the IQ socket.
    assert bytes(conn.writer.buf) == b""
    assert conn.control_available is True


async def test_connect_without_control_sends_iq_tuning_commands(monkeypatch):
    def _coro(value):
        async def _inner():
            return value

        return _inner()

    async def fake_open(host, port):
        reader = type("R", (), {"read": staticmethod(lambda n: _coro(b"\x00" * n))})()
        return reader, FakeWriter()

    monkeypatch.setattr(sdr_svc.asyncio, "open_connection", fake_open)
    monkeypatch.setattr(
        sdr_svc,
        "RelayControlClient",
        lambda host, port, on_state=None: FakeControl(
            host, port, on_state, available=False
        ),
    )
    conn = sdr_svc.RtlTcpConnection(host="h", port=1234)
    await conn.connect()
    assert conn.control_available is False
    # Legacy path pushes sample rate (0x02) then centre (0x01).
    assert bytes(conn.writer.buf) == (
        bytes([0x02])
        + conn.sample_rate.to_bytes(4, "big")
        + bytes([0x01])
        + conn.center_hz.to_bytes(4, "big")
    )


# ── connection_status + broadcaster control frame ─────────────────────────────


def test_connection_status_reports_ownership(monkeypatch):
    conn = _control_conn(owner=True, locked=True)
    conn.connected = True
    monkeypatch.setitem(sdr_svc._connections, "h:1234", conn)
    status = sdr_svc.connection_status("h", 1234)
    assert status["is_owner"] is True
    assert status["control_available"] is True
    assert status["locked"] is True


def test_broadcaster_pushes_control_frame_on_state_change():
    conn = _control_conn(owner=False, locked=True)
    conn.center_hz = 118_500_000
    broadcaster = sdr_svc.RadioBroadcaster(conn)
    queue = broadcaster.subscribe()
    broadcaster._on_control_state()
    frame = queue.get_nowait()
    assert frame["type"] == "control"
    assert frame["is_owner"] is False
    assert frame["control_available"] is True
    assert frame["locked"] is True
    assert frame["center_hz"] == 118_500_000


# ── Router: WS status/control frames + follower connect ───────────────────────


class _RouterConn:
    """Fake connection for the WebSocket/HTTP layer."""

    host = "h1"
    port = 1234
    center_hz = 100_000_000
    sample_rate = 2_048_000
    mode = "NFM"
    gain_db = 30.0
    gain_auto = False

    def __init__(
        self, *, is_owner=True, control_available=False, locked=False, read_only=False
    ) -> None:
        self.is_owner = is_owner
        self.control_available = control_available
        self.tuner_locked = locked
        self._read_only = read_only

    async def set_frequency(self, freq_hz: int) -> None:
        if self._read_only:
            raise sdr_svc.ReadOnlyTuningError("owned elsewhere")
        self.center_hz = freq_hz


class _RouterBroadcaster:
    def subscribe(self):
        return asyncio.Queue()

    def unsubscribe(self, queue):
        pass


def _patch_router(monkeypatch, conn):
    radio = {"id": 1, "name": "Test", "host": "h1", "port": 1234}

    async def _fake_resolve(radio_id, websocket):
        return _RouterBroadcaster(), radio

    monkeypatch.setattr(sdr_router, "_resolve_broadcaster", _fake_resolve)
    monkeypatch.setattr(sdr_router.sdr_svc, "get_connection", lambda host, port: conn)
    monkeypatch.setattr(sdr_router.sdr_decode, "stop_bridge", _async_noop)


async def _async_noop(*args, **kwargs):
    return None


def test_ws_initial_status_includes_ownership(client, monkeypatch):
    conn = _RouterConn(is_owner=False, control_available=True, locked=True)
    _patch_router(monkeypatch, conn)
    with client.websocket_connect("/ws/sdr/1") as ws:
        status = ws.receive_json()
    assert status["type"] == "status"
    assert status["is_owner"] is False
    assert status["control_available"] is True
    assert status["locked"] is True


def test_ws_read_only_tune_emits_control_frame(client, monkeypatch):
    conn = _RouterConn(
        is_owner=False, control_available=True, locked=True, read_only=True
    )
    _patch_router(monkeypatch, conn)
    with client.websocket_connect("/ws/sdr/1") as ws:
        ws.receive_json()  # initial status
        ws.send_json({"cmd": "tune", "frequency_hz": 120_000_000})
        frame = ws.receive_json()
    assert frame["type"] == "control"
    assert frame["is_owner"] is False
    assert frame["locked"] is True


def test_connect_endpoint_succeeds_as_follower(client, monkeypatch):
    client.post("/api/sdr/radios", json={"name": "Test", "host": "h1", "port": 1234})
    conn = _RouterConn(
        is_owner=False, control_available=True, locked=True, read_only=True
    )

    async def _get_or_create(host, port):
        return conn

    monkeypatch.setattr(sdr_router.sdr_svc, "get_or_create_connection", _get_or_create)
    resp = client.post(
        "/api/sdr/connect", json={"radio_id": 1, "frequency_hz": 121_000_000}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "connected"
    assert body["is_owner"] is False
    assert body["control_available"] is True
