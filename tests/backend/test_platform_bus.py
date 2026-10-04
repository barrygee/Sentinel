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
