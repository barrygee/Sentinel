"""Per-module startup, shutdown and signal wake-up (section-containers plan, B8).

`backend/main.py` used to start and stop every section itself, in one long
lifespan function. Each module now declares its own `ModuleLifecycle` (see
`backend/modules/`), and the app just runs them. When a section moves into its
own container its lifecycle goes with it, unchanged.

Startup has two phases, because the order across modules matters at one point:
every module's `prepare` (schema, migrations, seeders) runs before any
module's `start`. The live config file sync (core `start`) must see the fully
seeded settings, and a section's background tasks must not start against a
half-seeded database. Within a phase, modules run in list order. Shutdown runs
in reverse list order.

`wake` hooks run from the SIGTERM/SIGINT handler, before uvicorn's own handler:
they unblock long-lived waiters (SDR WebSocket queues, decoder bridges, the
AIS reader, a running `pmtiles extract`) so uvicorn's graceful shutdown — and
`--reload` — doesn't deadlock waiting on tasks that would never return.
"""

from __future__ import annotations

import logging
import signal
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass
from types import FrameType
from typing import Any

logger = logging.getLogger(__name__)

AsyncHook = Callable[[], Awaitable[None]]
WakeHook = Callable[[], None]


@dataclass(frozen=True)
class ModuleLifecycle:
    """One module's lifecycle hooks; every hook is optional."""

    name: str
    prepare: AsyncHook | None = None
    """Schema/migration/seed work. Every module's `prepare` runs before any `start`."""
    start: AsyncHook | None = None
    """Start background work (tasks, pollers, sockets, resumed decodes)."""
    stop: AsyncHook | None = None
    """Stop and await everything `start` began."""
    wake: WakeHook | None = None
    """Synchronous, signal-safe nudge that unblocks this module's long-lived waiters."""


def _install_wake_chain(modules: Sequence[ModuleLifecycle]) -> dict[int, Any]:
    """Run every module's `wake` on SIGTERM/SIGINT, then the previous handler."""
    previous_handlers: dict[int, Any] = {}

    def chained_handler(signal_number: int, frame: FrameType | None) -> None:
        for module in modules:
            if module.wake is None:
                continue
            # One module failing to wake must not stop the others — every
            # unwoken waiter is another task uvicorn would hang on.
            try:
                module.wake()
            except Exception:
                logger.exception("wake hook for module %r failed", module.name)
        previous = previous_handlers.get(signal_number)
        if callable(previous):
            previous(signal_number, frame)

    for signal_number in (signal.SIGTERM, signal.SIGINT):
        previous_handlers[signal_number] = signal.getsignal(signal_number)
        signal.signal(signal_number, chained_handler)
    return previous_handlers


def _restore_handlers(previous_handlers: dict[int, Any]) -> None:
    for signal_number, previous in previous_handlers.items():
        if callable(previous) or previous in (signal.SIG_DFL, signal.SIG_IGN):
            signal.signal(signal_number, previous)


@asynccontextmanager
async def run_lifecycles(modules: Sequence[ModuleLifecycle]) -> AsyncIterator[None]:
    """Prepare, start, and (on exit) stop `modules`, with the signal wake chain installed while running."""
    for module in modules:
        if module.prepare is not None:
            await module.prepare()
    for module in modules:
        if module.start is not None:
            await module.start()
    previous_handlers = _install_wake_chain(modules)
    try:
        yield
    finally:
        _restore_handlers(previous_handlers)
        for module in reversed(modules):
            if module.stop is not None:
                await module.stop()
