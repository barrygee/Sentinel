"""Tests for `backend.services.land_feeds.poller.LandFeedsPoller` — the
background fetch loop, resync bookkeeping, fresh/stale/miss snapshot cache
state, and the short-lived image/clip byte cache.

No real network, no real sleeping and no real clock: every test either
(a) drives `resync()` bookkeeping without letting a task's fetch loop run
(a freshly created `asyncio.Task` does not execute until the test yields to
the event loop, so pure add/remove/enable/disable assertions never touch the
adapter or the DB), or (b) monkeypatches `asyncio.sleep` inside the poller
module with a scripted stand-in that records each requested duration and
raises a private sentinel exception after a fixed number of calls — this ends
the loop's `while True` deterministically without waiting on real time, while
still exercising the real backoff/reset arithmetic. `_StopPollLoop` is
distinct from `asyncio.CancelledError` on purpose, so a test can tell "the
loop ran exactly N scheduling decisions and then we stopped it" apart from
"the loop was genuinely cancelled".
"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import cache as cache_module
from backend.services.land_feeds import poller as poller_module
from backend.services.land_feeds.base import (
    FeedOffline,
    FeedRefNotFound,
    FeedUpstreamError,
)
from backend.services.land_feeds.poller import LandFeedsPoller
from backend.services.land_feeds.schema import FeedConfig, FeedSnapshot


class _StopPollLoop(Exception):
    """Raised by `ScriptedSleep` to end a poll loop deterministically."""


class ScriptedSleep:
    """Stand-in for `asyncio.sleep` that never actually waits.

    Records every requested duration; once `calls` reaches `stop_after`, it
    raises `_StopPollLoop` instead of returning, terminating the (otherwise
    infinite) `_run_feed` loop from inside the coroutine itself so the test
    can `await` the task and inspect exactly what happened up to that point.
    """

    def __init__(self, stop_after: int) -> None:
        self.calls: list[float] = []
        self._stop_after = stop_after

    async def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)
        if len(self.calls) >= self._stop_after:
            raise _StopPollLoop()


class FakeAdapter:
    """A minimal `FeedAdapter` whose `fetch()` plays back a scripted list of
    results — either a `FeedSnapshot` (success) or an exception instance/class
    (failure) — one per call, repeating the last entry once exhausted."""

    min_interval_seconds = 0.0
    supports_clips = True

    def __init__(self, script: list) -> None:
        self._script = script
        self.fetch_calls = 0
        self.image_calls = 0
        self.image_result: tuple[bytes, str] | Exception = (b"bytes", "image/jpeg")

    async def fetch(self, config: FeedConfig, credential: dict | None) -> FeedSnapshot:
        self.fetch_calls += 1
        index = min(self.fetch_calls - 1, len(self._script) - 1)
        outcome = self._script[index]
        if isinstance(outcome, BaseException):
            raise outcome
        if isinstance(outcome, type) and issubclass(outcome, BaseException):
            raise outcome("scripted failure")
        return outcome

    async def probe(self, config, credential):
        raise NotImplementedError

    async def image(self, config, credential, ref):
        self.image_calls += 1
        if isinstance(self.image_result, BaseException):
            raise self.image_result
        return self.image_result

    async def clip(self, config, credential, ref):
        return await self.image(config, credential, ref)


def _feed_dict(**overrides) -> dict:
    base = {
        "id": "durham-cc",
        "name": "Durham County Council",
        "category": "traffic-cameras",
        "provider": "durham",
        "url": "https://example.org/layer",
        "enabled": True,
        "refreshSeconds": 15,
        "auth": {"type": "none"},
    }
    base.update(overrides)
    return base


@pytest.fixture()
def fresh_poller(test_engine, db_setup, monkeypatch) -> LandFeedsPoller:
    """A brand-new poller instance (never the process-wide singleton) wired
    to the in-memory test DB, so `_run_feed`'s credential lookups never touch
    a real database."""
    TestSession = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(poller_module, "AsyncSessionLocal", TestSession)
    return LandFeedsPoller()


async def _drain(instance: LandFeedsPoller) -> None:
    """Stop every task a test started, tolerating the case where none were."""
    await instance.stop()


async def _run_scripted(
    monkeypatch, instance: LandFeedsPoller, feed_id: str, stop_after: int
) -> ScriptedSleep:
    """Resync `instance` with whatever config is already registered under
    `feed_id`, run its loop under a `ScriptedSleep`, and return the sleeper
    once `_StopPollLoop` ends the loop."""
    sleeper = ScriptedSleep(stop_after)
    monkeypatch.setattr(poller_module.asyncio, "sleep", sleeper)
    task = instance._tasks[feed_id]
    with pytest.raises(_StopPollLoop):
        await task
    return sleeper


class TestResyncAddRemoveEnableDisable:
    async def test_adding_an_enabled_feed_starts_a_task(self, fresh_poller):
        await fresh_poller.resync([_feed_dict()])
        assert [config.id for config in fresh_poller.list_configs()] == ["durham-cc"]
        assert "durham-cc" in fresh_poller._tasks
        # The task is scheduled but has not yet had a chance to run its first
        # iteration (that requires yielding to the event loop), so `running`
        # is still the FeedStatus default here — see
        # TestFetchLoopSuccessAndErrorTransitions for the loop actually
        # setting it True once it starts.
        assert fresh_poller.get_status("durham-cc").running is False
        await _drain(fresh_poller)

    async def test_adding_a_disabled_feed_does_not_start_a_task(self, fresh_poller):
        await fresh_poller.resync([_feed_dict(enabled=False)])
        assert fresh_poller.get_config("durham-cc") is not None
        assert fresh_poller.get_status("durham-cc").running is False
        assert "durham-cc" not in fresh_poller._tasks
        await _drain(fresh_poller)

    async def test_removing_a_feed_stops_its_task_and_clears_state(self, fresh_poller):
        await fresh_poller.resync([_feed_dict()])
        await fresh_poller.resync([])  # feed removed from the new list
        assert fresh_poller.get_config("durham-cc") is None
        assert fresh_poller.list_configs() == []
        # get_status() returns a fresh default rather than KeyError for an
        # unknown feed id, so this also proves the state was actually cleared
        # rather than merely unreachable.
        assert fresh_poller.get_status("durham-cc").running is False

    async def test_disabling_a_running_feed_stops_it_and_empties_its_snapshot(
        self, fresh_poller
    ):
        await fresh_poller.resync([_feed_dict(enabled=True)])
        await fresh_poller.resync([_feed_dict(enabled=False)])
        assert fresh_poller.get_status("durham-cc").running is False
        assert "durham-cc" not in fresh_poller._tasks
        snapshot, cache_state = fresh_poller.get_snapshot_with_cache_state("durham-cc")
        assert snapshot.features == []
        assert cache_state == "MISS"

    async def test_enabling_a_previously_disabled_feed_starts_a_task(
        self, fresh_poller
    ):
        await fresh_poller.resync([_feed_dict(enabled=False)])
        await fresh_poller.resync([_feed_dict(enabled=True)])
        assert "durham-cc" in fresh_poller._tasks
        await _drain(fresh_poller)

    async def test_running_flag_is_true_once_the_loop_actually_starts(
        self, fresh_poller, monkeypatch
    ):
        """Distinguishes "task scheduled" from "task is actually looping" —
        `running` only flips once `_run_feed`'s body begins executing."""
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        gate = asyncio.Event()
        # Captured before patching `poller_module.asyncio.sleep` below (that
        # patch mutates the *same* asyncio module the test imports), so the
        # test still has a real, non-blocking way to yield to the event loop.
        real_sleep = asyncio.sleep

        async def blocking_sleep(seconds: float) -> None:
            await gate.wait()

        monkeypatch.setattr(poller_module.asyncio, "sleep", blocking_sleep)
        await fresh_poller.resync([_feed_dict()])
        # Yield control so the scheduled task actually runs its first
        # iteration and parks on `blocking_sleep`.
        await real_sleep(0)
        assert fresh_poller.get_status("durham-cc").running is True
        gate.set()
        await _drain(fresh_poller)
        assert fresh_poller.get_status("durham-cc").running is False

    async def test_resync_is_a_no_op_for_an_already_running_unchanged_feed(
        self, fresh_poller
    ):
        await fresh_poller.resync([_feed_dict()])
        first_task = fresh_poller._tasks["durham-cc"]
        await fresh_poller.resync([_feed_dict()])  # same config again
        assert fresh_poller._tasks["durham-cc"] is first_task
        await _drain(fresh_poller)

    async def test_invalid_entries_are_skipped_not_fatal(self, fresh_poller):
        await fresh_poller.resync([{"id": "not-a-valid-feed"}, _feed_dict()])
        assert [config.id for config in fresh_poller.list_configs()] == ["durham-cc"]
        await _drain(fresh_poller)

    async def test_non_dict_entries_are_skipped(self, fresh_poller):
        await fresh_poller.resync(["not-a-dict", 42, None, _feed_dict()])
        assert [config.id for config in fresh_poller.list_configs()] == ["durham-cc"]
        await _drain(fresh_poller)

    async def test_stop_cancels_every_task_and_is_idempotent(self, fresh_poller):
        await fresh_poller.resync([_feed_dict(id="feed-a"), _feed_dict(id="feed-b")])
        await fresh_poller.stop()
        assert fresh_poller._tasks == {}
        await fresh_poller.stop()  # a second call must not raise


class TestFetchLoopSuccessAndErrorTransitions:
    async def test_a_successful_fetch_populates_the_snapshot_and_status(
        self, fresh_poller, monkeypatch
    ):
        feature_snapshot = FeedSnapshot.empty()
        fake_adapter = FakeAdapter([feature_snapshot])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)

        await fresh_poller.resync([_feed_dict()])
        sleeper = await _run_scripted(
            monkeypatch, fresh_poller, "durham-cc", stop_after=1
        )

        status = fresh_poller.get_status("durham-cc")
        assert status.last_error is None
        assert status.feature_count == 0
        assert status.last_fetch_at is not None
        assert sleeper.calls == [15]  # the feed's own refresh interval
        await _drain(fresh_poller)

    async def test_a_failed_fetch_records_the_sanitised_error_and_backs_off(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([FeedUpstreamError("upstream said no")])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        monkeypatch.setattr(poller_module, "_MAX_BACKOFF_SECONDS", 900.0)

        await fresh_poller.resync([_feed_dict()])
        sleeper = await _run_scripted(
            monkeypatch, fresh_poller, "durham-cc", stop_after=1
        )

        status = fresh_poller.get_status("durham-cc")
        assert status.last_error == "FeedUpstreamError: upstream said no"
        assert sleeper.calls == [30.0]  # interval(15) * 2, first failure
        await _drain(fresh_poller)

    async def test_backoff_doubles_on_repeated_failures_then_caps(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([FeedUpstreamError("down")])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        monkeypatch.setattr(poller_module, "_MAX_BACKOFF_SECONDS", 50.0)

        await fresh_poller.resync([_feed_dict()])
        sleeper = await _run_scripted(
            monkeypatch, fresh_poller, "durham-cc", stop_after=4
        )

        # 15*2=30, 30*2=60->capped to 50, 50*2=100->capped to 50
        assert sleeper.calls == [30.0, 50.0, 50.0, 50.0]
        await _drain(fresh_poller)

    async def test_backoff_resets_to_the_interval_after_a_success(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter(
            [
                FeedUpstreamError("down"),
                FeedUpstreamError("down"),
                FeedSnapshot.empty(),
                FeedUpstreamError("down"),
            ]
        )
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        monkeypatch.setattr(poller_module, "_MAX_BACKOFF_SECONDS", 900.0)

        await fresh_poller.resync([_feed_dict()])
        sleeper = await _run_scripted(
            monkeypatch, fresh_poller, "durham-cc", stop_after=4
        )

        # fail(30) -> fail(60) -> success(interval=15) -> fail(30 again, reset)
        assert sleeper.calls == [30.0, 60.0, 15, 30.0]
        await _drain(fresh_poller)

    async def test_a_cancelled_fetch_propagates_instead_of_being_treated_as_a_failure(
        self, fresh_poller, monkeypatch
    ):
        """`asyncio.CancelledError` from the adapter's own `fetch()` must be
        re-raised untouched — recording it as a normal fetch failure (and
        sleeping through a backoff) would swallow a real task cancellation."""
        fake_adapter = FakeAdapter([asyncio.CancelledError()])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)

        await fresh_poller.resync([_feed_dict()])
        task = fresh_poller._tasks["durham-cc"]
        with pytest.raises(asyncio.CancelledError):
            await task
        assert task.cancelled()

    async def test_an_unhandled_exception_type_is_still_sanitised(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([RuntimeError("boom")])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)

        await fresh_poller.resync([_feed_dict()])
        await _run_scripted(monkeypatch, fresh_poller, "durham-cc", stop_after=1)

        assert fresh_poller.get_status("durham-cc").last_error == "RuntimeError: boom"
        await _drain(fresh_poller)

    async def test_a_long_error_message_is_truncated(self, fresh_poller, monkeypatch):
        fake_adapter = FakeAdapter([FeedUpstreamError("x" * 500)])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)

        await fresh_poller.resync([_feed_dict()])
        await _run_scripted(monkeypatch, fresh_poller, "durham-cc", stop_after=1)

        error = fresh_poller.get_status("durham-cc").last_error
        assert (
            error == "FeedUpstreamError"
        )  # over 160 chars -> falls back to just the label
        await _drain(fresh_poller)

    async def test_loop_exits_quietly_once_the_feed_is_disabled_out_from_under_it(
        self, fresh_poller, monkeypatch
    ):
        """A task's own config lookup at the top of each iteration is the
        second line of defence if resync's teardown ever races a tick: the
        config is removed from under the task directly (as if a resync
        mid-tick removed the feed) rather than driving another resync,
        which would cancel the task itself and hide this branch. The next
        iteration's config lookup is what ends the loop — cleanly, with no
        exception at all."""
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        removed = False

        async def sleep_and_remove_config_once(seconds: float) -> None:
            nonlocal removed
            if not removed:
                removed = True
                fresh_poller._configs.pop("durham-cc", None)
            # Returns normally (no real wait) either way.

        monkeypatch.setattr(
            poller_module.asyncio, "sleep", sleep_and_remove_config_once
        )
        await fresh_poller.resync([_feed_dict()])
        task = fresh_poller._tasks["durham-cc"]

        await task  # returns cleanly — no exception, no explicit cancellation
        assert fake_adapter.fetch_calls == 1  # only the first tick ran
        assert fresh_poller.get_status("durham-cc").running is False


class TestGetSnapshotWithCacheState:
    async def test_unknown_feed_is_miss(self, fresh_poller):
        snapshot, state = fresh_poller.get_snapshot_with_cache_state("no-such-feed")
        assert snapshot.features == [] and state == "MISS"

    async def test_never_fetched_is_miss(self, fresh_poller):
        await fresh_poller.resync([_feed_dict(enabled=True)])
        snapshot, state = fresh_poller.get_snapshot_with_cache_state("durham-cc")
        assert state == "MISS"
        await _drain(fresh_poller)

    async def test_within_the_refresh_window_is_hit(self, fresh_poller, monkeypatch):
        await fresh_poller.resync([_feed_dict(refreshSeconds=60)])
        status = fresh_poller.get_status("durham-cc")
        status.last_fetch_at = 1_000_000
        fresh_poller._snapshots["durham-cc"] = FeedSnapshot.empty()
        monkeypatch.setattr(
            cache_module, "now_ms", lambda: 1_000_000 + 30_000
        )  # 30s later, fresh_until=+120s
        _, state = fresh_poller.get_snapshot_with_cache_state("durham-cc")
        assert state == "HIT"
        await _drain(fresh_poller)

    async def test_past_the_refresh_window_but_within_stale_is_stale(
        self, fresh_poller, monkeypatch
    ):
        await fresh_poller.resync([_feed_dict(refreshSeconds=60)])
        status = fresh_poller.get_status("durham-cc")
        status.last_fetch_at = 1_000_000
        fresh_poller._snapshots["durham-cc"] = FeedSnapshot.empty()
        # fresh_until = 1_000_000 + 60*2*1000 = 1_121_000; ask for a time just past it.
        monkeypatch.setattr(cache_module, "now_ms", lambda: 1_121_500)
        _, state = fresh_poller.get_snapshot_with_cache_state("durham-cc")
        assert state == "STALE"
        await _drain(fresh_poller)

    async def test_past_the_stale_window_is_miss_and_returns_an_empty_snapshot(
        self, fresh_poller, monkeypatch
    ):
        await fresh_poller.resync([_feed_dict(refreshSeconds=60)])
        status = fresh_poller.get_status("durham-cc")
        status.last_fetch_at = 1_000_000
        fresh_poller._snapshots["durham-cc"] = FeedSnapshot.empty()
        far_future = 1_000_000 + poller_module._STALE_WINDOW_MS + 1
        monkeypatch.setattr(cache_module, "now_ms", lambda: far_future)
        snapshot, state = fresh_poller.get_snapshot_with_cache_state("durham-cc")
        assert state == "MISS"
        assert snapshot.features == []
        await _drain(fresh_poller)

    async def test_disabled_feed_is_miss_even_with_a_past_snapshot(self, fresh_poller):
        await fresh_poller.resync([_feed_dict(enabled=True)])
        status = fresh_poller.get_status("durham-cc")
        status.last_fetch_at = cache_module.now_ms()
        await fresh_poller.resync([_feed_dict(enabled=False)])
        _, state = fresh_poller.get_snapshot_with_cache_state("durham-cc")
        assert state == "MISS"


class TestGetAsset:
    async def test_unknown_feed_raises_ref_not_found(self, fresh_poller):
        with pytest.raises(FeedRefNotFound):
            await fresh_poller.get_asset("no-such-feed", "ref", kind="image")

    async def test_clip_on_a_provider_without_clip_support_raises_ref_not_found(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        fake_adapter.supports_clips = False
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        await fresh_poller.resync([_feed_dict(enabled=False)])
        with pytest.raises(FeedRefNotFound):
            await fresh_poller.get_asset("durham-cc", "ref", kind="clip")

    async def test_image_bytes_are_returned_and_cached_for_repeat_requests(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        await fresh_poller.resync([_feed_dict(enabled=False)])

        first = await fresh_poller.get_asset("durham-cc", "ref-1", kind="image")
        second = await fresh_poller.get_asset("durham-cc", "ref-1", kind="image")
        assert first == second == (b"bytes", "image/jpeg")
        assert fake_adapter.image_calls == 1  # second call served from cache

    async def test_cache_expires_after_its_window(self, fresh_poller, monkeypatch):
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        await fresh_poller.resync([_feed_dict(enabled=False)])

        current_time = [1000.0]
        monkeypatch.setattr(poller_module.time, "monotonic", lambda: current_time[0])
        await fresh_poller.get_asset("durham-cc", "ref-1", kind="image")
        current_time[0] += poller_module._IMAGE_CACHE_SECONDS + 1
        await fresh_poller.get_asset("durham-cc", "ref-1", kind="image")
        assert fake_adapter.image_calls == 2

    async def test_different_refs_are_cached_independently(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        await fresh_poller.resync([_feed_dict(enabled=False)])

        await fresh_poller.get_asset("durham-cc", "ref-1", kind="image")
        await fresh_poller.get_asset("durham-cc", "ref-2", kind="image")
        assert fake_adapter.image_calls == 2

    async def test_adapter_raised_feed_error_propagates_unchanged(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        fake_adapter.image_result = FeedOffline("night blackout")
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        await fresh_poller.resync([_feed_dict(enabled=False)])
        with pytest.raises(FeedOffline):
            await fresh_poller.get_asset("durham-cc", "ref-1", kind="image")

    async def test_cancelled_error_propagates_unchanged(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        fake_adapter.image_result = asyncio.CancelledError()
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        await fresh_poller.resync([_feed_dict(enabled=False)])
        with pytest.raises(asyncio.CancelledError):
            await fresh_poller.get_asset("durham-cc", "ref-1", kind="image")

    async def test_an_unexpected_adapter_exception_is_wrapped_as_upstream_error(
        self, fresh_poller, monkeypatch
    ):
        fake_adapter = FakeAdapter([FeedSnapshot.empty()])
        fake_adapter.image_result = ValueError("adapter bug")
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        await fresh_poller.resync([_feed_dict(enabled=False)])
        with pytest.raises(FeedUpstreamError):
            await fresh_poller.get_asset("durham-cc", "ref-1", kind="image")


class TestProbeAndConfigAccessors:
    async def test_probe_unknown_feed_raises_ref_not_found(self, fresh_poller):
        with pytest.raises(FeedRefNotFound):
            await fresh_poller.probe("no-such-feed")

    async def test_probe_delegates_to_the_adapter_with_the_resolved_credential(
        self, fresh_poller, monkeypatch
    ):
        from backend.services.land_feeds.schema import ProbeResult

        class ProbingAdapter(FakeAdapter):
            async def probe(self, config, credential):
                self.probed_with = credential
                return ProbeResult(ok=True, message="ok", feature_count=0)

        fake_adapter = ProbingAdapter([FeedSnapshot.empty()])
        monkeypatch.setattr(poller_module, "get_adapter", lambda provider: fake_adapter)
        await fresh_poller.resync([_feed_dict(enabled=False)])
        # No credential saved for this feed — exercise the "resolves to None" path.
        result = await fresh_poller.probe("durham-cc")
        assert result.ok is True
        assert fake_adapter.probed_with is None

    async def test_get_config_and_list_configs_reflect_the_current_resync(
        self, fresh_poller
    ):
        assert fresh_poller.get_config("durham-cc") is None
        assert fresh_poller.list_configs() == []
        await fresh_poller.resync([_feed_dict(enabled=False)])
        assert fresh_poller.get_config("durham-cc").id == "durham-cc"
        assert len(fresh_poller.list_configs()) == 1

    async def test_start_loads_feeds_from_the_database(
        self, fresh_poller, db_setup, test_engine, monkeypatch
    ):
        from sqlalchemy.ext.asyncio import AsyncSession
        from sqlalchemy.orm import sessionmaker

        TestSession = sessionmaker(
            bind=test_engine, class_=AsyncSession, expire_on_commit=False
        )
        async with TestSession() as db:
            from backend.db_helpers import upsert_setting

            await upsert_setting(db, "land", "feeds", [_feed_dict(enabled=False)])
        await fresh_poller.start()
        assert fresh_poller.get_config("durham-cc") is not None
        await _drain(fresh_poller)

    async def test_start_with_no_saved_feeds_leaves_the_poller_empty(
        self, fresh_poller
    ):
        await fresh_poller.start()
        assert fresh_poller.list_configs() == []
