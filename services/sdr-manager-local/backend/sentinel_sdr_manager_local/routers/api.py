"""Aggregates every domain router into the SDR Manager API (Sentry architecture §4.4).

One `include_router` call per resource — never a single monolithic router.
No prefix here: `contract_app.py` mounts the whole API twice, at
`/api/sdr-manager/local` (the gateway's prefix) and at `/api` (for other
machines' managers), so every path below is relative to either mount.
"""

from __future__ import annotations

from fastapi import APIRouter

from sentinel_sdr_manager_local.routers import (
    auth,
    config,
    devices,
    events,
    health,
    hotspot,
    sdrs,
    status,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(status.router)
api_router.include_router(events.router)
api_router.include_router(devices.router)
api_router.include_router(sdrs.router)
api_router.include_router(hotspot.router)
api_router.include_router(config.router)
