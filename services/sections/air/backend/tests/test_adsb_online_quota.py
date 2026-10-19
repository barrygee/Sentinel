"""Tests for keeping Air inside the online ADS-B feed's daily quota.

adsb.lol allows 500 requests a day (`x-ratelimit-limit: 500, 4;w=1, 60;w=60,
500;w=86400`). Air used to call it every 10 s while a map was open, plus every
20 s from the background squawk watcher, and spent the day's budget in about an
hour; after that every call was a 429 and the map went empty with 503s.

What these pin:

- the operator's Settings › AIR › Online Refresh Interval
  (`air.onlineRefreshIntervalSec`) is read, clamped and defaulted correctly;
- every call to the online feed, the map's and the watcher's, is spaced by it,
  while a local decoder keeps its own short spacing;
- an online snapshot stays a cache HIT for the whole interval and may stand in
  for that long plus the usual stale window;
- once the quota is spent, Air waits for adsb.lol's own reset instead of
  retrying every minute.

Run with:  uv run --project backend pytest services/sections/air/backend/tests/test_adsb_online_quota.py
"""

from __future__ import annotations

import time

import httpx
import pytest
from backend.services.upstream_rate_limit import MinimumIntervalRateLimiter, UpstreamThrottledError

from sentinel_air import router as air_router
from sentinel_air.services import adsb as adsb_service
from sentinel_air.services import adsb_squawk
from sentinel_air.services.adsb import _cooldown_seconds, _quota_reset_header

# Pinned rather than read from `settings`, so a `.env` on the machine running
# the suite cannot quietly change what these tests assert.
DEFAULT_REFRESH_INTERVAL_S = 180.0
PENALTY_MS = 60_000
MAX_PENALTY_MS = 600_000
OFFGRID_TTL_MS = 10_000
STALE_MS = 60_000


@pytest.fixture(autouse=True)
def pinned_settings(monkeypatch):
    """Fix every setting these tests depend on to its documented default."""
    monkeypatch.setattr(adsb_service.settings, "adsb_online_refresh_interval_s", DEFAULT_REFRESH_INTERVAL_S)
    monkeypatch.setattr(adsb_service.settings, "adsb_rate_limit_penalty_ms", PENALTY_MS)
    monkeypatch.setattr(adsb_service.settings, "adsb_rate_limit_max_penalty_ms", MAX_PENALTY_MS)
    monkeypatch.setattr(adsb_service.settings, "adsb_ttl_ms", OFFGRID_TTL_MS)
    monkeypatch.setattr(adsb_service.settings, "adsb_stale_ms", STALE_MS)


# ── The limiter's per-call interval ────────────────────────────────────────────


class TestPerCallInterval:
    """`acquire(interval_seconds=…)` spaces the next slot by the caller's gap, not the limiter's."""

    async def test_a_given_interval_holds_the_next_slot_that_far_out(self):
        limiter = MinimumIntervalRateLimiter(interval_seconds=0)
        await limiter.acquire("api.example", max_wait_seconds=0.01, interval_seconds=30)

        # With the limiter's own zero interval this would be granted; only the
        # per-call 30 s gap can refuse it.
        with pytest.raises(UpstreamThrottledError):
            await limiter.acquire("api.example", max_wait_seconds=0.01)

    async def test_without_one_the_limiters_own_interval_applies(self):
        limiter = MinimumIntervalRateLimiter(interval_seconds=30)
        await limiter.acquire("api.example", max_wait_seconds=0.01)

        with pytest.raises(UpstreamThrottledError):
            await limiter.acquire("api.example", max_wait_seconds=0.01)

    async def test_a_zero_interval_overrides_a_long_default(self):
        """`0` is a real interval, not "unset" — it must not fall back to the default."""
        limiter = MinimumIntervalRateLimiter(interval_seconds=30)
        await limiter.acquire("api.example", max_wait_seconds=0.01, interval_seconds=0)

        await limiter.acquire("api.example", max_wait_seconds=0.01)

    async def test_the_gap_is_per_host(self):
        limiter = MinimumIntervalRateLimiter(interval_seconds=0)
        await limiter.acquire("api.example", max_wait_seconds=0.01, interval_seconds=30)

        await limiter.acquire("offgrid.local", max_wait_seconds=0.01)


# ── Reading the operator's interval ───────────────────────────────────────────


class TestOnlineRefreshIntervalSetting:
    """`online_refresh_interval_s` reads `air.onlineRefreshIntervalSec`, clamped to 5–280 s."""

    @staticmethod
    def _stored(monkeypatch, value):
        reads: list[tuple[str, str]] = []

        async def fake_read_setting(db, namespace, key, default=None):
            reads.append((namespace, key))
            return value

        monkeypatch.setattr(adsb_service, "read_setting", fake_read_setting)
        return reads

    async def test_reads_the_air_setting(self, monkeypatch):
        reads = self._stored(monkeypatch, 120)

        assert await adsb_service.online_refresh_interval_s(object()) == 120.0
        assert reads == [("air", "onlineRefreshIntervalSec")]

    async def test_a_fractional_value_is_kept(self, monkeypatch):
        self._stored(monkeypatch, 172.8)

        assert await adsb_service.online_refresh_interval_s(object()) == 172.8

    @pytest.mark.parametrize("stored", [None, "120", True, False, [120], {"seconds": 120}])
    async def test_anything_but_a_number_uses_the_config_default(self, monkeypatch, stored):
        # A bool is an int in Python; `True` must not become a 1 s interval.
        self._stored(monkeypatch, stored)

        assert await adsb_service.online_refresh_interval_s(object()) == DEFAULT_REFRESH_INTERVAL_S

    @pytest.mark.parametrize(("stored", "in_force"), [(0, 5.0), (-30, 5.0), (4.9, 5.0), (5, 5.0)])
    async def test_too_short_is_raised_to_the_minimum(self, monkeypatch, stored, in_force):
        self._stored(monkeypatch, stored)

        assert await adsb_service.online_refresh_interval_s(object()) == in_force

    @pytest.mark.parametrize(("stored", "in_force"), [(280, 280.0), (280.1, 280.0), (900, 280.0)])
    async def test_too_long_is_lowered_to_the_maximum(self, monkeypatch, stored, in_force):
        # Past ~5 minutes the map removes every aircraft between two refreshes.
        self._stored(monkeypatch, stored)

        assert await adsb_service.online_refresh_interval_s(object()) == in_force


class TestIsOnlineFeed:
    @pytest.mark.parametrize(
        ("base_url", "online"),
        [
            ("https://api.adsb.lol/v2", True),
            ("https://api.adsb.lol/v2/", True),
            ("http://adsb-decoder:8080/data/aircraft.json", False),
            ("http://adsb-decoder:8080/data", False),
            ("http://adsb-decoder:8080/data/", False),
        ],
    )
    def test_only_a_readsb_source_is_local(self, base_url, online):
        assert adsb_service.is_online_feed(base_url) is online


# ── fetch_aircraft spaces online calls by the interval ────────────────────────


class SpacingLimiter(MinimumIntervalRateLimiter):
    """Grants every slot and records the interval each call asked for."""

    def __init__(self) -> None:
        super().__init__(interval_seconds=0)
        self.intervals: list[tuple[str, float | None]] = []
        self.penalties: list[tuple[str, float]] = []

    async def acquire(self, host_key: str, max_wait_seconds: float, interval_seconds: float | None = None) -> None:
        self.intervals.append((host_key, interval_seconds))

    async def penalize(self, host_key: str, cooldown_seconds: float) -> None:
        self.penalties.append((host_key, cooldown_seconds))


class TestFetchAircraftSpacing:
    ONLINE = "https://api.adsb.lol/v2"
    READSB = "http://adsb-decoder:8080/data/aircraft.json"

    @pytest.fixture
    def limiter(self, monkeypatch) -> SpacingLimiter:
        spacing = SpacingLimiter()
        monkeypatch.setattr(adsb_service, "_adsb_rate_limiter", spacing)
        return spacing

    @pytest.fixture(autouse=True)
    def no_network(self, monkeypatch):
        async def fake_get_json(client, url):
            return {"ac": [], "now": 0}

        monkeypatch.setattr(adsb_service, "_get_json", fake_get_json)

    async def test_an_online_call_holds_the_given_interval(self, limiter):
        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE, 240.0)

        assert limiter.intervals == [("api.adsb.lol", 240.0)]

    async def test_an_online_call_without_one_holds_the_config_default(self, limiter):
        # A caller that forgets the setting must still stay inside the quota,
        # not fall back to the local decoder's 5 s spacing.
        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)

        assert limiter.intervals == [("api.adsb.lol", DEFAULT_REFRESH_INTERVAL_S)]

    async def test_a_local_decoder_keeps_the_limiters_own_spacing(self, limiter):
        # The online interval is about a public quota; off grid must stay live.
        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.READSB, 240.0)

        assert limiter.intervals == [("adsb-decoder:8080", None)]

    async def test_back_to_back_online_calls_are_refused_for_the_interval(self, monkeypatch):
        """End to end with the real limiter: the second poll never reaches the wire."""
        monkeypatch.setattr(adsb_service, "_adsb_rate_limiter", MinimumIntervalRateLimiter(5))
        await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE, 180.0)

        with pytest.raises(UpstreamThrottledError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE, 180.0)


# ── Waiting for the quota to reset ────────────────────────────────────────────


def _headers(**values: str) -> httpx.Headers:
    return httpx.Headers({name.replace("_", "-"): value for name, value in values.items()})


class TestQuotaResetHeader:
    """`_quota_reset_header` returns adsb.lol's reset only once nothing remains."""

    def test_a_spent_quota_gives_its_reset(self):
        headers = _headers(x_ratelimit_remaining="0", x_ratelimit_reset="64711")

        assert _quota_reset_header(headers) == "64711"

    def test_whitespace_around_the_remaining_count_is_tolerated(self):
        headers = _headers(x_ratelimit_remaining=" 0 ", x_ratelimit_reset="30")

        assert _quota_reset_header(headers) == "30"

    def test_budget_left_gives_nothing(self):
        # A 429 with budget left is a per-second/minute breach; the reset may
        # name the daily window's and park the feed for no reason.
        headers = _headers(x_ratelimit_remaining="12", x_ratelimit_reset="64711")

        assert _quota_reset_header(headers) is None

    def test_no_remaining_count_gives_nothing(self):
        assert _quota_reset_header(_headers(x_ratelimit_reset="64711")) is None

    def test_a_spent_quota_without_a_reset_gives_nothing(self):
        assert _quota_reset_header(_headers(x_ratelimit_remaining="0")) is None


class TestCooldownWithQuotaReset:
    def test_the_quota_reset_is_used_when_there_is_no_retry_after(self):
        assert _cooldown_seconds(None, "30") == 30.0

    def test_retry_after_wins_over_the_quota_reset(self):
        assert _cooldown_seconds("12", "30") == 12.0

    def test_a_long_reset_is_clamped_to_the_ceiling(self):
        # 18 hours from adsb.lol: try again in 10 minutes rather than park the
        # feed until tomorrow on one header.
        assert _cooldown_seconds(None, "64711") == MAX_PENALTY_MS / 1000

    def test_an_unparseable_reset_uses_the_default(self):
        assert _cooldown_seconds(None, "later") == PENALTY_MS / 1000

    def test_neither_header_uses_the_default(self):
        assert _cooldown_seconds(None, None) == PENALTY_MS / 1000


class TestFetchAircraftHonoursTheQuotaReset:
    ONLINE = "https://api.adsb.lol/v2"

    @pytest.fixture
    def limiter(self, monkeypatch) -> SpacingLimiter:
        spacing = SpacingLimiter()
        monkeypatch.setattr(adsb_service, "_adsb_rate_limiter", spacing)
        return spacing

    @staticmethod
    def _answer_429(monkeypatch, headers: dict[str, str]):
        async def fake_get_json(client, url):
            request = httpx.Request("GET", url)
            response = httpx.Response(429, request=request, headers=headers)
            raise httpx.HTTPStatusError("quota", request=request, response=response)

        monkeypatch.setattr(adsb_service, "_get_json", fake_get_json)

    async def test_a_spent_quota_cools_down_until_its_reset(self, monkeypatch, limiter):
        self._answer_429(monkeypatch, {"x-ratelimit-remaining": "0", "x-ratelimit-reset": "90"})

        with pytest.raises(httpx.HTTPStatusError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)

        assert limiter.penalties == [("api.adsb.lol", 90.0)]

    async def test_a_429_with_budget_left_uses_the_default_cooldown(self, monkeypatch, limiter):
        self._answer_429(monkeypatch, {"x-ratelimit-remaining": "3", "x-ratelimit-reset": "90"})

        with pytest.raises(httpx.HTTPStatusError):
            await adsb_service.fetch_aircraft(54.0, -1.5, 100, self.ONLINE)

        assert limiter.penalties == [("api.adsb.lol", PENALTY_MS / 1000)]


# ── The router: an online snapshot lasts the interval ─────────────────────────


class TestRouterOnlineFreshness:
    ONLINE = "https://online.example/v2"
    OFFGRID = "http://offgrid.example/data/aircraft.json"
    POINT = "/api/air/adsb/point/54.0/-1.5/100"
    SNAPSHOT = {"ac": [{"hex": "abc123"}], "total": 1}

    @pytest.fixture
    def clock(self, monkeypatch) -> list[int]:
        from backend import cache

        current = [1_800_000_000_000]
        monkeypatch.setattr(cache, "now_ms", lambda: current[0])
        monkeypatch.setattr(air_router, "now_ms", lambda: current[0])
        return current

    @pytest.fixture
    def fetches(self, monkeypatch) -> list[tuple[str, float | None]]:
        """Every source answers SNAPSHOT; records (base_url, online interval) per call."""
        calls: list[tuple[str, float | None]] = []

        async def fake_fetch(lat, lon, radius, base_url, online_interval_seconds=None):
            calls.append((base_url, online_interval_seconds))
            return self.SNAPSHOT

        monkeypatch.setattr(adsb_service, "fetch_aircraft", fake_fetch)
        return calls

    def _configure(self, client, *, online=ONLINE, override="online", interval=None):
        client.put("/api/settings/air/onlineDataSourceURL", json={"value": online})
        client.put("/api/settings/air/offgridDataSourceURL", json={"value": {"url": self.OFFGRID}})
        client.put("/api/settings/air/sourceOverride", json={"value": override})
        if interval is not None:
            client.put("/api/settings/air/onlineRefreshIntervalSec", json={"value": interval})

    def test_the_operators_interval_is_handed_to_the_fetch(self, client, clock, fetches):
        self._configure(client, interval=240)

        client.get(self.POINT)

        assert fetches == [(self.ONLINE, 240.0)]

    def test_an_online_snapshot_is_a_hit_for_the_whole_interval(self, client, clock, fetches):
        self._configure(client, interval=120)
        assert client.get(self.POINT).headers["X-Cache"] == "MISS"

        # Well past the 10 s off-grid TTL, still inside the 120 s interval.
        clock[0] += 120_000 - 1
        response = client.get(self.POINT)

        assert response.headers["X-Cache"] == "HIT"
        assert len(fetches) == 1

    def test_an_online_snapshot_is_refetched_once_the_interval_passes(self, client, clock, fetches):
        self._configure(client, interval=120)
        client.get(self.POINT)

        clock[0] += 120_000
        response = client.get(self.POINT)

        assert response.headers["X-Cache"] == "MISS"
        assert len(fetches) == 2

    def test_without_a_setting_the_config_default_applies(self, client, clock, fetches):
        self._configure(client)
        client.get(self.POINT)

        clock[0] += int(DEFAULT_REFRESH_INTERVAL_S * 1000) - 1

        assert client.get(self.POINT).headers["X-Cache"] == "HIT"
        assert fetches == [(self.ONLINE, DEFAULT_REFRESH_INTERVAL_S)]

    def test_an_off_grid_snapshot_keeps_the_short_ttl(self, client, clock, fetches):
        # Off grid the local decoder answers; the online quota must not slow it.
        self._configure(client, override="offgrid", interval=120)
        assert client.get(self.POINT).headers["X-Cache"] == "MISS"

        clock[0] += OFFGRID_TTL_MS
        response = client.get(self.POINT)

        assert response.headers["X-Cache"] == "MISS"
        assert [base_url for base_url, _ in fetches] == [self.OFFGRID, self.OFFGRID]

    def test_off_grid_the_stale_window_is_not_lengthened(self, client, clock, fetches, monkeypatch):
        self._configure(client, override="offgrid", interval=120)
        client.get(self.POINT)

        async def unreachable(lat, lon, radius, base_url, online_interval_seconds=None):
            raise httpx.ConnectError("down")

        monkeypatch.setattr(adsb_service, "fetch_aircraft", unreachable)
        clock[0] += STALE_MS + 1

        # An online primary would still serve this row (stale + interval);
        # off grid a minute-old receiver snapshot is too old to show as live.
        assert client.get(self.POINT).status_code == 503

    def test_with_no_online_source_the_setting_is_not_read(self, client, clock, fetches, monkeypatch):
        # An empty online URL falls back to the built-in default; blank that too.
        monkeypatch.setattr(adsb_service.settings, "adsb_upstream_base", "")
        self._configure(client, online="", override="offgrid")

        async def must_not_read(db):
            raise AssertionError("read the online interval with no online source")

        monkeypatch.setattr(adsb_service, "online_refresh_interval_s", must_not_read)

        response = client.get(self.POINT)

        assert response.status_code == 200
        assert fetches == [(self.OFFGRID, DEFAULT_REFRESH_INTERVAL_S)]


# ── The squawk watcher shares the spacing ─────────────────────────────────────


class TestWatcherSharesTheOnlineSpacing:
    """The watcher's online calls must hold the same gap, or it alone spends the quota."""

    async def test_the_watcher_hands_the_operators_interval_to_the_fetch(self, monkeypatch):
        tracker = adsb_squawk.SquawkTracker()
        monkeypatch.setattr(adsb_squawk, "tracker", tracker)

        async def online_mode(domain, db):
            return "online"

        async def interval(db, watch_mode):
            return 20.0

        async def area(db, watch_mode=None):
            return (51.5, -0.12)

        async def urls(domain, db, *, online_default, offgrid_default):
            return ("https://api.adsb.lol/v2", None)

        async def online_refresh_interval(db):
            return 240.0

        calls: list[tuple[str, float | None]] = []

        async def fake_fetch(lat, lon, radius, base_url, online_interval_seconds=None):
            calls.append((base_url, online_interval_seconds))
            return {"ac": []}

        async def observe(snapshot, db):
            return None

        monkeypatch.setattr(adsb_squawk, "resolve_effective_mode", online_mode)
        monkeypatch.setattr(adsb_squawk, "watch_interval_s", interval)
        monkeypatch.setattr(adsb_squawk, "watch_area", area)
        monkeypatch.setattr(adsb_squawk, "resolve_domain_urls", urls)
        monkeypatch.setattr(adsb_squawk.adsb_service, "online_refresh_interval_s", online_refresh_interval)
        monkeypatch.setattr(adsb_squawk.adsb_service, "fetch_aircraft", fake_fetch)
        monkeypatch.setattr(tracker, "observe", observe)
        # Long after any browser poll or snapshot, so the watcher fetches.
        monkeypatch.setattr(adsb_squawk, "_now_ms", lambda: int(time.time() * 1000) + 10**9)

        assert await adsb_squawk.watch_once(object()) is True
        assert calls == [("https://api.adsb.lol/v2", 240.0)]
