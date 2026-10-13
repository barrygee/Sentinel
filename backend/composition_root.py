"""Core's app factory — the composition root for the process every deployment runs.

It lives outside `backend.core` on purpose: it is the one place allowed to
import every section (the import-linter contract keeps `backend.core`
section-free), the way `backend/modules/__init__.py` composes their lifecycles.

`create_core_app()` is to core what `create_service()` (`backend/platform/sdk/`)
is to a section running in its own container. Core always serves notifications,
settings, offline maps, the section list, service registration, secret settings
and the SPA. It also hosts, in-process, every section and the radio hub that
`SENTINEL_EXTERNAL_SERVICES` doesn't list — all of them in the all-in-one
(`dev-all`) deployment, none when every one runs in its own container.

A service that runs elsewhere isn't even imported: importing a section's
services subscribes them to the bus, and the radio hub's modules answer `hub.*`
requests at import, so the copy left behind here would handle events and
requests meant for the container.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from backend.core import app_sections as app_sections_router
from backend.core import notifications as notifications_router
from backend.core import registry_router, settings_secrets
from backend.core.service_registry import registry
from backend.core.spa_serving import mount_spa
from backend.error_handlers import request_validation_error_handler
from backend.modules import external_services, hosts_in_process
from backend.platform.lifecycle import run_lifecycles
from backend.routers import offline_map
from backend.routers import settings as settings_router
from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def create_core_app() -> FastAPI:
    """Build core's FastAPI app for this deployment's `SENTINEL_EXTERNAL_SERVICES`.

    Registers the services it hosts with the service registry before returning,
    so they are listed before the first request — and in tests, which skip the
    lifespan. Raises `ValueError` when `SENTINEL_EXTERNAL_SERVICES` names a
    service that can't run on its own.
    """
    # Composed here, not at import: see backend/modules/__init__.py.
    from backend.modules import MANIFESTS, MODULES

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        # Each module owns its startup, shutdown and SIGTERM/SIGINT wake hook;
        # see backend/platform/lifecycle.py for the phase ordering and why the
        # wake chain must not be removed (without it `--reload` deadlocks on
        # long-lived SDR WebSocket tasks and a running `pmtiles extract`).
        async with run_lifecycles(MODULES):
            yield

    app = FastAPI(
        title="SENTINEL API",
        version="1.0.0",
        lifespan=lifespan,
        # Under /api/ so the built-in docs routes don't clash with the SPA.
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)
    for router in api_routers():
        app.include_router(router)
    registry.register_in_process(list(MANIFESTS), instance_id="core")
    _add_health(app)
    mount_spa(app, withheld_remotes=external_services())
    return app


def api_routers() -> list[APIRouter]:
    """Core's API routers plus those of every hosted service, in route-matching order.

    The order is load-bearing: the parity route-inventory golden pins it. The
    radio hub and the SDR section share the /api/sdr/ prefix, so their routers
    are interleaved to keep exactly the order the single SDR router once
    registered them in; the gateway's longest-prefix match keeps each one's
    paths apart when either runs elsewhere.
    """
    routers: list[APIRouter] = []
    if hosts_in_process("air"):
        from sentinel_air import adsb_source_router  # noqa: F401 — included under /api/sdr/
        from sentinel_air import router as air

        routers.append(air.router)
    # Core notifications keep their /api/air/messages paths (B5).
    routers.append(notifications_router.router)
    if hosts_in_process("space"):
        from sentinel_space import router as space

        routers.append(space.router)
    if hosts_in_process("land"):
        from sentinel_land import router as land

        routers.append(land.router)
    if hosts_in_process("sea"):
        from sentinel_sea import router as sea

        routers.append(sea.router)
    routers.append(settings_router.router)
    routers.extend(_sdr_prefix_routers())
    routers.append(offline_map.router)
    routers.append(app_sections_router.router)
    routers.append(registry_router.router)
    # Secret settings for their owning service (Sea's AISStream key), per-service credential gated.
    routers.append(settings_secrets.router)
    return routers


def _sdr_prefix_routers() -> list[APIRouter]:
    """Every hosted router under /api/sdr/: radio hub, SDR section and Air's ADS-B source."""
    routers: list[APIRouter] = []
    hosts_radio_hub = hosts_in_process("radio-hub")
    if hosts_radio_hub:
        from backend.radio_hub.routers import decode as hub_decode_router
        from backend.radio_hub.routers import decoders as hub_decoders_router
        from backend.radio_hub.routers import iq_captures as hub_iq_captures_router
        from backend.radio_hub.routers import radio_control as hub_radio_control_router
        from backend.radio_hub.routers import radios as hub_radios_router
        from backend.radio_hub.routers import sentry as sentry_router

        routers.append(hub_radios_router.router)
    if hosts_in_process("sdr"):
        from backend.routers import sdr as sdr_router

        routers.append(sdr_router.router)
    if hosts_radio_hub:
        routers.extend(
            [
                hub_radio_control_router.router,
                hub_decode_router.router,
                hub_decoders_router.router,
                sentry_router.router,
                hub_iq_captures_router.router,
            ]
        )
    if hosts_in_process("air"):
        # Air's, despite sitting under /api/sdr/ (the Sentry dongle behind Off Grid ADS-B).
        from sentinel_air import adsb_source_router

        routers.append(adsb_source_router.router)
    return routers


def _add_health(app: FastAPI) -> None:
    @app.get("/health")
    async def health_check():
        return JSONResponse({"status": "ok", "timestamp": int(time.time() * 1000)})
