"""The live service registry — which services this deployment has, and whether they're up.

Services register their manifest with core on start (plan §3.2). The registry
validates it (`ServiceManifest` does the shape; this module does the rules that
need the other registrations: one live instance per id, no shared route
prefixes), keeps it in memory, and probes each service's health over HTTP every
`registry_probe_interval_s`. A service that fails `registry_probe_failures`
probes in a row is marked unavailable, and comes back on its next good probe.

Liveness is HTTP, never the bus, so a NATS restart can't grey out healthy
sections (plan §3.2.3). Changes are still announced as `registry.changed` on the
bus for whoever wants to react to them.

Nothing is persisted: services re-register when they (or core) restart, so the
registry is always rebuilt from what is actually running.

In-process registrations are the monolith's own sections (`backend/modules/`):
they live and die with this process, so they are never probed, and their UI
remote is served from this process's SPA build.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx
from backend.config import settings
from backend.platform.bus import bus
from backend.platform.service_manifest import ServiceManifest

logger = logging.getLogger(__name__)

REGISTRY_CHANGED_SUBJECT = "registry.changed"

# How long one health probe may take. Well under the probe interval, so a hung
# service can't stall the loop that probes everyone else.
PROBE_TIMEOUT_S = 3.0


class RegistrationConflict(Exception):
    """A registration clashes with a live service (same id elsewhere, or a shared route)."""


@dataclass
class RegisteredService:
    """One registration and what the probes have learned about it."""

    manifest: ServiceManifest
    instance_id: str
    in_process: bool
    registered_at_ms: int
    available: bool = True
    consecutive_probe_failures: int = 0


def _now_ms() -> int:
    return int(time.time() * 1000)


class ServiceRegistry:
    """In-memory registry of every service that has registered with core.

    Every method runs on the event loop (single-process asyncio); the only
    awaits are the bus publish and the probes, and no state is read across them.
    """

    def __init__(self) -> None:
        self._services: dict[str, RegisteredService] = {}
        self._probe_task: asyncio.Task[None] | None = None

    # ── Registration ────────────────────────────────────────────────────────

    def register_in_process(self, manifests: list[ServiceManifest], instance_id: str) -> None:
        """Register the monolith's own sections — at import time, before any request.

        Synchronous on purpose: `backend/main.py` calls it while building the
        app, as it includes the routers, so the sections are listed in tests
        (which skip the lifespan) exactly as in production. There is no one to
        announce `registry.changed` to that early, so nothing is published.

        Raises `RegistrationConflict` when two of the monolith's own manifests
        clash — a programming error that must fail the build, not a request.
        """
        for manifest in manifests:
            self._check_conflicts(manifest, instance_id)
            self._services[manifest.id] = RegisteredService(
                manifest=manifest,
                instance_id=instance_id,
                in_process=True,
                registered_at_ms=_now_ms(),
            )

    async def register(self, manifest: ServiceManifest, instance_id: str) -> RegisteredService:
        """Register (or re-register) a service that runs in its own process.

        Re-registering from the same instance replaces its manifest — a service
        restarting with a new version does exactly that. A *different* instance
        may only take an id over once the current holder has failed its probes;
        a live id is never stolen (plan §3.2.1).

        Raises `RegistrationConflict` when the id is held by another live
        instance, or a route prefix is already another service's.
        """
        self._check_conflicts(manifest, instance_id)
        registration = RegisteredService(
            manifest=manifest,
            instance_id=instance_id,
            in_process=False,
            registered_at_ms=_now_ms(),
        )
        self._services[manifest.id] = registration
        logger.info("registry: %s %s registered from %s", manifest.kind, manifest.id, manifest.internal_url)
        await self._announce(manifest.id, "registered")
        return registration

    def _check_conflicts(self, manifest: ServiceManifest, instance_id: str) -> None:
        current = self._services.get(manifest.id)
        if current is not None and current.instance_id != instance_id and current.available:
            raise RegistrationConflict(f"service {manifest.id!r} is already registered by a live instance")
        claimed_routes = set(manifest.routes)
        for other in self._services.values():
            if other.manifest.id == manifest.id:
                continue
            shared = claimed_routes.intersection(other.manifest.routes)
            if shared:
                raise RegistrationConflict(
                    f"route {sorted(shared)[0]!r} is already registered by service {other.manifest.id!r}"
                )

    # ── Reads ───────────────────────────────────────────────────────────────

    def services(self) -> list[RegisteredService]:
        """Every registration, in nav order (then id) — the shell's registration order."""
        return sorted(
            self._services.values(),
            key=lambda registration: (registration.manifest.nav_order, registration.manifest.id),
        )

    def get(self, service_id: str) -> RegisteredService | None:
        return self._services.get(service_id)

    # ── Health probes ───────────────────────────────────────────────────────

    async def probe_once(self, client: httpx.AsyncClient) -> None:
        """Probe every out-of-process service once, concurrently, and record the results."""
        probed = [registration for registration in self._services.values() if not registration.in_process]
        if not probed:
            return
        results = await asyncio.gather(*(self._probe(client, registration) for registration in probed))
        for registration, healthy in zip(probed, results, strict=True):
            # The service may have re-registered (a new object) or been replaced
            # while the probes were in flight; only record against the one probed.
            if self._services.get(registration.manifest.id) is registration:
                await self._record_probe(registration, healthy)

    async def _probe(self, client: httpx.AsyncClient, registration: RegisteredService) -> bool:
        url = registration.manifest.internal_url + registration.manifest.health
        try:
            response = await client.get(url, timeout=PROBE_TIMEOUT_S)
        except httpx.HTTPError:
            return False
        return response.is_success

    async def _record_probe(self, registration: RegisteredService, healthy: bool) -> None:
        if healthy:
            registration.consecutive_probe_failures = 0
            if not registration.available:
                registration.available = True
                logger.info("registry: %s is available again", registration.manifest.id)
                await self._announce(registration.manifest.id, "available")
            return
        registration.consecutive_probe_failures += 1
        if registration.available and registration.consecutive_probe_failures >= settings.registry_probe_failures:
            registration.available = False
            logger.warning(
                "registry: %s failed %d health probes; marking it unavailable",
                registration.manifest.id,
                registration.consecutive_probe_failures,
            )
            await self._announce(registration.manifest.id, "unavailable")

    async def _probe_loop(self) -> None:
        async with httpx.AsyncClient() as client:
            while True:
                await asyncio.sleep(settings.registry_probe_interval_s)
                try:
                    await self.probe_once(client)
                except Exception:
                    # One bad round must not end probing for the life of the process.
                    logger.exception("registry: health probe round failed")

    def start(self) -> None:
        """Start the background health probes (core's lifecycle `start`)."""
        if self._probe_task is None or self._probe_task.done():
            self._probe_task = asyncio.create_task(self._probe_loop(), name="registry-probes")

    async def stop(self) -> None:
        """Stop the health probes and wait for the loop to end."""
        task, self._probe_task = self._probe_task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _announce(self, service_id: str, change: str) -> None:
        await bus.publish(REGISTRY_CHANGED_SUBJECT, {"id": service_id, "change": change})


# Process-wide singleton: the registration endpoint, the section list and the
# monolith's own registrations must all see the same registry.
registry = ServiceRegistry()
