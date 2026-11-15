"""A remote SDR host's devices: the cached status snapshot, and edits proxied to the host.

  GET    /api/sdr-manager/remote/hosts/{host_id}/devices                 — cached status snapshot
  GET    /api/sdr-manager/remote/hosts/{host_id}/devices/records         — the host's device records
  PATCH  /api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}     — proxy PATCH /api/devices/{id}
  DELETE /api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}     — proxy DELETE /api/devices/{id}
  POST   /api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}/serial — proxy the EEPROM flash

The host stays the source of truth (ADR 0007): every write goes to it and its
rejection comes back verbatim.
"""

from __future__ import annotations

from typing import Any

from backend.database import get_db
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sdr_manager_remote.routers.host_access import (
    get_host_or_404,
    raise_for_host_error,
    raise_for_unreachable,
)
from sentinel_sdr_manager_remote.schemas.hosts import (
    DeviceSnapshotOut,
    SerialFlashIn,
)
from sentinel_sdr_manager_remote.services.host_poller import host_poller
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    SdrManagerApiError,
    SdrManagerUnreachableError,
    client_for_host,
)

router = APIRouter(prefix="/api/sdr-manager/remote/hosts", tags=["sdr-manager-remote"])


# ── Cached device snapshot ──────────────────────────────────────────────────────


@router.get("/{host_id}/devices", response_model=DeviceSnapshotOut)
async def get_host_devices(host_id: int, db: AsyncSession = Depends(get_db)) -> DeviceSnapshotOut:
    """Return the fleet poller's cached `GET /api/status` snapshot for one host.

    Served from memory, never a live round-trip, by design: Sentinel's
    device list is a cache refreshed on a 2s poll, and this route surfaces
    exactly that cache plus its own reachability so a dead host still renders
    something instead of blocking the request.
    """
    await get_host_or_404(host_id, db)
    snapshot = host_poller.get_snapshot(host_id)
    if snapshot is None:
        return DeviceSnapshotOut(
            reachable=False, last_error=None, last_polled_at=None, last_success_at=None, api_version=None, status=None
        )
    return DeviceSnapshotOut(
        reachable=snapshot.reachable,
        last_error=snapshot.last_error,
        last_polled_at=snapshot.last_polled_at,
        last_success_at=snapshot.last_success_at,
        api_version=snapshot.api_version,
        status=snapshot.status_payload,
    )


@router.get("/{host_id}/devices/records")
async def get_host_device_records(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `GET /api/devices` — the host's persisted device configuration.

    Distinct from the cached snapshot above, and both are needed. `/api/status`
    returns `DeviceStatus`, which describes what a device is *doing* — present,
    state, live tuner readout — and deliberately carries none of the persisted
    tuning intent. The stored `sample_rate`, `gain_db`, `gain_auto`,
    `ppm_correction`, `bias_tee` and `direct_sampling` live only on
    `DeviceRecord`, so an edit form driven off the snapshot alone would show
    every tuning field blank and silently clear them on save.

    Live rather than cached: it is fetched when a form opens, not on a timer,
    and the operator is about to edit these values so they must be current. It
    also carries the host's `port_suggestion` and `constraints`, which the port
    field needs to suggest a free port rather than guess.
    """
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_devices()
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return JSONResponse(response.data)


# ── Device proxy — writes go straight to the host, never reimplemented here ──────


@router.patch("/{host_id}/devices/{device_id}")
async def patch_host_device(
    host_id: int, device_id: str, patch: dict[str, Any], db: AsyncSession = Depends(get_db)
) -> JSONResponse:
    """Proxy `PATCH /api/devices/{device_id}` to the host, propagating its response verbatim.

    The body is forwarded as-is: The host owns the full `DevicePatch` validation
    (bounds, enums, port allocation, name uniqueness) and its rejection code
    must reach the caller unchanged, so this router does not re-validate or
    reshape it beyond being valid JSON.
    """
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.patch_device(device_id, patch)
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    await host_poller.refresh_now(host_id)
    return JSONResponse(response.data)


@router.delete("/{host_id}/devices/{device_id}", status_code=204)
async def delete_host_device(host_id: int, device_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    """Proxy `DELETE /api/devices/{device_id}` — removes the host's persisted config for that device."""
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        await client.delete_device(device_id)
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    await host_poller.refresh_now(host_id)
    return Response(status_code=204)


@router.post("/{host_id}/devices/{device_id}/serial", status_code=202)
async def flash_host_device_serial(
    host_id: int, device_id: str, body: SerialFlashIn, db: AsyncSession = Depends(get_db)
) -> JSONResponse:
    """Proxy `POST /api/devices/{device_id}/serial` — begins the host's guarded EEPROM flash."""
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.flash_serial(device_id, body.serial)
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    await host_poller.refresh_now(host_id)
    return JSONResponse(response.data, status_code=202)
