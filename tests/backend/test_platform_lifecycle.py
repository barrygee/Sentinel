"""
tests/backend/test_platform_lifecycle.py

Unit tests for backend/platform/lifecycle.py — the runner that replaced the
monolithic lifespan in backend/main.py (section-containers plan, B8).

What matters here is ordering and the signal wake chain:
  * every module's `prepare` runs before any module's `start` (the config file
    sync must see fully seeded settings);
  * `stop` runs in reverse, and still runs when the app body raises;
  * SIGTERM/SIGINT wake every module, even if one wake hook fails, and then
    hand over to the previous handler (uvicorn's) — without that `--reload`
    deadlocks on long-lived SDR WebSocket tasks;
  * the previous handlers are put back afterwards.

Signals are never actually raised: the test calls the installed handler the
way the interpreter would, so a broken chain can't kill the test process.
"""

import logging
import signal
from collections.abc import Iterator
from typing import Any

import pytest

from backend.platform.lifecycle import ModuleLifecycle, run_lifecycles


@pytest.fixture
def known_previous_handlers() -> Iterator[list[tuple[int, Any]]]:
    """Install recording handlers for SIGTERM/SIGINT, restoring the real ones afterwards."""
    calls: list[tuple[int, Any]] = []
    originals = {
        number: signal.getsignal(number) for number in (signal.SIGTERM, signal.SIGINT)
    }

    def recording_handler(signal_number: int, frame: Any) -> None:
        calls.append((signal_number, frame))

    for number in originals:
        signal.signal(number, recording_handler)
    try:
        yield calls
    finally:
        for number, original in originals.items():
            signal.signal(number, original)


def recording_module(
    name: str, calls: list[str], *, with_wake: bool = True
) -> ModuleLifecycle:
    async def prepare() -> None:
        calls.append(f"{name}.prepare")

    async def start() -> None:
        calls.append(f"{name}.start")

    async def stop() -> None:
        calls.append(f"{name}.stop")

    def wake() -> None:
        calls.append(f"{name}.wake")

    return ModuleLifecycle(
        name=name,
        prepare=prepare,
        start=start,
        stop=stop,
        wake=wake if with_wake else None,
    )


class TestOrdering:
    async def test_prepares_all_then_starts_all_then_stops_in_reverse(
        self, known_previous_handlers
    ):
        calls: list[str] = []
        modules = [
            recording_module("core", calls),
            recording_module("hub", calls),
            recording_module("sea", calls),
        ]

        async with run_lifecycles(modules):
            calls.append("running")

        assert calls == [
            "core.prepare",
            "hub.prepare",
            "sea.prepare",
            "core.start",
            "hub.start",
            "sea.start",
            "running",
            "sea.stop",
            "hub.stop",
            "core.stop",
        ]

    async def test_a_module_with_no_hooks_is_skipped(self, known_previous_handlers):
        calls: list[str] = []
        modules = [ModuleLifecycle(name="air"), recording_module("land", calls)]

        async with run_lifecycles(modules):
            pass

        assert calls == ["land.prepare", "land.start", "land.stop"]

    async def test_stops_every_module_even_when_the_app_body_raises(
        self, known_previous_handlers
    ):
        calls: list[str] = []
        modules = [recording_module("core", calls), recording_module("hub", calls)]

        with pytest.raises(RuntimeError, match="boom"):
            async with run_lifecycles(modules):
                raise RuntimeError("boom")

        assert calls[-2:] == ["hub.stop", "core.stop"]


class TestWakeChain:
    async def test_signal_wakes_every_module_then_calls_the_previous_handler(
        self, known_previous_handlers
    ):
        calls: list[str] = []
        modules = [recording_module("core", calls), recording_module("hub", calls)]

        async with run_lifecycles(modules):
            calls.clear()
            installed = signal.getsignal(signal.SIGTERM)
            assert callable(installed)
            installed(signal.SIGTERM, None)

        assert calls[:2] == ["core.wake", "hub.wake"]
        assert known_previous_handlers == [(signal.SIGTERM, None)]

    async def test_sigint_is_chained_too(self, known_previous_handlers):
        calls: list[str] = []

        async with run_lifecycles([recording_module("hub", calls)]):
            calls.clear()
            signal.getsignal(signal.SIGINT)(signal.SIGINT, None)

        assert calls[0] == "hub.wake"
        assert known_previous_handlers == [(signal.SIGINT, None)]

    async def test_one_failing_wake_does_not_stop_the_others(
        self, known_previous_handlers, caplog
    ):
        calls: list[str] = []

        def broken_wake() -> None:
            raise RuntimeError("wake failed")

        modules = [
            ModuleLifecycle(name="broken", wake=broken_wake),
            recording_module("hub", calls),
        ]

        with caplog.at_level(logging.ERROR, logger="backend.platform.lifecycle"):
            async with run_lifecycles(modules):
                calls.clear()
                signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)

        assert calls[0] == "hub.wake"
        assert known_previous_handlers == [(signal.SIGTERM, None)]
        assert "wake hook for module 'broken' failed" in caplog.text

    async def test_modules_without_a_wake_hook_are_skipped(
        self, known_previous_handlers
    ):
        calls: list[str] = []
        modules = [
            recording_module("land", calls, with_wake=False),
            recording_module("sea", calls),
        ]

        async with run_lifecycles(modules):
            calls.clear()
            signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)

        assert calls[0] == "sea.wake"
        assert "land.wake" not in calls

    async def test_a_non_callable_previous_handler_is_not_called(self):
        # SIG_DFL is an int constant, not a function: the chain must wake the
        # modules and then stop rather than try to call it.
        original = signal.getsignal(signal.SIGTERM)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        calls: list[str] = []
        try:
            async with run_lifecycles([recording_module("hub", calls)]):
                calls.clear()
                signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)
            assert calls[0] == "hub.wake"
            # …and SIG_DFL is put back afterwards.
            assert signal.getsignal(signal.SIGTERM) == signal.SIG_DFL
        finally:
            signal.signal(signal.SIGTERM, original)

    async def test_restores_the_previous_handlers_on_exit(
        self, known_previous_handlers
    ):
        before = {
            number: signal.getsignal(number)
            for number in (signal.SIGTERM, signal.SIGINT)
        }

        async with run_lifecycles([ModuleLifecycle(name="core")]):
            assert signal.getsignal(signal.SIGTERM) is not before[signal.SIGTERM]

        assert signal.getsignal(signal.SIGTERM) is before[signal.SIGTERM]
        assert signal.getsignal(signal.SIGINT) is before[signal.SIGINT]

    async def test_restores_the_previous_handlers_when_the_app_body_raises(
        self, known_previous_handlers
    ):
        before = signal.getsignal(signal.SIGTERM)

        with pytest.raises(RuntimeError):
            async with run_lifecycles([ModuleLifecycle(name="core")]):
                raise RuntimeError("boom")

        assert signal.getsignal(signal.SIGTERM) is before

    async def test_signals_are_not_chained_during_startup(
        self, known_previous_handlers
    ):
        # The chain goes in only once every module has started, so a hook that
        # inspects the handler during start still sees the previous one.
        seen_during_start: list[Any] = []
        previous = signal.getsignal(signal.SIGTERM)

        async def start() -> None:
            seen_during_start.append(signal.getsignal(signal.SIGTERM))

        async with run_lifecycles([ModuleLifecycle(name="core", start=start)]):
            pass

        assert seen_during_start == [previous]
