"""Service registration — how a service joins this deployment (section-containers plan §3.2).

  POST /internal/registry/register — `{"instanceId", "manifest"}` → the registration

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
"""

from __future__ import annotations

from backend.core.internal_auth import require_caller, require_permission
from backend.core.service_registry import RegistrationConflict, registry
from backend.platform.service_access import may_register
from backend.platform.service_manifest import ServiceManifest
from fastapi import APIRouter, Header, HTTPException
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
