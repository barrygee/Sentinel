import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from backend.database import create_tables, migrate_sdr_radios_to_settings, seed_default_settings
from backend.routers import air, space
from backend.routers import sdr as sdr_router
from backend.routers import settings as settings_router
from backend.services.flight_history import cleanup_old_snapshots
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).parent.parent
SPA_DIR  = ROOT_DIR / "frontend" / "spa-dist"


async def _daily_cleanup_loop() -> None:
    """Run flight history cleanup once at startup and then every 24 hours."""
    while True:
        try:
            await cleanup_old_snapshots()
        except Exception:
            logging.getLogger(__name__).exception("Flight history cleanup failed")
        await asyncio.sleep(24 * 60 * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler — creates tables and seeds defaults on startup."""
    await create_tables()
    await migrate_sdr_radios_to_settings()
    await seed_default_settings()
    cleanup_task = asyncio.create_task(_daily_cleanup_loop())
    yield
    cleanup_task.cancel()


app = FastAPI(
    title="SENTINEL API",
    version="1.0.0",
    lifespan=lifespan,
    # Disable the built-in /docs and /redoc routes so they don't clash with the SPA.
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── API routers ────────────────────────────────────────────────────────────────
app.include_router(air.router)
app.include_router(space.router)
app.include_router(settings_router.router)
app.include_router(sdr_router.router)


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
if SPA_DIR.exists():
    app.mount("/spa-assets", StaticFiles(directory=str(SPA_DIR / "spa-assets")), name="spa-assets")


# ── SPA catch-all ─────────────────────────────────────────────────────────────
# Any path that didn't match an API route or static mount above gets the SPA
# index.html, allowing Vue Router to handle client-side routing.
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index = SPA_DIR / "index.html"
    if index.exists():
        return FileResponse(index, media_type="text/html")
    # SPA not built yet — return a helpful message during development
    return JSONResponse(
        {"detail": "SPA not built. Run: cd frontend/vue && npm run build"},
        status_code=503,
    )
