"""Core notifications store — every section's alerts, persisted.

Endpoints (paths unchanged from when they lived in the Air router, because the
SPA and the gateway route `/api/air/messages` to core — see the section-
containers plan, B5 and §4.4):
  GET    /api/air/messages              — List non-dismissed notifications
  POST   /api/air/messages              — Create a notification (idempotent on msg_id)
  DELETE /api/air/messages/{msg_id}     — Dismiss (soft-delete) one notification
  DELETE /api/air/messages              — Dismiss all notifications
  GET    /api/air/messages/stream       — Server-Sent Events: alerts raised server-side, as they happen

Sections raise a server-side alert by publishing `notifications.raise` on the
event bus (same fields as the POST body); core stores it and pushes it to every
open stream. Core never needs to know what the alert is about.

Despite the `/api/air` prefix and the `air_messages` table name, these hold
Space, Sea, Land and system notifications too — the names predate the other
sections and are kept so no client or stored data has to change. The `air`
OpenAPI tag is kept for the same reason (the parity golden pins it).
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator

from backend.database import get_db
from backend.models import AirMessage
from backend.platform.bus import EventPayload, bus
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

RAISE_SUBJECT = "notifications.raise"
"""Bus subject a section publishes to raise a server-side alert."""

STREAM_KEEPALIVE_S = 15.0
"""Seconds between SSE keep-alive comments, so proxies and the browser don't
treat a quiet stream as dead."""


class MessageIn(BaseModel):
    """Body for POST /api/air/messages — creates a new notification message."""

    msg_id: str  # client-generated unique id
    type: str  # 'emergency' | 'flight' | 'system' | 'squawk-clr' etc.
    title: str  # short headline shown in the panel
    detail: str = ""  # optional secondary text
    ts: int  # event timestamp, Unix ms
    hex: str | None = None  # ICAO hex of the aircraft it is about, if any


def _message_json(msg: AirMessage) -> dict:
    return {
        "msg_id": msg.msg_id,
        "type": msg.type,
        "title": msg.title,
        "detail": msg.detail,
        "ts": msg.ts,
        "hex": msg.hex,
    }


async def _store(db: AsyncSession, body: MessageIn) -> AirMessage | None:
    """Insert `body` unless its msg_id is already stored; the new row, or None."""
    existing = await db.execute(select(AirMessage).where(AirMessage.msg_id == body.msg_id))
    if existing.scalar_one_or_none():
        return None
    row = AirMessage(msg_id=body.msg_id, type=body.type, title=body.title, detail=body.detail, ts=body.ts, hex=body.hex)
    db.add(row)
    await db.commit()
    return row


class _StreamHub:
    """The open SSE streams, each fed by its own queue.

    `None` in a queue ends that stream — sent to all of them by `wake()` on
    SIGTERM/SIGINT, because uvicorn's graceful shutdown (and `--reload`) waits
    for every open response, and a stream never finishes on its own.
    """

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[dict | None]] = set()
        self._closing = False

    def broadcast(self, message: dict) -> None:
        for queue in self._queues:
            queue.put_nowait(message)

    def wake(self) -> None:
        self._closing = True
        for queue in self._queues:
            queue.put_nowait(None)

    def reopen(self) -> None:
        """Accept streams again (the next app start in the same process, e.g. tests)."""
        self._closing = False

    async def events(self) -> AsyncIterator[str]:
        queue: asyncio.Queue[dict | None] = asyncio.Queue()
        self._queues.add(queue)
        try:
            # Ask the browser to wait 5 s before reconnecting after a drop.
            yield "retry: 5000\n\n"
            while not self._closing:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=STREAM_KEEPALIVE_S)
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                if message is None:
                    break
                yield f"data: {json.dumps(message, separators=(',', ':'))}\n\n"
        finally:
            self._queues.discard(queue)


streams = _StreamHub()


async def _on_raise(payload: EventPayload) -> None:
    """Store a server-raised alert and push it to every open stream."""
    try:
        body = MessageIn.model_validate({key: value for key, value in payload.items() if key != "db"})
    except ValidationError as error:
        logger.warning("ignoring malformed %s: %s", RAISE_SUBJECT, error)
        return
    row = await _store(payload["db"], body)
    if row is not None:
        streams.broadcast(_message_json(row))


bus.subscribe(RAISE_SUBJECT, _on_raise)


router = APIRouter(prefix="/api/air", tags=["air"])


@router.get("/messages")
async def list_air_messages(db: AsyncSession = Depends(get_db)):
    """Return all non-dismissed air messages, newest first."""
    result = await db.execute(
        select(AirMessage)
        .where(AirMessage.dismissed == False)  # noqa: E712
        .order_by(AirMessage.ts.desc())
    )
    rows = result.scalars().all()
    # Serialise to plain dicts (omit the dismissed flag — client doesn't need it)
    return JSONResponse([_message_json(msg) for msg in rows])


@router.get("/messages/stream")
async def stream_air_messages():
    """Push alerts raised server-side (`notifications.raise`) as Server-Sent Events.

    Browser-created alerts are not echoed here: the browser that made one
    already has it, and the others see it on their next load.
    """
    return StreamingResponse(
        streams.events(),
        media_type="text/event-stream",
        # no-transform/no buffering: a proxy must pass each event straight on.
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.post("/messages", status_code=201)
async def create_air_message(body: MessageIn, db: AsyncSession = Depends(get_db)):
    """Persist a new air message. Idempotent: if msg_id already exists, returns 200 'exists'."""
    if await _store(db, body) is None:
        return JSONResponse({"status": "exists"}, status_code=200)  # already stored, no-op
    return JSONResponse({"status": "created"}, status_code=201)


@router.delete("/messages/{msg_id}", status_code=200)
async def dismiss_air_message(msg_id: str, db: AsyncSession = Depends(get_db)):
    """Soft-delete a single message by msg_id (sets dismissed=True). Idempotent: missing row returns 200."""
    result = await db.execute(select(AirMessage).where(AirMessage.msg_id == msg_id))
    row = result.scalar_one_or_none()
    if not row:
        return JSONResponse({"status": "absent"})
    row.dismissed = True
    await db.commit()
    return JSONResponse({"status": "dismissed"})


@router.delete("/messages", status_code=200)
async def dismiss_all_air_messages(db: AsyncSession = Depends(get_db)):
    """Soft-delete all air messages in one query."""
    await db.execute(AirMessage.__table__.update().values(dismissed=True))
    await db.commit()
    return JSONResponse({"status": "cleared"})
