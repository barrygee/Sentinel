"""A service registering itself with core (section-containers plan §3.2).

The service POSTs its manifest to core's `/internal/registry/register` with the
join token, retrying until core answers, then again every
`service_register_interval_s`. Core keeps the registry in memory, so the repeat
is how a restarted core relearns the service; an unchanged re-registration is a
no-op on core's side.

Nothing here blocks startup: the service serves its API while it keeps trying,
and core simply doesn't route to it until it has registered.
"""

from __future__ import annotations

import asyncio
import logging
import socket

import httpx
from backend.config import settings
from backend.platform.join_token import service_join_token
from backend.platform.service_manifest import ServiceManifest

logger = logging.getLogger(__name__)

REGISTER_PATH = "/internal/registry/register"
REGISTER_TIMEOUT_S = 5.0
# Retry quickly while core is starting (it is usually seconds behind us).
FIRST_ATTEMPT_RETRY_S = 2.0


def instance_id() -> str:
    """This copy's identity: configured, or the host name (the container's, under Docker)."""
    return settings.service_instance_id or socket.gethostname()


class ServiceRegistrar:
    """Keeps one manifest registered with core for the life of the process."""

    def __init__(self, manifest: ServiceManifest) -> None:
        self.manifest = manifest
        self.registered = False
        self._task: asyncio.Task[None] | None = None

    async def register_once(self, client: httpx.AsyncClient) -> bool:
        """One registration attempt. True when core recorded it."""
        token = service_join_token()
        if not token:
            logger.warning("registration: no join token yet (SENTINEL_JOIN_TOKEN / SENTINEL_JOIN_TOKEN_FILE)")
            return False
        try:
            response = await client.post(
                settings.sentinel_core_url.rstrip("/") + REGISTER_PATH,
                json={"instanceId": instance_id(), "manifest": self.manifest.to_wire()},
                headers={"Authorization": f"Bearer {token}"},
                timeout=REGISTER_TIMEOUT_S,
            )
        except httpx.HTTPError as error:
            logger.info("registration: core unreachable (%s); retrying", error)
            return False
        if response.is_success:
            if not self.registered:
                logger.info("registration: %s registered with core at %s", self.manifest.id, settings.sentinel_core_url)
            return True
        # 409 is expected for a few probe rounds after a container is recreated
        # under a new host name: core still believes the old copy is live.
        logger.warning("registration: core refused %s (%d): %s", self.manifest.id, response.status_code, response.text)
        return False

    async def _run(self) -> None:
        async with httpx.AsyncClient() as client:
            while True:
                try:
                    self.registered = await self.register_once(client)
                except Exception:
                    # A bug in one attempt must not end registration for good.
                    logger.exception("registration: attempt failed")
                    self.registered = False
                delay = settings.service_register_interval_s if self.registered else FIRST_ATTEMPT_RETRY_S
                await asyncio.sleep(delay)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name=f"register-{self.manifest.id}")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
