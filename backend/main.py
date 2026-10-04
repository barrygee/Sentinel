import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from backend.core import notifications as notifications_router
from backend.error_handlers import request_validation_error_handler
from backend.modules import MODULES
from backend.platform.lifecycle import run_lifecycles
from backend.radio_hub.routers import decode as hub_decode_router
from backend.radio_hub.routers import decoders as hub_decoders_router
from backend.radio_hub.routers import radio_control as hub_radio_control_router
from backend.radio_hub.routers import radios as hub_radios_router
from backend.radio_hub.routers import sentry as sentry_router
from backend.routers import adsb_source as adsb_source_router
from backend.routers import air, land, offline_map, sea, space
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
app.include_router(air.router)
# Core notifications keep their /api/air/messages paths (B5).
app.include_router(notifications_router.router)
app.include_router(space.router)
app.include_router(land.router)
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
app.include_router(adsb_source_router.router)
app.include_router(offline_map.router)


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
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    # SPA not built yet — return a helpful message during development
    return JSONResponse(
        {"detail": "SPA not built. Run: cd frontend/vue && npm run build"},
        status_code=503,
    )
