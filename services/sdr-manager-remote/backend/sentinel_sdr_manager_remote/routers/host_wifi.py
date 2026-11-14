"""A remote SDR host's Wi-Fi hotspot, proxied to its `/api/hotspot` routes.

GET    /api/sdr-manager/remote/hosts/{host_id}/wifi                    — proxy GET /api/hotspot
PUT    /api/sdr-manager/remote/hosts/{host_id}/wifi                    — proxy PUT /api/hotspot
DELETE /api/sdr-manager/remote/hosts/{host_id}/wifi                    — proxy DELETE /api/hotspot
POST   /api/sdr-manager/remote/hosts/{host_id}/wifi/enable             — proxy POST /api/hotspot/enable
POST   /api/sdr-manager/remote/hosts/{host_id}/wifi/disable            — proxy POST /api/hotspot/disable
POST   /api/sdr-manager/remote/hosts/{host_id}/wifi/confirm            — proxy POST /api/hotspot/confirm
GET    /api/sdr-manager/remote/hosts/{host_id}/wifi/interfaces         — proxy GET /api/hotspot/interfaces
GET    /api/sdr-manager/remote/hosts/{host_id}/wifi/clients            — proxy GET /api/hotspot/clients
"""

from __future__ import annotations

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
    WifiActivationIn,
    WifiConfigIn,
)
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    SdrManagerApiError,
    SdrManagerUnreachableError,
    client_for_host,
)

router = APIRouter(prefix="/api/sdr-manager/remote/hosts", tags=["sdr-manager-remote"])


# ── WiFi/hotspot proxy ───────────────────────────────────────────────────────────


@router.get("/{host_id}/wifi")
async def get_host_wifi(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `GET /api/hotspot` — the host's response never includes the passphrase."""
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_hotspot()
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.put("/{host_id}/wifi")
async def put_host_wifi(host_id: int, body: WifiConfigIn, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `PUT /api/hotspot` — a full replace, matching the host's own semantics."""
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.put_hotspot(body.model_dump())
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.delete("/{host_id}/wifi", status_code=204)
async def delete_host_wifi(host_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    """Proxy `DELETE /api/hotspot` — forgets the hotspot configuration, including its password."""
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        await client.delete_hotspot()
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return Response(status_code=204)


@router.post("/{host_id}/wifi/enable")
async def enable_host_wifi(host_id: int, body: WifiActivationIn, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `POST /api/hotspot/enable` — brings the hotspot up provisionally.

    The host rolls this back unless `POST .../wifi/confirm` arrives within its
    own timeout; Sentinel never calls confirm automatically (see that route).
    """
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.enable_hotspot(body.confirm_uplink_loss)
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.post("/{host_id}/wifi/disable")
async def disable_host_wifi(host_id: int, body: WifiActivationIn, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `POST /api/hotspot/disable`."""
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.disable_hotspot(body.confirm_uplink_loss)
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.post("/{host_id}/wifi/confirm")
async def confirm_host_wifi(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `POST /api/hotspot/confirm`.

    Safety-critical (Sentry ADR-0007, carried into sdr-manager-local): this route must only ever be
    reached by an explicit operator action in the UI — never invoked
    automatically after `enable`, and never called speculatively by this
    backend on the operator's behalf.
    """
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.confirm_hotspot()
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.get("/{host_id}/wifi/interfaces")
async def list_host_wifi_interfaces(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `GET /api/hotspot/interfaces`."""
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_hotspot_interfaces()
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.get("/{host_id}/wifi/clients")
async def list_host_wifi_clients(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `GET /api/hotspot/clients`."""
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_hotspot_clients()
    except SdrManagerApiError as exc:
        raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        raise_for_unreachable(exc)
    return JSONResponse(response.data)
