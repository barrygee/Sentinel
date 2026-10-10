import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from backend.core import app_sections as app_sections_router
from backend.core import notifications as notifications_router
from backend.core import registry_router, settings_secrets, spa_csp
from backend.core.service_registry import registry
from backend.error_handlers import request_validation_error_handler
from backend.modules import MANIFESTS, MODULES, external_services, hosts_in_process
from backend.platform.lifecycle import run_lifecycles
from backend.radio_hub.routers import decode as hub_decode_router
from backend.radio_hub.routers import decoders as hub_decoders_router
from backend.radio_hub.routers import radio_control as hub_radio_control_router
from backend.radio_hub.routers import radios as hub_radios_router
from backend.radio_hub.routers import sentry as sentry_router
from backend.routers import offline_map
from backend.routers import sdr as sdr_router
from backend.routers import settings as settings_router
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).parent.parent
SPA_DIR = ROOT_DIR / "frontend" / "spa-dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run every module's lifecycle (backend/modules/) for the life of the app.

    Each module owns its startup, shutdown and SIGTERM/SIGINT wake hook; see
    backend/platform/lifecycle.py for the phase ordering and why the wake
    chain must not be removed (without it `--reload` deadlocks on long-lived
    SDR WebSocket tasks and a running `pmtiles extract`).
    """
    async with run_lifecycles(MODULES):
        yield


app = FastAPI(
    title="SENTINEL API",
    version="1.0.0",
    lifespan=lifespan,
    # Disable the built-in /docs and /redoc routes so they don't clash with the SPA.
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)
app.add_exception_handler(RequestValidationError, request_validation_error_handler)

# ── API routers ────────────────────────────────────────────────────────────────
# A section in SENTINEL_EXTERNAL_SERVICES runs in its own container (P6) and
# serves its paths itself, through the gateway. Its routers aren't even
# imported here: importing a section's services subscribes them to the bus.
if hosts_in_process("air"):
    from backend.routers import adsb_source as adsb_source_router
    from backend.routers import air

    app.include_router(air.router)
# Core notifications keep their /api/air/messages paths (B5).
app.include_router(notifications_router.router)
if hosts_in_process("space"):
    from backend.routers import space

    app.include_router(space.router)
if hosts_in_process("land"):
    from backend.routers import land

    app.include_router(land.router)
if hosts_in_process("sea"):
    from backend.routers import sea

    app.include_router(sea.router)
app.include_router(settings_router.router)
# The radio hub (backend/radio_hub/) and the SDR section share the /api/sdr/
# prefix. They are included interleaved so the routes keep exactly the order the
# single SDR router registered them in (the parity route-inventory golden pins it).
app.include_router(hub_radios_router.router)
app.include_router(sdr_router.router)
app.include_router(hub_radio_control_router.router)
app.include_router(hub_decode_router.router)
app.include_router(hub_decoders_router.router)
app.include_router(sentry_router.router)
if hosts_in_process("air"):
    # Air's, despite sitting under /api/sdr/ (the Sentry dongle behind Off Grid ADS-B).
    app.include_router(adsb_source_router.router)
app.include_router(offline_map.router)
app.include_router(app_sections_router.router)
app.include_router(registry_router.router)
# Secret settings for their owning service (Sea's AISStream key), join-token gated.
app.include_router(settings_secrets.router)

# This process hosts every section (and the radio hub) until each moves into its
# own container (P6); register them now, at import, so they are listed before
# the first request — and in tests, which skip the lifespan.
registry.register_in_process(list(MANIFESTS), instance_id="core")


# ── Health probe ───────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return JSONResponse({"status": "ok", "timestamp": int(time.time() * 1000)})


# ── Favicon ────────────────────────────────────────────────────────────────────
@app.get("/favicon.ico")
async def favicon_ico():
    return FileResponse(
        ROOT_DIR / "frontend" / "assets" / "favicon.ico",
        media_type="image/x-icon",
    )


# ── Static mounts ──────────────────────────────────────────────────────────────
# /assets — map tiles, PMTiles archives, sprites, fonts, favicons
app.mount("/assets", StaticFiles(directory=str(ROOT_DIR / "frontend" / "assets")), name="assets")

# ── SPA static files ───────────────────────────────────────────────────────────
# Serve the built Vue app's hashed JS/CSS bundles from /spa-assets/.
# Vite is configured with assetsDir='spa-assets' so these never clash with
# the map-tile /assets mount above.
fonts_dir = SPA_DIR / "fonts"
if fonts_dir.exists():
    app.mount("/fonts", StaticFiles(directory=str(fonts_dir)), name="fonts")

if SPA_DIR.exists():
    app.mount("/spa-assets", StaticFiles(directory=str(SPA_DIR / "spa-assets")), name="spa-assets")

# Each section's federation remote (GET /api/app/sections lists them). Mounted
# even before the remotes are built (check_dir=False), so a rebuild is served
# without a restart — and a missing remote file is a 404, never the SPA's
# index.html, which the shell would otherwise try to run as a remote entry.
app.mount(
    "/remotes",
    app_sections_router.RemotesStaticFiles(
        directory=str(SPA_DIR / "remotes"),
        check_dir=False,
        # A section that runs in its own container serves its own remote.
        withheld=external_services(),
    ),
    name="remotes",
)


# ── SPA catch-all ─────────────────────────────────────────────────────────────
# Any path that didn't match an API route or static mount above gets the SPA
# index.html, allowing Vue Router to handle client-side routing.
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index = SPA_DIR / "index.html"
    if index.exists():
        # The SPA entry must never be cached: it references hash-named JS/CSS
        # assets, so a stale index.html keeps pointing at an old bundle after a
        # rebuild. The hashed assets themselves remain immutably cacheable.
        return FileResponse(
            index,
            media_type="text/html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                # Pins where the shell (and every section remote it loads) may
                # run scripts from; see backend/core/spa_csp.py.
                "Content-Security-Policy": spa_csp.policy_for_index(index),
            },
        )
    # SPA not built yet — return a helpful message during development
    return JSONResponse(
        {"detail": "SPA not built. Run: cd frontend/vue && npm run build"},
        status_code=503,
    )
