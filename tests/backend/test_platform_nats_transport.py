"""
tests/backend/test_platform_nats_transport.py

Unit tests for backend/platform/nats_transport.py — the NATS half of the event
bus (P5.2): forwarding publishes to other processes, delivering theirs to
local handlers, and carrying requests no local responder answers.

`FakeBroker` stands in for nats-server so two `EventBus`es ("two processes")
can talk without a network: it honours the semantics the transport relies on
— subject wildcards, `no_echo`, queue groups, request/reply, no-responders and
timeouts. `test_against_a_real_nats_server` runs the same round trip against a
real server when `SENTINEL_TEST_NATS_URL` is set.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import pytest
from nats.errors import NoRespondersError
from nats.errors import TimeoutError as NatsTimeoutError

from backend.platform import nats_transport
from backend.platform.bus import EventBus, Subscription, _pattern_matches
from backend.platform.nats_transport import (
    RESPONDER_QUEUE,
    UNBOUNDED_REQUEST_TIMEOUT_S,
    NatsTransport,
    RemoteHandlerError,
    decode_payload,
    encode_payload,
)

# ── fake broker ──────────────────────────────────────────────────────────────


class FakeMessage:
    def __init__(self, subject: str, data: bytes, reply_future: asyncio.Future[bytes] | None = None) -> None:
        self.subject = subject
        self.data = data
        self._reply_future = reply_future

    async def respond(self, data: bytes) -> None:
        assert self._reply_future is not None, "respond() on a message that was not a request"
        self._reply_future.set_result(data)


class FakeNatsSubscription:
    def __init__(self, client: FakeClient, pattern: str, queue: str, callback: Any) -> None:
        self.client = client
        self.pattern = pattern
        self.queue = queue
        self.callback = callback
        self.fail_unsubscribe = False

    async def unsubscribe(self) -> None:
        if self.fail_unsubscribe:
            raise ConnectionError("connection closing")
        self.client.broker.subscriptions.remove(self)


class FakeBroker:
    def __init__(self) -> None:
        self.subscriptions: list[FakeNatsSubscription] = []
        self.up = asyncio.Event()
        self.up.set()

    def _targets(self, sender: FakeClient, subject: str) -> list[FakeNatsSubscription]:
        """Matching subscriptions, minus the sender's own under no_echo, and
        only the first member of each queue group (as one delivery)."""
        targets: list[FakeNatsSubscription] = []
        groups_served: set[str] = set()
        for subscription in self.subscriptions:
            if subscription.client is sender and sender.options.get("no_echo"):
                continue
            if not _pattern_matches(subscription.pattern, subject):
                continue
            if subscription.queue:
                if subscription.queue in groups_served:
                    continue
                groups_served.add(subscription.queue)
            targets.append(subscription)
        return targets

    async def route(self, sender: FakeClient, subject: str, data: bytes) -> None:
        for subscription in self._targets(sender, subject):
            await subscription.callback(FakeMessage(subject, data))

    async def ask(self, sender: FakeClient, subject: str, data: bytes, timeout: float) -> FakeMessage:
        targets = self._targets(sender, subject)
        if not targets:
            raise NoRespondersError
        reply_future: asyncio.Future[bytes] = asyncio.get_running_loop().create_future()
        asyncio.get_running_loop().create_task(targets[0].callback(FakeMessage(subject, data, reply_future)))
        try:
            reply = await asyncio.wait_for(reply_future, timeout=timeout)
        except TimeoutError as error:
            raise NatsTimeoutError from error
        return FakeMessage(subject, reply)


class FakeClient:
    """The subset of nats-py's Client the transport uses."""

    broker: FakeBroker

    def __init__(self) -> None:
        self.options: dict[str, Any] = {}
        self.is_connected = False
        self.closed = False
        self.published: list[tuple[str, bytes]] = []
        self.request_timeouts: list[float] = []
        self.fail_publish = False

    async def connect(self, url: str, **options: Any) -> None:
        self.options = {"url": url, **options}
        # nats-py with max_reconnect_attempts=-1 keeps retrying until the
        # server is up; waiting on the broker's `up` event models exactly that.
        await self.broker.up.wait()
        self.is_connected = True

    async def publish(self, subject: str, data: bytes) -> None:
        if self.fail_publish:
            raise ConnectionError("broker gone")
        self.published.append((subject, data))
        await self.broker.route(self, subject, data)

    async def subscribe(self, pattern: str, queue: str = "", cb: Any = None) -> FakeNatsSubscription:
        subscription = FakeNatsSubscription(self, pattern, queue, cb)
        self.broker.subscriptions.append(subscription)
        return subscription

    async def request(self, subject: str, data: bytes, timeout: float) -> FakeMessage:
        self.request_timeouts.append(timeout)
        return await self.broker.ask(self, subject, data, timeout)

    async def close(self) -> None:
        self.closed = True
        self.is_connected = False


@pytest.fixture
def broker(monkeypatch) -> FakeBroker:
    fake_broker = FakeBroker()

    def make_client() -> FakeClient:
        client = FakeClient()
        client.broker = fake_broker
        return client

    monkeypatch.setattr(nats_transport, "NatsClient", make_client)
    return fake_broker


@asynccontextmanager
async def fake_session_opener():
    yield "local-session"


def transport_for(event_bus: EventBus, *, open_session: Any = fake_session_opener) -> NatsTransport:
    return NatsTransport(event_bus, "nats://broker:4222", client_name="test", open_session=open_session)


async def connected_pair(
    *, open_session: Any = fake_session_opener
) -> tuple[EventBus, NatsTransport, EventBus, NatsTransport]:
    """Two buses, each attached through its own transport — "two processes"."""
    core_bus, hub_bus = EventBus(), EventBus()
    core_transport = transport_for(core_bus, open_session=open_session)
    hub_transport = transport_for(hub_bus, open_session=open_session)
    await core_transport.start()
    await hub_transport.start()
    return core_bus, core_transport, hub_bus, hub_transport


async def settled(*transports: NatsTransport) -> None:
    """Let queued watch/unwatch tasks run."""
    for transport in transports:
        await transport._settle()


# ── wire encoding ────────────────────────────────────────────────────────────


class TestEncoding:
    def test_encode_drops_the_process_local_session_and_keeps_the_rest(self):
        encoded = encode_payload({"keys": ["aprsChannelHz"], "db": object(), "radio_id": 3})
        assert json.loads(encoded) == {"keys": ["aprsChannelHz"], "radio_id": 3}

    def test_encode_raises_type_error_for_a_value_json_cannot_carry(self):
        with pytest.raises(TypeError):
            encode_payload({"keys": [object()]})

    def test_decode_returns_the_object(self):
        assert decode_payload(b'{"radio_id": 3}') == {"radio_id": 3}

    def test_decode_treats_an_empty_body_as_an_empty_payload(self):
        assert decode_payload(b"") == {}

    @pytest.mark.parametrize("data", [b"[1, 2]", b'"text"', b"not json"])
    def test_decode_rejects_anything_but_a_json_object(self, data):
        with pytest.raises(ValueError):
            decode_payload(data)


# ── connecting and stopping ──────────────────────────────────────────────────


class TestStart:
    async def test_connects_with_no_echo_and_unlimited_reconnects_then_attaches(self, broker):
        event_bus = EventBus()
        transport = transport_for(event_bus)
        await transport.start()
        options = transport._client.options
        assert options["url"] == "nats://broker:4222"
        assert options["name"] == "test"
        assert options["no_echo"] is True
        assert options["max_reconnect_attempts"] == -1
        assert options["reconnect_time_wait"] == nats_transport.RECONNECT_WAIT_S
        assert event_bus.remote is transport
        assert transport.connected is True

    async def test_watches_subscriptions_made_before_it_connected(self, broker):
        event_bus = EventBus()
        event_bus.subscribe("settings.changed.*", lambda payload: None)
        event_bus.reply("hub.decode.ais.status", lambda payload: {})
        await transport_for(event_bus).start()
        assert [(item.pattern, item.queue) for item in broker.subscriptions] == [
            ("settings.changed.*", ""),
            # Responders share a queue group so one request gets one answer.
            ("hub.decode.ais.status", RESPONDER_QUEUE),
        ]

    async def test_an_unreachable_broker_does_not_hold_up_startup(self, broker, monkeypatch, caplog):
        monkeypatch.setattr(nats_transport, "STARTUP_CONNECT_WAIT_S", 0.01)
        broker.up.clear()
        event_bus = EventBus()
        transport = transport_for(event_bus)
        with caplog.at_level(logging.WARNING, logger=nats_transport.__name__):
            await transport.start()
        assert event_bus.remote is None
        assert transport.connected is False
        assert "not reachable yet" in caplog.text
        # The broker arrives later: the background connection attaches then.
        broker.up.set()
        await transport._connect_task
        assert event_bus.remote is transport

    async def test_stop_while_still_connecting_cancels_and_closes(self, broker, monkeypatch):
        monkeypatch.setattr(nats_transport, "STARTUP_CONNECT_WAIT_S", 0.01)
        broker.up.clear()
        event_bus = EventBus()
        transport = transport_for(event_bus)
        await transport.start()
        connect_task = transport._connect_task
        await transport.stop()
        assert connect_task.cancelled()
        assert transport._connect_task is None
        assert transport._client.closed is True
        assert event_bus.remote is None

    async def test_stop_detaches_drops_interest_and_closes(self, broker):
        event_bus = EventBus()
        event_bus.subscribe("settings.changed.*", lambda payload: None)
        transport = transport_for(event_bus)
        await transport.start()
        await transport.stop()
        assert event_bus.remote is None
        assert broker.subscriptions == []
        assert transport._client.closed is True

    async def test_stop_leaves_a_different_transport_attached(self, broker):
        event_bus = EventBus()
        first, second = transport_for(event_bus), transport_for(event_bus)
        await first.start()
        await second.start()
        await first.stop()
        assert event_bus.remote is second


# ── publish / subscribe across processes ─────────────────────────────────────


class TestPublishAcrossProcesses:
    async def test_reaches_the_other_process_once_with_its_own_session(self, broker):
        core_bus, core_transport, hub_bus, hub_transport = await connected_pair()
        core_seen: list[dict] = []
        hub_seen: list[dict] = []
        core_bus.subscribe("settings.changed.*", core_seen.append)
        hub_bus.subscribe("settings.changed.*", hub_seen.append)
        await settled(core_transport, hub_transport)
        publisher_session = object()
        await core_bus.publish("settings.changed.land", {"keys": ["aprsChannelHz"], "db": publisher_session})
        # Local: synchronous, with the publisher's own session; and only once —
        # no_echo stops NATS handing the publish back to its own process.
        assert core_seen == [{"keys": ["aprsChannelHz"], "db": publisher_session}]
        # Remote: the session the receiving process opened for it.
        assert hub_seen == [{"keys": ["aprsChannelHz"], "db": "local-session"}]

    async def test_overlapping_patterns_each_see_the_event_once(self, broker):
        core_bus, core_transport, hub_bus, hub_transport = await connected_pair()
        seen: list[str] = []
        hub_bus.subscribe("settings.changed.*", lambda payload: seen.append("narrow"))
        hub_bus.subscribe("settings.>", lambda payload: seen.append("wide"))
        await settled(core_transport, hub_transport)
        await core_bus.publish("settings.changed.sea", {"keys": ["aisSdrRadioId"]})
        assert sorted(seen) == ["narrow", "wide"]

    async def test_without_a_session_opener_the_payload_arrives_as_sent(self, broker):
        core_bus, _, hub_bus, hub_transport = await connected_pair(open_session=None)
        seen: list[dict] = []
        hub_bus.subscribe("registry.changed", seen.append)
        await settled(hub_transport)
        await core_bus.publish("registry.changed", {"id": "sea", "change": "registered"})
        assert seen == [{"id": "sea", "change": "registered"}]

    async def test_an_unsubscribed_handler_stops_receiving(self, broker):
        core_bus, _, hub_bus, hub_transport = await connected_pair()
        seen: list[dict] = []
        unsubscribe = hub_bus.subscribe("decode.aprs.*", seen.append)
        await settled(hub_transport)
        unsubscribe()
        await settled(hub_transport)
        await core_bus.publish("decode.aprs.1", {"event": {}, "radio_id": 1})
        assert seen == []
        assert broker.subscriptions == []

    async def test_a_payload_json_cannot_carry_is_kept_local(self, broker, caplog):
        core_bus, core_transport, _, _ = await connected_pair()
        local_seen: list[dict] = []
        core_bus.subscribe("settings.changed.sea", local_seen.append)
        with caplog.at_level(logging.WARNING, logger=nats_transport.__name__):
            await core_bus.publish("settings.changed.sea", {"keys": [object()]})
        assert len(local_seen) == 1
        assert core_transport._client.published == []
        assert "not JSON-serialisable" in caplog.text

    async def test_a_failing_broker_never_breaks_the_publisher(self, broker, caplog):
        core_bus, core_transport, _, _ = await connected_pair()
        core_transport._client.fail_publish = True
        with caplog.at_level(logging.ERROR, logger=nats_transport.__name__):
            await core_bus.publish("settings.changed.sea", {"keys": ["x"]})
        assert "could not forward 'settings.changed.sea'" in caplog.text

    async def test_a_malformed_event_is_dropped(self, broker, caplog):
        _, core_transport, hub_bus, hub_transport = await connected_pair()
        seen: list[dict] = []
        hub_bus.subscribe("decode.ais.*", seen.append)
        await settled(hub_transport)
        with caplog.at_level(logging.WARNING, logger=nats_transport.__name__):
            await core_transport._client.publish("decode.ais.1", b"[not an object]")
        assert seen == []
        assert "dropping malformed bus event on 'decode.ais.1'" in caplog.text

    async def test_a_failing_remote_handler_is_logged_not_raised(self, broker, caplog):
        core_bus, _, hub_bus, hub_transport = await connected_pair()

        def broken(payload):
            raise RuntimeError("handler bug")

        hub_bus.subscribe("decode.ais.*", broken)
        await settled(hub_transport)
        with caplog.at_level(logging.ERROR):
            await core_bus.publish("decode.ais.1", {"event": {}, "radio_id": 1})
        assert "failed on remote subject 'decode.ais.1'" in caplog.text

    async def test_a_session_that_cannot_be_opened_is_logged(self, broker, caplog):
        @asynccontextmanager
        async def broken_opener():
            raise OSError("database locked")
            yield  # pragma: no cover - never reached

        core_bus, _, hub_bus, hub_transport = await connected_pair(open_session=broken_opener)
        seen: list[dict] = []
        hub_bus.subscribe("decode.ais.*", seen.append)
        await settled(hub_transport)
        with caplog.at_level(logging.ERROR, logger=nats_transport.__name__):
            await core_bus.publish("decode.ais.1", {"event": {}, "radio_id": 1})
        assert seen == []
        assert "could not open a session for bus event 'decode.ais.1'" in caplog.text


# ── request / reply across processes ─────────────────────────────────────────


class TestRequestAcrossProcesses:
    async def test_returns_the_remote_responders_result(self, broker):
        core_bus, _, hub_bus, hub_transport = await connected_pair()

        async def status(payload):
            return {"radio_id": payload["radio_id"], "session": payload["db"]}

        hub_bus.reply("hub.decode.ais.status", status)
        await settled(hub_transport)
        reply = await core_bus.request("hub.decode.ais.status", {"radio_id": 3, "db": object()})
        assert reply == {"radio_id": 3, "session": "local-session"}

    async def test_a_local_responder_answers_without_the_wire(self, broker):
        core_bus, core_transport, hub_bus, hub_transport = await connected_pair()
        core_bus.reply("hub.decode.ais.status", lambda payload: "local")
        hub_bus.reply("hub.decode.ais.status", lambda payload: "remote")
        await settled(core_transport, hub_transport)
        assert await core_bus.request("hub.decode.ais.status", {}) == "local"
        assert core_transport._client.request_timeouts == []

    async def test_a_remote_exception_is_raised_as_remote_handler_error(self, broker):
        core_bus, _, hub_bus, hub_transport = await connected_pair()

        def busy(payload):
            raise ValueError("radio busy")

        hub_bus.reply("hub.decode.ais.start", busy)
        await settled(hub_transport)
        with pytest.raises(RemoteHandlerError, match="radio busy"):
            await core_bus.request("hub.decode.ais.start", {"radio_id": 1})

    async def test_a_remote_exception_without_a_message_is_named_by_type(self, broker):
        core_bus, _, hub_bus, hub_transport = await connected_pair()

        def silent(payload):
            raise KeyError

        hub_bus.reply("hub.decode.ais.start", silent)
        await settled(hub_transport)
        with pytest.raises(RemoteHandlerError, match="KeyError"):
            await core_bus.request("hub.decode.ais.start", {})

    async def test_no_responder_anywhere_raises_lookup_error(self, broker):
        core_bus, *_ = await connected_pair()
        with pytest.raises(LookupError, match="hub.nothing"):
            await core_bus.request("hub.nothing", {})

    async def test_a_slow_remote_responder_raises_timeout(self, broker):
        core_bus, _, hub_bus, hub_transport = await connected_pair()
        release = asyncio.Event()

        async def slow(payload):
            await release.wait()

        hub_bus.reply("hub.iq-capture.start", slow)
        await settled(hub_transport)
        with pytest.raises(TimeoutError):
            await core_bus.request("hub.iq-capture.start", {}, timeout=0.01)
        release.set()

    async def test_no_timeout_uses_the_unbounded_backstop(self, broker):
        core_bus, core_transport, hub_bus, hub_transport = await connected_pair()
        hub_bus.reply("hub.decode.ais.stop", lambda payload: {"ok": True})
        await settled(hub_transport)
        await core_bus.request("hub.decode.ais.stop", {}, timeout=None)
        assert core_transport._client.request_timeouts == [UNBOUNDED_REQUEST_TIMEOUT_S]

    async def test_a_malformed_request_gets_an_error_reply(self, broker):
        _, core_transport, hub_bus, hub_transport = await connected_pair()
        hub_bus.reply("hub.decode.ais.status", lambda payload: {})
        await settled(hub_transport)
        reply = await core_transport._client.request("hub.decode.ais.status", b"[1]", timeout=1)
        assert json.loads(reply.data) == {"ok": False, "error": "bus payload must be a JSON object"}

    async def test_a_result_json_cannot_carry_gets_an_error_reply(self, broker):
        core_bus, _, hub_bus, hub_transport = await connected_pair()
        hub_bus.reply("hub.decode.ais.status", lambda payload: {"value": object()})
        await settled(hub_transport)
        with pytest.raises(RemoteHandlerError, match="not JSON serializable"):
            await core_bus.request("hub.decode.ais.status", {})


# ── watch / unwatch bookkeeping ──────────────────────────────────────────────


class TestUnwatch:
    async def test_unwatching_a_subscription_never_watched_is_a_no_op(self, broker):
        event_bus = EventBus()
        transport = transport_for(event_bus)
        await transport.start()
        await transport._unwatch(Subscription("never.watched", lambda payload: None, is_responder=False))
        assert broker.subscriptions == []

    async def test_a_failed_nats_unsubscribe_is_swallowed(self, broker):
        event_bus = EventBus()
        transport = transport_for(event_bus)
        await transport.start()
        unsubscribe = event_bus.subscribe("settings.changed.*", lambda payload: None)
        await settled(transport)
        broker.subscriptions[0].fail_unsubscribe = True
        unsubscribe()
        await settled(transport)
        assert transport._nats_subscriptions == {}


# ── connection-state logging ─────────────────────────────────────────────────


class TestConnectionLogging:
    async def test_a_repeated_error_is_logged_once(self, broker, caplog):
        transport = transport_for(EventBus())
        with caplog.at_level(logging.WARNING, logger=nats_transport.__name__):
            await transport._on_error(OSError("Connection refused"))
            await transport._on_error(OSError("Connection refused"))
            await transport._on_error(OSError("unexpected EOF"))
            await transport._on_error(TimeoutError())
        messages = [record.getMessage() for record in caplog.records]
        assert messages == [
            "NATS error: Connection refused",
            "NATS error: unexpected EOF",
            "NATS error: TimeoutError",
        ]

    async def test_connecting_forgets_the_last_error(self, broker, caplog):
        transport = transport_for(EventBus())
        await transport._on_error(OSError("Connection refused"))
        await transport.start()
        caplog.clear()
        with caplog.at_level(logging.WARNING, logger=nats_transport.__name__):
            await transport._on_error(OSError("Connection refused"))
        # Logged again: a failure after a successful connection is news.
        assert [record.getMessage() for record in caplog.records] == ["NATS error: Connection refused"]

    async def test_disconnect_and_reconnect_are_logged(self, broker, caplog):
        transport = transport_for(EventBus())
        with caplog.at_level(logging.INFO, logger=nats_transport.__name__):
            await transport._on_disconnected()
            await transport._on_reconnected()
        assert "disconnected from NATS; local delivery continues" in caplog.text
        assert "reconnected to NATS" in caplog.text


# ── real server (opt-in) ─────────────────────────────────────────────────────


@pytest.mark.skipif(
    not os.environ.get("SENTINEL_TEST_NATS_URL"),
    reason="set SENTINEL_TEST_NATS_URL (e.g. nats://localhost:4222) to run against a real nats-server",
)
async def test_against_a_real_nats_server():
    url = os.environ["SENTINEL_TEST_NATS_URL"]
    core_bus, hub_bus = EventBus(), EventBus()
    hub_seen: list[dict] = []
    received = asyncio.Event()

    def on_event(payload):
        hub_seen.append(payload)
        received.set()

    hub_bus.subscribe("settings.changed.*", on_event)
    hub_bus.reply("hub.decode.ais.status", lambda payload: {"radio_id": payload["radio_id"]})
    core_transport = NatsTransport(core_bus, url, client_name="core-test", open_session=fake_session_opener)
    hub_transport = NatsTransport(hub_bus, url, client_name="hub-test", open_session=fake_session_opener)
    await core_transport.start()
    await hub_transport.start()
    try:
        await core_bus.publish("settings.changed.land", {"keys": ["aprsChannelHz"], "db": object()})
        await asyncio.wait_for(received.wait(), timeout=2)
        assert hub_seen == [{"keys": ["aprsChannelHz"], "db": "local-session"}]
        assert await core_bus.request("hub.decode.ais.status", {"radio_id": 7}) == {"radio_id": 7}
        with pytest.raises(LookupError):
            await core_bus.request("hub.nothing", {}, timeout=1)
    finally:
        await core_transport.stop()
        await hub_transport.stop()
