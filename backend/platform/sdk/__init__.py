"""The service SDK — one FastAPI factory for every service that runs in its own container (plan §4.2).

`create_service()` turns a section's routers, lifecycle and manifest into a
standalone app that:
  - runs the section's own lifecycle, with the SIGTERM/SIGINT wake chain
    (`backend/platform/lifecycle.py`) exactly as the monolith does;
  - connects the event bus to NATS when `NATS_URL` is set;
  - registers its manifest with core and keeps it registered
    (`registration.py`), advertising `SERVICE_INTERNAL_URL`;
  - serves `/health` (core's probe) and its own UI remote under
    `/remotes/<id>/`.

Settings stay in core: with `SENTINEL_CORE_URL` set, the settings client reads
and writes them over HTTP (`backend/platform/settings_client.py`). The service's
own data lives in its own SQLite file (`DB_PATH`); `legacy_import.py` copies it
out of the monolith's database on first boot.

The section's code is the same code the monolith runs in-process — moved, not
rewritten — so the two composition roots can't drift apart.
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from pathlib import Path

from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.error_handlers import request_validation_error_handler
from backend.platform.bus import bus
from backend.platform.lifecycle import ModuleLifecycle, run_lifecycles
from backend.platform.nats_transport import NatsTransport
from backend.platform.remote_files import RemotesStaticFiles
from backend.platform.sdk.registration import ServiceRegistrar
from backend.platform.service_manifest import ServiceManifest
from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ServiceMisconfigured(RuntimeError):
    """The environment is missing what a standalone service needs to join a deployment."""


def advertised_manifest(manifest: ServiceManifest) -> ServiceManifest:
    """`manifest` with this container's own address (`SERVICE_INTERNAL_URL`) as its `internalUrl`.

    Validated again, so a bad URL fails at startup rather than at registration.
    Raises `ServiceMisconfigured` when core's or the service's address is unset.
    """
    if not settings.sentinel_core_url:
        raise ServiceMisconfigured("SENTINEL_CORE_URL must be set for a service to join core")
    if not settings.service_internal_url:
        raise ServiceMisconfigured(
            "SERVICE_INTERNAL_URL must be set: it is where core and the gateway reach this service"
        )
    return ServiceManifest.model_validate({**manifest.to_wire(), "internalUrl": settings.service_internal_url})


def _bus_lifecycle(service_id: str) -> ModuleLifecycle:
    transport: NatsTransport | None = None

    async def start() -> None:
        nonlocal transport
        if not settings.nats_url:
            return
        transport = NatsTransport(
            bus, settings.nats_url, client_name=f"sentinel-{service_id}", open_session=AsyncSessionLocal
        )
        await transport.start()

    async def stop() -> None:
        nonlocal transport
        if transport is not None:
            await transport.stop()
            transport = None

    return ModuleLifecycle(name="bus", start=start, stop=stop)


def _registration_lifecycle(registrar: ServiceRegistrar) -> ModuleLifecycle:
    async def start() -> None:
        registrar.start()

    return ModuleLifecycle(name="registration", start=start, stop=registrar.stop)


def create_service(
    *,
    manifest: ServiceManifest,
    routers: Sequence[APIRouter],
    lifecycles: Sequence[ModuleLifecycle],
    remote_dir: Path | None = None,
) -> FastAPI:
    """Build the FastAPI app for one standalone service.

    `lifecycles` run after the bus connects and before registration starts, so
    a service is only routed to once its own `prepare`/`start` have run (and it
    deregisters — stops re-registering — before they stop). `remote_dir` is
    the built UI remote served at `/remotes/<id>/` (sections only).

    Raises `ServiceMisconfigured` when the environment can't place the service.
    """
    # The monolith configures logging in backend/main.py; a service has no other entry.
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    advertised = advertised_manifest(manifest)
    registrar = ServiceRegistrar(advertised)
    modules = (_bus_lifecycle(advertised.id), *lifecycles, _registration_lifecycle(registrar))

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        async with run_lifecycles(modules):
            yield

    app = FastAPI(
        title=f"SENTINEL {advertised.display_name or advertised.id} service",
        version=advertised.version,
        lifespan=lifespan,
        # The browser reaches this service only through the gateway, on the
        # section's own prefixes; /api/docs is core's.
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)
    for router in routers:
        app.include_router(router)

    @app.get(advertised.health, include_in_schema=False)
    async def health() -> JSONResponse:
        return JSONResponse(
            {
                "status": "ok",
                "service": advertised.id,
                "registered": registrar.registered,
                "timestamp": int(time.time() * 1000),
            }
        )

    if advertised.ui is not None and remote_dir is not None:
        # Same caching rules as the monolith's /remotes mount; a missing build is a 404.
        app.mount(
            f"/remotes/{advertised.id}",
            RemotesStaticFiles(directory=str(remote_dir), check_dir=False),
            name="remote",
        )
    app.state.registrar = registrar
    return app
