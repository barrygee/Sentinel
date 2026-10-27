"""Behaviour tracking stays fail-open while Redis is down.

fastapi-guard's tracker raises when Redis is unreachable, which would answer
every 404 (the scanner rule) with a 500 during an outage.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_fail_open.py
"""

from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any

import pytest
from guard_core.exceptions import GuardRedisError

from backend.platform.security import fail_open
from backend.platform.security.fail_open import FailOpenBehaviorStore, make_behavior_tracking_fail_open


class FakeRedisHandler:
    """Stands in for fastapi-guard's RedisManager."""

    def __init__(self, hits: int | None = None) -> None:
        self.hits = hits
        self.prefix = "sentinel_guard:"
        self.calls: list[tuple[Any, ...]] = []

    async def record_sliding_window_hit(
        self, namespace: str, key: str, timestamp: float, window_start: float, ttl: int
    ) -> int:
        self.calls.append((namespace, key, timestamp, window_start, ttl))
        if self.hits is None:
            raise GuardRedisError(503, "Redis unreachable")
        return self.hits


class TestFailOpenBehaviorStore:
    async def test_returns_the_window_count_while_redis_answers(self) -> None:
        handler = FakeRedisHandler(hits=7)
        store = FailOpenBehaviorStore(handler)

        assert await store.record_sliding_window_hit("behavior", "192.168.1.50", 100.0, 40.0, 60) == 7
        assert handler.calls == [("behavior", "192.168.1.50", 100.0, 40.0, 60)]

    async def test_counts_zero_when_redis_is_down(self) -> None:
        store = FailOpenBehaviorStore(FakeRedisHandler(hits=None))

        assert await store.record_sliding_window_hit("behavior", "192.168.1.50", 100.0, 40.0, 60) == 0

    async def test_logs_the_outage_at_most_once_a_minute(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        clock = iter([1000.0, 1030.0, 1061.0])
        # Its own `time` only: the event loop reads time.monotonic too.
        monkeypatch.setattr(fail_open, "time", SimpleNamespace(monotonic=lambda: next(clock)))
        store = FailOpenBehaviorStore(FakeRedisHandler(hits=None))

        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            for _ in range(3):
                await store.record_sliding_window_hit("behavior", "key", 1.0, 0.0, 60)

        assert len(caplog.messages) == 2
        assert "Redis unreachable" in caplog.messages[0]

    async def test_other_errors_are_not_swallowed(self) -> None:
        class BrokenHandler(FakeRedisHandler):
            async def record_sliding_window_hit(self, *arguments: Any) -> int:
                raise RuntimeError("a bug, not an outage")

        with pytest.raises(RuntimeError, match="a bug"):
            await FailOpenBehaviorStore(BrokenHandler()).record_sliding_window_hit("behavior", "key", 1.0, 0.0, 60)

    def test_everything_else_goes_straight_through(self) -> None:
        handler = FakeRedisHandler()

        assert FailOpenBehaviorStore(handler).prefix == "sentinel_guard:"


class FakeBehaviorTracker:
    def __init__(self) -> None:
        self.redis_handler: Any = "unset"

    async def initialize_redis(self, redis_handler: Any) -> None:
        self.redis_handler = redis_handler


class TestMakeBehaviorTrackingFailOpen:
    async def test_every_redis_handle_it_is_given_is_wrapped(self) -> None:
        tracker = FakeBehaviorTracker()
        make_behavior_tracking_fail_open(tracker)
        first, second = FakeRedisHandler(hits=1), FakeRedisHandler(hits=2)

        await tracker.initialize_redis(first)
        wrapped_first = tracker.redis_handler
        # fastapi-guard initialises again when Redis was down at startup.
        await tracker.initialize_redis(second)

        assert isinstance(wrapped_first, FailOpenBehaviorStore)
        assert isinstance(tracker.redis_handler, FailOpenBehaviorStore)
        assert await tracker.redis_handler.record_sliding_window_hit("b", "k", 1.0, 0.0, 60) == 2

    async def test_no_redis_stays_no_redis(self) -> None:
        tracker = FakeBehaviorTracker()
        make_behavior_tracking_fail_open(tracker)

        await tracker.initialize_redis(None)

        assert tracker.redis_handler is None
