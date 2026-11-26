"""A short-lived, shared cache of the sections' snapshot answers.

Every open globe tab polls `/api/globe/objects` every few seconds. Without
this, each poll would send each owning section its own NATS request; with it,
one request per layer and key is made per TTL, and concurrent polls that miss
together share the one request in flight. Failures are cached for the TTL too,
so a stopped section costs one timeout per interval, not one per tab.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Hashable


class SnapshotCache[CachedValue]:
    """Values by key, each kept for `ttl_seconds`, at most `max_entries` (oldest dropped first).

    Not thread-safe: used from the event loop only, like the rest of the service.
    """

    def __init__(self, ttl_seconds: float, max_entries: int = 64, clock: Callable[[], float] = time.monotonic) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._entries: OrderedDict[Hashable, tuple[float, CachedValue]] = OrderedDict()
        self._in_flight: dict[Hashable, asyncio.Future[CachedValue]] = {}

    async def get_or_load(self, key: Hashable, load: Callable[[], Awaitable[CachedValue]]) -> CachedValue:
        """The cached value for `key`, or the result of `load()`, shared with any concurrent caller.

        `load` must not raise: callers turn their failures into a value (an
        unavailable layer) so that failure is cached like an answer.
        """
        now = self._clock()
        cached = self._entries.get(key)
        if cached is not None and now - cached[0] < self._ttl_seconds:
            return cached[1]
        pending = self._in_flight.get(key)
        if pending is not None:
            # shield: one caller giving up (its client disconnected) must not
            # cancel the load the other callers are waiting on.
            return await asyncio.shield(pending)
        future: asyncio.Future[CachedValue] = asyncio.get_running_loop().create_future()
        self._in_flight[key] = future
        try:
            value = await load()
        except BaseException as error:
            # Only a cancellation or a broken `load` lands here; waiters hear it too.
            future.set_exception(error)
            # Retrieved here so an exception nobody else awaited isn't logged as lost.
            future.exception()
            raise
        else:
            future.set_result(value)
            self._store(key, value)
            return value
        finally:
            self._in_flight.pop(key, None)

    def clear(self) -> None:
        """Forget every cached value (tests; nothing in flight is affected)."""
        self._entries.clear()

    def _store(self, key: Hashable, value: CachedValue) -> None:
        self._entries[key] = (self._clock(), value)
        self._entries.move_to_end(key)
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)
