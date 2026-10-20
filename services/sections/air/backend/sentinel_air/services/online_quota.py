"""How much of the online ADS-B feed's daily call limit is used, and warnings as it runs out.

Counted per feed host, so choosing a different Online Data Source starts a
count of its own (and switching back finds the old one). The limit for a host
is, in order:

1. Settings › AIR › Daily Call Limit (`air.onlineDailyCallLimit`), when set
   above 0 — for a feed that has a limit but doesn't state it;
2. the feed's own figure: the `;w=86400` policy in its `X-RateLimit-Limit`
   header (adsb.lol: `4, 4;w=1, 60;w=60, 500;w=86400`);
3. for the default feed only, `adsb_online_daily_quota` (500) until its first
   answer says so.

With none of those, the host has no known daily limit: calls are still
counted and shown, but nothing warns — unless the feed refuses a call with a
daily-length reset, which is "reached" whatever the limit.

A feed's `X-RateLimit-Remaining` only ever reports its tightest window (the
per-second one), so it can't say how much of the day is left: Sentinel counts
its own calls over a rolling 24 hours instead (`adsb_online_call`, so a restart
doesn't reset the count).

- `OnlineQuotaTracker.record_call` is called for every call that reaches an
  online feed, whoever made it (the map, the background alerts, the squawk
  watcher).
- `status()` is what `GET /api/air/adsb/online-quota` returns for the feed in
  use: the map banner and Settings › AIR › Online API Usage show it.
- Crossing into `approaching` or `reached` raises one core notification
  (`notifications.raise`) per state per host per day, so the warning reaches
  every open browser in any section.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlsplit

import httpx
from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.platform.bus import bus
from backend.platform.settings_client import read_setting
from sqlalchemy import delete, select

from sentinel_air.models import AdsbOnlineCall

logger = logging.getLogger(__name__)

QUOTA_WINDOW_SECONDS = 86_400
"""The limit's window: a day, the `;w=86400` policy."""

NOTIFICATIONS_RAISE_SUBJECT = "notifications.raise"

ONLINE_SOURCE_SETTING = "onlineDataSourceURL"
"""The `air` setting naming the online feed."""

DAILY_CALL_LIMIT_SETTING = "onlineDailyCallLimit"
"""The `air` setting overriding the feed's daily limit; 0 or unset = the feed's own figure."""

QuotaState = Literal["ok", "approaching", "reached", "no_limit"]
LimitSource = Literal["setting", "feed", "default"]

_SEVERITY: dict[QuotaState, int] = {"no_limit": 0, "ok": 0, "approaching": 1, "reached": 2}


@dataclass(frozen=True)
class OnlineQuotaStatus:
    """One feed's daily call limit as Sentinel has used it."""

    host: str
    used: int
    state: QuotaState
    # None when the feed has no known daily limit.
    limit: int | None
    limit_source: LimitSource | None
    remaining: int | None
    # Seconds until a call is next allowed (reached), else until the oldest
    # counted call leaves the window; None with nothing counted.
    resets_in_seconds: int | None

    def as_json(self) -> dict[str, int | str | None]:
        return {
            "host": self.host,
            "used": self.used,
            "state": self.state,
            "limit": self.limit,
            "limitSource": self.limit_source,
            "remaining": self.remaining,
            "resetsInSeconds": self.resets_in_seconds,
        }


@dataclass
class _HostCount:
    """Calls to one feed host inside the window, and what it has said about its limit."""

    call_times_ms: deque[int] = field(default_factory=deque)
    stated_limit: int | None = None
    # Set when the feed refuses calls with a daily-length reset, until then:
    # the authoritative "reached", whatever Sentinel's own count says (other
    # clients behind the same address share the limit).
    exhausted_until_ms: int = 0


def feed_host(base_url: str) -> str:
    """The host a feed's limit belongs to: the same host may be reached through differing paths."""
    return urlsplit(base_url).netloc or base_url


def daily_limit_from_header(rate_limit_header: str | None) -> int | None:
    """The daily limit in an `X-RateLimit-Limit` header, e.g. `4, 4;w=1, 60;w=60, 500;w=86400` → 500.

    None when the header is absent or names no 24-hour policy.
    """
    if not rate_limit_header:
        return None
    for policy in rate_limit_header.split(","):
        quota, _, parameters = policy.strip().partition(";")
        if parameters.strip() != f"w={QUOTA_WINDOW_SECONDS}":
            continue
        try:
            limit = int(quota.strip())
        except ValueError:
            return None
        return limit if limit > 0 else None
    return None


async def configured_daily_limit() -> int | None:
    """Settings › AIR › Daily Call Limit, or None while it is 0, unset or not a whole number."""
    try:
        async with AsyncSessionLocal() as db:
            value = await read_setting(db, "air", DAILY_CALL_LIMIT_SETTING)
    except Exception:
        logger.exception("could not read %s; using the feed's own limit", DAILY_CALL_LIMIT_SETTING)
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


async def online_feed_url() -> str:
    """The online feed in use (Settings › AIR › Online Data Source), whatever the current mode."""
    try:
        async with AsyncSessionLocal() as db:
            value = await read_setting(db, "air", ONLINE_SOURCE_SETTING)
    except Exception:
        logger.exception("could not read %s; assuming the default feed", ONLINE_SOURCE_SETTING)
        return settings.adsb_upstream_base
    return value.strip() if isinstance(value, str) and value.strip() else settings.adsb_upstream_base


async def daily_limit_override(host: str) -> int | None:
    """Settings › AIR › Daily Call Limit, when `host` is the feed it was set for.

    The setting sits beside the Online Data Source, so it describes that feed:
    after switching back to another one, its own figure applies again.
    """
    if host != feed_host(await online_feed_url()):
        return None
    return await configured_daily_limit()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _format_duration(seconds: int) -> str:
    """`3h 20m`, `45m`, `under a minute` — for a notification's detail line."""
    hours, remainder = divmod(max(0, seconds), 3600)
    minutes = remainder // 60
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m" if minutes else "under a minute"


class OnlineQuotaTracker:
    """Counts calls per online feed host over a rolling day and announces when a limit runs low."""

    def __init__(self) -> None:
        self._hosts: dict[str, _HostCount] = {}
        self._loaded = False
        self._lock = asyncio.Lock()

    async def load(self) -> None:
        """Read the calls still inside the window from the database (on start).

        A failure to read them is logged, not raised: the count then starts
        from this call, which only understates the limit used — far better
        than a counting error stopping aircraft from being fetched.
        """
        oldest_counted_ms = _now_ms() - QUOTA_WINDOW_SECONDS * 1000
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(AdsbOnlineCall.host, AdsbOnlineCall.called_at)
                    .where(AdsbOnlineCall.called_at >= oldest_counted_ms)
                    .order_by(AdsbOnlineCall.called_at)
                )
                hosts: dict[str, _HostCount] = {}
                for host, called_at in result.all():
                    hosts.setdefault(host, _HostCount()).call_times_ms.append(called_at)
                self._hosts = hosts
        except Exception:
            logger.exception("could not read the stored online ADS-B calls; counting from now")
        self._loaded = True

    async def record_call(self, host: str, response_headers: httpx.Headers | None) -> None:
        """Count one call that reached `host` (answered or not).

        `response_headers` (when there was a response) may state the host's
        daily limit, which then stands for that host until it says otherwise.
        """
        configured_limit = await daily_limit_override(host)
        async with self._lock:
            if not self._loaded:
                await self.load()
            count = self._hosts.setdefault(host, _HostCount())
            previous_state = self._status(host, count, configured_limit).state
            called_at_ms = _now_ms()
            count.call_times_ms.append(called_at_ms)
            if response_headers is not None:
                stated_limit = daily_limit_from_header(response_headers.get("x-ratelimit-limit"))
                if stated_limit is not None:
                    count.stated_limit = stated_limit
            await self._persist(host, called_at_ms)
            await self._announce_if_worse(self._status(host, count, configured_limit), previous_state)

    async def note_exhausted(self, host: str, reset_in_seconds: float) -> None:
        """`host` refused a call with nothing left for the day; it accepts calls again in `reset_in_seconds`."""
        configured_limit = await daily_limit_override(host)
        async with self._lock:
            count = self._hosts.setdefault(host, _HostCount())
            previous_state = self._status(host, count, configured_limit).state
            count.exhausted_until_ms = max(count.exhausted_until_ms, _now_ms() + int(reset_in_seconds * 1000))
            await self._announce_if_worse(self._status(host, count, configured_limit), previous_state)

    async def status(self, host: str) -> OnlineQuotaStatus:
        """The limit for `host` as of now."""
        configured_limit = await daily_limit_override(host)
        return self._status(host, self._hosts.get(host, _HostCount()), configured_limit)

    def _status(self, host: str, count: _HostCount, configured_limit: int | None) -> OnlineQuotaStatus:
        now_ms = _now_ms()
        self._forget_outside_window(count, now_ms)
        used = len(count.call_times_ms)
        limit, limit_source = self._limit_for(host, count, configured_limit)

        if now_ms < count.exhausted_until_ms:
            return OnlineQuotaStatus(
                host=host,
                used=used,
                state="reached",
                limit=limit,
                limit_source=limit_source,
                remaining=0,
                resets_in_seconds=(count.exhausted_until_ms - now_ms + 999) // 1000,
            )

        resets_in_seconds = None
        if count.call_times_ms:
            oldest_leaves_window_ms = count.call_times_ms[0] + QUOTA_WINDOW_SECONDS * 1000
            resets_in_seconds = max(0, (oldest_leaves_window_ms - now_ms + 999) // 1000)

        if limit is None:
            return OnlineQuotaStatus(host, used, "no_limit", None, None, None, resets_in_seconds)
        remaining = max(0, limit - used)
        if remaining == 0:
            state: QuotaState = "reached"
        elif used >= limit * settings.adsb_online_quota_warn_fraction:
            state = "approaching"
        else:
            state = "ok"
        return OnlineQuotaStatus(host, used, state, limit, limit_source, remaining, resets_in_seconds)

    @staticmethod
    def _limit_for(host: str, count: _HostCount, configured_limit: int | None) -> tuple[int | None, LimitSource | None]:
        if configured_limit is not None:
            return configured_limit, "setting"
        if count.stated_limit is not None:
            return count.stated_limit, "feed"
        # Only the default feed's limit is known before it answers (and after
        # a restart, until its next answer restates it).
        if host == feed_host(settings.adsb_upstream_base):
            return settings.adsb_online_daily_quota, "default"
        return None, None

    @staticmethod
    def _forget_outside_window(count: _HostCount, now_ms: int) -> None:
        oldest_counted_ms = now_ms - QUOTA_WINDOW_SECONDS * 1000
        while count.call_times_ms and count.call_times_ms[0] < oldest_counted_ms:
            count.call_times_ms.popleft()

    async def _persist(self, host: str, called_at_ms: int) -> None:
        # Its own session: counting a call must never disturb the caller's
        # cache write, and a failure to store it only costs accuracy after a
        # restart, so it is logged rather than raised.
        try:
            async with AsyncSessionLocal() as db:
                db.add(AdsbOnlineCall(host=host, called_at=called_at_ms))
                await db.execute(
                    delete(AdsbOnlineCall).where(AdsbOnlineCall.called_at < called_at_ms - QUOTA_WINDOW_SECONDS * 1000)
                )
                await db.commit()
        except Exception:
            logger.exception("could not store an online ADS-B call for the daily count")

    async def _announce_if_worse(self, status: OnlineQuotaStatus, previous_state: QuotaState) -> None:
        """Raise a notification when a host's state moves to `approaching` or `reached`."""
        if _SEVERITY[status.state] <= _SEVERITY[previous_state]:
            return
        if status.state == "approaching":
            title = "ADS-B CALL LIMIT LOW"
            detail = (
                f"{status.used} of {status.limit} daily {status.host} calls used. "
                "Raise Settings › AIR › Online Refresh Interval to make the rest last."
            )
        else:
            title = "ADS-B CALL LIMIT REACHED"
            wait = (
                f" Calls resume in about {_format_duration(status.resets_in_seconds)}."
                if status.resets_in_seconds is not None
                else ""
            )
            if status.limit is not None:
                detail = f"All {status.limit} daily {status.host} calls used: aircraft won't update.{wait}"
            else:
                # No known limit: the feed itself refused, with a day-long reset.
                detail = f"{status.host} is refusing calls for today: aircraft won't update.{wait}"
        now_ms = _now_ms()
        # One per state per host per UTC day: core ignores a msg_id it already
        # stored, so a count hovering around the threshold (or a restart)
        # can't repeat it.
        day = datetime.fromtimestamp(now_ms / 1000, UTC).strftime("%Y-%m-%d")
        try:
            async with AsyncSessionLocal() as db:
                await bus.publish(
                    NOTIFICATIONS_RAISE_SUBJECT,
                    {
                        "msg_id": f"adsb-online-quota:{status.host}:{status.state}:{day}",
                        "type": "system",
                        "title": title,
                        "detail": detail,
                        "ts": now_ms,
                        "db": db,
                    },
                )
        except Exception:
            logger.exception("could not raise the ADS-B daily call limit notification")


tracker = OnlineQuotaTracker()
