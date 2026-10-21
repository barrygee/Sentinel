"""Tests for `EventBus`: `close()` (the service's SIGTERM/SIGINT wake hook) and per-device coalescing.

An `EventSource` stream never ends by itself, and uvicorn waits for open
responses before shutting down — so unless `close()` ends every public
subscription, a stop (or `--reload`) hangs until Docker kills the process.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_event_bus.py
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from sdr_manager_local_fake_clock import FakeClock

from sentinel_sdr_manager_local.services.event_bus import CLOSED_EVENT_NAME, EventBus, SseMessage


async def _collect(subscription: object) -> list[SseMessage]:
    return [message async for message in subscription]  # type: ignore[attr-defined]


async def _subscribe(bus: EventBus) -> tuple[object, asyncio.Task[list[SseMessage]]]:
    subscription = bus.subscribe()
    task = asyncio.create_task(_collect(subscription))
    # Let the subscriber register and block on its queue.
    await asyncio.sleep(0)
    return subscription, task


async def test_ends_every_open_subscription() -> None:
    bus = EventBus(FakeClock())
    _first, first_task = await _subscribe(bus)
    _second, second_task = await _subscribe(bus)
    assert bus.subscriber_count() == 2

    bus.close()

    assert await asyncio.wait_for(first_task, timeout=1) == []
    assert await asyncio.wait_for(second_task, timeout=1) == []
    assert bus.subscriber_count() == 0


async def test_delivers_what_was_published_before_closing_never_the_marker() -> None:
    bus = EventBus(FakeClock())
    _subscription, task = await _subscribe(bus)

    bus.publish(SseMessage(event="notice", data="before"))
    await asyncio.sleep(0)
    bus.close()

    received = await asyncio.wait_for(task, timeout=1)
    assert [message.data for message in received] == ["before"]
    assert all(message.event != CLOSED_EVENT_NAME for message in received)


async def test_still_fits_when_a_subscriber_queue_is_full() -> None:
    bus = EventBus(FakeClock(), subscriber_queue_size=2)
    subscription = bus.subscribe()
    bus_started = asyncio.create_task(subscription.__anext__())
    await asyncio.sleep(0)
    bus.publish(SseMessage(event="notice", data="first"))
    assert (await asyncio.wait_for(bus_started, timeout=1)).data == "first"
    # The subscriber now stops reading, and its queue overflows.
    for index in range(5):
        bus.publish(SseMessage(event="notice", data=index))

    bus.close()

    # The backlog was dropped so the marker fit, and the stream ends; at most
    # the overflow's resync request is left ahead of it.
    remaining = await asyncio.wait_for(_collect(subscription), timeout=1)
    assert [message.event for message in remaining if message.event != "__resync_required__"] == []


async def test_leaves_internal_subscribers_running() -> None:
    bus = EventBus(FakeClock())
    internal = bus.subscribe_internal()
    next_internal = asyncio.create_task(internal.__anext__())
    await asyncio.sleep(0)

    bus.close()
    bus.publish(SseMessage(event="internal.device_arrived", data="still delivered"))

    message = await asyncio.wait_for(next_internal, timeout=1)
    assert message.data == "still delivered"
    await internal.aclose()


def test_is_harmless_with_no_subscribers() -> None:
    bus = EventBus(FakeClock())

    bus.close()
    bus.close()

    assert bus.subscriber_count() == 0


async def test_a_burst_of_changes_to_one_device_delivers_only_the_latest() -> None:
    clock = FakeClock()
    bus = EventBus(clock)
    _subscription, task = await _subscribe(bus)

    for state in ("configured", "starting", "streaming"):
        bus.publish(SseMessage(event="device_changed", data=SimpleNamespace(device_id="serial:A", state=state)))
        await asyncio.sleep(0)
    clock.advance(1)
    for _ in range(5):
        await asyncio.sleep(0)
    bus.close()

    received = await asyncio.wait_for(task, timeout=1)
    assert [message.data.state for message in received] == ["streaming"]
    # The delivered task removed its own entry; nothing is left pending.
    assert bus._pending_device_changed_tasks == {}
