"""NATS behind the event bus — how bus events cross process boundaries (P5.2).

`backend/platform/bus.py` delivers every event to the handlers in this
process first, synchronously, exactly as it did before NATS existed. This
transport adds the out-of-process half: it forwards each publish to NATS for
handlers in other processes, delivers their publishes to ours, and carries a
`bus.request()` that nothing in this process answers to whichever process
does (plan §3.3). Only NATS core is used — no JetStream — because every
consumer reconciles level-triggered on restart.

Payloads cross the wire as JSON. The one process-local value a payload may
carry is the publisher's database session (`db`, see `settings_client.py`):
it is dropped on the way out, and the receiving side opens a session of its
own and puts it under the same key, so handlers keep their signatures. That
is safe because every publisher commits before it publishes.

A reply crosses as `{"ok": true, "result": …}` or `{"ok": false, "error": …}`
— a raised exception can't cross the wire, so the requester re-raises the
latter as `RemoteHandlerError`.

Losing the broker never breaks a publisher or blocks startup: `start()`
gives the first connection a short head start and otherwise leaves nats-py
retrying in the background (it never gives up, first connection included)
while the app runs in-process only. Forwarding failures are logged.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import Any

from backend.platform.bus import EventBus, EventPayload, Subscription
from nats.aio.client import Client as NatsClient
from nats.aio.msg import Msg
from nats.aio.subscription import Subscription as NatsSubscription
from nats.errors import NoRespondersError
from nats.errors import TimeoutError as NatsTimeoutError

logger = logging.getLogger(__name__)

PROCESS_LOCAL_KEYS = ("db",)
"""Payload keys that only mean something inside the publishing process."""

RESPONDER_QUEUE = "sentinel-responders"
"""Queue group for responders, so one request gets one answer however many
processes (or replicas) can give it."""

UNBOUNDED_REQUEST_TIMEOUT_S = 300.0
"""NATS needs a request timeout; `bus.request(timeout=None)` means the
responder bounds its own I/O, so this is only a backstop."""

STARTUP_CONNECT_WAIT_S = 2.0
"""How long `start()` waits for the first connection before carrying on
in-process; the connection keeps being attempted after that."""

RECONNECT_WAIT_S = 5
"""Seconds between connection attempts while the broker is unreachable."""

SessionOpener = Callable[[], AbstractAsyncContextManager[Any]]


class RemoteHandlerError(RuntimeError):
    """The responder in another process raised; its message is carried over."""


def encode_payload(payload: EventPayload) -> bytes:
    """JSON-encode a payload for the wire, without its process-local keys.

    Raises `TypeError` when a value is not JSON-serialisable.
    """
    wire_payload = {key: value for key, value in payload.items() if key not in PROCESS_LOCAL_KEYS}
    return json.dumps(wire_payload, separators=(",", ":")).encode()


def decode_payload(data: bytes) -> EventPayload:
    """Decode a wire payload; raises `ValueError` unless it is a JSON object (empty means `{}`)."""
    decoded = json.loads(data or b"{}")
    if not isinstance(decoded, dict):
        raise ValueError("bus payload must be a JSON object")
    return decoded


class NatsTransport:
    """The bus's `RemoteTransport` over one NATS connection."""

    def __init__(self, bus: EventBus, url: str, *, client_name: str, open_session: SessionOpener | None) -> None:
        self._bus = bus
        self._url = url
        self._client_name = client_name
        self._open_session = open_session
        self._client = NatsClient()
        self._nats_subscriptions: dict[int, NatsSubscription] = {}
        # watch()/unwatch() are synchronous (bus.subscribe is) but NATS
        # subscribing is not, so they queue tasks; kept so none is garbage
        # collected mid-flight and stop() can wait for them.
        self._pending: set[asyncio.Task[None]] = set()
        self._connect_task: asyncio.Task[None] | None = None
        # Repeated identical connection errors are logged once, not every
        # RECONNECT_WAIT_S for as long as the broker is down.
        self._last_error_text: str | None = None

    @property
    def connected(self) -> bool:
        return self._client.is_connected

    async def start(self) -> None:
        """Connect and attach to the bus, waiting at most `STARTUP_CONNECT_WAIT_S`.

        A reachable broker is attached before this returns, so the modules
        started after it publish onto a connected bus. An unreachable one is
        retried in the background for as long as the app runs.
        """
        self._connect_task = asyncio.create_task(self._connect())
        done, _ = await asyncio.wait({self._connect_task}, timeout=STARTUP_CONNECT_WAIT_S)
        if not done:
            logger.warning("NATS at %s not reachable yet; events stay in-process until it is", self._url)

    async def _connect(self) -> None:
        await self._client.connect(
            self._url,
            name=self._client_name,
            # Local handlers already ran synchronously in publish(); hearing
            # our own publish back from NATS would run them a second time.
            no_echo=True,
            # Never give up — on the first connection or after losing one.
            max_reconnect_attempts=-1,
            reconnect_time_wait=RECONNECT_WAIT_S,
            error_cb=self._on_error,
            disconnected_cb=self._on_disconnected,
            reconnected_cb=self._on_reconnected,
        )
        self._last_error_text = None
        self._bus.attach_remote(self)
        await self._settle()
        logger.info("event bus connected to NATS at %s", self._url)

    async def stop(self) -> None:
        """Detach from the bus and close the connection (or stop connecting)."""
        if self._connect_task is not None and not self._connect_task.done():
            self._connect_task.cancel()
            await asyncio.gather(self._connect_task, return_exceptions=True)
        self._connect_task = None
        if self._bus.remote is self:
            self._bus.detach_remote()
        await self._settle()
        await self._client.close()

    # ── RemoteTransport ────────────────────────────────────────────────

    def watch(self, subscription: Subscription) -> None:
        self._spawn(self._watch(subscription))

    def unwatch(self, subscription: Subscription) -> None:
        self._spawn(self._unwatch(subscription))

    async def forward(self, subject: str, payload: EventPayload) -> None:
        client = self._client
        try:
            data = encode_payload(payload)
        except TypeError as error:
            logger.warning("not forwarding %r to NATS: payload is not JSON-serialisable (%s)", subject, error)
            return
        try:
            await client.publish(subject, data)
        except Exception:
            # Never break the publisher: its local handlers have already run.
            logger.exception("could not forward %r to NATS", subject)

    async def request(self, subject: str, payload: EventPayload, timeout: float | None) -> Any:
        client = self._client
        try:
            message = await client.request(
                subject,
                encode_payload(payload),
                timeout=UNBOUNDED_REQUEST_TIMEOUT_S if timeout is None else timeout,
            )
        except NoRespondersError as error:
            raise LookupError(f"no responder registered for subject {subject!r}") from error
        except NatsTimeoutError as error:
            raise TimeoutError(f"no reply on {subject!r} within {timeout} s") from error
        reply = decode_payload(message.data)
        if not reply.get("ok"):
            raise RemoteHandlerError(str(reply.get("error", "remote handler failed")))
        return reply.get("result")

    # ── internals ──────────────────────────────────────────────────────

    def _spawn(self, coroutine: Any) -> None:
        task = asyncio.get_running_loop().create_task(coroutine)
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    async def _settle(self) -> None:
        if self._pending:
            await asyncio.gather(*self._pending, return_exceptions=True)

    async def _watch(self, subscription: Subscription) -> None:
        client = self._client
        if subscription.is_responder:

            async def on_request(message: Msg) -> None:
                await self._answer(message)

            nats_subscription = await client.subscribe(subscription.pattern, queue=RESPONDER_QUEUE, cb=on_request)
        else:

            async def on_event(message: Msg) -> None:
                await self._deliver(subscription, message)

            nats_subscription = await client.subscribe(subscription.pattern, cb=on_event)
        self._nats_subscriptions[id(subscription)] = nats_subscription

    async def _unwatch(self, subscription: Subscription) -> None:
        nats_subscription = self._nats_subscriptions.pop(id(subscription), None)
        if nats_subscription is None:
            return
        try:
            await nats_subscription.unsubscribe()
        except Exception:
            # The connection may already be closing; the server drops the
            # interest with it.
            logger.debug("NATS unsubscribe of %r failed", subscription.pattern, exc_info=True)

    async def _with_session(self, payload: EventPayload, run: Callable[[EventPayload], Any]) -> Any:
        """Run `run(payload)` with a fresh local session under `db`."""
        if self._open_session is None:
            return await run(payload)
        async with self._open_session() as session:
            return await run({**payload, "db": session})

    async def _deliver(self, subscription: Subscription, message: Msg) -> None:
        try:
            payload = decode_payload(message.data)
        except ValueError:
            logger.warning("dropping malformed bus event on %r", message.subject)
            return

        async def run(local_payload: EventPayload) -> None:
            await self._bus.deliver_remote(subscription, message.subject, local_payload)

        try:
            await self._with_session(payload, run)
        except Exception:
            logger.exception("could not open a session for bus event %r", message.subject)

    async def _answer(self, message: Msg) -> None:
        try:
            payload = decode_payload(message.data)

            async def run(local_payload: EventPayload) -> Any:
                return await self._bus.answer_remote(message.subject, local_payload)

            reply: dict[str, Any] = {"ok": True, "result": await self._with_session(payload, run)}
            data = json.dumps(reply, separators=(",", ":")).encode()
        except Exception as error:
            logger.exception("bus responder for %r failed", message.subject)
            data = json.dumps({"ok": False, "error": str(error) or type(error).__name__}).encode()
        await message.respond(data)

    async def _on_error(self, error: Exception) -> None:
        error_text = str(error) or type(error).__name__
        if error_text != self._last_error_text:
            logger.warning("NATS error: %s", error_text)
        self._last_error_text = error_text

    async def _on_disconnected(self) -> None:
        logger.warning("event bus disconnected from NATS; local delivery continues")

    async def _on_reconnected(self) -> None:
        logger.info("event bus reconnected to NATS")
