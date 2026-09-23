"""AISStream.io reader — the Sea domain's online vessel feed.

AISStream (https://aisstream.io) pushes AIS messages over a WebSocket, needs a
private API key and allows **one connection per key**, so this module keeps a
single long-lived socket per backend process and fans the result out through
:mod:`backend.services.ais_store` to the Sea router's snapshot endpoints.

The connection is driven by a watchdog rather than a naive reconnect loop:

* silence is *reported* quickly (``sea_ais_silence_report_ms``, 2 min) so a dead
  feed reads as dead on the map, but the socket is only *recycled* after
  ``sea_ais_recycle_ratio`` × that, because a reconnect storm against the
  one-connection-per-key limit is exactly how the feed gets locked out;
* transport failures walk a back-off ladder (``sea_ais_backoff_ms``) and then
  settle on a slow ``sea_ais_down_retry_ms`` cadence;
* a rejected key is a terminal state probed once an hour — retrying cannot fix a
  bad credential — and is cleared the moment the configured key changes.

The reader also consults the Sea settings (domain enabled, effective source,
bounding boxes, API key) on every tick, so a change made in Settings › SEA takes
effect within one tick without a restart.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlsplit

import websockets
from backend.cache import now_ms
from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.db_helpers import get_setting
from backend.services.ais_store import AisVesselStore, store
from backend.utils import resolve_domain_urls, resolve_effective_mode

logger = logging.getLogger(__name__)

# Message types worth subscribing to: the three position-report kinds plus the
# two static-data kinds that carry names, types and destinations.
DEFAULT_MESSAGE_TYPES: tuple[str, ...] = (
    "PositionReport",
    "StandardClassBPositionReport",
    "ExtendedClassBPositionReport",
    "ShipStaticData",
    "StaticDataReport",
)
# Whole-world subscription, in AISStream's [[[south, west], [north, east]]] shape.
WORLD_BOUNDING_BOXES: list[list[list[float]]] = [[[-90.0, -180.0], [90.0, 180.0]]]

# Substrings AISStream uses in its error envelopes when the key is rejected.
_AUTH_ERROR_MARKERS = ("api key", "apikey", "unauthorized", "invalid key", "authentication")
_RATE_ERROR_MARKERS = ("too many", "rate", "connection limit", "already connected")

FeedStatus = str  # 'disabled' | 'no-source' | 'missing-key' | 'connecting' | 'live' | 'stale'
#                 | 'reconnecting' | 'down' | 'auth-failed' | 'unsupported-source'


class AisStreamAuthError(Exception):
    """AISStream rejected the API key."""


def validate_bounding_boxes(value: object) -> list[list[list[float]]] | None:
    """Return a cleaned ``[[[south, west], [north, east]], …]`` list, or None if invalid.

    The value comes from a user setting (Settings › SEA "Coverage area"), so it
    is validated here rather than trusted: each box must be two lat/lon pairs
    inside ±90/±180, and the list is capped at ``sea_ais_max_bounding_boxes``.
    """
    if not isinstance(value, list) or not value or len(value) > settings.sea_ais_max_bounding_boxes:
        return None
    cleaned: list[list[list[float]]] = []
    for box in value:
        if not isinstance(box, list) or len(box) != 2:
            return None
        corners: list[list[float]] = []
        for corner in box:
            if not isinstance(corner, list) or len(corner) != 2:
                return None
            try:
                latitude, longitude = float(corner[0]), float(corner[1])
            except (TypeError, ValueError):
                return None
            if abs(latitude) > 90 or abs(longitude) > 180:
                return None
            corners.append([latitude, longitude])
        if corners[0][0] > corners[1][0]:
            return None  # south must not exceed north
        cleaned.append(corners)
    return cleaned


def classify_error_text(text: str) -> str:
    """Bucket an AISStream error message: ``'auth'``, ``'rate'`` or ``'transport'``."""
    lowered = text.lower()
    if any(marker in lowered for marker in _AUTH_ERROR_MARKERS):
        return "auth"
    if any(marker in lowered for marker in _RATE_ERROR_MARKERS):
        return "rate"
    return "transport"


def key_fingerprint(api_key: str) -> str | None:
    """A truncated digest of the key — enough to notice a change, never the key itself."""
    if not api_key:
        return None
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]


class AisStreamReader:
    """One AISStream connection plus its watchdog, feeding an :class:`AisVesselStore`.

    ``connect`` and ``clock`` are injectable so the watchdog ladder can be
    tested end-to-end with a fake socket and a fake clock.
    """

    def __init__(
        self,
        vessel_store: AisVesselStore | None = None,
        *,
        connect: Callable[[str], Awaitable[Any]] | None = None,
        clock: Callable[[], int] | None = None,
    ) -> None:
        self.store = vessel_store if vessel_store is not None else store
        self._connect = connect or self._default_connect
        self._now = clock or now_ms
        self._socket_task: asyncio.Task[None] | None = None
        self._tick_task: asyncio.Task[None] | None = None
        self._socket: Any = None
        self._generation = 0
        self.status: FeedStatus = "disabled"
        self.error: str | None = None
        self.last_message_at: int | None = None
        self.connected_at: int | None = None
        self.reconnect_attempt = 0
        self.next_attempt_at: int | None = None
        self.auth_failed_fingerprint: str | None = None
        self._subscription_fingerprint: str | None = None
        self._last_persist_at: int = 0
        self.source_label = "AISStream"

    # ── lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Warm the store from SQLite and start the watchdog tick."""
        try:
            loaded = await self.store.load_snapshot(self._now())
            if loaded:
                logger.info("Sea: restored %d vessels from the last snapshot", loaded)
        except Exception:
            logger.exception("Sea: could not restore the vessel snapshot")
        if self._tick_task is None:
            self._tick_task = asyncio.create_task(self._tick_loop())

    async def stop(self) -> None:
        """Tear down the socket and the tick, and persist the final picture."""
        if self._tick_task is not None:
            self._tick_task.cancel()
            try:
                await self._tick_task
            except asyncio.CancelledError:
                pass
            self._tick_task = None
        await self._close_socket()
        try:
            await self.store.persist_snapshot(force=True)
        except Exception:
            logger.exception("Sea: could not persist the vessel snapshot on shutdown")

    def wake(self) -> None:
        """Signal-handler hook: abandon the socket so shutdown never waits on it."""
        if self._socket_task is not None:
            self._socket_task.cancel()

    async def _tick_loop(self) -> None:
        while True:
            try:
                await self.ensure()
            except Exception:
                logger.exception("Sea: AIS watchdog tick failed")
            await asyncio.sleep(settings.sea_ais_tick_ms / 1000)

    # ── the watchdog ──────────────────────────────────────────────────────────

    async def ensure(self) -> FeedStatus:
        """Drive the connection one step from the current settings and feed state.

        Called by the tick and by the Sea router on every snapshot request, so
        recovery never depends on browser traffic but also happens promptly
        when someone is actually looking.
        """
        config = await self._read_config()
        current = self._now()
        # Runs every tick, so a source switch empties the store promptly even
        # when no browser is polling.
        await self.store.switch_source(config["source_mode"])
        # Expiry sweep lives here, once a tick, rather than per message.
        self.store.prune(current)

        if not config["enabled"] or config["mode"] == "no-source":
            await self._close_socket()
            self.status = "disabled" if not config["enabled"] else "no-source"
            self.error = None
            return self.status
        if config["mode"] == "unsupported-source":
            await self._close_socket()
            self.status = "unsupported-source"
            self.error = f"Off-grid source {config['url']!r} is not a supported AIS feed (use wss://)"
            return self.status
        if not config["api_key"]:
            await self._close_socket()
            self.status = "missing-key"
            self.error = "No AISStream API key configured — add one in Settings › SEA or AISSTREAM_API_KEY"
            return self.status

        fingerprint = key_fingerprint(config["api_key"])
        if self.auth_failed_fingerprint and self.auth_failed_fingerprint != fingerprint:
            # A different key clears the terminal state so it gets a fresh try.
            self.auth_failed_fingerprint = None
            self.reconnect_attempt = 0
            self.next_attempt_at = None

        subscription = self._build_subscription(config)
        subscription_fingerprint = hashlib.sha256(
            json.dumps({**subscription, "APIKey": fingerprint}, sort_keys=True).encode("utf-8")
        ).hexdigest()

        if self._socket_task is not None and not self._socket_task.done():
            if self._subscription_fingerprint != subscription_fingerprint:
                logger.info("Sea: AIS subscription changed — recycling the socket")
                await self._close_socket()
            else:
                self._evaluate_silence(current)
                await self._maybe_persist(current)
                return self.status

        if self.auth_failed_fingerprint == fingerprint:
            self.status = "auth-failed"
            if self.next_attempt_at is not None and current < self.next_attempt_at:
                return self.status
        elif self.next_attempt_at is not None and current < self.next_attempt_at:
            self.status = "reconnecting" if self.reconnect_attempt <= len(settings.sea_ais_backoff_ms) else "down"
            await self._maybe_persist(current)
            return self.status

        self._subscription_fingerprint = subscription_fingerprint
        self._generation += 1
        self.status = "connecting"
        self.error = None
        self._socket_task = asyncio.create_task(
            self._run_socket(config["url"], subscription, fingerprint, self._generation)
        )
        return self.status

    def _evaluate_silence(self, current: int) -> None:
        reference = self.last_message_at or self.connected_at
        if reference is None:
            return
        silent_for = current - reference
        recycle_after = int(settings.sea_ais_silence_report_ms * settings.sea_ais_recycle_ratio)
        if silent_for >= recycle_after:
            logger.warning("Sea: AIS feed silent for %d s — recycling the socket", silent_for // 1000)
            self.error = "feed silent — reconnecting"
            self.status = "reconnecting"
            self._schedule_retry(current, transport_failure=True)
            if self._socket_task is not None:
                self._socket_task.cancel()
        elif silent_for >= settings.sea_ais_silence_report_ms:
            self.status = "stale"
            self.error = f"no AIS traffic for {silent_for // 1000} s"
        elif self.status in ("stale", "connecting") and self.last_message_at is not None:
            self.status = "live"
            self.error = None

    def _schedule_retry(self, current: int, *, transport_failure: bool, auth_failure: bool = False) -> None:
        if auth_failure:
            self.next_attempt_at = current + settings.sea_ais_auth_probe_ms
            return
        if not transport_failure:
            self.next_attempt_at = current
            return
        ladder = settings.sea_ais_backoff_ms
        self.reconnect_attempt += 1
        if self.reconnect_attempt <= len(ladder):
            delay = ladder[self.reconnect_attempt - 1]
            self.status = "reconnecting"
        else:
            delay = settings.sea_ais_down_retry_ms
            self.status = "down"
        self.next_attempt_at = current + delay

    async def _maybe_persist(self, current: int) -> None:
        if current - self._last_persist_at < settings.sea_ais_snapshot_persist_ms:
            return
        self._last_persist_at = current
        try:
            await self.store.persist_snapshot()
        except Exception:
            logger.exception("Sea: vessel snapshot persist failed")

    # ── the socket ────────────────────────────────────────────────────────────

    async def _run_socket(
        self, url: str, subscription: dict[str, Any], fingerprint: str | None, generation: int
    ) -> None:
        try:
            socket = await self._connect(url)
            if generation != self._generation:
                await _close_quietly(socket)
                return
            self._socket = socket
            self.connected_at = self._now()
            await socket.send(json.dumps(subscription))
            async for frame in socket:
                if generation != self._generation:
                    break
                self._handle_frame(frame)
            # A clean upstream close is still a transport failure from the map's
            # point of view — there is no data until we reconnect.
            if generation == self._generation:
                self.error = "AISStream closed the connection"
                self._schedule_retry(self._now(), transport_failure=True)
        except asyncio.CancelledError:
            raise
        except AisStreamAuthError as exc:
            self.error = str(exc)
            self.status = "auth-failed"
            self.auth_failed_fingerprint = fingerprint
            self._schedule_retry(self._now(), transport_failure=False, auth_failure=True)
            logger.error("Sea: AISStream rejected the API key: %s", exc)
        except Exception as exc:  # noqa: BLE001 — every transport failure lands here
            if generation == self._generation:
                self.error = str(exc) or exc.__class__.__name__
                self._schedule_retry(self._now(), transport_failure=True)
                logger.warning(
                    "Sea: AISStream connection failed (%s); next attempt in %d s", self.error, self._retry_in_s()
                )
        finally:
            if generation == self._generation:
                await _close_quietly(self._socket)
                self._socket = None
                self.connected_at = None

    def _handle_frame(self, frame: str | bytes) -> None:
        try:
            envelope = json.loads(frame)
        except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
            return
        if not isinstance(envelope, dict):
            return
        error_text = envelope.get("error")
        if isinstance(error_text, str) and error_text:
            kind = classify_error_text(error_text)
            if kind == "auth":
                raise AisStreamAuthError(error_text)
            self.error = error_text
            logger.warning("Sea: AISStream error envelope: %s", error_text)
            return
        if self.store.ingest_envelope(envelope, self._now()):
            self.last_message_at = self._now()
            if self.status != "live":
                self.status = "live"
                self.error = None
                self.reconnect_attempt = 0
                self.next_attempt_at = None

    async def _close_socket(self) -> None:
        self._generation += 1
        task = self._socket_task
        self._socket_task = None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        await _close_quietly(self._socket)
        self._socket = None
        self.connected_at = None

    @staticmethod
    async def _default_connect(url: str) -> Any:
        # Ping/pong keeps NAT tables warm; AISStream itself is silent between
        # messages only when the subscription really is empty.
        return await websockets.connect(url, ping_interval=20, ping_timeout=20, max_size=1_000_000, open_timeout=15)

    # ── configuration ─────────────────────────────────────────────────────────

    async def _read_config(self) -> dict[str, Any]:
        async with AsyncSessionLocal() as db:
            enabled = bool(await get_setting(db, "sea", "enabled", default=False))
            primary_url, _fallback = await resolve_domain_urls("sea", db, online_default=settings.aisstream_ws_url)
            configured_key = await get_setting(db, "sea", "aisstreamApiKey", default="")
            raw_boxes = await get_setting(db, "sea", "aisBoundingBoxes", default=None)
            source_mode = await resolve_effective_mode("sea", db)
        api_key = configured_key.strip() if isinstance(configured_key, str) and configured_key.strip() else ""
        api_key = api_key or settings.aisstream_api_key.strip()
        boxes = validate_bounding_boxes(raw_boxes) or WORLD_BOUNDING_BOXES
        if primary_url is None:
            mode = "no-source"
        elif urlsplit(primary_url).scheme in ("ws", "wss"):
            mode = "aisstream"
        else:
            mode = "unsupported-source"
        return {
            "enabled": enabled,
            "url": primary_url,
            "mode": mode,
            "api_key": api_key,
            "bounding_boxes": boxes,
            "source_mode": source_mode,
        }

    @staticmethod
    def _build_subscription(config: dict[str, Any]) -> dict[str, Any]:
        return {
            "APIKey": config["api_key"],
            "BoundingBoxes": config["bounding_boxes"],
            "FilterMessageTypes": list(DEFAULT_MESSAGE_TYPES),
        }

    # ── status ────────────────────────────────────────────────────────────────

    def _retry_in_s(self) -> int:
        if self.next_attempt_at is None:
            return 0
        return max(0, (self.next_attempt_at - self._now()) // 1000)

    def snapshot(self) -> dict[str, Any]:
        """Status metadata for the Sea snapshot endpoints (never includes the key)."""
        current = self._now()
        reference = self.last_message_at or self.connected_at
        return {
            "source": self.source_label,
            "status": self.status,
            "error": self.error,
            "lastMessageAt": self.last_message_at,
            "silentForMs": (current - reference) if reference is not None else None,
            "reconnectAttempt": self.reconnect_attempt,
            "nextAttemptAt": self.next_attempt_at,
            "staleAfterMs": settings.sea_ais_silence_report_ms,
            "retentionMs": settings.sea_ais_stale_ms,
            "newestPositionAt": self.store.newest_position_ms,
            "vesselCount": len(self.store),
        }


async def _close_quietly(socket: Any) -> None:
    if socket is None:
        return
    try:
        await socket.close()
    except Exception:  # noqa: BLE001 — a close that fails is a socket already gone
        pass


# Process-wide reader, started from the app lifespan.
reader = AisStreamReader()
