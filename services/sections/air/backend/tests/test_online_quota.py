"""Tests for counting calls to the online ADS-B feeds against their daily limits.

The failure this guards against: Sentinel calling a feed faster than its daily
limit allows, with nothing on screen until the map silently stops updating —
or warning against the wrong limit after the operator picks a different feed.

Run with:  uv run --project backend pytest services/sections/air/backend/tests/test_online_quota.py
"""

from __future__ import annotations

import logging

import httpx
import pytest
from backend.database import Base
from backend.services.upstream_rate_limit import UpstreamThrottledError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from sentinel_air.models import AdsbOnlineCall, AdsbOnlineRefusal
from sentinel_air.services import adsb as adsb_service
from sentinel_air.services import adsb_squawk, online_quota
from sentinel_air.services.adsb import _daily_quota_reset_seconds
from sentinel_air.services.online_quota import (
    QUOTA_WINDOW_SECONDS,
    OnlineQuotaTracker,
    _format_duration,
    configured_daily_limit,
    daily_limit_from_header,
    feed_host,
    online_feed_url,
)

ADSB_LOL = "api.adsb.lol"
OTHER_FEED = "opendata.adsb.fi"
ADSB_LOL_LIMIT_HEADER = "4, 4;w=1, 60;w=60, 500;w=86400"
START_MS = 1_800_000_000_000
DAY_MS = QUOTA_WINDOW_SECONDS * 1000
# START_MS is 2027-01-15 08:00 UTC.
TODAY_START_MS = START_MS - 8 * 3_600_000
NEXT_MIDNIGHT_MS = TODAY_START_MS + DAY_MS


@pytest.fixture
def clock(monkeypatch) -> list[int]:
    """The tracker's clock, moved by tests: `clock[0]` is now in Unix ms."""
    now = [START_MS]
    monkeypatch.setattr(online_quota, "_now_ms", lambda: now[0])
    return now


@pytest.fixture(autouse=True)
def pinned_settings(monkeypatch):
    """Fix the settings these tests depend on, so a local `.env` can't change them."""
    monkeypatch.setattr(online_quota.settings, "adsb_upstream_base", "https://api.adsb.lol/v2")
    monkeypatch.setattr(online_quota.settings, "adsb_online_daily_quota", 500)
    monkeypatch.setattr(online_quota.settings, "adsb_online_quota_warn_fraction", 0.8)


@pytest.fixture
async def quota_database(monkeypatch):
    """A real in-memory SQLite database holding `adsb_online_call` and `adsb_online_refusal`, used by the tracker."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection,
                tables=[Base.metadata.tables["adsb_online_call"], Base.metadata.tables["adsb_online_refusal"]],
            )
        )
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(online_quota, "AsyncSessionLocal", session_factory)
    yield session_factory
    await engine.dispose()


def set_daily_limit_setting(monkeypatch, limit: int | None, selected_feed: str = "https://api.adsb.lol/v2"):
    """Settings › AIR: a Daily Call Limit, set for `selected_feed` as the Online Data Source."""

    async def configured() -> int | None:
        return limit

    async def selected() -> str:
        return selected_feed

    monkeypatch.setattr(online_quota, "configured_daily_limit", configured)
    monkeypatch.setattr(online_quota, "online_feed_url", selected)


async def record_calls(tracker, host: str, count: int, headers: dict[str, str] | None = None) -> None:
    for _ in range(count):
        await tracker.record_call(host, httpx.Headers(headers) if headers is not None else None)


# ── Reading a feed's daily limit from its header ──────────────────────────────


class TestDailyLimitFromHeader:
    def test_reads_the_daily_policy_out_of_adsb_lols_header(self):
        assert daily_limit_from_header(ADSB_LOL_LIMIT_HEADER) == 500

    def test_a_header_with_only_the_daily_policy(self):
        assert daily_limit_from_header("1000;w=86400") == 1000

    def test_tolerates_spaces_around_the_policy(self):
        assert daily_limit_from_header(" 4 ;w=1 ,  250 ; w=86400 ") == 250

    @pytest.mark.parametrize("header", [None, ""])
    def test_no_header_states_no_limit(self, header):
        assert daily_limit_from_header(header) is None

    def test_a_header_without_a_daily_window_states_no_limit(self):
        # Per-second and per-minute limits say nothing about the day.
        assert daily_limit_from_header("4, 4;w=1, 60;w=60") is None

    @pytest.mark.parametrize("header", ["lots;w=86400", "0;w=86400", "-5;w=86400"])
    def test_an_unusable_daily_figure_states_no_limit(self, header):
        assert daily_limit_from_header(header) is None


class TestFeedHost:
    def test_the_host_of_a_feed_url(self):
        assert feed_host("https://api.adsb.lol/v2") == ADSB_LOL

    def test_the_same_host_through_another_path_is_the_same_feed(self):
        assert feed_host("https://api.adsb.lol/v3/other") == feed_host("https://api.adsb.lol/v2")

    def test_something_that_is_not_a_url_is_used_as_it_is(self):
        assert feed_host("not-a-url") == "not-a-url"


class TestFormatDuration:
    @pytest.mark.parametrize(
        ("seconds", "expected"),
        [
            (3 * 3600 + 20 * 60 + 59, "3h 20m"),
            (3600, "1h 0m"),
            (45 * 60, "45m"),
            (59, "under a minute"),
            (-5, "under a minute"),
        ],
    )
    def test_formats_hours_and_minutes(self, seconds, expected):
        assert _format_duration(seconds) == expected


# ── The settings it reads ─────────────────────────────────────────────────────


class FakeSessionFactory:
    """Stands in for `AsyncSessionLocal` where only `read_setting` touches the session."""

    def __call__(self):
        return self

    async def __aenter__(self):
        return object()

    async def __aexit__(self, *exc_info):
        return False


def stored_setting(monkeypatch, value=None, error: Exception | None = None):
    """`read_setting` answering `value` (or raising `error`) for every key."""

    async def fake_read_setting(db, namespace, key, default=None):
        if error is not None:
            raise error
        return value

    monkeypatch.setattr(online_quota, "read_setting", fake_read_setting)
    monkeypatch.setattr(online_quota, "AsyncSessionLocal", FakeSessionFactory())


class TestConfiguredDailyLimit:
    async def test_a_whole_number_above_zero_is_the_limit(self, monkeypatch):
        stored_setting(monkeypatch, 750)
        assert await configured_daily_limit() == 750

    @pytest.mark.parametrize("value", [0, -1, None, True, 12.5, "750", [750]])
    async def test_anything_else_leaves_the_feeds_own_figure(self, monkeypatch, value):
        # 0 is the documented "use the feed's own figure"; True is an int in
        # Python and must not read as a limit of 1.
        stored_setting(monkeypatch, value)
        assert await configured_daily_limit() is None

    async def test_a_failed_read_leaves_the_feeds_own_figure_and_logs(self, monkeypatch, caplog):
        stored_setting(monkeypatch, error=RuntimeError("core unreachable"))
        with caplog.at_level(logging.ERROR, logger=online_quota.__name__):
            assert await configured_daily_limit() is None
        assert "onlineDailyCallLimit" in caplog.text


class TestOnlineFeedUrl:
    async def test_the_stored_online_data_source(self, monkeypatch):
        stored_setting(monkeypatch, "  https://opendata.adsb.fi/api/v2  ")
        assert await online_feed_url() == "https://opendata.adsb.fi/api/v2"

    @pytest.mark.parametrize("value", [None, "", "   ", 42])
    async def test_unset_or_unusable_means_the_default_feed(self, monkeypatch, value):
        stored_setting(monkeypatch, value)
        assert await online_feed_url() == "https://api.adsb.lol/v2"

    async def test_a_failed_read_means_the_default_feed_and_logs(self, monkeypatch, caplog):
        stored_setting(monkeypatch, error=RuntimeError("core unreachable"))
        with caplog.at_level(logging.ERROR, logger=online_quota.__name__):
            assert await online_feed_url() == "https://api.adsb.lol/v2"
        assert "onlineDataSourceURL" in caplog.text


class TestDailyLimitOverride:
    async def test_applies_to_the_selected_feed(self, monkeypatch):
        set_daily_limit_setting(monkeypatch, 40, selected_feed="https://opendata.adsb.fi/api/v2")
        assert await online_quota.daily_limit_override(OTHER_FEED) == 40

    async def test_does_not_follow_the_operator_back_to_another_feed(self, monkeypatch):
        # Set for adsb.fi; adsb.lol must keep its own 500.
        set_daily_limit_setting(monkeypatch, 40, selected_feed="https://opendata.adsb.fi/api/v2")
        assert await online_quota.daily_limit_override(ADSB_LOL) is None


# ── Where the limit comes from ────────────────────────────────────────────────


class TestLimitSource:
    async def test_the_default_feed_is_500_before_it_answers(self, quota_tracker, clock):
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.limit, status.limit_source, status.remaining, status.state) == (500, "default", 500, "ok")

    async def test_a_feed_stating_its_limit_is_held_to_that(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 1, {"x-ratelimit-limit": "4;w=1, 300;w=86400"})
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.limit, status.limit_source, status.remaining) == (300, "feed", 299)

    async def test_an_answer_without_the_header_keeps_the_stated_limit(self, quota_tracker, clock):
        await record_calls(quota_tracker, OTHER_FEED, 1, {"x-ratelimit-limit": "300;w=86400"})
        await record_calls(quota_tracker, OTHER_FEED, 1, {})
        await record_calls(quota_tracker, OTHER_FEED, 1, None)
        status = await quota_tracker.status(OTHER_FEED)
        assert (status.limit, status.used) == (300, 3)

    async def test_another_feed_stating_nothing_has_no_limit_and_no_warning(self, quota_tracker, clock):
        await record_calls(quota_tracker, OTHER_FEED, 450, {})
        status = await quota_tracker.status(OTHER_FEED)
        assert (status.state, status.limit, status.limit_source, status.remaining) == ("no_limit", None, None, None)
        assert status.used == 450
        assert quota_tracker.announced == []

    async def test_the_daily_call_limit_setting_beats_the_feeds_figure(self, quota_tracker, clock, monkeypatch):
        set_daily_limit_setting(monkeypatch, 50)
        await record_calls(quota_tracker, ADSB_LOL, 1, {"x-ratelimit-limit": ADSB_LOL_LIMIT_HEADER})
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.limit, status.limit_source, status.remaining) == (50, "setting", 49)

    async def test_the_setting_gives_a_silent_feed_a_limit(self, quota_tracker, clock, monkeypatch):
        set_daily_limit_setting(monkeypatch, 10, selected_feed="https://opendata.adsb.fi/api/v2")
        await record_calls(quota_tracker, OTHER_FEED, 8, {})
        status = await quota_tracker.status(OTHER_FEED)
        assert (status.limit, status.limit_source, status.state) == (10, "setting", "approaching")


# ── Each feed counted on its own ──────────────────────────────────────────────


class TestCountedPerFeed:
    async def test_calls_to_one_feed_do_not_count_against_another(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 3, {"x-ratelimit-limit": ADSB_LOL_LIMIT_HEADER})
        await record_calls(quota_tracker, OTHER_FEED, 5, {})
        assert (await quota_tracker.status(ADSB_LOL)).used == 3
        assert (await quota_tracker.status(OTHER_FEED)).used == 5

    async def test_a_feed_never_called_has_used_nothing(self, quota_tracker, clock):
        status = await quota_tracker.status("never.example")
        # The count still starts again at midnight UTC.
        assert (status.used, status.resets_in_seconds) == (0, 16 * 3600)


# ── States as the day's calls are used ────────────────────────────────────────


class TestStates:
    async def test_ok_until_80_percent_used(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 399)
        assert (await quota_tracker.status(ADSB_LOL)).state == "ok"

    async def test_approaching_from_80_percent(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 400)
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.state, status.remaining) == ("approaching", 100)

    async def test_reached_with_nothing_left(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 500)
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.state, status.remaining) == ("reached", 0)

    async def test_remaining_never_goes_below_zero(self, quota_tracker, clock):
        # Another client behind the same address, or a lowered setting.
        await record_calls(quota_tracker, ADSB_LOL, 510)
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.used, status.remaining, status.state) == (510, 0, "reached")


class TestUtcDay:
    """adsb.lol's daily limit resets at 00:00 UTC: a refusal's reset always points
    there. The test clock is 08:00 UTC, 16 hours before the next midnight."""

    async def test_calls_count_until_the_next_utc_midnight(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 1)
        clock[0] = NEXT_MIDNIGHT_MS - 1
        assert (await quota_tracker.status(ADSB_LOL)).used == 1
        clock[0] = NEXT_MIDNIGHT_MS
        assert (await quota_tracker.status(ADSB_LOL)).used == 0

    async def test_a_call_late_yesterday_does_not_count_today(self, quota_tracker, clock):
        clock[0] = TODAY_START_MS - 1
        await record_calls(quota_tracker, ADSB_LOL, 1)
        clock[0] = TODAY_START_MS
        assert (await quota_tracker.status(ADSB_LOL)).used == 0

    async def test_reports_when_the_count_starts_again(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 1)
        assert (await quota_tracker.status(ADSB_LOL)).resets_in_seconds == 16 * 3600
        clock[0] += 3_600_000
        assert (await quota_tracker.status(ADSB_LOL)).resets_in_seconds == 15 * 3600

    async def test_a_reached_limit_recovers_at_utc_midnight(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 500)
        assert (await quota_tracker.status(ADSB_LOL)).state == "reached"
        clock[0] = NEXT_MIDNIGHT_MS
        assert (await quota_tracker.status(ADSB_LOL)).state == "ok"


class TestFeedRefusingCalls:
    async def test_a_refusal_for_the_day_is_reached_whatever_the_count(self, quota_tracker, clock):
        # The feed's word beats Sentinel's count: others may share the address.
        await record_calls(quota_tracker, ADSB_LOL, 10)
        await quota_tracker.note_exhausted(ADSB_LOL, 7200)
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.state, status.remaining, status.resets_in_seconds) == ("reached", 0, 7200)

    async def test_a_feed_with_no_known_limit_can_still_be_reached(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(OTHER_FEED, 600)
        status = await quota_tracker.status(OTHER_FEED)
        assert (status.state, status.limit, status.remaining) == ("reached", None, 0)

    async def test_the_refusal_ends_at_its_reset(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(ADSB_LOL, 600)
        clock[0] += 600_000
        assert (await quota_tracker.status(ADSB_LOL)).state == "ok"

    async def test_a_shorter_refusal_does_not_cut_a_longer_one_short(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(ADSB_LOL, 7200)
        await quota_tracker.note_exhausted(ADSB_LOL, 120)
        assert (await quota_tracker.status(ADSB_LOL)).resets_in_seconds == 7200

    async def test_a_partial_second_rounds_up(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(ADSB_LOL, 90.4)
        assert (await quota_tracker.status(ADSB_LOL)).resets_in_seconds == 91


class TestRefusedForSeconds:
    """Only the feed's own refusal stops calls, and only until the reset it stated."""

    async def test_a_feed_never_heard_from_is_not_refusing(self, quota_tracker, clock):
        assert quota_tracker.refused_for_seconds(ADSB_LOL) is None

    async def test_a_feed_answering_normally_is_not_refusing(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 1)
        assert quota_tracker.refused_for_seconds(ADSB_LOL) is None

    async def test_a_count_at_the_limit_alone_is_not_a_refusal(self, quota_tracker, clock):
        # "reached" by Sentinel's count, but the feed hasn't said so: its next
        # answer is what says when calls stop, and for how long.
        await record_calls(quota_tracker, ADSB_LOL, 500)
        assert (await quota_tracker.status(ADSB_LOL)).state == "reached"
        assert quota_tracker.refused_for_seconds(ADSB_LOL) is None

    async def test_a_refusal_lasts_the_feeds_stated_reset(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(ADSB_LOL, 7200)
        assert quota_tracker.refused_for_seconds(ADSB_LOL) == 7200
        assert quota_tracker.persisted_refusals == [(ADSB_LOL, START_MS + 7_200_000)]

    async def test_a_reset_before_utc_midnight_is_not_stretched_to_it(self, quota_tracker, clock):
        # START_MS is 08:00 UTC, so midnight is 16 hours away; the feed said 10 minutes.
        await quota_tracker.note_exhausted(ADSB_LOL, 600)
        clock[0] += 600_000
        assert quota_tracker.refused_for_seconds(ADSB_LOL) is None

    async def test_it_counts_down(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(ADSB_LOL, 7200)
        clock[0] += 3_600_000
        assert quota_tracker.refused_for_seconds(ADSB_LOL) == 3600

    async def test_the_last_millisecond_still_refuses(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(ADSB_LOL, 600)
        clock[0] += 600_000 - 1
        assert quota_tracker.refused_for_seconds(ADSB_LOL) == 1

    async def test_a_partial_second_rounds_up(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(ADSB_LOL, 90.4)
        assert quota_tracker.refused_for_seconds(ADSB_LOL) == 91

    async def test_another_feed_is_not_refused_with_it(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(ADSB_LOL, 7200)
        assert quota_tracker.refused_for_seconds(OTHER_FEED) is None


# ── Announcing it ─────────────────────────────────────────────────────────────


class TestAnnouncedOncePerStage:
    async def test_nothing_while_ok(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 399)
        assert quota_tracker.announced == []

    async def test_approaching_then_reached_each_once(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 505)
        assert quota_tracker.announced == [(ADSB_LOL, "approaching"), (ADSB_LOL, "reached")]

    async def test_a_refusal_after_reaching_the_limit_is_not_announced_again(self, quota_tracker, clock):
        await record_calls(quota_tracker, ADSB_LOL, 500)
        await quota_tracker.note_exhausted(ADSB_LOL, 7200)
        assert quota_tracker.announced.count((ADSB_LOL, "reached")) == 1

    async def test_a_refusal_with_calls_to_spare_is_announced(self, quota_tracker, clock):
        await quota_tracker.note_exhausted(OTHER_FEED, 7200)
        assert quota_tracker.announced == [(OTHER_FEED, "reached")]


class RecordingBus:
    def __init__(self, error: Exception | None = None) -> None:
        self.published: list[tuple[str, dict]] = []
        self._error = error

    async def publish(self, subject: str, payload: dict) -> None:
        if self._error is not None:
            raise self._error
        self.published.append((subject, payload))


class TestTheNotification:
    """The real `_announce_if_worse`: what reaches core's notifications."""

    @pytest.fixture
    def bus(self, monkeypatch) -> RecordingBus:
        recording = RecordingBus()
        monkeypatch.setattr(online_quota, "bus", recording)
        return recording

    @pytest.fixture
    def tracker(self, quota_database) -> OnlineQuotaTracker:
        real = OnlineQuotaTracker()
        real._loaded = True
        return real

    async def test_approaching_names_the_feed_and_what_to_do(self, tracker, bus, clock):
        await record_calls(tracker, ADSB_LOL, 400)
        [(subject, payload)] = bus.published
        assert subject == "notifications.raise"
        assert payload["type"] == "system"
        assert payload["title"] == "ADS-B CALL LIMIT LOW"
        assert payload["detail"] == (
            "Online data source: 400 of 500 daily calls used. Raise the Online Refresh Interval to make them last."
        )
        assert payload["ts"] == START_MS
        assert payload["db"] is not None

    async def test_one_message_id_per_feed_stage_and_day(self, tracker, bus, clock):
        # Core ignores an id it already stored, so a restart can't repeat it.
        await record_calls(tracker, ADSB_LOL, 400)
        assert bus.published[0][1]["msg_id"] == "adsb-online-quota:api.adsb.lol:approaching:2027-01-15"

    async def test_reached_by_count_says_all_were_used_and_when_calls_resume(self, tracker, bus, clock):
        await record_calls(tracker, ADSB_LOL, 500)
        payload = bus.published[-1][1]
        assert payload["title"] == "ADS-B CALL LIMIT REACHED"
        assert payload["detail"] == (
            "Online data source daily limit reached. Aircraft will resume in approximately 16h 0m."
        )

    async def test_a_refusal_before_the_count_reaches_the_limit_names_no_figure(self, tracker, bus, clock):
        # The feed also counts calls Sentinel didn't see, so a figure such as
        # "all 500 used" beside a count of 161 would read as a bug.
        await record_calls(tracker, ADSB_LOL, 161)
        await tracker.note_exhausted(ADSB_LOL, 2 * 3600 + 15 * 60)
        payload = bus.published[0][1]
        assert payload["title"] == "ADS-B CALL LIMIT REACHED"
        assert payload["detail"] == (
            "Online data source daily limit reached. Aircraft will resume in approximately 2h 15m."
        )

    async def test_reached_without_a_known_limit_says_the_feed_refused(self, tracker, bus, clock):
        await tracker.note_exhausted(OTHER_FEED, 600)
        assert bus.published[0][1]["detail"] == (
            "Online data source is refusing calls today. Aircraft will resume in approximately 10m."
        )

    async def test_a_failure_to_raise_it_is_logged_not_raised(self, tracker, clock, monkeypatch, caplog):
        monkeypatch.setattr(online_quota, "bus", RecordingBus(error=RuntimeError("bus down")))
        with caplog.at_level(logging.ERROR, logger=online_quota.__name__):
            await record_calls(tracker, ADSB_LOL, 400)
        assert "could not raise" in caplog.text


# ── Kept across restarts ──────────────────────────────────────────────────────


class TestPersistence:
    async def test_calls_are_stored_with_their_feed(self, quota_database, clock, monkeypatch):
        monkeypatch.setattr(online_quota, "bus", RecordingBus())
        tracker = OnlineQuotaTracker()
        await record_calls(tracker, ADSB_LOL, 2)
        await record_calls(tracker, OTHER_FEED, 1)
        async with quota_database() as db:
            rows = (await db.execute(select(AdsbOnlineCall.host, AdsbOnlineCall.called_at))).all()
        assert sorted(rows) == [(ADSB_LOL, START_MS), (ADSB_LOL, START_MS), (OTHER_FEED, START_MS)]

    async def test_a_restart_picks_up_the_days_count_per_feed(self, quota_database, clock):
        async with quota_database() as db:
            db.add_all(
                [
                    AdsbOnlineCall(host=ADSB_LOL, called_at=START_MS - 1000),
                    AdsbOnlineCall(host=ADSB_LOL, called_at=START_MS - 2000),
                    AdsbOnlineCall(host=OTHER_FEED, called_at=START_MS - 3000),
                    # Late yesterday (UTC): not counted today.
                    AdsbOnlineCall(host=ADSB_LOL, called_at=TODAY_START_MS - 1),
                ]
            )
            await db.commit()
        tracker = OnlineQuotaTracker()
        await tracker.load()
        assert (await tracker.status(ADSB_LOL)).used == 2
        assert (await tracker.status(OTHER_FEED)).used == 1

    async def test_the_first_call_after_a_restart_loads_the_count_first(self, quota_database, clock, monkeypatch):
        monkeypatch.setattr(online_quota, "bus", RecordingBus())
        async with quota_database() as db:
            db.add(AdsbOnlineCall(host=ADSB_LOL, called_at=START_MS - 1000))
            await db.commit()
        tracker = OnlineQuotaTracker()
        await record_calls(tracker, ADSB_LOL, 1)
        assert (await tracker.status(ADSB_LOL)).used == 2

    async def test_storing_a_call_prunes_rows_from_before_today(self, quota_database, clock, monkeypatch):
        monkeypatch.setattr(online_quota, "bus", RecordingBus())
        async with quota_database() as db:
            db.add(AdsbOnlineCall(host=ADSB_LOL, called_at=TODAY_START_MS - 1))
            await db.commit()
        tracker = OnlineQuotaTracker()
        tracker._loaded = True
        await record_calls(tracker, ADSB_LOL, 1)
        async with quota_database() as db:
            remaining = (await db.execute(select(AdsbOnlineCall.called_at))).scalars().all()
        assert remaining == [START_MS]

    async def test_an_unreadable_store_counts_from_now_instead_of_failing(self, clock, monkeypatch, caplog):
        def broken_session():
            raise RuntimeError("disk gone")

        monkeypatch.setattr(online_quota, "AsyncSessionLocal", broken_session)
        monkeypatch.setattr(online_quota, "bus", RecordingBus())
        tracker = OnlineQuotaTracker()
        with caplog.at_level(logging.ERROR, logger=online_quota.__name__):
            # A counting failure must never stop aircraft being fetched.
            await record_calls(tracker, ADSB_LOL, 1)
        assert (await tracker.status(ADSB_LOL)).used == 1
        assert "counting from now" in caplog.text
        assert "could not store" in caplog.text


class TestRefusalPersistence:
    """A feed's daily-limit refusal survives a restart, so the first call after one isn't wasted on a "no"."""

    @pytest.fixture
    def tracker(self, quota_database, monkeypatch) -> OnlineQuotaTracker:
        monkeypatch.setattr(online_quota, "bus", RecordingBus())
        tracker = OnlineQuotaTracker()
        tracker._loaded = True
        return tracker

    @staticmethod
    async def stored_refusals(quota_database) -> list[tuple[str, int]]:
        async with quota_database() as db:
            rows = (await db.execute(select(AdsbOnlineRefusal.host, AdsbOnlineRefusal.until_ms))).all()
        return sorted((host, until_ms) for host, until_ms in rows)

    async def test_a_refusal_is_stored_until_its_reset(self, tracker, quota_database, clock):
        await tracker.note_exhausted(ADSB_LOL, 7200)
        assert await self.stored_refusals(quota_database) == [(ADSB_LOL, START_MS + 7_200_000)]

    async def test_one_row_per_feed_holding_the_later_reset(self, tracker, quota_database, clock):
        await tracker.note_exhausted(ADSB_LOL, 600)
        await tracker.note_exhausted(ADSB_LOL, 7200)
        # A shorter one after it must not shorten what is stored either.
        await tracker.note_exhausted(ADSB_LOL, 120)
        await tracker.note_exhausted(OTHER_FEED, 900)
        assert await self.stored_refusals(quota_database) == [
            (ADSB_LOL, START_MS + 7_200_000),
            (OTHER_FEED, START_MS + 900_000),
        ]

    async def test_storing_a_refusal_prunes_ones_whose_reset_has_passed(self, tracker, quota_database, clock):
        await tracker.note_exhausted(OTHER_FEED, 600)
        clock[0] += 600_000
        await tracker.note_exhausted(ADSB_LOL, 7200)
        assert await self.stored_refusals(quota_database) == [(ADSB_LOL, START_MS + 600_000 + 7_200_000)]

    async def test_a_restart_keeps_refusing_until_the_stated_reset(self, quota_database, clock):
        async with quota_database() as db:
            db.add_all(
                [
                    AdsbOnlineRefusal(host=ADSB_LOL, until_ms=START_MS + 6_200_000),
                    AdsbOnlineRefusal(host=OTHER_FEED, until_ms=START_MS + 1_000),
                ]
            )
            await db.commit()
        tracker = OnlineQuotaTracker()
        await tracker.load()
        assert tracker.refused_for_seconds(ADSB_LOL) == 6200
        assert tracker.refused_for_seconds(OTHER_FEED) == 1
        assert (await tracker.status(ADSB_LOL)).state == "reached"

    async def test_a_restart_after_the_reset_does_not_refuse(self, quota_database, clock):
        async with quota_database() as db:
            # Ended exactly now, and earlier: both over.
            db.add_all(
                [
                    AdsbOnlineRefusal(host=ADSB_LOL, until_ms=START_MS),
                    AdsbOnlineRefusal(host=OTHER_FEED, until_ms=START_MS - 1),
                ]
            )
            await db.commit()
        tracker = OnlineQuotaTracker()
        await tracker.load()
        assert tracker.refused_for_seconds(ADSB_LOL) is None
        assert tracker.refused_for_seconds(OTHER_FEED) is None

    async def test_a_restart_keeps_the_count_alongside_the_refusal(self, quota_database, clock):
        async with quota_database() as db:
            db.add_all(
                [
                    AdsbOnlineCall(host=ADSB_LOL, called_at=START_MS - 1000),
                    AdsbOnlineRefusal(host=ADSB_LOL, until_ms=START_MS + 600_000),
                ]
            )
            await db.commit()
        tracker = OnlineQuotaTracker()
        await tracker.load()
        status = await tracker.status(ADSB_LOL)
        assert (status.used, status.state, status.resets_in_seconds) == (1, "reached", 600)

    async def test_a_failure_to_store_it_still_refuses_in_memory(self, clock, monkeypatch, caplog):
        def broken_session():
            raise RuntimeError("disk gone")

        monkeypatch.setattr(online_quota, "AsyncSessionLocal", broken_session)
        monkeypatch.setattr(online_quota, "bus", RecordingBus())
        tracker = OnlineQuotaTracker()
        tracker._loaded = True
        with caplog.at_level(logging.ERROR, logger=online_quota.__name__):
            # Storing it must never stop the refusal taking effect.
            await tracker.note_exhausted(ADSB_LOL, 7200)
        assert tracker.refused_for_seconds(ADSB_LOL) == 7200
        assert "could not store an online ADS-B feed's daily limit refusal" in caplog.text


# ── fetch_aircraft counts what reaches the feed ───────────────────────────────


class TestFetchAircraftCounts:
    ONLINE = "https://api.adsb.lol/v2"
    READSB = "http://offgrid.local/data/aircraft.json"

    @pytest.fixture(autouse=True)
    def unthrottled(self, monkeypatch):
        """No spacing between calls, so a test can make several."""

        class NoLimit:
            async def acquire(self, host_key, max_wait_seconds, interval_seconds=None):
                return None

            async def penalize(self, host_key, cooldown_seconds):
                return None

        monkeypatch.setattr(adsb_service, "_adsb_rate_limiter", NoLimit())

    @staticmethod
    def answer(monkeypatch, status_code: int = 200, headers: dict | None = None, body: dict | None = None):
        async def fake_get_response(client, url):
            return httpx.Response(
                status_code,
                json=body if body is not None else {"ac": []},
                headers=headers or {},
                request=httpx.Request("GET", url),
            )

        monkeypatch.setattr(adsb_service, "_get_response", fake_get_response)

    async def test_an_answered_call_is_counted_against_its_feed(self, monkeypatch, quota_tracker, clock):
        self.answer(monkeypatch, headers={"x-ratelimit-limit": ADSB_LOL_LIMIT_HEADER}, body={"ac": [{"hex": "a"}]})
        result = await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert result == {"ac": [{"hex": "a"}]}
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.used, status.limit_source) == (1, "feed")

    async def test_a_refused_call_still_counts(self, monkeypatch, quota_tracker, clock):
        # The feed answered, so it counted the call whatever it said.
        self.answer(monkeypatch, status_code=503)
        with pytest.raises(httpx.HTTPStatusError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert (await quota_tracker.status(ADSB_LOL)).used == 1

    async def test_a_call_that_never_reached_the_feed_is_not_counted(self, monkeypatch, quota_tracker, clock):
        async def unreachable(client, url):
            raise httpx.ConnectError("no route to host")

        monkeypatch.setattr(adsb_service, "_get_response", unreachable)
        with pytest.raises(httpx.ConnectError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert (await quota_tracker.status(ADSB_LOL)).used == 0

    async def test_the_local_decoder_is_never_counted(self, monkeypatch, quota_tracker, clock):
        self.answer(monkeypatch, body={"aircraft": []})
        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.READSB)
        assert quota_tracker.persisted == []

    async def test_a_429_with_a_day_long_reset_marks_the_limit_reached(self, monkeypatch, quota_tracker, clock):
        self.answer(monkeypatch, status_code=429, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "7200"})
        with pytest.raises(httpx.HTTPStatusError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        status = await quota_tracker.status(ADSB_LOL)
        assert (status.state, status.resets_in_seconds) == ("reached", 7200)

    async def test_a_429_from_the_per_minute_window_is_not_the_daily_limit(self, monkeypatch, quota_tracker, clock):
        self.answer(monkeypatch, status_code=429, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "30"})
        with pytest.raises(httpx.HTTPStatusError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert (await quota_tracker.status(ADSB_LOL)).state == "ok"

    async def test_a_429_with_calls_left_is_not_the_daily_limit(self, monkeypatch, quota_tracker, clock):
        self.answer(monkeypatch, status_code=429, headers={"x-ratelimit-remaining": "3", "x-ratelimit-reset": "7200"})
        with pytest.raises(httpx.HTTPStatusError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert (await quota_tracker.status(ADSB_LOL)).state == "ok"


class TestNoCallsWhileTheFeedRefuses:
    """Once the feed refuses a call for its daily limit, nothing calls it until its stated reset.

    The failure this guards against: the 429 cooldown is clamped to 10
    minutes, so a spent limit was retried — and refused — every 10 minutes
    until the feed's reset.
    """

    ONLINE = "https://api.adsb.lol/v2"
    READSB = "http://offgrid.local/data/aircraft.json"
    DAILY_REFUSAL = {"x-ratelimit-remaining": "0", "x-ratelimit-reset": "7200"}

    @pytest.fixture(autouse=True)
    def slots(self, monkeypatch) -> list[str]:
        """No spacing between calls; records each host a call slot was taken for."""
        taken: list[str] = []

        class RecordingNoLimit:
            async def acquire(self, host_key, max_wait_seconds, interval_seconds=None):
                taken.append(host_key)

            async def penalize(self, host_key, cooldown_seconds):
                return None

        monkeypatch.setattr(adsb_service, "_adsb_rate_limiter", RecordingNoLimit())
        return taken

    @pytest.fixture
    def feed(self, monkeypatch) -> list[str]:
        """Every call answers 200 with no aircraft, unless `refusing` is set; records the URLs called."""
        called: list[str] = []

        async def fake_get_response(client, url):
            called.append(url)
            if self.refusing:
                return httpx.Response(429, headers=self.refusing, request=httpx.Request("GET", url))
            return httpx.Response(200, json={"ac": [], "aircraft": [], "now": 0}, request=httpx.Request("GET", url))

        self.refusing: dict[str, str] | None = None
        monkeypatch.setattr(adsb_service, "_get_response", fake_get_response)
        return called

    async def _refuse_for_the_day(self, headers: dict[str, str] | None = None) -> None:
        self.refusing = headers or self.DAILY_REFUSAL
        with pytest.raises(httpx.HTTPStatusError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        self.refusing = None

    async def test_the_next_call_is_refused_locally(self, quota_tracker, clock, feed, slots):
        await self._refuse_for_the_day()

        with pytest.raises(adsb_service.DailyLimitReachedError, match=r"api\.adsb\.lol.*7200s"):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)

        assert len(feed) == 1
        # Refused before the rate limiter: no call slot is spent on it.
        assert slots == [ADSB_LOL]

    async def test_callers_handling_a_throttled_call_handle_it(self, quota_tracker, clock, feed):
        # The map and the watcher catch UpstreamThrottledError; this must be one.
        await self._refuse_for_the_day()
        with pytest.raises(UpstreamThrottledError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)

    async def test_still_refused_long_after_the_clamped_cooldown(self, quota_tracker, clock, feed):
        await self._refuse_for_the_day()
        clock[0] += 7200_000 - 1000

        with pytest.raises(adsb_service.DailyLimitReachedError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert len(feed) == 1

    async def test_calls_resume_at_the_feeds_stated_reset_not_midnight(self, quota_tracker, clock, feed):
        await self._refuse_for_the_day()
        clock[0] += 7200_000

        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert len(feed) == 2

    async def test_a_wild_reset_stops_calls_for_a_day_at_most(self, quota_tracker, clock, feed):
        await self._refuse_for_the_day({"x-ratelimit-remaining": "0", "x-ratelimit-reset": "9999999"})
        assert quota_tracker.refused_for_seconds(ADSB_LOL) == QUOTA_WINDOW_SECONDS

        clock[0] += DAY_MS
        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert len(feed) == 2

    async def test_a_per_minute_refusal_does_not_stop_calls(self, quota_tracker, clock, feed):
        # Short-window 429s keep the limiter's clamped cooldown only.
        self.refusing = {"x-ratelimit-remaining": "0", "x-ratelimit-reset": "30"}
        with pytest.raises(httpx.HTTPStatusError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        self.refusing = None

        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert len(feed) == 2

    async def test_a_429_with_calls_left_does_not_stop_calls(self, quota_tracker, clock, feed):
        await self._refuse_for_the_day({"x-ratelimit-remaining": "3", "x-ratelimit-reset": "7200"})

        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert len(feed) == 2

    async def test_a_count_at_the_limit_alone_does_not_stop_calls(self, quota_tracker, clock, feed):
        await record_calls(quota_tracker, ADSB_LOL, 500)

        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)
        assert len(feed) == 1

    async def test_a_feed_with_no_known_limit_is_unaffected(self, quota_tracker, clock, feed):
        await self._refuse_for_the_day()

        await adsb_service.fetch_aircraft(54.0, -1.5, 100, f"https://{OTHER_FEED}/v2")
        assert feed[-1].startswith(f"https://{OTHER_FEED}/v2/point/")

    async def test_the_local_decoder_is_never_refused(self, quota_tracker, clock, feed):
        await quota_tracker.note_exhausted("offgrid.local", 7200)

        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.READSB)
        assert feed == [self.READSB]

    async def test_the_squawk_watcher_makes_no_call_and_tries_its_next_source(
        self, monkeypatch, quota_tracker, clock, feed
    ):
        await self._refuse_for_the_day()
        observed = await self._watch_once(monkeypatch, (self.ONLINE, self.READSB))

        assert observed is True
        assert feed[1:] == [self.READSB]

    async def test_the_squawk_watcher_with_no_other_source_waits(self, monkeypatch, quota_tracker, clock, feed):
        await self._refuse_for_the_day()
        observed = await self._watch_once(monkeypatch, (self.ONLINE, None))

        assert observed is False
        assert len(feed) == 1

    @staticmethod
    async def _watch_once(monkeypatch, sources: tuple[str, str | None]) -> bool:
        """One squawk watcher tick against `sources`, due to fetch and with nothing cached or alerted."""
        squawk_tracker = adsb_squawk.SquawkTracker()

        async def online_mode(domain, db):
            return "online"

        async def interval(db, watch_mode):
            return 20.0

        async def area(db, watch_mode=None):
            return (54.0, -1.5)

        async def urls(domain, db, *, online_default, offgrid_default):
            return sources

        async def refresh_interval(db):
            return 60.0

        async def observe(snapshot, db):
            return None

        async def no_cache(db, lat, lon, snapshot, fresh_for_ms):
            return None

        monkeypatch.setattr(adsb_squawk, "tracker", squawk_tracker)
        monkeypatch.setattr(adsb_squawk, "resolve_effective_mode", online_mode)
        monkeypatch.setattr(adsb_squawk, "watch_interval_s", interval)
        monkeypatch.setattr(adsb_squawk, "watch_area", area)
        monkeypatch.setattr(adsb_squawk, "resolve_domain_urls", urls)
        monkeypatch.setattr(adsb_squawk.adsb_service, "online_refresh_interval_s", refresh_interval)
        monkeypatch.setattr(squawk_tracker, "observe", observe)
        monkeypatch.setattr(adsb_squawk, "_cache_for_the_map", no_cache)
        # Long after any browser poll or snapshot, so the watcher fetches.
        monkeypatch.setattr(adsb_squawk, "_now_ms", lambda: START_MS + 10**9)
        return await adsb_squawk.watch_once(object())


class TestDailyQuotaResetSeconds:
    @pytest.mark.parametrize(
        ("header", "expected"),
        [("7200", 7200.0), (" 61 ", 61.0), ("60", None), ("30", None), ("soon", None), (None, None)],
    )
    def test_only_a_reset_longer_than_a_minute_is_the_days(self, header, expected):
        assert _daily_quota_reset_seconds(header) == expected

    @pytest.mark.parametrize(
        ("header", "expected"),
        [("86400", 86400.0), ("86401", 86400.0), ("9999999", 86400.0)],
    )
    def test_a_reset_is_capped_at_the_daily_window(self, header, expected):
        # A daily limit can't reset further off than a day: a wild header
        # mustn't stop calls for longer.
        assert _daily_quota_reset_seconds(header) == expected


# ── The endpoint the map and Settings poll ────────────────────────────────────


class TestOnlineQuotaEndpoint:
    URL = "/api/air/adsb/online-quota"

    def test_reports_the_selected_feeds_count(self, client, quota_tracker, clock):
        quota_tracker._hosts[ADSB_LOL] = online_quota._HostCount()
        quota_tracker._hosts[ADSB_LOL].call_times_ms.extend([START_MS - 1000] * 3)

        response = client.get(self.URL)

        assert response.status_code == 200
        assert response.json() == {
            "host": ADSB_LOL,
            "used": 3,
            "state": "ok",
            "limit": 500,
            "limitSource": "default",
            "remaining": 497,
            "resetsInSeconds": 16 * 3600,
        }

    def test_another_selected_feed_reports_its_own_count(self, client, quota_tracker, clock, monkeypatch):
        set_daily_limit_setting(monkeypatch, None, selected_feed="https://opendata.adsb.fi/api/v2")
        quota_tracker._hosts[ADSB_LOL] = online_quota._HostCount()
        quota_tracker._hosts[ADSB_LOL].call_times_ms.append(START_MS)

        body = client.get(self.URL).json()

        assert (body["host"], body["used"], body["state"], body["limit"]) == (OTHER_FEED, 0, "no_limit", None)
