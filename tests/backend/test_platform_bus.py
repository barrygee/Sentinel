"""
tests/backend/test_platform_bus.py

Unit tests for backend/platform/bus.py — the in-process, NATS-shaped event bus
that replaces direct cross-section calls (settings → SDR side effects).

Each test builds its own EventBus so nothing leaks into the process-wide
`bus` singleton that radio_hub/routers/decode.py subscribes to at import time.
"""

import asyncio
import logging

import pytest

from backend.platform.bus import EventBus, _pattern_matches


class TestPatternMatching:
    @pytest.mark.parametrize(
        ("pattern", "subject"),
        [
            ("settings.changed.land", "settings.changed.land"),
            ("settings.changed.*", "settings.changed.land"),
            ("settings.*.land", "settings.changed.land"),
            ("settings.>", "settings.changed.land"),
            ("settings.>", "settings.changed"),
            (">", "settings"),
        ],
    )
    def test_matches(self, pattern, subject):
        assert _pattern_matches(pattern, subject) is True

    @pytest.mark.parametrize(
        ("pattern", "subject"),
        [
            ("settings.changed.land", "settings.changed.sdr"),
            # '*' is exactly one token: never zero, never two.
            ("settings.changed.*", "settings.changed"),
            ("settings.*", "settings.changed.land"),
            # '>' needs at least one token to consume.
            ("settings.changed.>", "settings.changed"),
            # '>' is only a wildcard as the final token.
            ("settings.>.land", "settings.changed.land"),
            # A longer pattern never matches a shorter subject.
            ("settings.changed.land.extra", "settings.changed.land"),
            # Tokens are whole words, not prefixes.
            ("settings.change", "settings.changed"),
        ],
    )
    def test_does_not_match(self, pattern, subject):
        assert _pattern_matches(pattern, subject) is False


class TestPublish:
    async def test_awaits_matching_handlers_in_subscription_order(self):
        event_bus = EventBus()
        calls: list[str] = []

        async def first(payload):
            await asyncio.sleep(0)  # yields; order must still hold
            calls.append(f"first:{payload['value']}")

        def second(payload):  # sync handlers are accepted too
            calls.append(f"second:{payload['value']}")

        event_bus.subscribe("settings.changed.*", first)
        event_bus.subscribe("settings.changed.land", second)
        event_bus.subscribe(
            "settings.changed.sdr", lambda payload: calls.append("never")
        )

        await event_bus.publish("settings.changed.land", {"value": 1})

        # Both finished before publish() returned, in subscription order.
        assert calls == ["first:1", "second:1"]

    async def test_no_subscribers_is_a_no_op(self):
        await EventBus().publish("nothing.listens", {})

    async def test_a_failing_handler_is_logged_and_the_rest_still_run(self, caplog):
        event_bus = EventBus()
        calls: list[str] = []

        def broken(_payload):
            raise RuntimeError("boom")

        event_bus.subscribe("event", broken)
        event_bus.subscribe("event", lambda _payload: calls.append("after"))

        with caplog.at_level(logging.ERROR, logger="backend.platform.bus"):
            await event_bus.publish("event", {})

        assert calls == ["after"]
        assert "event bus handler for 'event' failed on subject 'event'" in caplog.text

    async def test_raise_errors_propagates_and_stops_later_handlers(self):
        event_bus = EventBus()
        calls: list[str] = []

        async def broken(_payload):
            raise ValueError("bad channel")

        event_bus.subscribe("event", broken)
        event_bus.subscribe("event", lambda _payload: calls.append("after"))

        with pytest.raises(ValueError, match="bad channel"):
            await event_bus.publish("event", {}, raise_errors=True)
        assert calls == []


class TestSubscribe:
    async def test_unsubscribe_removes_only_that_registration(self):
        event_bus = EventBus()
        calls: list[str] = []

        def handler(_payload):
            calls.append("handled")

        unsubscribe_first = event_bus.subscribe("event", handler)
        event_bus.subscribe("event", handler)  # same handler, second entry

        unsubscribe_first()
        await event_bus.publish("event", {})
        assert calls == ["handled"]

        unsubscribe_first()  # idempotent: removing again is harmless
        await event_bus.publish("event", {})
        assert calls == ["handled", "handled"]


class TestRequestReply:
    async def test_returns_the_first_matching_responders_result(self):
        event_bus = EventBus()

        async def status(payload):
            return {"running": payload["radio_id"] == 7}

        event_bus.reply("hub.decode.ais.status", status)
        event_bus.reply(
            "hub.decode.*.status", lambda _payload: {"running": "second responder"}
        )

        assert await event_bus.request("hub.decode.ais.status", {"radio_id": 7}) == {
            "running": True
        }

    async def test_raises_lookup_error_when_nothing_replies(self):
        with pytest.raises(LookupError, match="hub.decode.ais.status"):
            await EventBus().request("hub.decode.ais.status", {})

    async def test_times_out_a_slow_responder(self):
        event_bus = EventBus()

        async def slow(_payload):
            await asyncio.sleep(1)

        event_bus.reply("slow", slow)
        with pytest.raises(asyncio.TimeoutError):
            await event_bus.request("slow", {}, timeout=0.01)


class RecordingRemote:
    """A `RemoteTransport` that records what the bus asks of it."""

    def __init__(self, reply: object = None) -> None:
        self.calls: list[tuple] = []
        self.reply = reply

    def watch(self, subscription):
        self.calls.append(("watch", subscription.pattern, subscription.is_responder))

    def unwatch(self, subscription):
        self.calls.append(("unwatch", subscription.pattern))

    async def forward(self, subject, payload):
        self.calls.append(("forward", subject, payload))

    async def request(self, subject, payload, timeout):
        self.calls.append(("request", subject, payload, timeout))
        return self.reply


class TestRemoteAttachment:
    def test_subscribe_and_reply_record_which_kind_they_are(self):
        event_bus = EventBus()
        event_bus.subscribe("decode.aprs.*", lambda payload: None)
        event_bus.reply("hub.decode.ais.status", lambda payload: None)
        assert [(item.pattern, item.is_responder) for item in event_bus._subscriptions] == [
            ("decode.aprs.*", False),
            ("hub.decode.ais.status", True),
        ]

    def test_attach_watches_every_existing_subscription(self):
        event_bus = EventBus()
        event_bus.subscribe("decode.aprs.*", lambda payload: None)
        event_bus.reply("hub.decode.ais.status", lambda payload: None)
        remote = RecordingRemote()
        event_bus.attach_remote(remote)
        assert event_bus.remote is remote
        assert remote.calls == [
            ("watch", "decode.aprs.*", False),
            ("watch", "hub.decode.ais.status", True),
        ]

    def test_subscriptions_after_attach_are_watched_and_unwatched_once(self):
        event_bus = EventBus()
        remote = RecordingRemote()
        event_bus.attach_remote(remote)
        unsubscribe = event_bus.reply("hub.decode.x.start", lambda payload: None)
        unsubscribe()
        unsubscribe()  # already gone: must not unwatch twice
        assert remote.calls == [("watch", "hub.decode.x.start", True), ("unwatch", "hub.decode.x.start")]

    def test_unsubscribe_without_a_remote_only_removes_locally(self):
        event_bus = EventBus()
        unsubscribe = event_bus.subscribe("event", lambda payload: None)
        unsubscribe()
        assert event_bus._subscriptions == []

    def test_detach_unwatches_everything_and_goes_in_process(self):
        event_bus = EventBus()
        event_bus.subscribe("decode.aprs.*", lambda payload: None)
        remote = RecordingRemote()
        event_bus.attach_remote(remote)
        remote.calls.clear()
        event_bus.detach_remote()
        assert event_bus.remote is None
        assert remote.calls == [("unwatch", "decode.aprs.*")]
        # A later subscription no longer reaches the detached transport.
        event_bus.subscribe("event", lambda payload: None)
        assert remote.calls == [("unwatch", "decode.aprs.*")]

    def test_detach_without_a_remote_is_a_no_op(self):
        event_bus = EventBus()
        event_bus.detach_remote()
        assert event_bus.remote is None


class TestRemotePublish:
    async def test_forwards_after_every_local_handler(self):
        event_bus = EventBus()
        remote = RecordingRemote()
        event_bus.attach_remote(remote)
        event_bus.subscribe("event", lambda payload: remote.calls.append(("local",)))
        await event_bus.publish("event", {"value": 1})
        assert remote.calls[-2:] == [("local",), ("forward", "event", {"value": 1})]

    async def test_forwards_even_when_nothing_listens_locally(self):
        event_bus = EventBus()
        remote = RecordingRemote()
        event_bus.attach_remote(remote)
        await event_bus.publish("registry.changed", {"id": "sea"})
        assert remote.calls == [("forward", "registry.changed", {"id": "sea"})]

    async def test_forwards_when_a_local_handler_failed_quietly(self):
        event_bus = EventBus()
        remote = RecordingRemote()
        event_bus.attach_remote(remote)

        def broken(payload):
            raise RuntimeError("boom")

        event_bus.subscribe("event", broken)
        await event_bus.publish("event", {})
        assert remote.calls[-1] == ("forward", "event", {})

    async def test_does_not_forward_when_raise_errors_propagated(self):
        event_bus = EventBus()
        remote = RecordingRemote()
        event_bus.attach_remote(remote)

        def broken(payload):
            raise ValueError("bad channel")

        event_bus.subscribe("event", broken)
        with pytest.raises(ValueError):
            await event_bus.publish("event", {}, raise_errors=True)
        assert [call for call in remote.calls if call[0] == "forward"] == []


class TestRemoteDelivery:
    async def test_deliver_remote_runs_only_the_given_subscription(self):
        event_bus = EventBus()
        calls: list[str] = []
        event_bus.subscribe("settings.changed.*", lambda payload: calls.append("narrow"))
        event_bus.subscribe("settings.>", lambda payload: calls.append("wide"))
        await event_bus.deliver_remote(event_bus._subscriptions[1], "settings.changed.land", {})
        assert calls == ["wide"]

    async def test_deliver_remote_awaits_async_handlers(self):
        event_bus = EventBus()
        calls: list[dict] = []

        async def handler(payload):
            await asyncio.sleep(0)
            calls.append(payload)

        event_bus.subscribe("decode.ais.*", handler)
        await event_bus.deliver_remote(event_bus._subscriptions[0], "decode.ais.1", {"radio_id": 1})
        assert calls == [{"radio_id": 1}]

    async def test_deliver_remote_logs_a_failing_handler(self, caplog):
        event_bus = EventBus()

        def broken(payload):
            raise RuntimeError("boom")

        event_bus.subscribe("decode.ais.*", broken)
        with caplog.at_level(logging.ERROR, logger="backend.platform.bus"):
            await event_bus.deliver_remote(event_bus._subscriptions[0], "decode.ais.1", {})
        assert "event bus handler for 'decode.ais.*' failed on remote subject 'decode.ais.1'" in caplog.text


class TestRemoteRequest:
    async def test_a_local_responder_wins_over_the_remote(self):
        event_bus = EventBus()
        remote = RecordingRemote(reply="remote")
        event_bus.attach_remote(remote)
        event_bus.reply("hub.decode.ais.status", lambda payload: "local")
        assert await event_bus.request("hub.decode.ais.status", {}) == "local"
        assert [call for call in remote.calls if call[0] == "request"] == []

    async def test_with_no_local_responder_the_remote_answers(self):
        event_bus = EventBus()
        remote = RecordingRemote(reply={"running": True})
        event_bus.attach_remote(remote)
        reply = await event_bus.request("hub.decode.ais.status", {"radio_id": 2}, timeout=None)
        assert reply == {"running": True}
        assert remote.calls == [("request", "hub.decode.ais.status", {"radio_id": 2}, None)]

    async def test_answer_remote_uses_the_first_local_responder(self):
        event_bus = EventBus()
        event_bus.reply("hub.decode.ais.status", lambda payload: {"first": payload["radio_id"]})
        event_bus.reply("hub.decode.*.status", lambda payload: {"second": True})
        assert await event_bus.answer_remote("hub.decode.ais.status", {"radio_id": 4}) == {"first": 4}

    async def test_answer_remote_without_a_responder_raises_lookup_error(self):
        with pytest.raises(LookupError, match="hub.decode.ais.status"):
            await EventBus().answer_remote("hub.decode.ais.status", {})
