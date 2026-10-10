"""Service registration — how a service joins this deployment (section-containers plan §3.2).

  POST /internal/registry/register — `{"instanceId", "manifest"}` → the registration

Called by each service on start, with the deployment's join token as a bearer
token (`SENTINEL_JOIN_TOKEN`, or the shared file core generates —
`backend/platform/join_token.py`). Under `/internal/`, which the gateway never
routes from outside: only services on the deployment's network reach it.

Status codes a registering service acts on:
  200 registered (or re-registered); 401 wrong or missing token; 409 the id is
  held by another live instance, or a route is another service's; 422 the
  manifest is invalid; 503 registration is disabled (no join token configured).
"""

from __future__ import annotations

import hmac

from backend.core.service_registry import RegistrationConflict, registry
from backend.platform.join_token import core_join_token
from backend.platform.service_manifest import ServiceManifest
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/internal/registry", tags=["registry"], include_in_schema=False)

_BEARER_PREFIX = "Bearer "


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


def _require_join_token(authorization: str | None) -> None:
    expected = core_join_token()
    if not expected:
        raise HTTPException(status_code=503, detail="Service registration is disabled on this deployment")
    presented = (
        authorization[len(_BEARER_PREFIX) :] if authorization and authorization.startswith(_BEARER_PREFIX) else ""
    )
    # Constant-time, so the token can't be recovered a character at a time.
    if not hmac.compare_digest(presented.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid join token")


@router.post("/register", response_model=RegistrationResponse)
async def register_service(
    request: RegistrationRequest,
    authorization: str | None = Header(default=None),
) -> RegistrationResponse:
    """Register (or re-register) a service and its manifest."""
    _require_join_token(authorization)
    try:
        registration = await registry.register(request.manifest, request.instance_id)
    except RegistrationConflict as conflict:
        raise HTTPException(status_code=409, detail=str(conflict)) from conflict
    return RegistrationResponse(
        id=registration.manifest.id,
        available=registration.available,
        registeredAt=registration.registered_at_ms,
    )
