"""Settings client — how a module reads and writes settings it does not own.

Settings are central: every namespace lives in core's `user_settings` table and
is mirrored to the live config file. A module that writes a setting should do
it the way `PUT /api/settings/{namespace}/{key}` does — store the value, then
announce `settings.changed.<namespace>` on the bus so whoever reacts to that
key (a level-triggered reconciler) hears about it. Writing the row directly
skips the announcement, which is exactly the hidden coupling the
section-containers plan removes (B7, B10).

In-process today: `read_setting`/`write_setting` call the same helpers the
settings router uses. When a module moves into its own container this becomes
an HTTP client against core's settings API with the same two calls, so call
sites don't change.
"""

from __future__ import annotations

from typing import Any

from backend.db_helpers import get_setting, upsert_setting
from backend.platform.bus import bus
from sqlalchemy.ext.asyncio import AsyncSession


async def read_setting(db: AsyncSession, namespace: str, key: str, default: Any = None) -> Any:
    """The parsed value at (namespace, key), or `default` when unset."""
    return await get_setting(db, namespace, key, default=default)


async def write_setting(
    db: AsyncSession,
    namespace: str,
    key: str,
    value: Any,
    *,
    raise_errors: bool = False,
) -> None:
    """Store a setting and announce it as `settings.changed.<namespace>`.

    Validation is the caller's job (the settings router validates user input
    before calling this). `raise_errors` is passed to `bus.publish`: the
    settings router sets it so a failing reaction still surfaces as an HTTP
    error, while a background writer leaves it off so a subscriber can't break
    its loop.

    `db` rides in the event payload so a subscriber reads the value through the
    same session that just committed it (see `backend/platform/bus.py`).
    """
    await upsert_setting(db, namespace, key, value)
    await bus.publish(f"settings.changed.{namespace}", {"keys": [key], "db": db}, raise_errors=raise_errors)
