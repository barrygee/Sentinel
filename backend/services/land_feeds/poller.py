"""Background poller for Land live feeds.

One asyncio task per **enabled** feed, started/stopped by the app lifespan and
resynced whenever `land.feeds` is written (Settings UI, config upload, or a
raw `PUT /api/settings/land/feeds`). Each task calls its adapter on a timer —
`max(config.refreshSeconds, adapter.min_interval_seconds)` — and writes the
result into an in-memory store; `GET /api/land/feeds/{id}/features` only ever
reads that store, it never triggers a fetch itself, so a slow or misbehaving
upstream can't turn into a slow map request.

Image/clip bytes ARE fetched on the request path (that's what the proxy is
for), but are cached for a short window (`_IMAGE_CACHE_SECONDS`) so a burst of
near-simultaneous requests for the same camera doesn't multiply into a burst
of upstream calls.
"""

from __future__ import annotations

import asyncio
import logging
import time

from backend.cache import is_fresh, is_within_stale, now_ms
from backend.database import AsyncSessionLocal
from backend.db_helpers import get_setting
from backend.services.land_feeds import credentials
from backend.services.land_feeds.base import FeedOffline, FeedRefNotFound, FeedUpstreamError
from backend.services.land_feeds.registry import get_adapter
from backend.services.land_feeds.schema import FeedConfig, FeedSnapshot, ProbeResult

logger = logging.getLogger(__name__)

# Error back-off: starts at the feed's own refresh interval (no point retrying
# faster than the feed would have polled anyway) and doubles up to this cap.
_MAX_BACKOFF_SECONDS = 900.0  # 15 minutes
# How long a feed's snapshot is considered "fresh" past its own refresh
# interval, and how long it can still be served STALE if the poller falls
# behind (a task wedged on a slow upstream, or briefly during a restart).
_STALE_WINDOW_MS = 30 * 60 * 1000
# How long a proxied image/clip's bytes are reused for repeat requests.
_IMAGE_CACHE_SECONDS = 20.0


class FeedStatus:
    """Runtime status for one configured feed — never includes the credential."""

    __slots__ = ("last_fetch_at", "last_error", "feature_count", "running")

    def __init__(self) -> None:
        self.last_fetch_at: int | None = None
        self.last_error: str | None = None
        self.feature_count: int = 0
        self.running: bool = False

    def as_dict(self) -> dict:
        return {
            "lastFetchAt": self.last_fetch_at,
            "lastError": self.last_error,
            "featureCount": self.feature_count,
            "running": self.running,
        }


def _sanitised_error(exc: Exception) -> str:
    """A short, safe status message — never the upstream response body, which
    could carry provider-internal detail or reflect back request content."""
    label = exc.__class__.__name__
    text = str(exc).strip()
    # Keep messages short and drop anything that looks like a URL/host, which
    # would otherwise leak the upstream base URL (itself not secret, but not
    # something a status field needs to echo either).
    if not text or len(text) > 160:
        return label
    return f"{label}: {text[:160]}"


class LandFeedsPoller:
    """Owns the background fetch tasks, the in-memory snapshot store, and the
    short-lived image/clip byte cache for Land live feeds."""

    def __init__(self) -> None:
        self._configs: dict[str, FeedConfig] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._snapshots: dict[str, FeedSnapshot] = {}
        self._status: dict[str, FeedStatus] = {}
        self._image_cache: dict[tuple[str, str, str], tuple[bytes, str, float]] = {}

    # ── lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Load `land.feeds` and start a task for every enabled feed."""
        async with AsyncSessionLocal() as db:
            raw_feeds = await get_setting(db, "land", "feeds", default=[])
        await self.resync(raw_feeds if isinstance(raw_feeds, list) else [])

    async def stop(self) -> None:
        """Cancel every running fetch task. Safe to call repeatedly."""
        tasks = list(self._tasks.values())
        self._tasks.clear()
        for task in tasks:
            task.cancel()
        for task in tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def resync(self, raw_feeds: list) -> None:
        """Reconcile running tasks against a fresh `land.feeds` list.

        Called once at startup and again after every settings write that
        touches `land.feeds`. Invalid entries are skipped defensively (the
        settings router already validates on write, so this is a second line
        of defence, not the primary gate) rather than aborting the whole sync.
        """
        parsed: dict[str, FeedConfig] = {}
        for entry in raw_feeds:
            if not isinstance(entry, dict):
                continue
            try:
                config = FeedConfig(**entry)
            except Exception:
                logger.warning("Land feeds: skipping an invalid feed config entry")
                continue
            parsed[config.id] = config

        removed_ids = set(self._configs) - set(parsed)
        for feed_id in removed_ids:
            await self._stop_feed(feed_id)
            self._snapshots.pop(feed_id, None)
            self._status.pop(feed_id, None)

        self._configs = parsed
        for feed_id, config in parsed.items():
            task = self._tasks.get(feed_id)
            currently_running = task is not None and not task.done()
            if not config.enabled:
                if currently_running:
                    await self._stop_feed(feed_id)
                    self._snapshots[feed_id] = FeedSnapshot.empty()
                self._status.setdefault(feed_id, FeedStatus())
                continue
            if currently_running:
                continue  # already polling this feed; the task reads fresh config each tick
            self._status[feed_id] = self._status.get(feed_id, FeedStatus())
            self._tasks[feed_id] = asyncio.create_task(self._run_feed(feed_id))

    async def _stop_feed(self, feed_id: str) -> None:
        task = self._tasks.pop(feed_id, None)
        if task is None:
            return
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
        status = self._status.get(feed_id)
        if status is not None:
            status.running = False

    # ── the poll loop ─────────────────────────────────────────────────────────

    async def _run_feed(self, feed_id: str) -> None:
        status = self._status[feed_id]
        status.running = True
        backoff_seconds = None
        try:
            while True:
                config = self._configs.get(feed_id)
                if config is None or not config.enabled:
                    return  # resync() already handles teardown; just stop looping
                adapter = get_adapter(config.provider)
                interval = max(config.refresh_seconds, adapter.min_interval_seconds)

                async with AsyncSessionLocal() as db:
                    credential = await credentials.get_credential(db, feed_id)
                try:
                    snapshot = await adapter.fetch(config, credential)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001 — every adapter failure lands here
                    status.last_error = _sanitised_error(exc)
                    backoff_seconds = min((backoff_seconds or interval) * 2, _MAX_BACKOFF_SECONDS)
                    logger.warning("Land feed %s: fetch failed (%s)", feed_id, status.last_error)
                    await asyncio.sleep(backoff_seconds)
                    continue

                self._snapshots[feed_id] = snapshot
                status.last_fetch_at = now_ms()
                status.last_error = None
                status.feature_count = len(snapshot.features)
                backoff_seconds = None
                await asyncio.sleep(interval)
        finally:
            status.running = False

    # ── reads (router-facing) ────────────────────────────────────────────────

    def get_config(self, feed_id: str) -> FeedConfig | None:
        return self._configs.get(feed_id)

    def list_configs(self) -> list[FeedConfig]:
        return list(self._configs.values())

    def get_status(self, feed_id: str) -> FeedStatus:
        return self._status.get(feed_id, FeedStatus())

    def get_snapshot_with_cache_state(self, feed_id: str) -> tuple[FeedSnapshot, str]:
        """Return (snapshot, X-Cache state) for a feed, per the plan's cache
        semantics: HIT within the feed's own refresh interval, STALE within
        the wider stale window, MISS otherwise (including "never fetched")."""
        config = self._configs.get(feed_id)
        status = self._status.get(feed_id)
        snapshot = self._snapshots.get(feed_id, FeedSnapshot.empty())
        if config is None or not config.enabled or status is None or status.last_fetch_at is None:
            return FeedSnapshot.empty(), "MISS"
        fresh_until = status.last_fetch_at + config.refresh_seconds * 2 * 1000
        if is_fresh(fresh_until):
            return snapshot, "HIT"
        if is_within_stale(status.last_fetch_at, _STALE_WINDOW_MS):
            return snapshot, "STALE"
        return FeedSnapshot.empty(), "MISS"

    # ── image / clip proxy ───────────────────────────────────────────────────

    async def get_asset(self, feed_id: str, ref: str, *, kind: str) -> tuple[bytes, str]:
        """Fetch (and briefly cache) one camera's image or clip bytes.

        Raises the same `FeedAdapterError` subclasses the adapter raises;
        the router translates those to 404/502/503.
        """
        config = self._configs.get(feed_id)
        if config is None:
            raise FeedRefNotFound(f"unknown feed {feed_id!r}")
        cache_key = (feed_id, kind, ref)
        cached = self._image_cache.get(cache_key)
        now = time.monotonic()
        if cached is not None and cached[2] > now:
            return cached[0], cached[1]

        adapter = get_adapter(config.provider)
        if kind == "clip" and not adapter.supports_clips:
            raise FeedRefNotFound("this feed does not offer clips")

        async with AsyncSessionLocal() as db:
            credential = await credentials.get_credential(db, feed_id)
        try:
            if kind == "image":
                content, content_type = await adapter.image(config, credential, ref)
            else:
                content, content_type = await adapter.clip(config, credential, ref)
        except (FeedRefNotFound, FeedOffline, FeedUpstreamError):
            raise
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — treat any other adapter bug as an upstream failure
            raise FeedUpstreamError(_sanitised_error(exc)) from exc

        self._image_cache[cache_key] = (content, content_type, now + _IMAGE_CACHE_SECONDS)
        return content, content_type

    async def probe(self, feed_id: str) -> ProbeResult:
        """Run the adapter's probe for the Settings "TEST" button."""
        config = self._configs.get(feed_id)
        if config is None:
            raise FeedRefNotFound(f"unknown feed {feed_id!r}")
        adapter = get_adapter(config.provider)
        async with AsyncSessionLocal() as db:
            credential = await credentials.get_credential(db, feed_id)
        return await adapter.probe(config, credential)


# Process-wide poller, started/stopped from the app lifespan.
poller = LandFeedsPoller()
