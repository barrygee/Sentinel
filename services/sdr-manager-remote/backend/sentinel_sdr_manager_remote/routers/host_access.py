"""What every `/api/sdr-manager/remote/hosts` router shares: the host lookup, its response, and host errors."""

from __future__ import annotations

from typing import Any, NoReturn

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sdr_manager_remote.models import TRANSPORT_HTTP, RemoteSdrHost
from sentinel_sdr_manager_remote.schemas.hosts import (
    RemoteSdrHostOut,
    TlsState,
)
from sentinel_sdr_manager_remote.services.host_poller import host_poller
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    SdrManagerApiError,
    SdrManagerUnreachableError,
)

MACHINE_NAME_MAX_LENGTH = 64
"""A host's published machine name is cut to this, as sdr-manager-local cuts its own."""


# ── Shared helpers ────────────────────────────────────────────────────────────


async def get_host_or_404(host_id: int, db: AsyncSession) -> RemoteSdrHost:
    """Fetch a RemoteSdrHost row or raise 404 without leaking anything about its token."""
    host = await db.get(RemoteSdrHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_host", "message": "No such SDR host."})
    return host


def host_to_out(host: RemoteSdrHost) -> RemoteSdrHostOut:
    """Build the response schema for a host, overlaying the poller's live reachability."""
    snapshot = host_poller.get_snapshot(host.id)
    return RemoteSdrHostOut(
        id=host.id,
        name=host.name,
        address=host.address,
        port=host.port,
        enabled=host.enabled,
        auth_token_set=bool(host.auth_token),
        is_local=host.is_local,
        machine_name=published_machine_name(snapshot.export_payload if snapshot is not None else None),
        may_use_private=host.is_local or (snapshot is not None and snapshot.may_use_private),
        auto_add_sdrs=host.auto_add_sdrs,
        created_at=host.created_at,
        last_seen_at=host.last_seen_at,
        last_error=host.last_error,
        reachable=snapshot.reachable if snapshot is not None else False,
        api_version=snapshot.api_version if snapshot is not None else None,
        transport=host.transport,
        tls_fingerprint=host.tls_fingerprint,
        tls_state=_tls_state(host, certificate_rejected=snapshot is not None and snapshot.certificate_rejected),
    )


def published_machine_name(export_payload: dict[str, Any] | None) -> str | None:
    """The `source.machine_name` a host's export carries, trimmed; None when absent, blank or not text."""
    source = (export_payload or {}).get("source")
    machine_name = source.get("machine_name") if isinstance(source, dict) else None
    if not isinstance(machine_name, str):
        return None
    return machine_name.strip()[:MACHINE_NAME_MAX_LENGTH] or None


def _tls_state(host: RemoteSdrHost, *, certificate_rejected: bool) -> TlsState:
    """How the host's connection is secured, for the Settings host card (see `RemoteSdrHostOut`)."""
    if host.transport == TRANSPORT_HTTP:
        return "insecure"
    if host.tls_certificate_authority:
        return "changed" if certificate_rejected else "pinned"
    return "deployment" if host.is_local else "untrusted"


def raise_for_host_error(exc: SdrManagerApiError) -> NoReturn:
    """Propagate the host's own status code and `{code, message, ...context}` envelope verbatim."""
    raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message, **exc.context})


def raise_for_unreachable(exc: SdrManagerUnreachableError) -> NoReturn:
    """502: Sentinel never got a response to interpret, so there is no host code to surface.

    The code still says why: `host_unreachable`, or `certificate_rejected` /
    `certificate_untrusted` when the request was refused before it was sent.
    """
    raise HTTPException(status_code=502, detail={"code": exc.code, "message": str(exc)})
