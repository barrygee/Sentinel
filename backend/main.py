import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.database import create_tables
from backend.routers import air, space, sea, land


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(
    title="SENTINEL API",
    version="1.0.0",
    lifespan=lifespan,
)

# Domain routers
app.include_router(air.router)
app.include_router(space.router)
app.include_router(sea.router)
app.include_router(land.router)


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok", "timestamp": int(time.time() * 1000)})


# Serve static files from project root (dev convenience — nginx handles this in production)
app.mount("/", StaticFiles(directory=".", html=True), name="static")
