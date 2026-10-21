"""Core's app factory: the FastAPI app behind the gateway in every deployment.

Core serves notifications, settings, offline maps, the section list, service
registration, secret settings and the SPA shell. Every section and the radio
hub run as services of their own (`sentinel_<id>.service`,
`sentinel_radio.service`) built by `create_service()` (`backend/platform/sdk/`):
they register with core over `/internal/registry/register`, and the gateway
routes their prefixes to them. Core never imports their code; import-linter
keeps all of `backend` section-free.

The test suite builds an app that hosts every section and the hub in-process
on top of this one (`tests/in_process_app.py`), passing its own routers and
lifecycles to `create_core_app()`.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager

from backend.core import app_docs as app_docs_router
from backend.core import app_mode as app_mode_router
from backend.core import app_sections as app_sections_router
from backend.core import notifications as notifications_router
from backend.core import registry_router, settings_secrets
from backend.core.spa_serving import mount_spa
from backend.error_handlers import request_validation_error_handler
from backend.modules import bus as bus_module
from backend.modules import core as core_module
from backend.platform.lifecycle import ModuleLifecycle, run_lifecycles
from backend.routers import offline_map
from backend.routers import settings as settings_router
from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# bus first, so every later module publishes onto a connected bus.
CORE_LIFECYCLES: tuple[ModuleLifecycle, ...] = (bus_module.lifecycle, core_module.lifecycle)


def core_routers() -> list[APIRouter]:
    """Core's own API routers, in route-matching order."""
    return [
        # Every section's alerts, despite the path (B5).
        notifications_router.router,
        settings_router.router,
        offline_map.router,
        app_sections_router.router,
        # Whether the optional docs service is deployed (the shell offers Docs only then).
        app_docs_router.router,
        # Full app or SDR Manager-only: which shell the SPA mounts (ADR 0007).
        app_mode_router.router,
        registry_router.router,
        # Secret settings for their owning service (Sea's AISStream key), per-service credential gated.
        settings_secrets.router,
    ]


def create_core_app(
    *,
    routers: Sequence[APIRouter] | None = None,
    lifecycles: Sequence[ModuleLifecycle] = CORE_LIFECYCLES,
    serve_section_remotes: bool = False,
) -> FastAPI:
    """Build core's FastAPI app.

    `routers` and `lifecycles` default to core's own; the test suite's in-process
    app passes its own, which add every section's and the hub's. Section remotes
    (`/remotes/<id>/`) are a 404 unless `serve_section_remotes`: in a deployment
    each section serves its own, so core never hands out a stale copy.
    """

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        # Each module owns its startup, shutdown and SIGTERM/SIGINT wake hook;
        # see backend/platform/lifecycle.py for the phase ordering and why the
        # wake chain must not be removed (without it `--reload` deadlocks on
        # long-lived WebSocket tasks and a running `pmtiles extract`).
        async with run_lifecycles(lifecycles):
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
    for router in core_routers() if routers is None else routers:
        app.include_router(router)
    _add_health(app)
    mount_spa(app, serve_section_remotes=serve_section_remotes)
    return app


def _add_health(app: FastAPI) -> None:
    @app.get("/health")
    async def health_check():
        return JSONResponse({"status": "ok", "timestamp": int(time.time() * 1000)})
