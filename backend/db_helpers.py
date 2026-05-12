"""Shared helpers for the UserSettings key/value store.

Routers, the database module, and a couple of services all query UserSettings
by (namespace, key) and parse the JSON-encoded value. This module collapses
the duplicated `select(UserSettings).where(...)` + json.loads/dumps pattern
into a small surface area.
"""
from __future__ import annotations

import json
from typing import Any

from backend.cache import now_ms
from backend.models import UserSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_setting_row(
    db: AsyncSession,
    namespace: str,
    key: str,
) -> UserSettings | None:
    """Return the raw UserSettings row for (namespace, key), or None."""
    result = await db.execute(
        select(UserSettings).where(
            UserSettings.namespace == namespace,
            UserSettings.key == key,
        )
    )
    return result.scalar_one_or_none()


async def get_setting(
    db: AsyncSession,
    namespace: str,
    key: str,
    default: Any = None,
) -> Any:
    """Return the parsed JSON value at (namespace, key), or `default` if not set.

    Falls back to `default` on any JSON-decode error so callers don't have to
    wrap the call in try/except.
    """
    row = await get_setting_row(db, namespace, key)
    if row is None:
        return default
    try:
        return json.loads(row.value)
    except (json.JSONDecodeError, TypeError):
        return default


async def upsert_setting(
    db: AsyncSession,
    namespace: str,
    key: str,
    value: Any,
) -> None:
    """Upsert (namespace, key) → JSON-encoded value. Commits the transaction."""
    row = await get_setting_row(db, namespace, key)
    value_str = json.dumps(value)
    ts = now_ms()
    if row:
        row.value = value_str
        row.updated_at = ts
    else:
        db.add(UserSettings(
            namespace=namespace,
            key=key,
            value=value_str,
            updated_at=ts,
        ))
    await db.commit()
