"""The "This machine" link: keeps one host row in step with this machine's sdr-manager-local (ADR 0007).

sdr-manager-local registers with core like any service, as a container or as a
Mac process. Every `local_link_interval_s` this asks core's registry for it
(`GET /internal/registry/services?kind=sdr-manager-local`) and keeps the
`is_local` row of `remote_sdr_hosts` matching:

  - registered and available: the row exists, is enabled, signs in with the
    service bearer (`auth_mode='service'`), and points at the address in its
    `internalUrl`. A row an operator already added at that address and port is
    adopted rather than duplicated, so radios made from it keep working.
  - gone, or failing core's probes: the row is **disabled, never deleted**,
    because `sdr.radios` references it by id; it comes back when the service does.
  - core can't be asked: nothing changes. Not knowing is not the same as absent.

The operator can't delete or readdress the row (`routers/hosts.py` answers
409 `local_host_managed`), so nothing but this module moves it.
"""

from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlsplit

from backend.cache import now_ms
from backend.database import AsyncSessionLocal
from backend.platform.sdk.discovery import RegistryUnavailable, list_registered_services
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sdr_manager_remote.config import get_settings
from sentinel_sdr_manager_remote.models import AUTH_MODE_SERVICE, RemoteSdrHost
from sentinel_sdr_manager_remote.services.host_poller import host_poller
from sentinel_sdr_manager_remote.services.sdr_manager_client import validate_host_address, validate_host_port

logger = logging.getLogger(__name__)

LOCAL_SERVICE_KIND = "sdr-manager-local"


def local_address(internal_url: str) -> tuple[str, int] | None:
    """The `(address, port)` a registered `internalUrl` names, or None when the client can't use it.

    The client speaks plain HTTP to a bare host and port (`SdrManagerClient`),
    which is what sdr-manager-local advertises; anything else (another scheme,
    a path, credentials) is refused rather than guessed at.
    """
    try:
        parts = urlsplit(internal_url)
        # Not `or 80`: an explicit `:0` is a bad address, not a missing port.
        port = parts.port if parts.port is not None else 80
    except ValueError:
        return None
    if parts.scheme != "http" or not parts.hostname or parts.username or parts.password:
        return None
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        return None
    try:
        return validate_host_address(parts.hostname), validate_host_port(port)
    except ValueError:
        return None


async def _discover_local_address() -> tuple[str, int] | None:
    """Where this machine's sdr-manager-local answers, None when it isn't there.

    Raises `RegistryUnavailable` when core can't say, including when this
    process has no core to ask (the test suite's in-process app).
    """
    services = await list_registered_services(LOCAL_SERVICE_KIND)
    if services is None:
        raise RegistryUnavailable("no core registry to ask")
    for service in services:
        if not service.available:
            continue
        address = local_address(service.internal_url)
        if address is None:
            logger.warning("local link: %s registered an unusable address %r", service.id, service.internal_url)
            continue
        return address
    return None


async def _occupant(db: AsyncSession, address: str, port: int, *, excluding: int | None) -> RemoteSdrHost | None:
    query = select(RemoteSdrHost).where(RemoteSdrHost.address == address, RemoteSdrHost.port == port)
    if excluding is not None:
        query = query.where(RemoteSdrHost.id != excluding)
    return (await db.execute(query)).scalar_one_or_none()


class LocalLink:
    """Owns the background task that keeps the "This machine" row in step with core's registry.

    Not a singleton by class design (tests can instantiate their own), but
    `local_link` at module scope is the one instance the running app uses.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None

    async def sync_once(self) -> None:
        """Ask core once and bring the row in line; never raises for an expected failure."""
        try:
            discovered = await _discover_local_address()
        except RegistryUnavailable as error:
            logger.debug("local link: core's registry can't be asked (%s); leaving This machine as it is", error)
            return
        async with AsyncSessionLocal() as db:
            local = (
                await db.execute(select(RemoteSdrHost).where(RemoteSdrHost.is_local.is_(True)))
            ).scalar_one_or_none()
            if discovered is None:
                await self._disable(db, local)
            else:
                await self._link(db, local, *discovered)

    async def _disable(self, db: AsyncSession, local: RemoteSdrHost | None) -> None:
        if local is None or not local.enabled:
            return
        local.enabled = False
        await db.commit()
        await host_poller.stop_host(local.id)
        logger.info("local link: sdr-manager-local is gone; This machine (host %d) is disabled", local.id)

    async def _link(self, db: AsyncSession, local: RemoteSdrHost | None, address: str, port: int) -> None:
        if local is None:
            # An operator may have added this machine by hand before the link
            # first ran: take that row over, so radios made from it keep its id.
            local = await _occupant(db, address, port, excluding=None)
            if local is None:
                local = RemoteSdrHost(address=address, port=port, created_at=now_ms())
                db.add(local)
            local.is_local = True
            changed = True
        elif (local.address, local.port) != (address, port):
            if await _occupant(db, address, port, excluding=local.id) is not None:
                # Two rows can't share an address, and the other one is the
                # operator's: say so, and keep trying each interval.
                logger.warning(
                    "local link: sdr-manager-local moved to %s:%d, where another SDR host is registered; "
                    "This machine (host %d) stays at %s:%d",
                    address,
                    port,
                    local.id,
                    local.address,
                    local.port,
                )
                return
            local.address, local.port = address, port
            changed = True
        else:
            changed = not local.enabled or local.auth_mode != AUTH_MODE_SERVICE
        if not changed:
            # Idempotent: an unchanged tick writes nothing and leaves the poller running.
            await host_poller.start_host(local.id)
            return
        local.auth_mode = AUTH_MODE_SERVICE
        # The bearer replaces any console password an adopted row carried.
        local.auth_token = ""
        local.enabled = True
        await db.commit()
        await db.refresh(local)
        await host_poller.restart_host(local.id)
        logger.info("local link: This machine (host %d) is linked at %s:%d", local.id, address, port)

    async def _run(self) -> None:
        while True:
            try:
                await self.sync_once()
            except Exception:
                # A bug in one tick must not end the link for good.
                logger.exception("local link: sync failed")
            await asyncio.sleep(get_settings().local_link_interval_s)

    def start(self) -> None:
        """Start the link's task (a no-op while it is running)."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="sdr-manager-local-link")

    async def stop(self) -> None:
        """Cancel and await the link's task."""
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


# Process-wide singleton, started by the service's lifecycle and cancelled when it stops.
local_link = LocalLink()
