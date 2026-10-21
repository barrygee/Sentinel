"""Service registration — how a service joins this deployment (section-containers plan §3.2).

  POST /internal/registry/register — `{"instanceId", "manifest"}` → the registration
  GET  /internal/registry/services?kind=<kind> — `{"services": [{"id", "kind", "internalUrl", "available"}, …]}`

Called by each service on start, with its own credential as a bearer token
(`backend/platform/service_credentials.py`); a credential registers only its
own service id (`backend/platform/service_access.py`). Under `/internal/`,
which the gateway never routes from outside: only services on the deployment's
network reach it.

Status codes a registering service acts on:
  200 registered (or re-registered); 401 wrong or missing credential; 403 the
  credential belongs to another service; 409 the id is held by another live
  instance, or a route is another service's; 422 the manifest is invalid; 503
  registration is disabled (core has no accepted-callers list).

The listing lets one service find another by kind: `sdr-manager-remote` finds
`sdr-manager-local` (a container or a Mac process) to manage it as "This
machine" (ADR 0007). Each caller may list only the kinds `service_access.py`
grants it; any other kind, known or not, is a 403, so the listing can't be used
to probe what is deployed.
"""

from __future__ import annotations

from backend.core.internal_auth import require_caller, require_permission
from backend.core.service_registry import RegistrationConflict, registry
from backend.platform.service_access import may_list_services, may_register
from backend.platform.service_manifest import ServiceManifest
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/internal/registry", tags=["registry"], include_in_schema=False)


class RegistrationRequest(BaseModel):
    """Body of POST /internal/registry/register."""

    model_config = ConfigDict(populate_by_name=True)

    # Distinguishes a service restarting (same instance, may replace its own
    # registration) from a second copy trying to take a live id.
    instance_id: str = Field(alias="instanceId", min_length=1, max_length=128)
    manifest: ServiceManifest


class RegistrationResponse(BaseModel):
    """What core recorded."""

    id: str
    available: bool
    registeredAt: int  # camelCase: the wire name


class ListedService(BaseModel):
    """One registered service, as another service needs to reach it."""

    id: str
    kind: str
    internalUrl: str  # camelCase: the wire name, as in the manifest
    available: bool


class ListedServices(BaseModel):
    """Body of GET /internal/registry/services."""

    services: list[ListedService]


@router.post("/register", response_model=RegistrationResponse)
async def register_service(
    request: RegistrationRequest,
    authorization: str | None = Header(default=None),
) -> RegistrationResponse:
    """Register (or re-register) a service and its manifest."""
    # A service registers itself only: its credential can't claim another id.
    require_permission(may_register(require_caller(authorization), request.manifest.id))
    try:
        registration = await registry.register(request.manifest, request.instance_id)
    except RegistrationConflict as conflict:
        raise HTTPException(status_code=409, detail=str(conflict)) from conflict
    return RegistrationResponse(
        id=registration.manifest.id,
        available=registration.available,
        registeredAt=registration.registered_at_ms,
    )


@router.get("/services", response_model=ListedServices)
async def list_services(
    # Bounded like a service id; checked against the caller's grant, not a list
    # of kinds, so an unauthorised caller learns nothing from a 422.
    kind: str = Query(min_length=1, max_length=32),
    authorization: str | None = Header(default=None),
) -> ListedServices:
    """The registered services of one manifest `kind`, in nav order."""
    require_permission(may_list_services(require_caller(authorization), kind))
    return ListedServices(
        services=[
            ListedService(
                id=registration.manifest.id,
                kind=registration.manifest.kind,
                internalUrl=registration.manifest.internal_url,
                available=registration.available,
            )
            for registration in registry.services()
            if registration.manifest.kind == kind
        ]
    )
