"""Tests for `location_source.py`: this machine's position, read from Sentinel's Location setting.

The position other Sentinels plot must come from core's `app.location`, survive
a core outage (the last good value is kept), and never be half-published.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_location_source.py
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import pytest
from backend.platform import settings_client
from sdr_manager_local_fake_clock import FakeClock

from sentinel_sdr_manager_local.location_source import (
    LOCATION_KEY,
    LOCATION_NAMESPACE,
    CoreLocationSource,
    parse_location_setting,
)

NOW_MS = 1_700_000_000_000


class TestParseLocationSetting:
    @pytest.mark.parametrize(
        ("setting", "expected"),
        [
            pytest.param({"latitude": "51.5", "longitude": "-0.12"}, (51.5, -0.12), id="strings-as-typed"),
            pytest.param({"latitude": " 51.5 ", "longitude": "-0.12 "}, (51.5, -0.12), id="padded-strings"),
            pytest.param({"latitude": 51.5, "longitude": -0.12}, (51.5, -0.12), id="numbers"),
            pytest.param({"latitude": 0, "longitude": 0}, (0.0, 0.0), id="null-island-is-a-position"),
        ],
    )
    def test_reads_a_complete_pair(self, setting: dict[str, Any], expected: tuple[float, float]) -> None:
        assert parse_location_setting(setting) == expected

    @pytest.mark.parametrize(
        "setting",
        [
            pytest.param({"latitude": "", "longitude": ""}, id="fresh-install-blank"),
            pytest.param({"latitude": "51.5", "longitude": ""}, id="half-blank"),
            pytest.param({"latitude": "51.5", "longitude": "   "}, id="whitespace"),
            pytest.param({"latitude": "51.5"}, id="missing-key"),
            pytest.param({"latitude": None, "longitude": None}, id="nulls"),
            pytest.param({"latitude": True, "longitude": 1}, id="boolean-is-not-a-coordinate"),
            pytest.param({"latitude": "north", "longitude": "1"}, id="not-a-number"),
            pytest.param({"latitude": [51.5], "longitude": "1"}, id="wrong-type"),
            pytest.param({"latitude": "nan", "longitude": "1"}, id="nan"),
            pytest.param({"latitude": "1", "longitude": "inf"}, id="infinity"),
            pytest.param(None, id="setting-absent"),
            pytest.param("51.5,-0.12", id="not-an-object"),
        ],
    )
    def test_anything_incomplete_or_unusable_is_unset(self, setting: Any) -> None:
        assert parse_location_setting(setting) is None


@pytest.fixture
def core_answers(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Make the settings client remote, answering `app.location` with whatever the test sets."""
    answer: dict[str, Any] = {"value": None, "error": None, "calls": []}

    async def read_setting(db: Any, namespace: str, key: str, default: Any = None) -> Any:
        answer["calls"].append((db, namespace, key))
        if answer["error"] is not None:
            raise answer["error"]
        return answer["value"]

    monkeypatch.setattr(settings_client, "settings_are_remote", lambda: True)
    monkeypatch.setattr(settings_client, "read_setting", read_setting)
    return answer


class TestRefresh:
    async def test_starts_unset(self) -> None:
        location = await CoreLocationSource(FakeClock(NOW_MS), 60).get_location()

        assert location.is_set is False
        assert location.updated_at == 0

    async def test_reads_app_location_from_core(self, core_answers: dict[str, Any]) -> None:
        core_answers["value"] = {"latitude": "54.95149", "longitude": "-1.53586"}
        source = CoreLocationSource(FakeClock(NOW_MS), 60)

        await source.refresh()
        location = await source.get_location()

        assert core_answers["calls"] == [(None, LOCATION_NAMESPACE, LOCATION_KEY)]
        assert (location.latitude, location.longitude) == (54.95149, -1.53586)
        assert location.updated_at == NOW_MS

    async def test_a_blank_setting_clears_the_position(self, core_answers: dict[str, Any]) -> None:
        source = CoreLocationSource(FakeClock(NOW_MS), 60)
        core_answers["value"] = {"latitude": "54.9", "longitude": "-1.5"}
        await source.refresh()

        core_answers["value"] = {"latitude": "", "longitude": ""}
        await source.refresh()
        location = await source.get_location()

        assert location.is_set is False
        assert location.updated_at == NOW_MS

    async def test_keeps_the_last_good_position_while_core_is_down(
        self, core_answers: dict[str, Any], caplog: pytest.LogCaptureFixture
    ) -> None:
        source = CoreLocationSource(FakeClock(NOW_MS), 60)
        core_answers["value"] = {"latitude": "54.9", "longitude": "-1.5"}
        await source.refresh()

        core_answers["error"] = settings_client.SettingsUnavailable("core settings API unreachable")
        with caplog.at_level(logging.INFO, logger="sentinel_sdr_manager_local.location_source"):
            await source.refresh()
            await source.refresh()
        location = await source.get_location()

        assert (location.latitude, location.longitude) == (54.9, -1.5)
        # Said once per outage, not on every failed refresh.
        assert [record.getMessage().startswith("location: core unreachable") for record in caplog.records] == [True]

    async def test_logs_the_next_outage_again_after_core_came_back(
        self, core_answers: dict[str, Any], caplog: pytest.LogCaptureFixture
    ) -> None:
        source = CoreLocationSource(FakeClock(NOW_MS), 60)
        with caplog.at_level(logging.INFO, logger="sentinel_sdr_manager_local.location_source"):
            core_answers["error"] = settings_client.SettingsUnavailable("down")
            await source.refresh()
            core_answers["error"] = None
            core_answers["value"] = {"latitude": "1", "longitude": "2"}
            await source.refresh()
            core_answers["error"] = settings_client.SettingsUnavailable("down again")
            await source.refresh()

        assert sum("core unreachable" in record.getMessage() for record in caplog.records) == 2
        assert (await source.get_location()).is_set is True

    async def test_never_asks_when_there_is_no_core_to_ask(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def must_not_be_called(*_args: Any, **_kwargs: Any) -> Any:
            raise AssertionError("read_setting called without a core")

        monkeypatch.setattr(settings_client, "settings_are_remote", lambda: False)
        monkeypatch.setattr(settings_client, "read_setting", must_not_be_called)
        source = CoreLocationSource(FakeClock(NOW_MS), 60)

        await source.refresh()

        assert (await source.get_location()).is_set is False

    @pytest.mark.parametrize(
        "setting",
        [
            pytest.param({"latitude": "91", "longitude": "0"}, id="latitude-off-the-globe"),
            pytest.param({"latitude": "0", "longitude": "-180.5"}, id="longitude-off-the-globe"),
        ],
    )
    async def test_an_out_of_range_setting_publishes_no_position(
        self, core_answers: dict[str, Any], setting: dict[str, str], caplog: pytest.LogCaptureFixture
    ) -> None:
        source = CoreLocationSource(FakeClock(NOW_MS), 60)
        core_answers["value"] = {"latitude": "54.9", "longitude": "-1.5"}
        await source.refresh()

        core_answers["value"] = setting
        with caplog.at_level(logging.WARNING, logger="sentinel_sdr_manager_local.location_source"):
            await source.refresh()
        location = await source.get_location()

        # Not the previous value either: core answered, with something unusable.
        assert location.is_set is False
        assert location.updated_at == NOW_MS
        assert "out of range" in caplog.text


class _CountingClock(FakeClock):
    """Ends the loop on its `stop_after`-th sleep, recording each requested interval."""

    def __init__(self, stop_after: int) -> None:
        super().__init__(NOW_MS)
        self.sleeps: list[float] = []
        self._stop_after = stop_after

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        if len(self.sleeps) >= self._stop_after:
            raise asyncio.CancelledError


class TestRun:
    async def test_refreshes_at_once_then_every_interval(self, core_answers: dict[str, Any]) -> None:
        core_answers["value"] = {"latitude": "1", "longitude": "2"}
        clock = _CountingClock(stop_after=2)
        source = CoreLocationSource(clock, 45)

        with pytest.raises(asyncio.CancelledError):
            await source.run()

        assert len(core_answers["calls"]) == 2
        assert clock.sleeps == [45, 45]

    async def test_an_unexpected_failure_is_logged_and_the_loop_carries_on(
        self, core_answers: dict[str, Any], caplog: pytest.LogCaptureFixture
    ) -> None:
        core_answers["error"] = RuntimeError("boom")
        clock = _CountingClock(stop_after=2)
        source = CoreLocationSource(clock, 45)

        with (
            caplog.at_level(logging.ERROR, logger="sentinel_sdr_manager_local.location_source"),
            pytest.raises(asyncio.CancelledError),
        ):
            await source.run()

        assert len(core_answers["calls"]) == 2
        assert caplog.text.count("location: refresh failed") == 2

    async def test_cancellation_during_a_refresh_is_not_swallowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        source = CoreLocationSource(_CountingClock(stop_after=99), 45)

        async def cancelled_refresh() -> None:
            raise asyncio.CancelledError

        monkeypatch.setattr(source, "refresh", cancelled_refresh)

        with pytest.raises(asyncio.CancelledError):
            await source.run()
