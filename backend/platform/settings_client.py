"""Settings client — how a module reads and writes settings it does not own.

Settings are central: every namespace lives in core's `user_settings` table and
is mirrored to the live config file. A module that writes a setting should do
it the way `PUT /api/settings/{namespace}/{key}` does — store the value, then
announce `settings.changed.<namespace>` on the bus so whoever reacts to that
key (a level-triggered reconciler) hears about it. Writing the row directly
skips the announcement, which is exactly the hidden coupling the
section-containers plan removes (B7, B10).

Two modes, chosen by `SENTINEL_CORE_URL`:
  - unset (core itself, or the test suite's in-process app): the same database
    helpers the settings router uses, through the caller's session.
  - set (a service in its own container, P6): core's settings API over HTTP —
    `PUT` there stores, announces and mirrors the value to the config file
    exactly as a browser's write does. The `db` argument is then unused; call
    sites don't change.

Secret settings (`SECRET_SETTING_KEYS`, e.g. Sea's AISStream key) never cross
the public settings API, which redacts them. Their owner uses `read_secret` /
`write_secret` / `delete_secret`, which go to core's
`/internal/settings/secrets/` routes with this service's own credential when remote (plan §4.3 rule 4).

Remote reads are cached for `SETTINGS_CACHE_TTL_S`. A service reads the same
few namespaces on nearly every request (one ADS-B poll reads `air` and `app`
five times between them), so without a cache a busy map hammered core and every
core hiccup stalled the map. Concurrent reads of one namespace share a single
request; this service's own writes drop its cached copy at once; and if core
stops answering, the last good answer stands in for up to
`SETTINGS_STALE_IF_ERROR_S`, so a frozen core slows a request rather than
failing it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
from backend.config import settings
from backend.db_helpers import get_setting, upsert_setting
from backend.platform.bus import bus
from backend.platform.internal_tls import internal_verify
from backend.platform.service_credentials import own_token
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Core is on the same network; a request slower than this is a fault, not load.
CORE_REQUEST_TIMEOUT_S = 5.0

# Between attempts while `wait_for_core` waits for core to start answering.
CORE_WAIT_RETRY_S = 2.0

# How long a remote read is reused. Short on purpose: a change saved in the
# browser reaches core, not this process, so this is the longest a service can
# act on the value from before it.
SETTINGS_CACHE_TTL_S = 2.0

# How old the last good answer may be and still stand in while core is not
# answering. Settings can't change during that time anyway: every write goes
# through core.
SETTINGS_STALE_IF_ERROR_S = 300.0


class SettingsUnavailable(Exception):
    """Core's settings API could not be reached, or refused the request."""


@dataclass(frozen=True)
class _CachedRead:
    """A remote read's raw body, kept as bytes so no caller can mutate what the next one gets."""

    body: bytes
    fetched_at: float  # time.monotonic()


# Keyed by request URL: one entry per namespace or secret.
_cached_reads: dict[str, _CachedRead] = {}
_reads_in_flight: dict[str, asyncio.Future[bytes]] = {}
# URLs already logged as served stale during the current outage, so a frozen
# core logs one line per URL rather than one per request.
_stale_reads_logged: set[str] = set()
_shared_client: httpx.AsyncClient | None = None


def forget_cached_settings() -> None:
    """Drop every cached read and the shared HTTP client.

    For tests: each runs on its own event loop and may swap `httpx.AsyncClient`
    for a fake, so nothing may carry over from the last one. The client is
    dropped, not closed, because closing needs the loop it was opened on.
    """
    global _shared_client
    _cached_reads.clear()
    _reads_in_flight.clear()
    _stale_reads_logged.clear()
    _shared_client = None


async def close_core_client() -> None:
    """Close the shared HTTP client to core; a service's lifespan calls this on shutdown."""
    global _shared_client
    client, _shared_client = _shared_client, None
    if client is not None:
        await client.aclose()


def _core_client() -> httpx.AsyncClient:
    # One pooled client per process: a fresh client per call meant a new
    # connection (and TLS handshake, where internal TLS is on) for every read.
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient(timeout=CORE_REQUEST_TIMEOUT_S, verify=internal_verify())
    return _shared_client


def _forget_cached_read(url: str) -> None:
    """Drop `url`'s cached body, and detach any read in flight so its (older) answer is never stored."""
    _cached_reads.pop(url, None)
    _reads_in_flight.pop(url, None)


def settings_are_remote() -> bool:
    """True when this process is a service reading core's settings over HTTP."""
    return bool(settings.sentinel_core_url)


async def wait_for_core(waiting_for: str) -> None:
    """Return once core's settings API answers; at once when settings are local.

    A section's container usually starts a few seconds before core does (a full
    `docker compose up`, or core restarting under it). Background work whose
    first run reads settings awaits this first, so it starts when it can rather
    than failing once and logging a traceback for an expected startup race.
    `waiting_for` names the work in the log: one line while waiting, and one
    once core answers (with how long that took), so a slow start reads clearly.
    """
    if not settings_are_remote():
        return
    started = time.monotonic()
    logged = False
    while True:
        try:
            await _core_request("GET", _settings_url("app"))
        except SettingsUnavailable as error:
            if not logged:
                logger.info("%s: waiting for core to answer (%s)", waiting_for, error)
                logged = True
            await asyncio.sleep(CORE_WAIT_RETRY_S)
            continue
        if logged:
            logger.info(
                "%s: connected to core at %s after %.1f s",
                waiting_for,
                settings.sentinel_core_url,
                time.monotonic() - started,
            )
        else:
            logger.info("%s: connected to core at %s", waiting_for, settings.sentinel_core_url)
        return


def _settings_url(*path_segments: str) -> str:
    return "/".join([settings.sentinel_core_url.rstrip("/"), "api", "settings", *path_segments])


async def _core_request(method: str, url: str, **request_options: Any) -> httpx.Response:
    try:
        response = await _core_client().request(method, url, **request_options)
    except httpx.HTTPError as error:
        raise SettingsUnavailable(f"core settings API unreachable: {error}") from error
    if not response.is_success:
        raise SettingsUnavailable(f"core settings API answered {response.status_code} for {method} {url}")
    return response


async def _fetch_body(url: str, request_options: dict[str, Any]) -> bytes:
    return (await _core_request("GET", url, **request_options)).content


def _settle_read(url: str, read: asyncio.Future[bytes]) -> None:
    """Store a finished read's body, unless a write detached it while it was in flight."""
    if read.cancelled():
        return
    # Retrieved here as well as by the waiting callers, so a failure nobody is
    # left waiting for (every caller cancelled) isn't logged as unretrieved.
    failure = read.exception()
    if _reads_in_flight.get(url) is not read:
        return
    del _reads_in_flight[url]
    if failure is None:
        _cached_reads[url] = _CachedRead(body=read.result(), fetched_at=time.monotonic())
        _stale_reads_logged.discard(url)


async def _cached_get_json(url: str, **request_options: Any) -> Any:
    """GET `url` from core as parsed JSON, through the read cache (see the module docstring)."""
    cached = _cached_reads.get(url)
    if cached is not None and time.monotonic() - cached.fetched_at < SETTINGS_CACHE_TTL_S:
        return json.loads(cached.body)
    read = _reads_in_flight.get(url)
    if read is None:
        read = asyncio.ensure_future(_fetch_body(url, request_options))
        _reads_in_flight[url] = read
        read.add_done_callback(lambda finished: _settle_read(url, finished))
    try:
        # Shielded: one caller giving up must not cancel the read the others share.
        body = await asyncio.shield(read)
    except SettingsUnavailable as error:
        if cached is None or time.monotonic() - cached.fetched_at >= SETTINGS_STALE_IF_ERROR_S:
            raise
        if url not in _stale_reads_logged:
            _stale_reads_logged.add(url)
            logger.warning("serving cached settings while core is not answering: %s", error)
        return json.loads(cached.body)
    return json.loads(body)


async def read_namespace(db: AsyncSession, namespace: str) -> dict[str, Any]:
    """Every (non-secret) setting in `namespace`, as `{key: parsed value}`."""
    if settings_are_remote():
        body = await _cached_get_json(_settings_url(namespace))
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
        url = _settings_url(namespace, key)
        try:
            await _core_request("PUT", url, json={"value": value})
        finally:
            # Even on failure: a PUT that timed out may still have landed.
            _forget_cached_read(_settings_url(namespace))
        return
    await upsert_setting(db, namespace, key, value)
    await bus.publish(f"settings.changed.{namespace}", {"keys": [key], "db": db}, raise_errors=raise_errors)


# ── secrets ───────────────────────────────────────────────────────────────────


def _secret_url(namespace: str, key: str) -> str:
    return "/".join([settings.sentinel_core_url.rstrip("/"), "internal", "settings", "secrets", namespace, key])


def _credential_header() -> dict[str, str]:
    token = own_token()
    if not token:
        raise SettingsUnavailable("no HTTP credential: core's secret settings can't be reached")
    return {"Authorization": f"Bearer {token}"}


async def read_secret(db: AsyncSession, namespace: str, key: str) -> str:
    """The secret stored at (namespace, key), or `""` when none is saved."""
    if settings_are_remote():
        body = await _cached_get_json(_secret_url(namespace, key), headers=_credential_header())
        value = body.get("value") if isinstance(body, dict) else None
    else:
        value = await get_setting(db, namespace, key, default="")
    return value if isinstance(value, str) else ""


async def write_secret(db: AsyncSession, namespace: str, key: str, value: str) -> None:
    """Store a secret. Not announced on the bus: its owner re-reads it on its own schedule."""
    if settings_are_remote():
        url = _secret_url(namespace, key)
        try:
            await _core_request("PUT", url, headers=_credential_header(), json={"value": value})
        finally:
            _forget_cached_read(url)
        return
    await upsert_setting(db, namespace, key, value)


async def delete_secret(db: AsyncSession, namespace: str, key: str) -> None:
    """Forget a secret (a no-op when none is saved)."""
    if settings_are_remote():
        url = _secret_url(namespace, key)
        try:
            await _core_request("DELETE", url, headers=_credential_header())
        finally:
            _forget_cached_read(url)
        return
    # Deferred, like read_namespace's: only core touches the table.
    from backend.models import UserSettings
    from sqlalchemy import delete

    await db.execute(delete(UserSettings).where(UserSettings.namespace == namespace, UserSettings.key == key))
    await db.commit()
