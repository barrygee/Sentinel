"""`GET /api/status` (Sentry architecture §7.2). Requires bearer auth when configured."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status

from sentinel_sdr_manager_local.config import Settings
from sentinel_sdr_manager_local.dependencies import (
    get_clock,
    get_device_registry,
    get_location_source,
    get_settings_dependency,
)
from sentinel_sdr_manager_local.interfaces.clock import Clock
from sentinel_sdr_manager_local.location_source import CoreLocationSource
from sentinel_sdr_manager_local.routers.host_resolution import resolve_public_host, with_resolved_hosts
from sentinel_sdr_manager_local.schemas.device import StatusResponse
from sentinel_sdr_manager_local.security import require_console_session
from sentinel_sdr_manager_local.services.device_registry import DeviceRegistry

router = APIRouter(tags=["status"], dependencies=[Depends(require_console_session)])


@router.get(
    "/status",
    response_model=StatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Realtime per-SDR status",
)
async def get_status(
    request: Request,
    device_registry: DeviceRegistry = Depends(get_device_registry),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_settings_dependency),
    location_service: CoreLocationSource = Depends(get_location_source),
) -> StatusResponse:
    """Return the realtime per-SDR view — identical payload to the SSE `snapshot` event.

    The registry cannot know the publishable host, so it emits `output.host=""`;
    it is overlaid here (Sentry architecture §7.7) so consumers of this endpoint get the
    same reachable address `/api/v1/sdrs` reports.
    """
    host = resolve_public_host(request, settings)
    return StatusResponse(
        generated_at=clock.now_ms(),
        # Sentinel's Location setting, so a Sentinel polling this endpoint can plot
        # the Pi without a second call — see `schemas/location.py`.
        location=await location_service.get_location(),
        sdrs=with_resolved_hosts(device_registry.list_statuses(), host),
    )
