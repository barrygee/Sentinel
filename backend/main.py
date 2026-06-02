import asyncio
import logging
import signal
import time
from contextlib import asynccontextmanager
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from backend.database import create_tables, migrate_sdr_radios_to_settings, normalize_sdr_frequencies_config, normalize_sdr_search_ranges_config, seed_default_sdr_groups, seed_default_sdr_search_ranges, seed_default_settings
from backend.routers import air, space
from backend.routers import sdr as sdr_router
from backend.routers import settings as settings_router
from backend.services import sdr as sdr_service
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
    await seed_default_sdr_groups()
    await normalize_sdr_frequencies_config()
    await seed_default_sdr_search_ranges()
    await normalize_sdr_search_ranges_config()
    cleanup_task = asyncio.create_task(_daily_cleanup_loop())

    # Chain SIGTERM/SIGINT: wake all SDR subscriber queues the instant the
    # signal arrives so blocked WS stream loops exit immediately, THEN run
    # uvicorn's original handler to start its graceful shutdown. Without the
    # pre-wake, uvicorn waits on those never-returning WS tasks before it
    # invokes lifespan shutdown — a deadlock that hangs `--reload`.
    _orig_handlers: dict[int, object] = {}

    def _chain(signum, frame):
        try:
            sdr_service.wake_all_subscribers()
        except Exception:
            logging.getLogger(__name__).exception("wake_all_subscribers failed")
        prev = _orig_handlers.get(signum)
        if callable(prev):
            prev(signum, frame)

    for _sig in (signal.SIGTERM, signal.SIGINT):
        _orig_handlers[_sig] = signal.getsignal(_sig)
        signal.signal(_sig, _chain)

    yield
    # Shutdown: cancel the cleanup loop and await it so uvicorn's graceful
    # shutdown doesn't hang waiting on a still-cancelling task. Then stop all
    # SDR broadcasters/connections (their long-lived tasks would otherwise
    # block shutdown indefinitely).
    for _sig, _prev in _orig_handlers.items():
        if callable(_prev) or _prev in (signal.SIG_DFL, signal.SIG_IGN):
            signal.signal(_sig, _prev)
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await sdr_service.shutdown_all()


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
        return FileResponse(index, media_type="text/html")
    # SPA not built yet — return a helpful message during development
    return JSONResponse(
        {"detail": "SPA not built. Run: cd frontend/vue && npm run build"},
        status_code=503,
    )
