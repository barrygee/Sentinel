"""Core notifications store — every section's alerts, persisted.

Endpoints (paths unchanged from when they lived in the Air router, because the
SPA and the gateway route `/api/air/messages` to core — see the section-
containers plan, B5 and §4.4):
  GET    /api/air/messages              — List non-dismissed notifications
  POST   /api/air/messages              — Create a notification (idempotent on msg_id)
  DELETE /api/air/messages/{msg_id}     — Dismiss (soft-delete) one notification
  DELETE /api/air/messages              — Dismiss all notifications

Despite the `/api/air` prefix and the `air_messages` table name, these hold
Space, Sea, Land and system notifications too — the names predate the other
sections and are kept so no client or stored data has to change. The `air`
OpenAPI tag is kept for the same reason (the parity golden pins it).
"""

from backend.database import get_db
from backend.models import AirMessage
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class MessageIn(BaseModel):
    """Body for POST /api/air/messages — creates a new notification message."""

    msg_id: str  # client-generated unique id
    type: str  # 'emergency' | 'flight' | 'system' | 'squawk-clr' etc.
    title: str  # short headline shown in the panel
    detail: str = ""  # optional secondary text
    ts: int  # event timestamp, Unix ms


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
    return JSONResponse(
        [
            {"msg_id": msg.msg_id, "type": msg.type, "title": msg.title, "detail": msg.detail, "ts": msg.ts}
            for msg in rows
        ]
    )


@router.post("/messages", status_code=201)
async def create_air_message(body: MessageIn, db: AsyncSession = Depends(get_db)):
    """Persist a new air message. Idempotent: if msg_id already exists, returns 200 'exists'."""
    existing = await db.execute(select(AirMessage).where(AirMessage.msg_id == body.msg_id))
    if existing.scalar_one_or_none():
        return JSONResponse({"status": "exists"}, status_code=200)  # already stored, no-op

    db.add(
        AirMessage(
            msg_id=body.msg_id,
            type=body.type,
            title=body.title,
            detail=body.detail,
            ts=body.ts,
        )
    )
    await db.commit()
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
