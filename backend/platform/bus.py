"""In-process event bus — the seam between Sentinel's sections.

Today every section (air/space/sea/land/sdr) and the core app run in one
FastAPI process, so a settings write can just call the function that needs to
react to it. That direct call is what makes `routers/settings.py`,
`services/app_config.py`, `database.py` and `routers/sdr.py` import each
other in a cycle (P1 decoupling plan). This module replaces the direct call
with a publish/subscribe indirection: a writer publishes a named event, and
whichever section cares about it subscribes independently — so the writer
never needs to import the reactor's module.

It is deliberately modelled on NATS subjects (dotted tokens, `*` for one
token, `>` for the remaining tokens) so that when a section is later split
into its own process/container, swapping this module for a real NATS client
is a drop-in change — the subject strings and handler signatures don't need
to change, only what sits behind `bus.publish`/`bus.subscribe`.

Scope: **low-rate control/state-change events only** (e.g. "a setting
changed", "a radio was reassigned"). Never route FFT/IQ/PCM streams through
this bus — those are high-rate binary data with their own fan-out path
(`services/sdr.py`'s per-radio broadcaster) and would swamp every handler.

Synchronous-by-design: `publish()` awaits every matching handler, in the
order it was subscribed, before returning — this preserves the exact
same-transaction timing the direct function calls it replaces had (a
publisher can rely on a handler having finished before it proceeds, e.g.
before returning an HTTP response). This is a deliberate trade-off for the
in-process seam; a NATS-backed bus would normally be fire-and-forget, and
`request()`/`reply()` exists for the one case that genuinely needs a reply.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

# A handler receives the event payload and returns nothing (publish/subscribe)
# or a reply payload (request/reply). Both sync and async callables are
# accepted — async is expected in practice since every handler here ends up
# touching the database.
EventPayload = dict[str, Any]
Handler = Callable[[EventPayload], "Awaitable[Any] | Any"]


def _tokens(subject: str) -> list[str]:
    return subject.split(".")


def _pattern_matches(pattern: str, subject: str) -> bool:
    """NATS-style subject matching: `*` matches exactly one token, `>` matches
    one-or-more remaining tokens and must be the pattern's last token."""
    pattern_tokens = _tokens(pattern)
    subject_tokens = _tokens(subject)
    for index, pattern_token in enumerate(pattern_tokens):
        if pattern_token == ">":
            # '>' must be the last token in the pattern and consumes the rest
            # of the subject — there must be at least one token left for it.
            return index == len(pattern_tokens) - 1 and index < len(subject_tokens)
        if index >= len(subject_tokens):
            return False
        if pattern_token != "*" and pattern_token != subject_tokens[index]:
            return False
    return len(pattern_tokens) == len(subject_tokens)


async def _invoke(handler: Handler, payload: EventPayload) -> Any:
    result = handler(payload)
    if asyncio.iscoroutine(result):
        return await result
    return result


class EventBus:
    """A minimal, in-process, NATS-shaped publish/subscribe/request bus.

    Not thread-safe (Sentinel's backend is single-process asyncio); every
    method must be called from the event loop.
    """

    def __init__(self) -> None:
        # Ordered so publish() can guarantee "subscription order" — a list of
        # (pattern, handler); subscribing twice registers two independent
        # entries (unsubscribe removes only the one returned).
        self._subscriptions: list[tuple[str, Handler]] = []

    def subscribe(self, pattern: str, handler: Handler) -> Callable[[], None]:
        """Register `handler` for every subject matching `pattern`.

        Returns an `unsubscribe()` callable. Registration is synchronous and
        has no dependency on the app lifespan — call it at module import time
        (see `routers/sdr.py`) so it also takes effect in tests, which skip
        the lifespan.
        """
        entry = (pattern, handler)
        self._subscriptions.append(entry)

        def unsubscribe() -> None:
            with_removed = [item for item in self._subscriptions if item is not entry]
            self._subscriptions[:] = with_removed

        return unsubscribe

    async def publish(self, subject: str, payload: EventPayload, *, raise_errors: bool = False) -> None:
        """Publish `payload` to every handler subscribed to a matching pattern.

        Handlers run sequentially, in subscription order, and are all
        awaited before this returns (see the module docstring for why).

        By default a handler's exception is logged and does not stop the
        remaining handlers or propagate to the caller — publishing an event
        must not be able to break the publisher. Pass `raise_errors=True`
        at a call site where, before this bus existed, the handler was called
        directly and an exception there was expected to surface as an HTTP
        error response (e.g. a 4xx/5xx) — that call site must keep failing
        the same way.
        """
        for pattern, handler in list(self._subscriptions):
            if not _pattern_matches(pattern, subject):
                continue
            if raise_errors:
                await _invoke(handler, payload)
            else:
                try:
                    await _invoke(handler, payload)
                except Exception:
                    logger.exception("event bus handler for %r failed on subject %r", pattern, subject)

    def reply(self, subject: str, handler: Handler) -> Callable[[], None]:
        """Register the (single) responder for `subject`, used with `request()`.

        A thin alias of `subscribe()` — kept as a distinct name so request/
        reply call sites read like request/reply, not fire-and-forget
        publish/subscribe, even though today's implementation is the same
        in-process dispatch either way.
        """
        return self.subscribe(subject, handler)

    async def request(self, subject: str, payload: EventPayload, timeout: float | None = 5.0) -> Any:
        """Call the first responder registered for `subject` via `reply()` and
        return its result, or raise `asyncio.TimeoutError` after `timeout`
        seconds or `LookupError` if nothing replies to `subject`.

        `timeout=None` waits for the responder however long it takes — for a
        responder whose own I/O is already bounded (e.g. the hub's Sentry
        calls, which carry the client's connect/read timeouts), where a second,
        shorter limit here would only cut off a slow-but-working answer.
        """
        for pattern, handler in list(self._subscriptions):
            if _pattern_matches(pattern, subject):
                return await asyncio.wait_for(_invoke(handler, payload), timeout=timeout)
        raise LookupError(f"no responder registered for subject {subject!r}")


# Process-wide singleton — every section imports this instance rather than
# constructing its own EventBus, so publishers and subscribers actually meet.
bus = EventBus()
