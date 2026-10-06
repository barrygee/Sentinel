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
(`radio_hub/services/sdr.py`'s per-radio broadcaster) and would swamp every handler.

Synchronous-by-design: `publish()` awaits every matching handler, in the
order it was subscribed, before returning — this preserves the exact
same-transaction timing the direct function calls it replaces had (a
publisher can rely on a handler having finished before it proceeds, e.g.
before returning an HTTP response). This is a deliberate trade-off for the
in-process seam; a NATS-backed bus would normally be fire-and-forget, and
`request()`/`reply()` exists for the one case that genuinely needs a reply.

Out-of-process delivery (P5.2): when a `RemoteTransport` is attached (NATS,
`backend/platform/nats_transport.py`, started by `backend/modules/bus.py`
when `NATS_URL` is set), the bus keeps the synchronous local delivery above
and ALSO forwards every publish to the transport, so handlers in other
processes see it; it delivers messages from other processes to the local
handlers; and a `request()` with no local responder goes over the wire.
Local always wins, so the single-process app behaves byte-for-byte as it did
before NATS existed, with or without a broker.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any, NamedTuple, Protocol

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


class Subscription(NamedTuple):
    """One local registration: a handler, the pattern it listens on, and
    whether it was registered with `reply()` (a responder) or `subscribe()`."""

    pattern: str
    handler: Handler
    is_responder: bool


class RemoteTransport(Protocol):
    """What the bus needs from an out-of-process transport (NATS today)."""

    def watch(self, subscription: Subscription) -> None:
        """Start receiving remote messages for a local subscription."""

    def unwatch(self, subscription: Subscription) -> None:
        """Stop receiving remote messages for a local subscription."""

    async def forward(self, subject: str, payload: EventPayload) -> None:
        """Send a publish to the other processes; must never raise."""

    async def request(self, subject: str, payload: EventPayload, timeout: float | None) -> Any:
        """Ask a responder in another process; raises `LookupError` when none
        answers `subject` and `asyncio.TimeoutError` when it answers too late."""


class EventBus:
    """A minimal, in-process, NATS-shaped publish/subscribe/request bus.

    Not thread-safe (Sentinel's backend is single-process asyncio); every
    method must be called from the event loop.
    """

    def __init__(self) -> None:
        # Ordered so publish() can guarantee "subscription order"; subscribing
        # twice registers two independent entries (unsubscribe removes only
        # the one returned).
        self._subscriptions: list[Subscription] = []
        self._remote: RemoteTransport | None = None

    @property
    def remote(self) -> RemoteTransport | None:
        """The attached out-of-process transport, or None when in-process only."""
        return self._remote

    def attach_remote(self, remote: RemoteTransport) -> None:
        """Start forwarding to (and receiving from) `remote`.

        Every subscription made so far — most are made at module import, long
        before the lifespan connects a transport — is watched at once.
        """
        self._remote = remote
        for subscription in self._subscriptions:
            remote.watch(subscription)

    def detach_remote(self) -> None:
        """Go back to in-process only (shutdown, or a test tearing down)."""
        remote, self._remote = self._remote, None
        if remote is not None:
            for subscription in self._subscriptions:
                remote.unwatch(subscription)

    def subscribe(self, pattern: str, handler: Handler) -> Callable[[], None]:
        """Register `handler` for every subject matching `pattern`.

        Returns an `unsubscribe()` callable. Registration is synchronous and
        has no dependency on the app lifespan — call it at module import time
        (see `radio_hub/routers/decode.py`) so it also takes effect in tests, which skip
        the lifespan.
        """
        return self._register(Subscription(pattern, handler, is_responder=False))

    def _register(self, entry: Subscription) -> Callable[[], None]:
        self._subscriptions.append(entry)
        if self._remote is not None:
            self._remote.watch(entry)

        def unsubscribe() -> None:
            with_removed = [item for item in self._subscriptions if item is not entry]
            if len(with_removed) != len(self._subscriptions) and self._remote is not None:
                self._remote.unwatch(entry)
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

        With a remote transport attached the event is then forwarded to the
        other processes (after every local handler, and only if none raised
        with `raise_errors=True`). Their handlers run on their own time — the
        synchronous guarantee is local only.
        """
        for pattern, handler, _ in list(self._subscriptions):
            if not _pattern_matches(pattern, subject):
                continue
            if raise_errors:
                await _invoke(handler, payload)
            else:
                try:
                    await _invoke(handler, payload)
                except Exception:
                    logger.exception("event bus handler for %r failed on subject %r", pattern, subject)
        if self._remote is not None:
            await self._remote.forward(subject, payload)

    async def deliver_remote(self, subscription: Subscription, subject: str, payload: EventPayload) -> None:
        """Run one local handler for a message another process published.

        Called by the transport, once per watched subscription, so a handler
        whose pattern overlaps another's still sees each message exactly once.
        Errors are logged — there is no publisher here to fail.
        """
        try:
            await _invoke(subscription.handler, payload)
        except Exception:
            logger.exception("event bus handler for %r failed on remote subject %r", subscription.pattern, subject)

    def reply(self, subject: str, handler: Handler) -> Callable[[], None]:
        """Register the (single) responder for `subject`, used with `request()`.

        A thin alias of `subscribe()` — kept as a distinct name so request/
        reply call sites read like request/reply, not fire-and-forget
        publish/subscribe, even though today's implementation is the same
        in-process dispatch either way.
        """
        return self._register(Subscription(subject, handler, is_responder=True))

    async def request(self, subject: str, payload: EventPayload, timeout: float | None = 5.0) -> Any:
        """Call the first responder registered for `subject` via `reply()` and
        return its result, or raise `asyncio.TimeoutError` after `timeout`
        seconds or `LookupError` if nothing replies to `subject`.

        `timeout=None` waits for the responder however long it takes — for a
        responder whose own I/O is already bounded (e.g. the hub's Sentry
        calls, which carry the client's connect/read timeouts), where a second,
        shorter limit here would only cut off a slow-but-working answer.

        A responder in this process always answers; only when there is none
        does the request go to the remote transport (if one is attached).
        """
        handler = self._local_responder(subject)
        if handler is not None:
            return await asyncio.wait_for(_invoke(handler, payload), timeout=timeout)
        if self._remote is not None:
            return await self._remote.request(subject, payload, timeout)
        raise LookupError(f"no responder registered for subject {subject!r}")

    async def answer_remote(self, subject: str, payload: EventPayload) -> Any:
        """Answer a request another process sent, with this process's own
        first responder; `LookupError` if it has none (it unsubscribed while
        the request was in flight)."""
        handler = self._local_responder(subject)
        if handler is None:
            raise LookupError(f"no responder registered for subject {subject!r}")
        return await _invoke(handler, payload)

    def _local_responder(self, subject: str) -> Handler | None:
        # Every local subscription is eligible, as before NATS: reply() has
        # always been a thin alias of subscribe() for in-process dispatch.
        for pattern, handler, _ in self._subscriptions:
            if _pattern_matches(pattern, subject):
                return handler
        return None


# Process-wide singleton — every section imports this instance rather than
# constructing its own EventBus, so publishers and subscribers actually meet.
bus = EventBus()
