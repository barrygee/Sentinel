"""Settings client — how a module reads and writes settings it does not own.

Settings are central: every namespace lives in core's `user_settings` table and
is mirrored to the live config file. A module that writes a setting should do
it the way `PUT /api/settings/{namespace}/{key}` does — store the value, then
announce `settings.changed.<namespace>` on the bus so whoever reacts to that
key (a level-triggered reconciler) hears about it. Writing the row directly
skips the announcement, which is exactly the hidden coupling the
section-containers plan removes (B7, B10).

Two modes, chosen by `SENTINEL_CORE_URL`:
  - unset (the monolith, which is core): the same database helpers the settings
    router uses, through the caller's session.
  - set (a service in its own container, P6): core's settings API over HTTP —
    `PUT` there stores, announces and mirrors the value to the config file
    exactly as a browser's write does. The `db` argument is then unused; call
    sites don't change.
"""

from __future__ import annotations

from typing import Any

import httpx
from backend.config import settings
from backend.db_helpers import get_setting, upsert_setting
from backend.platform.bus import bus
from sqlalchemy.ext.asyncio import AsyncSession

# Core is on the same network; a request slower than this is a fault, not load.
CORE_REQUEST_TIMEOUT_S = 5.0


class SettingsUnavailable(Exception):
    """Core's settings API could not be reached, or refused the request."""


def settings_are_remote() -> bool:
    """True when this process is a service reading core's settings over HTTP."""
    return bool(settings.sentinel_core_url)


def _settings_url(*path_segments: str) -> str:
    return "/".join([settings.sentinel_core_url.rstrip("/"), "api", "settings", *path_segments])


async def _core_request(method: str, url: str, **request_options: Any) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=CORE_REQUEST_TIMEOUT_S) as client:
            response = await client.request(method, url, **request_options)
    except httpx.HTTPError as error:
        raise SettingsUnavailable(f"core settings API unreachable: {error}") from error
    if not response.is_success:
        raise SettingsUnavailable(f"core settings API answered {response.status_code} for {method} {url}")
    return response


async def read_namespace(db: AsyncSession, namespace: str) -> dict[str, Any]:
    """Every (non-secret) setting in `namespace`, as `{key: parsed value}`."""
    if settings_are_remote():
        body = (await _core_request("GET", _settings_url(namespace))).json()
        return body if isinstance(body, dict) else {}
    # Deferred: backend.services.app_config pulls in the config-file machinery,
    # which only core needs.
    from backend.models import UserSettings
    from backend.services.app_config import rows_to_namespace_dict
    from sqlalchemy import select

    rows = (await db.execute(select(UserSettings).where(UserSettings.namespace == namespace))).scalars().all()
    return rows_to_namespace_dict(rows, namespace)


async def read_setting(db: AsyncSession, namespace: str, key: str, default: Any = None) -> Any:
    """The parsed value at (namespace, key), or `default` when unset."""
    if settings_are_remote():
        return (await read_namespace(db, namespace)).get(key, default)
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
    its loop. Remotely, core's settings router does both the store and the
    announcement, and a failure there raises `SettingsUnavailable`.

    `db` rides in the event payload so a subscriber reads the value through the
    same session that just committed it (see `backend/platform/bus.py`).
    """
    if settings_are_remote():
        await _core_request("PUT", _settings_url(namespace, key), json={"value": value})
        return
    await upsert_setting(db, namespace, key, value)
    await bus.publish(f"settings.changed.{namespace}", {"keys": [key], "db": db}, raise_errors=raise_errors)
