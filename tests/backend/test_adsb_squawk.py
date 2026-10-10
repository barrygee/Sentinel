"""
tests/backend/test_adsb_squawk.py

Unit tests for backend/services/adsb_squawk.py — server-side emergency squawk
alerts (docs/plans/adsb-server-alerts.md): the tracker that spots squawk
changes, the handler that turns them into alerts, and the watcher that fetches
only while no browser is.

Tracker and handler tests swap the module's bus for a recording one, so a test
sees exactly what was published without the rest of the app reacting.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db_helpers import upsert_setting
from backend.platform.bus import EventBus
from backend.services import adsb_squawk
from backend.services.adsb_squawk import (
    EMERGENCY_SQUAWKS,
    FORGET_AFTER_MS,
    NOTIFICATIONS_RAISE_SUBJECT,
    SQUAWK_CHANGED_SUBJECT,
    AdsbWatcher,
    SquawkTracker,
    callsign_of,
    emergency_detail,
    watch_area,
    watch_interval_s,
    watch_once,
)
from backend.services.upstream_rate_limit import UpstreamThrottledError

DB = object()  # stands in for a session where nothing reads it


@pytest.fixture
def published(monkeypatch) -> list[tuple[str, dict]]:
    """Every publish the module makes, in order."""
    recording_bus = EventBus()
    events: list[tuple[str, dict]] = []
    original_publish = recording_bus.publish

    async def record(subject: str, payload: dict, **kwargs: Any) -> None:
        events.append((subject, payload))
        await original_publish(subject, payload, **kwargs)

    recording_bus.publish = record  # type: ignore[method-assign]
    monkeypatch.setattr(adsb_squawk, "bus", recording_bus)
    return events


@pytest.fixture
def clock(monkeypatch) -> list[int]:
    """Controllable `_now_ms`: set `clock[0]`."""
    now = [1_000_000]
    monkeypatch.setattr(adsb_squawk, "_now_ms", lambda: now[0])
    return now


@pytest.fixture
async def db(test_engine, db_setup):
    async with AsyncSession(test_engine, expire_on_commit=False) as session:
        yield session


def aircraft(
    hex_code: str = "4ca123", squawk: str | None = "1200", **fields: Any
) -> dict:
    return {"hex": hex_code, "squawk": squawk, **fields}


# ── tracker ──────────────────────────────────────────────────────────────────


class TestSquawkTracker:
    async def test_a_first_sighting_with_a_normal_squawk_is_not_a_change(
        self, published, clock
    ):
        await SquawkTracker().observe({"ac": [aircraft(squawk="1200")]}, DB)
        assert published == []

    async def test_a_first_sighting_already_squawking_an_emergency_is_a_change(
        self, published, clock
    ):
        snapshot = {
            "ac": [
                aircraft(
                    squawk="7700",
                    flight="EIN123 ",
                    alt_baro=12000,
                    gs=420.4,
                    lat=51.5,
                    lon=-0.1,
                )
            ]
        }
        await SquawkTracker().observe(snapshot, DB)
        assert published == [
            (
                SQUAWK_CHANGED_SUBJECT,
                {
                    "hex": "4ca123",
                    "callsign": "EIN123",
                    "squawk": "7700",
                    "previous": None,
                    "alt_baro": 12000,
                    "gs": 420.4,
                    "lat": 51.5,
                    "lon": -0.1,
                    "ts": 1_000_000,
                    "db": DB,
                },
            )
        ]

    async def test_every_later_change_is_published_with_the_previous_squawk(
        self, published, clock
    ):
        tracker = SquawkTracker()
        await tracker.observe({"ac": [aircraft(squawk="1200")]}, DB)
        await tracker.observe({"ac": [aircraft(squawk="2000")]}, DB)
        await tracker.observe(
            {"ac": [aircraft(squawk="2000")]}, DB
        )  # unchanged: nothing
        assert [
            (payload["previous"], payload["squawk"]) for _, payload in published
        ] == [("1200", "2000")]

    async def test_a_missing_squawk_counts_as_blank(self, published, clock):
        tracker = SquawkTracker()
        await tracker.observe({"ac": [aircraft(squawk="7700")]}, DB)
        await tracker.observe({"ac": [aircraft(squawk=None)]}, DB)
        assert published[-1][1]["squawk"] == ""
        assert published[-1][1]["previous"] == "7700"

    async def test_aircraft_without_a_hex_and_empty_snapshots_are_ignored(
        self, published, clock
    ):
        tracker = SquawkTracker()
        await tracker.observe(
            {"ac": [{"squawk": "7700"}, {"hex": "", "squawk": "7700"}]}, DB
        )
        await tracker.observe({}, DB)
        await tracker.observe({"ac": None}, DB)
        assert published == []

    async def test_every_snapshot_marks_when_the_tracker_last_saw_one(
        self, published, clock
    ):
        tracker = SquawkTracker()
        assert tracker.last_observed_ms == 0
        clock[0] = 5_000_000
        await tracker.observe({"ac": []}, DB)
        assert tracker.last_observed_ms == 5_000_000

    def test_a_browser_poll_is_noted_without_observing_anything(self, published, clock):
        tracker = SquawkTracker()
        assert tracker.last_browser_poll_ms == 0
        clock[0] = 7_000_000
        tracker.browser_polled()
        assert tracker.last_browser_poll_ms == 7_000_000
        # A poll is not a snapshot: it must not look like one was observed.
        assert tracker.last_observed_ms == 0

    async def test_an_aircraft_missing_from_one_snapshot_does_not_alert_again(
        self, published, clock
    ):
        tracker = SquawkTracker()
        await tracker.observe({"ac": [aircraft(squawk="7700")]}, DB)
        clock[0] += 60_000
        await tracker.observe({"ac": []}, DB)  # e.g. the map looked elsewhere
        clock[0] += 60_000
        await tracker.observe({"ac": [aircraft(squawk="7700")]}, DB)
        assert len(published) == 1

    async def test_an_aircraft_unseen_for_the_whole_window_is_still_remembered(
        self, published, clock
    ):
        tracker = SquawkTracker()
        await tracker.observe({"ac": [aircraft(squawk="7700")]}, DB)
        clock[0] += FORGET_AFTER_MS  # exactly the window: kept
        await tracker.observe({"ac": []}, DB)
        await tracker.observe({"ac": [aircraft(squawk="7700")]}, DB)
        assert len(published) == 1

    async def test_an_aircraft_unseen_for_longer_is_forgotten_and_alerts_again(
        self, published, clock
    ):
        tracker = SquawkTracker()
        await tracker.observe({"ac": [aircraft(squawk="7700")]}, DB)
        clock[0] += FORGET_AFTER_MS + 1
        await tracker.observe({"ac": []}, DB)
        await tracker.observe({"ac": [aircraft(squawk="7700")]}, DB)
        assert len(published) == 2
        assert published[1][1]["previous"] is None


class TestCallsign:
    def test_prefers_the_flight_number_trimmed(self):
        assert (
            callsign_of({"hex": "4ca123", "flight": " EIN123 ", "r": "EI-ABC"})
            == "EIN123"
        )

    def test_falls_back_to_the_registration(self):
        assert (
            callsign_of({"hex": "4ca123", "flight": "  ", "r": " EI-ABC "}) == "EI-ABC"
        )

    def test_falls_back_to_the_hex(self):
        assert callsign_of({"hex": "4ca123", "flight": None}) == "4ca123"


# ── alerts ───────────────────────────────────────────────────────────────────


class TestEmergencyDetail:
    def test_airborne_with_speed(self):
        assert (
            emergency_detail("7700", 12000, 420.6)
            == "SQK 7700 — General Emergency · ALT 12,000 ft · GS 421 kt"
        )

    def test_a_fractional_altitude(self):
        assert (
            emergency_detail("7600", 3500.5, None)
            == "SQK 7600 — Radio Failure / Lost Comm · ALT 3,500.5 ft"
        )

    @pytest.mark.parametrize("alt_baro", ["ground", 0, -50, None])
    def test_on_the_ground_or_unknown_altitude(self, alt_baro):
        assert (
            emergency_detail("7500", alt_baro, 0)
            == "SQK 7500 — Hijacking / Unlawful Interference · ON GROUND"
        )

    def test_every_emergency_code_has_a_label(self):
        assert set(EMERGENCY_SQUAWKS) == {"7700", "7600", "7500"}


def change(squawk: str, previous: str | None) -> dict:
    return {
        "hex": "4ca123",
        "callsign": "EIN123",
        "squawk": squawk,
        "previous": previous,
        "alt_baro": 9000,
        "gs": 300,
        "ts": 42,
        "db": DB,
    }


class TestSquawkChangedHandler:
    async def test_an_emergency_raises_an_emergency_alert(self, published):
        await adsb_squawk._on_squawk_changed(change("7700", "1200"))
        assert published == [
            (
                NOTIFICATIONS_RAISE_SUBJECT,
                {
                    "msg_id": "adsb-squawk:4ca123:7700:42",
                    "type": "emergency",
                    "title": "EIN123",
                    "detail": "SQK 7700 — General Emergency · ALT 9,000 ft · GS 300 kt",
                    "ts": 42,
                    "hex": "4ca123",
                    "db": DB,
                },
            )
        ]

    async def test_leaving_an_emergency_raises_a_squawk_cleared_alert(self, published):
        await adsb_squawk._on_squawk_changed(change("2000", "7700"))
        _, payload = published[0]
        assert (payload["type"], payload["detail"], payload["msg_id"]) == (
            "squawk-clr",
            "Squawk changed to 2000",
            "adsb-squawk:4ca123:2000:42",
        )

    async def test_clearing_to_no_squawk_says_none(self, published):
        await adsb_squawk._on_squawk_changed(change("", "7600"))
        _, payload = published[0]
        assert payload["detail"] == "Squawk changed to (none)"
        assert payload["msg_id"] == "adsb-squawk:4ca123:none:42"

    async def test_an_ordinary_squawk_change_raises_nothing(self, published):
        await adsb_squawk._on_squawk_changed(change("2000", "1200"))
        await adsb_squawk._on_squawk_changed(change("2000", None))
        assert published == []

    async def test_end_to_end_on_the_real_bus_an_emergency_is_stored(self, db, clock):
        # The module's subscriptions are live on the process bus: tracker →
        # air.squawk.changed → notifications.raise → core stores it.
        from backend.models import AirMessage
        from sqlalchemy import select

        await SquawkTracker().observe(
            {"ac": [aircraft(squawk="7700", flight="EIN123")]}, db
        )
        rows = (await db.execute(select(AirMessage))).scalars().all()
        assert [(row.type, row.title, row.hex) for row in rows] == [
            ("emergency", "EIN123", "4ca123")
        ]


# ── where the watcher looks ──────────────────────────────────────────────────


def mode(monkeypatch, value: str) -> None:
    async def effective_mode(domain, db):
        return value

    monkeypatch.setattr(adsb_squawk, "resolve_effective_mode", effective_mode)


def receiver(monkeypatch, result: Any) -> None:
    async def receiver_location(db):
        if isinstance(result, BaseException):
            raise result
        return result

    monkeypatch.setattr(adsb_squawk.adsb_source, "receiver_location", receiver_location)


async def set_location(db: AsyncSession, value: Any) -> None:
    await upsert_setting(db, "app", "location", value)
    await db.commit()


class TestWatchArea:
    async def test_online_uses_the_operators_location(self, db, monkeypatch):
        mode(monkeypatch, "online")
        await set_location(db, {"latitude": "51.5", "longitude": "-0.12"})
        assert await watch_area(db) == (51.5, -0.12)

    @pytest.mark.parametrize(
        "value",
        [
            {"latitude": "", "longitude": ""},  # the seeded default: unset
            {"latitude": "51.5"},
            {"latitude": None, "longitude": None},
            "not a dict",
        ],
    )
    async def test_online_without_a_usable_location_stays_idle(
        self, db, monkeypatch, value
    ):
        mode(monkeypatch, "online")
        await set_location(db, value)
        assert await watch_area(db) is None

    async def test_online_with_no_location_setting_at_all_stays_idle(
        self, db, monkeypatch
    ):
        mode(monkeypatch, "online")
        assert await watch_area(db) is None

    async def test_off_grid_uses_the_receiver(self, db, monkeypatch):
        mode(monkeypatch, "offgrid")
        receiver(monkeypatch, (53.0, -2.0))
        await set_location(db, {"latitude": "51.5", "longitude": "-0.12"})
        assert await watch_area(db) == (53.0, -2.0)

    async def test_off_grid_without_a_receiver_position_uses_the_location(
        self, db, monkeypatch
    ):
        mode(monkeypatch, "offgrid")
        receiver(monkeypatch, None)
        await set_location(db, {"latitude": "51.5", "longitude": "-0.12"})
        assert await watch_area(db) == (51.5, -0.12)

    @pytest.mark.parametrize("error", [LookupError("no hub"), TimeoutError()])
    async def test_off_grid_with_no_hub_answering_uses_the_location(
        self, db, monkeypatch, error
    ):
        mode(monkeypatch, "offgrid")
        receiver(monkeypatch, error)
        await set_location(db, {"latitude": "51.5", "longitude": "-0.12"})
        assert await watch_area(db) == (51.5, -0.12)

    async def test_a_mode_passed_in_is_used_without_resolving_it_again(
        self, db, monkeypatch
    ):
        async def must_not_resolve(domain, db):
            raise AssertionError("the caller already resolved the mode")

        monkeypatch.setattr(adsb_squawk, "resolve_effective_mode", must_not_resolve)
        receiver(monkeypatch, (53.0, -2.0))
        await set_location(db, {"latitude": "51.5", "longitude": "-0.12"})
        assert await watch_area(db, "offgrid") == (53.0, -2.0)
        assert await watch_area(db, "online") == (51.5, -0.12)


async def set_air(db: AsyncSession, key: str, value: Any) -> None:
    await upsert_setting(db, "air", key, value)
    await db.commit()


@pytest.fixture
def interval_defaults(monkeypatch):
    # Distinct from each other and from every stored value below, so a test
    # can tell which default (if any) came back.
    monkeypatch.setattr(adsb_squawk.settings, "adsb_watch_online_interval_s", 21.0)
    monkeypatch.setattr(adsb_squawk.settings, "adsb_watch_offgrid_interval_s", 6.0)


class TestWatchIntervalS:
    @pytest.mark.parametrize(
        ("watch_mode", "expected"), [("online", 21.0), ("offgrid", 6.0)]
    )
    async def test_unset_uses_that_modes_default(
        self, db, interval_defaults, watch_mode, expected
    ):
        assert await watch_interval_s(db, watch_mode) == expected

    async def test_each_mode_reads_its_own_setting(self, db, interval_defaults):
        await set_air(db, "squawkWatchOnlineIntervalSec", 45)
        await set_air(db, "squawkWatchOffgridIntervalSec", 8)
        assert await watch_interval_s(db, "online") == 45.0
        assert await watch_interval_s(db, "offgrid") == 8.0

    @pytest.mark.parametrize("value", [5, 9999, 12.5])
    async def test_accepts_values_within_range(self, db, interval_defaults, value):
        await set_air(db, "squawkWatchOnlineIntervalSec", value)
        assert await watch_interval_s(db, "online") == float(value)

    @pytest.mark.parametrize(
        "value",
        [
            4.9,  # under the watcher's own tick
            0,
            -30,
            10_000,  # more than the four-digit input allows
            True,  # a JSON bool is an int (1) in Python, under the minimum
            "30",
            None,
            {"seconds": 30},
        ],
    )
    async def test_anything_else_falls_back_to_the_default(
        self, db, interval_defaults, value
    ):
        await set_air(db, "squawkWatchOnlineIntervalSec", value)
        assert await watch_interval_s(db, "online") == 21.0

    async def test_an_unknown_mode_is_treated_as_online(self, db, interval_defaults):
        await set_air(db, "squawkWatchOnlineIntervalSec", 45)
        assert await watch_interval_s(db, "auto") == 45.0


# ── fetching ─────────────────────────────────────────────────────────────────


class FakeTracker:
    def __init__(self, last_observed_ms: int = 0) -> None:
        self.last_observed_ms = last_observed_ms
        self.last_browser_poll_ms = 0
        self.observed: list[dict] = []

    async def observe(self, snapshot: dict, db: Any) -> None:
        self.observed.append(snapshot)


@pytest.fixture
def watch_setup(monkeypatch, clock):
    """A tracker that last saw a snapshot long ago, an area, and two sources."""
    tracker = FakeTracker()
    tracker.area_modes = []
    tracker.interval_modes = []
    monkeypatch.setattr(adsb_squawk, "tracker", tracker)
    mode(monkeypatch, "online")

    async def interval(db, watch_mode):
        tracker.interval_modes.append(watch_mode)
        return {"online": 20.0, "offgrid": 5.0}[watch_mode]

    async def area(db, watch_mode=None):
        tracker.area_modes.append(watch_mode)
        return (51.5, -0.12)

    monkeypatch.setattr(adsb_squawk, "watch_interval_s", interval)

    async def urls(domain, db, *, online_default, offgrid_default):
        return ("https://primary.example/v2", "https://fallback.example/v2")

    monkeypatch.setattr(adsb_squawk, "watch_area", area)
    monkeypatch.setattr(adsb_squawk, "resolve_domain_urls", urls)
    monkeypatch.setattr(adsb_squawk.settings, "adsb_watch_idle_s", 15.0)
    monkeypatch.setattr(adsb_squawk.settings, "adsb_watch_radius_nm", 250)
    return tracker


def fetch(monkeypatch, behaviour) -> list[tuple]:
    calls: list[tuple] = []

    async def fake_fetch(lat, lon, radius, base_url):
        calls.append((lat, lon, radius, base_url))
        return behaviour(base_url)

    monkeypatch.setattr(adsb_squawk.adsb_service, "fetch_aircraft", fake_fetch)
    return calls


class TestWatchOnce:
    async def test_fetches_the_area_and_feeds_the_tracker(
        self, watch_setup, monkeypatch
    ):
        calls = fetch(monkeypatch, lambda base_url: {"ac": ["snapshot"]})
        assert await watch_once(DB) is True
        assert calls == [(51.5, -0.12, 250, "https://primary.example/v2")]
        assert watch_setup.observed == [{"ac": ["snapshot"]}]

    async def test_does_nothing_while_a_snapshot_arrived_within_the_interval(
        self, watch_setup, monkeypatch, clock
    ):
        watch_setup.last_observed_ms = clock[0] - 19_999  # online interval: 20 s
        calls = fetch(monkeypatch, lambda base_url: {"ac": []})
        assert await watch_once(DB) is False
        assert calls == []

    async def test_fetches_once_the_interval_has_passed(
        self, watch_setup, monkeypatch, clock
    ):
        watch_setup.last_observed_ms = clock[0] - 20_000
        fetch(monkeypatch, lambda base_url: {"ac": []})
        assert await watch_once(DB) is True

    @pytest.mark.parametrize(
        ("watch_mode", "fetched"), [("offgrid", True), ("online", False)]
    )
    async def test_the_interval_is_the_current_modes(
        self, watch_setup, monkeypatch, clock, watch_mode, fetched
    ):
        # 5 s after the last snapshot: past the off-grid interval, inside the online one.
        mode(monkeypatch, watch_mode)
        watch_setup.last_observed_ms = clock[0] - 5_000
        fetch(monkeypatch, lambda base_url: {"ac": []})
        assert await watch_once(DB) is fetched
        assert watch_setup.interval_modes == [watch_mode]

    async def test_hands_the_resolved_mode_to_watch_area(
        self, watch_setup, monkeypatch
    ):
        mode(monkeypatch, "offgrid")
        fetch(monkeypatch, lambda base_url: {"ac": []})
        await watch_once(DB)
        assert watch_setup.area_modes == ["offgrid"]

    async def test_reads_no_settings_while_a_browser_polls(
        self, watch_setup, monkeypatch, clock
    ):
        # Idle ticks while the map is open cost nothing — in the Air service
        # every settings read is an HTTP call to core.
        async def must_not_resolve(domain, db):
            raise AssertionError("settings read while a browser is polling")

        monkeypatch.setattr(adsb_squawk, "resolve_effective_mode", must_not_resolve)
        watch_setup.last_browser_poll_ms = clock[0] - 14_999
        assert await watch_once(DB) is False
        assert watch_setup.interval_modes == []

    async def test_does_nothing_while_a_browser_polls_even_if_its_fetches_failed(
        self, watch_setup, monkeypatch, clock
    ):
        # The map's requests were answered from cache (upstream slow or
        # rate-limiting), so nothing was observed for a long time — yet the map
        # is open, and a watcher fetch now would take its rate budget.
        watch_setup.last_observed_ms = clock[0] - 600_000
        watch_setup.last_browser_poll_ms = clock[0] - 14_999
        calls = fetch(monkeypatch, lambda base_url: {"ac": []})
        assert await watch_once(DB) is False
        assert calls == []

    async def test_fetches_once_the_browser_has_stopped_polling(
        self, watch_setup, monkeypatch, clock
    ):
        watch_setup.last_observed_ms = clock[0] - 600_000
        watch_setup.last_browser_poll_ms = clock[0] - 15_000
        fetch(monkeypatch, lambda base_url: {"ac": []})
        assert await watch_once(DB) is True

    async def test_does_nothing_without_an_area(self, watch_setup, monkeypatch):
        async def no_area(db, watch_mode=None):
            return None

        monkeypatch.setattr(adsb_squawk, "watch_area", no_area)
        calls = fetch(monkeypatch, lambda base_url: {"ac": []})
        assert await watch_once(DB) is False
        assert calls == []

    @pytest.mark.parametrize(
        "error",
        [UpstreamThrottledError("throttled"), httpx.ConnectError("down")],
    )
    async def test_falls_back_to_the_second_source(
        self, watch_setup, monkeypatch, error
    ):
        def behaviour(base_url):
            if base_url == "https://primary.example/v2":
                raise error
            return {"ac": ["from fallback"]}

        calls = fetch(monkeypatch, behaviour)
        assert await watch_once(DB) is True
        assert [call[3] for call in calls] == [
            "https://primary.example/v2",
            "https://fallback.example/v2",
        ]
        assert watch_setup.observed == [{"ac": ["from fallback"]}]

    async def test_reports_nothing_observed_when_every_source_fails(
        self, watch_setup, monkeypatch
    ):
        def behaviour(base_url):
            raise httpx.ConnectError("down")

        fetch(monkeypatch, behaviour)
        assert await watch_once(DB) is False
        assert watch_setup.observed == []

    async def test_skips_a_missing_primary_source(self, watch_setup, monkeypatch):
        async def urls(domain, db, *, online_default, offgrid_default):
            return (None, "https://fallback.example/v2")

        monkeypatch.setattr(adsb_squawk, "resolve_domain_urls", urls)
        calls = fetch(monkeypatch, lambda base_url: {"ac": []})
        assert await watch_once(DB) is True
        assert [call[3] for call in calls] == ["https://fallback.example/v2"]


class TestAdsbWatcher:
    async def test_runs_a_pass_every_tick_and_survives_a_failing_one(
        self, monkeypatch, caplog
    ):
        passes: list[Any] = []
        two_passes = asyncio.Event()

        async def watch(db):
            passes.append(db)
            if len(passes) == 1:
                raise RuntimeError("first pass fails")
            two_passes.set()
            return True

        @asynccontextmanager
        async def session():
            yield "watch-session"

        monkeypatch.setattr(adsb_squawk, "watch_once", watch)
        monkeypatch.setattr(adsb_squawk, "AsyncSessionLocal", session)
        monkeypatch.setattr(adsb_squawk, "WATCH_TICK_S", 0)
        watcher = AdsbWatcher()
        watcher.start()
        await asyncio.wait_for(two_passes.wait(), timeout=2)
        await watcher.stop()
        assert passes[:2] == ["watch-session", "watch-session"]
        assert "ADS-B squawk watcher pass failed" in caplog.text
        assert watcher._task is None

    async def test_stop_without_start_is_a_no_op(self):
        watcher = AdsbWatcher()
        await watcher.stop()
        assert watcher._task is None


class TestWatchIntervalDefaults:
    def test_both_modes_keep_the_cadence_the_watcher_had_before_the_settings(self):
        # The watcher used to fetch every ~20 s (a 15 s idle window on a 5 s
        # tick); the settings were added without changing that.
        from backend.config import Settings

        assert Settings.model_fields["adsb_watch_online_interval_s"].default == 20.0
        assert Settings.model_fields["adsb_watch_offgrid_interval_s"].default == 20.0

    def test_both_settings_are_seeded_at_20_seconds(self):
        import json
        from pathlib import Path

        seeded = json.loads(
            (
                Path(__file__).resolve().parents[2] / "backend" / "default_config.json"
            ).read_text()
        )["air"]
        assert seeded["squawkWatchOnlineIntervalSec"] == 20
        assert seeded["squawkWatchOffgridIntervalSec"] == 20
