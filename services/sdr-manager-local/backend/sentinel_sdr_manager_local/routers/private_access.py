"""`/api/private-access` — the addresses, besides this machine, that may use private dongles."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from sentinel_sdr_manager_local.dependencies import (
    get_console_auth_service,
    get_private_access,
    get_supervisor,
)
from sentinel_sdr_manager_local.schemas.errors import error_detail
from sentinel_sdr_manager_local.schemas.private_access import PrivateAccessState, PrivateAccessUpdate
from sentinel_sdr_manager_local.security import require_console_session
from sentinel_sdr_manager_local.services.console_auth import ConsoleAuthService
from sentinel_sdr_manager_local.services.private_access import PrivateAccessList
from sentinel_sdr_manager_local.services.supervisor import SupervisorService

router = APIRouter(prefix="/private-access", tags=["private-access"], dependencies=[Depends(require_console_session)])


@router.get("", response_model=PrivateAccessState, summary="Addresses allowed to use private dongles")
async def get_private_access_state(
    private_access: PrivateAccessList = Depends(get_private_access),
) -> PrivateAccessState:
    """The stored list."""
    return PrivateAccessState(addresses=list(private_access.addresses))


@router.put("", response_model=PrivateAccessState, summary="Replace the addresses allowed to use private dongles")
async def replace_private_access(
    update: PrivateAccessUpdate,
    private_access: PrivateAccessList = Depends(get_private_access),
    console_auth: ConsoleAuthService = Depends(get_console_auth_service),
    supervisor: SupervisorService = Depends(get_supervisor),
) -> PrivateAccessState:
    """Replace the list, then restart the private dongles' relays so it takes effect.

    The restart is what drops a Sentinel that was just removed. Refused with `409
    console_password_required` while no password is set: on an open console anyone
    who can reach this API could add their own address.
    """
    if not await console_auth.is_password_set():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=error_detail(
                "console_password_required",
                "Set a console password first: without one, anyone who can reach this machine could add themselves.",
            ),
        )
    await private_access.replace(tuple(update.addresses))
    await supervisor.reconcile()
    return PrivateAccessState(addresses=list(private_access.addresses))
