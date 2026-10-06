"""
tests/backend/test_core_notifications_stream.py

Server-raised alerts in backend/core/notifications.py: the `notifications.raise`
bus handler that stores them, and the Server-Sent Events stream that pushes
them to open browsers (docs/plans/adsb-server-alerts.md).
"""

from __future__ import annotations

import asyncio
import json
import logging

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core import notifications
from backend.core.notifications import RAISE_SUBJECT, _StreamHub
from backend.models import AirMessage
from backend.platform.bus import bus


@pytest.fixture
async def db(test_engine, db_setup):
    async with AsyncSession(test_engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def hub(monkeypatch) -> _StreamHub:
    stream_hub = _StreamHub()
    monkeypatch.setattr(notifications, "streams", stream_hub)
    return stream_hub


def alert(**overrides) -> dict:
    return {
        "msg_id": "adsb-squawk:4ca123:7700:42",
        "type": "emergency",
        "title": "EIN123",
        "detail": "SQK 7700 — General Emergency",
        "ts": 42,
        "hex": "4ca123",
        **overrides,
    }


async def stored(db: AsyncSession) -> list[AirMessage]:
    return list((await db.execute(select(AirMessage))).scalars().all())


async def take(events, count: int) -> list[str]:
    return [await asyncio.wait_for(anext(events), timeout=1) for _ in range(count)]


# ── notifications.raise ──────────────────────────────────────────────────────


class TestRaise:
    async def test_stores_the_alert_and_pushes_it_to_every_stream(self, db, hub):
        first, second = hub.events(), hub.events()
        await take(first, 1)  # opening "retry:" line — the stream is now registered
        await take(second, 1)
        await bus.publish(RAISE_SUBJECT, {**alert(), "db": db})
        rows = await stored(db)
        assert [(row.msg_id, row.type, row.title, row.detail, row.ts, row.hex) for row in rows] == [
            ("adsb-squawk:4ca123:7700:42", "emergency", "EIN123", "SQK 7700 — General Emergency", 42, "4ca123")
        ]
        expected = f"data: {json.dumps(alert(), separators=(',', ':'))}\n\n"
        assert await take(first, 1) == [expected]
        assert await take(second, 1) == [expected]
        await first.aclose()
        await second.aclose()

    async def test_an_alert_already_stored_is_not_pushed_again(self, db, hub):
        await bus.publish(RAISE_SUBJECT, {**alert(), "db": db})
        events = hub.events()
        await take(events, 1)
        await bus.publish(RAISE_SUBJECT, {**alert(title="changed"), "db": db})
        assert len(await stored(db)) == 1
        queue = next(iter(hub._queues))
        assert queue.empty()
        await events.aclose()

    async def test_a_malformed_alert_is_logged_and_dropped(self, db, hub, caplog):
        with caplog.at_level(logging.WARNING, logger=notifications.__name__):
            await bus.publish(RAISE_SUBJECT, {"msg_id": "x", "db": db})  # no type/title/ts
        assert await stored(db) == []
        assert f"ignoring malformed {RAISE_SUBJECT}" in caplog.text

    async def test_hex_is_optional(self, db, hub):
        await bus.publish(RAISE_SUBJECT, {**alert(), "hex": None, "db": db})
        assert (await stored(db))[0].hex is None


# ── the stream ───────────────────────────────────────────────────────────────


class TestStream:
    async def test_starts_by_setting_the_browser_reconnect_delay(self, hub):
        events = hub.events()
        assert await take(events, 1) == ["retry: 5000\n\n"]
        await events.aclose()

    async def test_sends_a_keep_alive_when_quiet(self, hub, monkeypatch):
        monkeypatch.setattr(notifications, "STREAM_KEEPALIVE_S", 0.01)
        events = hub.events()
        # Keeps going after a keep-alive: a quiet stream is not a finished one.
        assert await take(events, 3) == ["retry: 5000\n\n", ": keep-alive\n\n", ": keep-alive\n\n"]
        await events.aclose()

    async def test_wake_ends_every_open_stream(self, hub):
        events = hub.events()
        await take(events, 1)
        hub.wake()
        with pytest.raises(StopAsyncIteration):
            await take(events, 1)
        assert hub._queues == set()

    async def test_wake_ends_a_stream_blocked_waiting_for_an_alert(self, hub):
        events = hub.events()
        await take(events, 1)
        waiting = asyncio.ensure_future(anext(events))
        await asyncio.sleep(0.01)  # now blocked in queue.get()
        assert not waiting.done()
        hub.wake()
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(waiting, timeout=1)
        assert hub._queues == set()

    async def test_a_stream_opened_while_closing_ends_at_once(self, hub):
        hub.wake()
        events = hub.events()
        assert await take(events, 1) == ["retry: 5000\n\n"]
        with pytest.raises(StopAsyncIteration):
            await take(events, 1)

    async def test_reopen_accepts_streams_again(self, hub):
        hub.wake()
        hub.reopen()
        events = hub.events()
        await take(events, 1)
        hub.broadcast({"msg_id": "m1"})
        assert await take(events, 1) == ['data: {"msg_id":"m1"}\n\n']
        await events.aclose()

    async def test_a_closed_client_unregisters_its_stream(self, hub):
        events = hub.events()
        await take(events, 1)
        assert len(hub._queues) == 1
        await events.aclose()
        assert hub._queues == set()

    async def test_broadcast_with_no_streams_is_a_no_op(self, hub):
        hub.broadcast({"msg_id": "m1"})
        hub.wake()


class TestStreamEndpoint:
    async def test_serves_an_unbuffered_event_stream(self, hub):
        response = await notifications.stream_air_messages()
        assert response.media_type == "text/event-stream"
        assert response.headers["cache-control"] == "no-cache, no-transform"
        assert response.headers["x-accel-buffering"] == "no"
        # The body is the hub's event stream.
        assert await take(response.body_iterator, 1) == ["retry: 5000\n\n"]
        await response.body_iterator.aclose()

    def test_is_routed_under_the_messages_path(self):
        from backend.main import app

        paths = {route.path for route in app.routes}
        assert "/api/air/messages/stream" in paths
