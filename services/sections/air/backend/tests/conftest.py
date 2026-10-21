"""Shared fixtures for Air's backend tests."""

from __future__ import annotations

import pytest
from backend.config import settings

from sentinel_air.services import adsb as adsb_service
from sentinel_air.services import online_quota


class InMemoryQuotaTracker(online_quota.OnlineQuotaTracker):
    """The real tracker with its database and notifications kept in memory.

    Every call that reaches an online feed is counted (`fetch_aircraft`), so
    without this each test fetching from a stubbed feed would write to the
    database and could raise real notifications.
    """

    def __init__(self) -> None:
        super().__init__()
        self._loaded = True
        self.persisted: list[tuple[str, int]] = []
        self.persisted_refusals: list[tuple[str, int]] = []
        self.announced: list[tuple[str, str]] = []

    async def load(self) -> None:
        self._loaded = True

    async def _persist(self, host: str, called_at_ms: int) -> None:
        self.persisted.append((host, called_at_ms))

    async def _persist_refusal(self, host: str, until_ms: int) -> None:
        self.persisted_refusals.append((host, until_ms))

    async def _announce_if_worse(self, status, previous_state) -> None:
        if online_quota._SEVERITY[status.state] > online_quota._SEVERITY[previous_state]:
            self.announced.append((status.host, status.state))


@pytest.fixture(autouse=True)
def no_real_feed_calls(monkeypatch):
    """Fail any test that would reach a real ADS-B feed.

    A test that stubbed the wrong layer once called adsb.lol from the
    developer's machine on every run, spending their daily call limit. Tests
    stub `_get_response` (or `fetch_aircraft`) themselves; anything that gets
    this far was going to the network.
    """

    async def refuse_real_call(client, url):
        raise AssertionError(f"test tried to call a real ADS-B feed: {url}")

    monkeypatch.setattr(adsb_service, "_get_response", refuse_real_call)


@pytest.fixture(autouse=True)
def quota_tracker(monkeypatch) -> InMemoryQuotaTracker:
    """A fresh in-memory quota tracker for every test, with no Daily Call Limit set
    and the default feed selected (both are settings reads otherwise)."""
    tracker = InMemoryQuotaTracker()
    monkeypatch.setattr(online_quota, "tracker", tracker)

    async def no_configured_limit() -> None:
        return None

    async def default_feed() -> str:
        return settings.adsb_upstream_base

    monkeypatch.setattr(online_quota, "configured_daily_limit", no_configured_limit)
    monkeypatch.setattr(online_quota, "online_feed_url", default_feed)
    return tracker
