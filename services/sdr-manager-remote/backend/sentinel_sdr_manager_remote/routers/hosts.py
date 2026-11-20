"""Remote SDR hosts router — this Sentinel's client surface onto other machines' SDR Manager API.

sdr-manager-local on each host stays the source of truth for device
configuration (ADR 0007); this service is a full remote client of its `/api`
surface plus a small local record of which hosts exist. This router never
reimplements the host's validation (port allocation, name uniqueness, device
state) — every device/hotspot mutation is proxied to the host and its
rejection propagated verbatim.

Endpoints:
  GET    /api/sdr-manager/remote/hosts                                   — list known SDR hosts
  POST   /api/sdr-manager/remote/hosts                                   — register a new host
  GET    /api/sdr-manager/remote/hosts/{host_id}                         — one host's record
  PUT    /api/sdr-manager/remote/hosts/{host_id}                         — update a host
  DELETE /api/sdr-manager/remote/hosts/{host_id}                         — forget a host
  POST   /api/sdr-manager/remote/hosts/certificate                       — read a not-yet-added host's certificate authority
  POST   /api/sdr-manager/remote/hosts/{host_id}/certificate             — read a host's certificate authority now
  PUT    /api/sdr-manager/remote/hosts/{host_id}/certificate             — trust (pin) it, by the fingerprint the operator checked
  POST   /api/sdr-manager/remote/hosts/{host_id}/test                    — probe GET /api/health
  GET    /api/sdr-manager/remote/hosts/{host_id}/info                    — everything known about a host
  GET    /api/sdr-manager/remote/hosts/locations                         — every host with a known position

  Devices: `host_devices.py`; Wi-Fi hotspot: `host_wifi.py` (same prefix, included after this router).

`auth_token` is write-only: accepted on POST/PUT, never returned in any
response body (only a boolean `auth_token_set`).

HTTPS is trust on first use (`services/host_certificates.py`): the operator
reads a host's certificate authority fingerprint (`POST .../certificate`),
compares it with the one the host shows, and the add (or `PUT .../certificate`)
carries the fingerprint they checked. The server reads the authority again and
pins it only if it still matches, so nothing can be swapped in between. Plain
HTTP is the operator's explicit choice (`transport: "http"`) for a host that
doesn't offer HTTPS.

The "This machine" row (`is_local`) is kept by `services/local_link.py`, not by
the operator: DELETE on it, or a PUT that changes anything but its `name`,
answers 409 `local_host_managed`.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from backend.cache import now_ms
from backend.database import get_db
from backend.platform.settings_client import SettingsUnavailable
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sdr_manager_remote.config import get_settings
from sentinel_sdr_manager_remote.models import TRANSPORT_HTTPS, RemoteSdrHost
from sentinel_sdr_manager_remote.routers.host_access import (
    get_host_or_404,
    host_to_out,
    published_machine_name,
)
from sentinel_sdr_manager_remote.schemas.hosts import (
    CertificatePreviewIn,
    CertificatePreviewOut,
    CertificateTrustIn,
    HealthProbeResult,
    HostLocationOut,
    HostSiteOut,
    HostSourceOut,
    RemoteSdrHostIn,
    RemoteSdrHostInfoOut,
    RemoteSdrHostOut,
    RemoteSdrHostPatch,
)

# Imported for its side effect: registers the reservation proxy
# (sdr-manager.remote.*) on the bus at import time, so Air's ADS-B claim
# reaches it even in tests, which skip the app lifespan.
from sentinel_sdr_manager_remote.services import reservations  # noqa: F401
from sentinel_sdr_manager_remote.services.host_certificates import (
    HostCertificateAuthority,
    HostCertificateError,
    HostOffersNoTlsError,
    fetch_host_certificate_authority,
)
from sentinel_sdr_manager_remote.services.host_poller import host_poller
from sentinel_sdr_manager_remote.services.host_radios import forget_host_radios
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    SdrManagerApiError,
    SdrManagerUnreachableError,
    client_for_host,
)
from sentinel_sdr_manager_remote.services.this_machine_address import this_machine_connect_address

logger = logging.getLogger(__name__)

THIS_MACHINE_LABEL = "This machine"
"""What this Sentinel's own SDR Manager is called; the UI puts the machine name (`app.machineName`) in front."""

router = APIRouter(prefix="/api/sdr-manager/remote/hosts", tags=["sdr-manager-remote"])

_SETTINGS_UNAVAILABLE_FOR_DELETE = HTTPException(
    status_code=503,
    detail={
        "code": "settings_unavailable",
        "message": "Couldn't remove this host's radios, so it was kept. Try again in a moment.",
    },
)

_LOCAL_HOST_MANAGED = HTTPException(
    status_code=409,
    detail={
        "code": "local_host_managed",
        "message": "This machine's SDR host is kept in step with sdr-manager-local and can't be removed or changed.",
    },
)

# The fields the local link owns on the "This machine" row. `name` is not one,
# but the UI no longer shows or sends it for this row: this machine is named by
# the `app.machineName` setting, the one name every surface uses for it.
_LOCAL_HOST_LINKED_FIELDS = frozenset({"address", "port", "auth_token", "enabled", "transport"})


async def _read_certificate_authority(address: str, port: int) -> HostCertificateAuthority:
    """Read a host's certificate authority, or raise the HTTP error to answer with.

    409 `host_offers_no_tls` — it serves plain HTTP; 502 `certificate_invalid`
    — what it sent isn't one authority that signed its own certificate; 502
    `host_unreachable` — no answer at all.
    """
    settings = get_settings()
    read_s = settings.read_timeout_s
    timeout = httpx.Timeout(connect=settings.connect_timeout_s, read=read_s, write=read_s, pool=read_s)
    try:
        return await fetch_host_certificate_authority(address, port, timeout=timeout)
    except HostOffersNoTlsError as exc:
        raise HTTPException(status_code=409, detail={"code": "host_offers_no_tls", "message": str(exc)}) from exc
    except HostCertificateError as exc:
        raise HTTPException(status_code=502, detail={"code": "certificate_invalid", "message": str(exc)}) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "host_unreachable", "message": f"Could not reach SDR host {address}:{port}."},
        ) from exc


async def _authority_matching(address: str, port: int, fingerprint: str) -> HostCertificateAuthority:
    """The host's authority, read now, provided it is the one the operator checked — else 409.

    Read again rather than taken from the preview: a client-supplied PEM would
    let a page trust anything, and the host could have changed in between.
    """
    authority = await _read_certificate_authority(address, port)
    if authority.fingerprint != fingerprint:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "certificate_changed",
                "message": "The host's certificate fingerprint is not the one you checked. Check it again.",
                "fingerprint": authority.fingerprint,
            },
        )
    return authority


def _preview_of(authority: HostCertificateAuthority, *, pinned: str | None) -> CertificatePreviewOut:
    return CertificatePreviewOut(
        tls_available=True,
        detail="ok",
        fingerprint=authority.fingerprint,
        subject=authority.subject,
        not_valid_after=authority.not_valid_after,
        matches_pinned=None if pinned is None else authority.fingerprint == pinned,
    )


async def _preview(address: str, port: int, *, pinned: str | None) -> CertificatePreviewOut:
    """`POST .../certificate`'s answer: a host without TLS is a result to show, not an error."""
    try:
        authority = await _read_certificate_authority(address, port)
    except HTTPException as exc:
        if isinstance(exc.detail, dict) and exc.detail.get("code") == "host_offers_no_tls":
            return CertificatePreviewOut(
                tls_available=False,
                detail="This SDR host doesn't offer HTTPS: its console password would cross the network unencrypted.",
            )
        raise
    return _preview_of(authority, pinned=pinned)


# ── Host CRUD ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[RemoteSdrHostOut])
async def list_hosts(db: AsyncSession = Depends(get_db)) -> list[RemoteSdrHostOut]:
    """List every SDR host Sentinel knows about."""
    hosts = (await db.execute(select(RemoteSdrHost).order_by(RemoteSdrHost.id))).scalars().all()
    return [host_to_out(host) for host in hosts]


@router.post("", response_model=RemoteSdrHostOut, status_code=201)
async def create_host(body: RemoteSdrHostIn, db: AsyncSession = Depends(get_db)) -> RemoteSdrHostOut:
    """Register a new SDR host and, if enabled, start polling it immediately."""
    existing = await db.execute(
        select(RemoteSdrHost).where(RemoteSdrHost.address == body.address, RemoteSdrHost.port == body.port)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "host_conflict",
                "message": "An SDR host at this address and port is already registered.",
            },
        )
    authority: HostCertificateAuthority | None = None
    if body.transport == TRANSPORT_HTTPS:
        assert body.tls_fingerprint is not None  # the schema requires it over HTTPS
        authority = await _authority_matching(body.address, body.port, body.tls_fingerprint)
    host = RemoteSdrHost(
        name=body.name,
        address=body.address,
        port=body.port,
        auth_token=body.auth_token,
        enabled=body.enabled,
        auto_add_sdrs=body.auto_add_sdrs,
        transport=body.transport,
        tls_certificate_authority=authority.pem if authority is not None else None,
        tls_fingerprint=authority.fingerprint if authority is not None else None,
        created_at=now_ms(),
    )
    db.add(host)
    await db.commit()
    await db.refresh(host)
    if host.enabled:
        await host_poller.start_host(host.id)
    return host_to_out(host)


@router.get("/locations", response_model=list[HostSiteOut])
async def list_host_locations(db: AsyncSession = Depends(get_db)) -> list[HostSiteOut]:
    """List every enabled SDR host that reports a position, for plotting on the domain maps.

    Reads only the fleet poller's cached export — never the network — because
    every domain map polls this while it is open: a round trip per host per poll
    would make a slow Pi stall the map. A host that has gone unreachable keeps
    its last known position and is reported with `reachable: false`, so an
    operator sees a site that is off the air rather than a site that vanished.

    Declared before `/{host_id}` on purpose: FastAPI matches routes in
    declaration order, so the reverse would parse "locations" as a host id.
    """
    hosts = (await db.execute(select(RemoteSdrHost).order_by(RemoteSdrHost.id))).scalars().all()
    sites: list[HostSiteOut] = []
    for host in hosts:
        if not host.enabled:
            continue
        snapshot = host_poller.get_snapshot(host.id)
        source = _coerce_source(snapshot.export_payload if snapshot is not None else None)
        location = source.location if source is not None else None
        if location is None or location.latitude is None or location.longitude is None:
            continue
        sites.append(
            HostSiteOut(
                id=host.id,
                # This Sentinel's own SDR Manager is "This machine" (the UI puts the
                # operator's machine name in front, `is_local`); any other host is
                # this operator's label, else the name its own operator gave it
                # (`machine_name`), else the name an older host reports for itself
                # (a Sentry Pi's own name; SDR Manager's fixed `sdr-manager` names
                # nothing), else none, and the UI falls back to its address.
                # `source` is never None here: the position came out of it.
                name=THIS_MACHINE_LABEL
                if host.is_local
                else (host.name or source.machine_name or _self_reported_name(source)),
                address=host.address,
                port=host.port,
                is_local=host.is_local,
                connect_address=this_machine_connect_address() if host.is_local else None,
                reachable=snapshot.reachable if snapshot is not None else False,
                latitude=location.latitude,
                longitude=location.longitude,
                updated_at=location.updated_at,
            )
        )
    return sites


@router.post("/certificate", response_model=CertificatePreviewOut)
async def preview_new_host_certificate(body: CertificatePreviewIn) -> CertificatePreviewOut:
    """Read the certificate authority a host presents, before adding it. Stores nothing.

    Declared before `/{host_id}` for the same reason as `/locations`.
    """
    return await _preview(body.address, body.port, pinned=None)


@router.get("/{host_id}", response_model=RemoteSdrHostOut)
async def get_host(host_id: int, db: AsyncSession = Depends(get_db)) -> RemoteSdrHostOut:
    """Return one SDR host's record."""
    host = await get_host_or_404(host_id, db)
    return host_to_out(host)


@router.put("/{host_id}", response_model=RemoteSdrHostOut)
async def update_host(host_id: int, body: RemoteSdrHostPatch, db: AsyncSession = Depends(get_db)) -> RemoteSdrHostOut:
    """Update an SDR host's connection details and/or enabled state.

    Restarts the poller (or starts/stops it as appropriate) so a changed
    address, port, token, or enabled flag takes effect immediately rather than
    waiting for the previous poller iteration to notice.
    """
    host = await get_host_or_404(host_id, db)
    if host.is_local and body.model_fields_set & _LOCAL_HOST_LINKED_FIELDS:
        # The link would undo the change within one interval, and a readdressed
        # row would point the service bearer at some other machine.
        raise _LOCAL_HOST_MANAGED
    if body.address is not None or body.port is not None:
        new_address = body.address if body.address is not None else host.address
        new_port = body.port if body.port is not None else host.port
        conflict = await db.execute(
            select(RemoteSdrHost).where(
                RemoteSdrHost.address == new_address, RemoteSdrHost.port == new_port, RemoteSdrHost.id != host_id
            )
        )
        if conflict.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "host_conflict",
                    "message": "An SDR host at this address and port is already registered.",
                },
            )
        if (new_address, new_port) != (host.address, host.port):
            if body.auth_token is None:
                # Never carry the console password over to a different machine.
                host.auth_token = ""
            # Nor the old machine's authority: the new one is trusted afresh.
            _forget_pin(host)
        host.address = new_address
        host.port = new_port
    if body.transport is not None and body.transport != host.transport:
        host.transport = body.transport
        _forget_pin(host)
    # `name` is the one field a null means something for: it is a cosmetic
    # label that falls back to the address, so an operator must be able to
    # clear it. Keyed on whether the field was sent rather than on its value,
    # which is what makes `{"name": null}` and `{"name": "  "}` clear it while
    # omitting the key entirely leaves it alone.
    if "name" in body.model_fields_set:
        host.name = body.name
    if body.auth_token is not None:
        host.auth_token = body.auth_token
    if body.enabled is not None:
        host.enabled = body.enabled
    if body.auto_add_sdrs is not None:
        host.auto_add_sdrs = body.auto_add_sdrs
    await db.commit()
    await db.refresh(host)
    if host.enabled:
        await host_poller.restart_host(host.id)
    else:
        await host_poller.stop_host(host.id)
    return host_to_out(host)


def _forget_pin(host: RemoteSdrHost) -> None:
    host.tls_certificate_authority = None
    host.tls_fingerprint = None


@router.post("/{host_id}/certificate", response_model=CertificatePreviewOut)
async def preview_host_certificate(host_id: int, db: AsyncSession = Depends(get_db)) -> CertificatePreviewOut:
    """Read the certificate authority a host presents now, and whether it is the pinned one. Stores nothing."""
    host = await get_host_or_404(host_id, db)
    if host.is_local:
        raise _LOCAL_HOST_MANAGED
    address, port, pinned = host.address, host.port, host.tls_fingerprint
    return await _preview(address, port, pinned=pinned)


@router.put("/{host_id}/certificate", response_model=RemoteSdrHostOut)
async def trust_host_certificate(
    host_id: int, body: CertificateTrustIn, db: AsyncSession = Depends(get_db)
) -> RemoteSdrHostOut:
    """Pin the host's certificate authority — the one whose fingerprint the operator compared.

    Moves a plain-HTTP host to HTTPS, trusts a host that has none pinned yet,
    or replaces a pin after the host's credentials were regenerated. The
    console password is kept: the operator has just vouched for this host.
    """
    host = await get_host_or_404(host_id, db)
    if host.is_local:
        # This machine is verified with the deployment's own authority.
        raise _LOCAL_HOST_MANAGED
    authority = await _authority_matching(host.address, host.port, body.fingerprint)
    host.transport = TRANSPORT_HTTPS
    host.tls_certificate_authority = authority.pem
    host.tls_fingerprint = authority.fingerprint
    await db.commit()
    await db.refresh(host)
    if host.enabled:
        await host_poller.restart_host(host.id)
    return host_to_out(host)


@router.delete("/{host_id}", status_code=204)
async def delete_host(host_id: int, db: AsyncSession = Depends(get_db)) -> None:
    """Forget an SDR host. Does not affect the Pi itself — only Sentinel's record of it."""
    host = await get_host_or_404(host_id, db)
    if host.is_local:
        # `sdr.radios` references the row by id; the link disables it when
        # sdr-manager-local goes away instead.
        raise _LOCAL_HOST_MANAGED
    # Stopped first, so no poll adds a radio back between the two steps below.
    await host_poller.stop_host(host_id)
    try:
        # Its radios go before the host: if core can't be reached the delete is
        # refused whole, rather than leaving radios for a host that is gone.
        removed = await forget_host_radios(db, host_id)
    except SettingsUnavailable as error:
        await host_poller.start_host(host_id)
        raise _SETTINGS_UNAVAILABLE_FOR_DELETE from error
    await db.delete(host)
    await db.commit()
    logger.info("SDR host %d deleted with its %d radio(s)", host_id, removed)
    return None


@router.post("/{host_id}/test", response_model=HealthProbeResult)
async def test_host(host_id: int, db: AsyncSession = Depends(get_db)) -> HealthProbeResult:
    """Probe `GET /api/health` on a host — always 200, the result reports reachability.

    Deliberately never raises on an unreachable host: this endpoint exists so
    an operator can check connectivity without the negative case looking like
    Sentinel's own error.
    """
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_health()
    except SdrManagerUnreachableError as exc:
        return HealthProbeResult(reachable=False, detail=str(exc))
    except SdrManagerApiError as exc:
        return HealthProbeResult(reachable=False, detail=f"{exc.code}: {exc.message}")
    return HealthProbeResult(reachable=True, detail="ok", api_version=response.api_version, health=response.data)


SDR_MANAGER_SOURCE_NAME = "sdr-manager"
"""What every SDR Manager reports as `source.name`: the kind of service, not a name for the machine."""


def _self_reported_name(source: HostSourceOut) -> str | None:
    """`source.name` when it names the machine (an older Sentry host's own name), else None."""
    return source.name if source.name and source.name != SDR_MANAGER_SOURCE_NAME else None


def _coerce_source(export_payload: dict[str, Any] | None) -> HostSourceOut | None:
    """Pull the `source` block out of a `/api/v1/sdrs` body, tolerating any shape.

    The export is a remote service's response, so nothing about it is
    guaranteed: an older host may omit `source` entirely, and a newer one may
    add keys. Anything unrecognised is dropped rather than allowed to fail the
    whole details read.
    """
    source = (export_payload or {}).get("source")
    if not isinstance(source, dict):
        return None
    raw_location = source.get("location")
    location = (
        HostLocationOut(**{key: value for key, value in raw_location.items() if key in HostLocationOut.model_fields})
        if isinstance(raw_location, dict)
        else None
    )
    return HostSourceOut(
        name=source.get("name") if isinstance(source.get("name"), str) else None,
        machine_name=published_machine_name(export_payload),
        version=source.get("version") if isinstance(source.get("version"), str) else None,
        host=source.get("host") if isinstance(source.get("host"), str) else None,
        http_port=source.get("http_port") if isinstance(source.get("http_port"), int) else None,
        location=location,
    )


@router.get("/{host_id}/info", response_model=RemoteSdrHostInfoOut)
async def get_host_info(host_id: int, db: AsyncSession = Depends(get_db)) -> RemoteSdrHostInfoOut:
    """Return every known detail of one SDR host — record, telemetry, and live self-report.

    Always 200. Reading a details view must not fail because the Pi is asleep,
    so an unreachable host answers with `reachable: false`, a human-readable
    `detail`, and null live blocks.
    """
    host = await get_host_or_404(host_id, db)
    client = client_for_host(host)
    snapshot = host_poller.get_snapshot(host.id)

    detail = "ok"
    health: dict[str, Any] | None = None
    api_version: str | None = None
    reachable = False
    try:
        health_response = await client.get_health()
    except SdrManagerUnreachableError as exc:
        detail = str(exc)
    except SdrManagerApiError as exc:
        detail = f"{exc.code}: {exc.message}"
    else:
        reachable = True
        health = health_response.data
        api_version = health_response.api_version

    export_payload: dict[str, Any] | None = None
    if reachable:
        # Only worth a second round trip once the host has answered at all —
        # and a failure here (an older host without the v1 export) leaves the
        # location blank rather than downgrading the host to unreachable.
        try:
            export_payload = (await client.get_sdr_export()).data
        except (SdrManagerUnreachableError, SdrManagerApiError):
            export_payload = None

    source = _coerce_source(export_payload)
    control_port_offset = (export_payload or {}).get("control_port_offset")

    # This request just probed the host, so its result is fresher than the
    # poller snapshot `host_to_out` overlays: the live reachability wins, and
    # so does the live API version when the probe reported one (a host that has
    # just gone down keeps the snapshot's last-known version).
    base_fields = host_to_out(host).model_dump()
    base_fields["reachable"] = reachable
    if api_version is not None:
        base_fields["api_version"] = api_version
    return RemoteSdrHostInfoOut(
        **base_fields,
        detail=detail,
        last_polled_at=snapshot.last_polled_at if snapshot is not None else None,
        last_success_at=snapshot.last_success_at if snapshot is not None else None,
        health=health,
        source=source,
        location=source.location if source is not None else None,
        control_port_offset=control_port_offset if isinstance(control_port_offset, int) else None,
    )
