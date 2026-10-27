"""Keeping behaviour tracking fail-open when Redis is down.

fastapi-guard's `redis_fail_open` lets requests through when its rate limiter
or ban list can't reach Redis, but its behaviour tracker (usage, frequency and
response-pattern rules — including the policy's global `status:404` scanner
rule) raises instead, so during a Redis outage every 404, and every call to a
route with a monitor, fails with a 500. With `redis_fail_open` on, this makes
the tracker match: a sliding-window count Redis can't record counts as zero
(no ban), logged at most once a minute.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from guard_core.exceptions import GuardRedisError

logger = logging.getLogger("sentinel.guard")

_LOG_INTERVAL_SECONDS = 60.0


class FailOpenBehaviorStore:
    """A guard `RedisManager` stand-in whose sliding-window hits never raise."""

    def __init__(self, redis_handler: Any) -> None:
        self._redis_handler = redis_handler
        self._last_logged_at = 0.0

    def __getattr__(self, name: str) -> Any:
        # Everything but the one call that raises goes straight through.
        return getattr(self._redis_handler, name)

    async def record_sliding_window_hit(
        self, namespace: str, key: str, timestamp: float, window_start: float, ttl: int
    ) -> int:
        """The window's hit count, or 0 when Redis can't be reached."""
        try:
            count: int = await self._redis_handler.record_sliding_window_hit(
                namespace, key, timestamp, window_start, ttl
            )
            return count
        except GuardRedisError:
            now = time.monotonic()
            if now - self._last_logged_at >= _LOG_INTERVAL_SECONDS:
                self._last_logged_at = now
                logger.warning("guard: Redis unreachable, behaviour rules aren't counting until it is back")
            return 0


def make_behavior_tracking_fail_open(behavior_tracker: Any) -> None:
    """Wrap every Redis handle `behavior_tracker` is ever given in a `FailOpenBehaviorStore`.

    Wraps `initialize_redis` rather than the current handle, because
    fastapi-guard initialises again on the first request when Redis was down
    at startup.
    """
    original_initialize: Callable[[Any], Awaitable[None]] = behavior_tracker.initialize_redis

    async def initialize_fail_open(redis_handler: Any) -> None:
        await original_initialize(FailOpenBehaviorStore(redis_handler) if redis_handler is not None else None)

    behavior_tracker.initialize_redis = initialize_fail_open
