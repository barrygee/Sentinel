"""The service SDK — one FastAPI factory for every service that runs in its own container (plan §4.2).

`create_service()` turns a section's routers, lifecycle and manifest into a
standalone app that:
  - runs the section's own lifecycle, with the SIGTERM/SIGINT wake chain
    (`backend/platform/lifecycle.py`) exactly as core does;
  - connects the event bus to NATS when `NATS_URL` is set;
  - registers its manifest with core and keeps it registered
    (`registration.py`), advertising `SERVICE_INTERNAL_URL`;
  - serves `/health` (core's probe) and its own UI remote under
    `/remotes/<id>/`.

By default nothing is served until core answers. A service that must keep
working while core is down (`sdr-manager-local`, whose dongles keep streaming,
ADR 0007) opts in with `serve_before_core=True`: its
`core_independent_lifecycles` run at startup and it serves at once, while the
core-ready wait, the bus, its other lifecycles and registration follow in the
background once core answers.

Settings stay in core: with `SENTINEL_CORE_URL` set, the settings client reads
and writes them over HTTP (`backend/platform/settings_client.py`). The service's
own data lives in its own SQLite file (`DB_PATH`); `legacy_import.py` copies it
out of the pre-split database (`sentinel.db`) on first boot.

The test suite's in-process app (`tests/in_process_app.py`) runs the very same
routers and lifecycles, so what the tests exercise is what a service runs.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator, Sequence
from contextlib import AsyncExitStack, asynccontextmanager
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
from backend.platform.settings_client import wait_for_core
from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


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


def _core_ready_lifecycle(service_id: str) -> ModuleLifecycle:
    """Hold the service's startup until core answers.

    A section's settings are core's, and the work its lifecycles start (table
    seeding, first cleanups, watchdogs) reads them straight away. The service
    container usually starts a few seconds before core, so without this every
    full `docker compose up` logged a failed first run per section. Every
    `prepare` runs before any `start`, so waiting in the first `prepare` covers
    all of a section's startup work.
    """

    async def prepare() -> None:
        await wait_for_core(f"{service_id} service startup")

    return ModuleLifecycle(name="core-ready", prepare=prepare)


def _registration_lifecycle(registrar: ServiceRegistrar) -> ModuleLifecycle:
    async def start() -> None:
        registrar.start()

    return ModuleLifecycle(name="registration", start=start, stop=registrar.stop)


@asynccontextmanager
async def _run_once_core_answers(service_id: str, modules: Sequence[ModuleLifecycle]) -> AsyncIterator[None]:
    """Run `modules` in the background once core answers, without holding up startup.

    For `serve_before_core`: the service is already serving when this yields.
    On exit, a wait (or startup) still in progress is cancelled, and modules
    that did start are stopped in reverse order, as `run_lifecycles` does.
    """
    started_modules = AsyncExitStack()

    async def wait_then_start() -> None:
        await wait_for_core(f"{service_id} service startup")
        try:
            await started_modules.enter_async_context(run_lifecycles(modules))
        except Exception:
            # The core-independent part keeps serving, so say clearly that the
            # rest never came up rather than letting the task die silently.
            logger.exception("%s: startup after core answered failed; serving without it", service_id)

    task = asyncio.create_task(wait_then_start(), name=f"{service_id}-after-core")
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        await started_modules.aclose()


def create_service(
    *,
    manifest: ServiceManifest,
    routers: Sequence[APIRouter],
    lifecycles: Sequence[ModuleLifecycle],
    remote_dir: Path | None = None,
    serve_before_core: bool = False,
    core_independent_lifecycles: Sequence[ModuleLifecycle] = (),
) -> FastAPI:
    """Build the FastAPI app for one standalone service.

    `lifecycles` run once core answers (see `_core_ready_lifecycle`), after
    the bus connects and before registration starts, so a service is only
    routed to once its own `prepare`/`start` have run (and it deregisters —
    stops re-registering — before they stop). `remote_dir` is the built UI
    remote served at `/remotes/<id>/` (sections and SDR Manager).

    With `serve_before_core`, the service starts serving without waiting for
    core: `core_independent_lifecycles` (which must not read settings or use
    the bus) run at startup, and everything else — the core-ready wait, the
    bus, `lifecycles`, registration — runs in the background once core
    answers. Off by default; only a service that must outlive a core outage
    should opt in.

    Raises `ServiceMisconfigured` when the environment can't place the service,
    and `ValueError` for `core_independent_lifecycles` without `serve_before_core`.
    """
    if core_independent_lifecycles and not serve_before_core:
        # Without serve_before_core, nothing would run before core anyway, so
        # the split would silently mean nothing.
        raise ValueError("core_independent_lifecycles needs serve_before_core=True")
    # Core configures logging in its entry point (backend/main.py); a service has no other entry.
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    advertised = advertised_manifest(manifest)
    registrar = ServiceRegistrar(advertised)
    core_dependent = (
        _bus_lifecycle(advertised.id),
        *lifecycles,
        _registration_lifecycle(registrar),
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if not serve_before_core:
            async with run_lifecycles((_core_ready_lifecycle(advertised.id), *core_dependent)):
                yield
            return
        async with run_lifecycles(core_independent_lifecycles):
            async with _run_once_core_answers(advertised.id, core_dependent):
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
        # Same caching rules as the test app's /remotes mount; a missing build is a 404.
        app.mount(
            f"/remotes/{advertised.id}",
            RemotesStaticFiles(directory=str(remote_dir), check_dir=False),
            name="remote",
        )
    app.state.registrar = registrar
    return app
