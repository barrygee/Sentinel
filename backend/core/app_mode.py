"""Which shell this deployment runs — what the SPA asks before it mounts (ADR 0007).

  GET /api/app/mode — `{"mode": "full" | "sdr-manager-local-only", "landingPath": str}`

`full` is the map with every section. `sdr-manager-local-only` is the
lightweight mode that only manages and shares this machine's SDRs: the shell
then shows Settings › SDR Manager and nothing else, so `landingPath` points
there. The mode comes from `SENTINEL_MODE`, which the compose file sets.
"""

from typing import Literal

from backend.config import settings
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/app", tags=["app"])

AppModeName = Literal["full", "sdr-manager-local-only"]

LANDING_PATHS: dict[AppModeName, str] = {
    "full": "/",
    "sdr-manager-local-only": "/settings/sdr-manager",
}
"""Where the shell starts in each mode."""


class AppMode(BaseModel):
    """Body of GET /api/app/mode."""

    mode: AppModeName
    landingPath: str  # camelCase: the wire name the shell reads


def current_app_mode() -> AppMode:
    """This deployment's mode, from `settings.sentinel_mode`, with its landing path."""
    return AppMode(mode=settings.sentinel_mode, landingPath=LANDING_PATHS[settings.sentinel_mode])


@router.get("/mode", response_model=AppMode)
async def get_app_mode() -> AppMode:
    """Say which shell to mount, and where it starts."""
    return current_app_mode()
