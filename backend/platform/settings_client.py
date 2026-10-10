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

Secret settings (`SECRET_SETTING_KEYS`, e.g. Sea's AISStream key) never cross
the public settings API, which redacts them. Their owner uses `read_secret` /
`write_secret` / `delete_secret`, which go to core's join-token-gated
`/internal/settings/secrets/` routes when remote (plan §4.3 rule 4).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from backend.config import settings
from backend.db_helpers import get_setting, upsert_setting
from backend.platform.bus import bus
from backend.platform.join_token import service_join_token
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Core is on the same network; a request slower than this is a fault, not load.
CORE_REQUEST_TIMEOUT_S = 5.0

# Between attempts while `wait_for_core` waits for core to start answering.
CORE_WAIT_RETRY_S = 2.0


class SettingsUnavailable(Exception):
    """Core's settings API could not be reached, or refused the request."""


def settings_are_remote() -> bool:
    """True when this process is a service reading core's settings over HTTP."""
    return bool(settings.sentinel_core_url)


async def wait_for_core(waiting_for: str) -> None:
    """Return once core's settings API answers; at once when settings are local.

    A section's container usually starts a few seconds before core does (a full
    `docker compose up`, or core restarting under it). Background work whose
    first run reads settings awaits this first, so it starts when it can rather
    than failing once and logging a traceback for an expected startup race.
    `waiting_for` names the work in the one log line written while waiting.
    """
    if not settings_are_remote():
        return
    logged = False
    while True:
        try:
            await _core_request("GET", _settings_url("app"))
            return
        except SettingsUnavailable as error:
            if not logged:
                logger.info("%s: waiting for core to answer (%s)", waiting_for, error)
                logged = True
            await asyncio.sleep(CORE_WAIT_RETRY_S)


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


# ── secrets ───────────────────────────────────────────────────────────────────


def _secret_url(namespace: str, key: str) -> str:
    return "/".join([settings.sentinel_core_url.rstrip("/"), "internal", "settings", "secrets", namespace, key])


def _join_token_header() -> dict[str, str]:
    token = service_join_token()
    if not token:
        # Core hasn't written the shared token file yet (it is starting).
        raise SettingsUnavailable("no join token yet: core's secret settings can't be reached")
    return {"Authorization": f"Bearer {token}"}


async def read_secret(db: AsyncSession, namespace: str, key: str) -> str:
    """The secret stored at (namespace, key), or `""` when none is saved."""
    if settings_are_remote():
        response = await _core_request("GET", _secret_url(namespace, key), headers=_join_token_header())
        value = response.json().get("value")
    else:
        value = await get_setting(db, namespace, key, default="")
    return value if isinstance(value, str) else ""


async def write_secret(db: AsyncSession, namespace: str, key: str, value: str) -> None:
    """Store a secret. Not announced on the bus: its owner re-reads it on its own schedule."""
    if settings_are_remote():
        await _core_request("PUT", _secret_url(namespace, key), headers=_join_token_header(), json={"value": value})
        return
    await upsert_setting(db, namespace, key, value)


async def delete_secret(db: AsyncSession, namespace: str, key: str) -> None:
    """Forget a secret (a no-op when none is saved)."""
    if settings_are_remote():
        await _core_request("DELETE", _secret_url(namespace, key), headers=_join_token_header())
        return
    # Deferred, like read_namespace's: only the monolith touches the table.
    from backend.models import UserSettings
    from sqlalchemy import delete

    await db.execute(delete(UserSettings).where(UserSettings.namespace == namespace, UserSettings.key == key))
    await db.commit()
