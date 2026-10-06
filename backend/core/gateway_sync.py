"""Keeps the gateway's routes in step with the service registry (section-containers plan §4.4, §6).

Core owns the routing table; Caddy only holds a copy. A reconcile loop reads
the registry subroute back from Caddy's admin API and replaces it whenever it
differs from what the registry says, so the copy heals by itself:

- a registration, an id taking over, or a service going unavailable or coming
  back announces `registry.changed`, which wakes the loop at once;
- a restarted gateway comes back with only its static config, which the next
  periodic pass notices and fills in (plan §6: "dynamic ones are re-pushed").

Disabled when `gateway_admin_url` is empty — the all-in-one app (dev-all, the
tests, `uvicorn` on a laptop) has no gateway in front of it.

The admin API is internal-network only (plan §4.5); nothing here is reachable
from a browser.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from backend.config import settings
from backend.core.gateway_routes import REGISTRY_ROUTES_ID, caddy_routes, routing_table
from backend.core.service_registry import REGISTRY_CHANGED_SUBJECT, registry
from backend.platform.bus import EventPayload, bus

logger = logging.getLogger(__name__)

# One admin call. The admin API is on the same network and answers in
# milliseconds; this only bounds a gateway that is down or wedged.
ADMIN_TIMEOUT_S = 5.0


def desired_registry_subroute() -> dict[str, Any]:
    """The registry subroute exactly as Caddy should hold it right now."""
    return {
        "@id": REGISTRY_ROUTES_ID,
        "handler": "subroute",
        "routes": caddy_routes(routing_table(registry.services(), settings.core_internal_url)),
    }


class GatewaySync:
    """The reconcile loop: one task, woken by registry changes or the interval."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._wake = asyncio.Event()
        self._unsubscribe: Any = None
        # Last outcome, so a gateway that stays down logs once, not every pass.
        self._last_reconcile_ok: bool | None = None

    async def reconcile_once(self, client: httpx.AsyncClient) -> bool:
        """Bring the gateway's registry subroute in line with the registry.

        Returns True when the gateway holds the desired routes afterwards
        (whether or not they had to be pushed), False when it couldn't be
        reached or refused the config — the next pass tries again.
        """
        desired = desired_registry_subroute()
        url = f"{settings.gateway_admin_url.rstrip('/')}/id/{REGISTRY_ROUTES_ID}"
        try:
            current = await client.get(url, timeout=ADMIN_TIMEOUT_S)
            current.raise_for_status()
            # Caddy leaves an empty `routes` array out of what it returns.
            held = current.json()
            if held.get("routes") is None:
                held["routes"] = []
            if held != desired:
                # PATCH replaces the object under the id: the whole subroute, so
                # routes that a service no longer claims are dropped too.
                pushed = await client.patch(url, json=desired, timeout=ADMIN_TIMEOUT_S)
                pushed.raise_for_status()
        except httpx.HTTPError as error:
            if self._last_reconcile_ok is not False:
                logger.warning("gateway: could not sync routes via %s: %s", settings.gateway_admin_url, error)
            self._last_reconcile_ok = False
            return False
        if self._last_reconcile_ok is not True:
            logger.info("gateway: routes synced (%d prefixes)", len(desired["routes"]))
        self._last_reconcile_ok = True
        return True

    async def _on_registry_changed(self, _payload: EventPayload) -> None:
        # Runs inside the publisher's await (a registration request), so it only
        # signals the loop; the admin call happens on the loop's own task.
        self._wake.set()

    async def _loop(self) -> None:
        async with httpx.AsyncClient() as client:
            while True:
                self._wake.clear()
                try:
                    await self.reconcile_once(client)
                except Exception:
                    # A bug in one pass must not end syncing for the process's life.
                    logger.exception("gateway: route sync pass failed")
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=settings.gateway_sync_interval_s)
                except TimeoutError:
                    pass

    def start(self) -> None:
        """Start syncing (core's lifecycle `start`); a no-op with no gateway configured."""
        if not settings.gateway_admin_url:
            return
        if self._task is None or self._task.done():
            self._unsubscribe = bus.subscribe(REGISTRY_CHANGED_SUBJECT, self._on_registry_changed)
            self._task = asyncio.create_task(self._loop(), name="gateway-sync")

    async def stop(self) -> None:
        """Stop syncing and wait for the loop to end. The gateway keeps the last routes."""
        task, self._task = self._task, None
        unsubscribe, self._unsubscribe = self._unsubscribe, None
        if unsubscribe is not None:
            unsubscribe()
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


# Process-wide singleton, started by core's lifecycle.
gateway_sync = GatewaySync()
