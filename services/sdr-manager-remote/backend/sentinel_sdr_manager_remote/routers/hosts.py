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

  GET    /api/sdr-manager/remote/hosts/{host_id}/devices                 — cached status snapshot
  PATCH  /api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}     — proxy PATCH /api/devices/{id}
  DELETE /api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}     — proxy DELETE /api/devices/{id}
  POST   /api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}/serial — proxy the EEPROM flash

  GET    /api/sdr-manager/remote/hosts/{host_id}/wifi                    — proxy GET /api/hotspot
  PUT    /api/sdr-manager/remote/hosts/{host_id}/wifi                    — proxy PUT /api/hotspot
  DELETE /api/sdr-manager/remote/hosts/{host_id}/wifi                    — proxy DELETE /api/hotspot
  POST   /api/sdr-manager/remote/hosts/{host_id}/wifi/enable             — proxy POST /api/hotspot/enable
  POST   /api/sdr-manager/remote/hosts/{host_id}/wifi/disable            — proxy POST /api/hotspot/disable
  POST   /api/sdr-manager/remote/hosts/{host_id}/wifi/confirm            — proxy POST /api/hotspot/confirm
  GET    /api/sdr-manager/remote/hosts/{host_id}/wifi/interfaces         — proxy GET /api/hotspot/interfaces
  GET    /api/sdr-manager/remote/hosts/{host_id}/wifi/clients            — proxy GET /api/hotspot/clients

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
from typing import Any, Literal, NoReturn

import httpx
from backend.cache import now_ms
from backend.database import get_db
from backend.platform.settings_client import SettingsUnavailable
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sdr_manager_remote.config import get_settings
from sentinel_sdr_manager_remote.models import TRANSPORT_HTTP, TRANSPORT_HTTPS, RemoteSdrHost

# Imported for its side effect: registers the reservation proxy
# (sdr-manager.remote.*) on the bus at import time, so Air's ADS-B claim
# reaches it even in tests, which skip the app lifespan.
from sentinel_sdr_manager_remote.services import reservations  # noqa: F401
from sentinel_sdr_manager_remote.services.host_certificates import (
    HostCertificateAuthority,
    HostCertificateError,
    HostOffersNoTlsError,
    fetch_host_certificate_authority,
    normalize_fingerprint,
)
from sentinel_sdr_manager_remote.services.host_poller import host_poller
from sentinel_sdr_manager_remote.services.host_radios import forget_host_radios
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    SdrManagerApiError,
    SdrManagerUnreachableError,
    client_for_host,
    validate_host_address,
    validate_host_port,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sdr-manager/remote/hosts", tags=["sdr-manager-remote"])

_MAX_NAME_LEN = 120
_MAX_TOKEN_LEN = 512
_SERIAL_PATTERN = r"^[A-Za-z0-9_-]{1,32}$"

Transport = Literal["https", "http"]
TlsState = Literal["pinned", "changed", "untrusted", "insecure", "deployment"]


def _validated_fingerprint(value: str | None) -> str | None:
    """Pydantic hook: the fingerprint in canonical `AA:BB:…` form, or a 422."""
    if value is None:
        return None
    try:
        return normalize_fingerprint(value)
    except ValueError as exc:
        raise ValueError(str(exc)) from exc


# ── Pydantic schemas ──────────────────────────────────────────────────────────


class RemoteSdrHostIn(BaseModel):
    """Body for `POST /api/sdr-manager/remote/hosts` — register a new SDR host."""

    name: str | None = None
    address: str
    port: int = 8000
    auth_token: str = ""
    enabled: bool = True
    # Make every public SDR on the host a radio by itself (see the model).
    auto_add_sdrs: bool = False
    # HTTPS unless the operator chose plain HTTP for a host that doesn't offer it.
    transport: Transport = TRANSPORT_HTTPS
    # The certificate authority fingerprint the operator compared with the
    # host's (from `POST .../certificate`). Required over HTTPS.
    tls_fingerprint: str | None = None

    @field_validator("tls_fingerprint")
    @classmethod
    def _validate_fingerprint(cls, value: str | None) -> str | None:
        return _validated_fingerprint(value)

    @model_validator(mode="after")
    def _require_fingerprint_over_https(self) -> RemoteSdrHostIn:
        if self.transport == TRANSPORT_HTTPS and self.tls_fingerprint is None:
            raise ValueError("Check the host's certificate fingerprint first (tls_fingerprint is required over HTTPS).")
        return self

    @field_validator("address")
    @classmethod
    def _validate_address(cls, value: str) -> str:
        try:
            return validate_host_address(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("port")
    @classmethod
    def _validate_port(cls, value: int) -> int:
        try:
            return validate_host_port(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) > _MAX_NAME_LEN:
            raise ValueError(f"name too long (max {_MAX_NAME_LEN} characters)")
        return cleaned or None

    @field_validator("auth_token")
    @classmethod
    def _bound_token(cls, value: str) -> str:
        if len(value) > _MAX_TOKEN_LEN:
            raise ValueError(f"auth_token too long (max {_MAX_TOKEN_LEN} characters)")
        return value


class RemoteSdrHostPatch(BaseModel):
    """Body for `PUT /api/sdr-manager/remote/hosts/{host_id}` — all fields optional, at least one required.

    Mirrors the host's own hotspot-PUT convention (architecture: the host's
    `HotspotConfigRequest`): omitting `auth_token` keeps the currently stored
    token, which is what keeps the secret write-only end to end — an operator
    editing only the name or enabled flag never has to re-paste a token they
    can no longer see. Moving the host to a new address or port without a new
    token clears the stored one instead: the poller would otherwise send the
    console password to whichever machine the new address names. The pinned
    certificate authority goes the same way, and with a change of `transport`
    too: the host is then HTTPS-but-untrusted until the operator trusts it
    again (`PUT .../certificate`), and nothing is sent to it meanwhile.
    """

    name: str | None = None
    address: str | None = None
    port: int | None = None
    auth_token: str | None = None
    enabled: bool | None = None
    auto_add_sdrs: bool | None = None
    transport: Transport | None = None

    @field_validator("address")
    @classmethod
    def _validate_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            return validate_host_address(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("port")
    @classmethod
    def _validate_port(cls, value: int | None) -> int | None:
        if value is None:
            return None
        try:
            return validate_host_port(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) > _MAX_NAME_LEN:
            raise ValueError(f"name too long (max {_MAX_NAME_LEN} characters)")
        return cleaned or None

    @field_validator("auth_token")
    @classmethod
    def _bound_token(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if len(value) > _MAX_TOKEN_LEN:
            raise ValueError(f"auth_token too long (max {_MAX_TOKEN_LEN} characters)")
        return value

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> RemoteSdrHostPatch:
        """Reject a body that names no fields at all.

        Tested against `model_fields_set` — which fields the client actually
        sent — rather than the resulting values. Testing the values conflates
        "you sent nothing" with "everything you sent normalised to null", so
        clearing the host's label (`{"name": "  "}`, which strips to null) came
        back as "At least one field must be provided", an error about a
        different mistake than the one the operator made.
        """
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided.")
        return self


class RemoteSdrHostOut(BaseModel):
    """Response shape for an SDR host — never carries the auth token itself."""

    id: int
    name: str | None
    address: str
    port: int
    enabled: bool
    auth_token_set: bool
    # This machine's own sdr-manager-local, linked from core's registry: it
    # signs in with the service bearer, so `auth_token_set` stays false.
    is_local: bool
    # The host lets this Sentinel use its private SDRs.
    may_use_private: bool
    auto_add_sdrs: bool
    created_at: int
    last_seen_at: int | None
    last_error: str | None
    reachable: bool
    api_version: str | None
    transport: Transport
    # The pinned certificate authority's SHA-256, for comparing with the host's.
    tls_fingerprint: str | None
    # `pinned` verified against the pin · `changed` the last poll met a
    # certificate the pin rejects · `untrusted` HTTPS with no pin yet (nothing
    # is sent) · `insecure` plain HTTP · `deployment` this machine over HTTPS,
    # verified by this deployment's own authority.
    tls_state: TlsState


class CertificatePreviewIn(BaseModel):
    """Body for `POST /api/sdr-manager/remote/hosts/certificate` — a host not added yet."""

    address: str
    port: int = 8000

    @field_validator("address")
    @classmethod
    def _validate_address(cls, value: str) -> str:
        try:
            return validate_host_address(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("port")
    @classmethod
    def _validate_port(cls, value: int) -> int:
        try:
            return validate_host_port(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class CertificatePreviewOut(BaseModel):
    """What a host presents, for the operator to compare before trusting it. Nothing is stored.

    `tls_available: false` means the host answered without TLS (an SDR host
    from before HTTPS); the operator may then add it over plain HTTP.
    """

    tls_available: bool
    detail: str
    fingerprint: str | None = None
    subject: str | None = None
    not_valid_after: str | None = None
    # Whether this is the authority already pinned for the host (existing hosts only).
    matches_pinned: bool | None = None


class CertificateTrustIn(BaseModel):
    """Body for `PUT .../{host_id}/certificate` — the fingerprint the operator compared."""

    fingerprint: str

    @field_validator("fingerprint")
    @classmethod
    def _validate_fingerprint(cls, value: str) -> str:
        normalized = _validated_fingerprint(value)
        assert normalized is not None  # a str in, a str out
        return normalized


class HealthProbeResult(BaseModel):
    """Response for `POST /api/sdr-manager/remote/hosts/{host_id}/test`."""

    reachable: bool
    detail: str
    api_version: str | None = None
    health: dict[str, Any] | None = None


class HostLocationOut(BaseModel):
    """Where the host itself is, as it reports it in `/api/v1/sdrs`'s `source.location`.

    Every field is optional: a host that has never had its position set
    reports `location: null`, which is a normal state, not an error.
    """

    latitude: float | None = None
    longitude: float | None = None
    updated_at: int | None = None


class HostSourceOut(BaseModel):
    """The `source` block of `/api/v1/sdrs` — the host's own description of itself."""

    name: str | None = None
    version: str | None = None
    host: str | None = None
    http_port: int | None = None
    location: HostLocationOut | None = None


class RemoteSdrHostInfoOut(RemoteSdrHostOut):
    """Everything Sentinel knows about one SDR host, for the details view.

    A superset of `RemoteSdrHostOut`: the stored record, the poller's telemetry,
    and a live read of the two *unauthenticated* SDR Manager API endpoints that carry
    the rest — `GET /api/health` (version, uptime, database/hotplug health,
    device counts) and `GET /api/v1/sdrs` (the `source` block, which is the
    only place the host's latitude/longitude is published). Both are
    unauthenticated by design (the host's ADR-0010, kept by sdr-manager-local), so this still fills in
    for a host whose console password Sentinel does not hold.

    Never raises for an unreachable host — `reachable`/`detail` report that,
    and the live blocks come back null, so a Pi that is off the network renders
    as a details view with gaps rather than as an error.
    """

    detail: str
    last_polled_at: int | None = None
    last_success_at: int | None = None
    health: dict[str, Any] | None = None
    source: HostSourceOut | None = None
    location: HostLocationOut | None = None
    control_port_offset: int | None = None


class HostSiteOut(BaseModel):
    """One SDR host that has told Sentinel where it is — a point for the domain maps.

    Only hosts with a usable position appear, so every entry carries a real
    latitude/longitude rather than the nullable pair `HostLocationOut` uses:
    a map plots points, and "somewhere unknown" is not one.
    """

    id: int
    name: str | None
    address: str
    port: int
    reachable: bool
    latitude: float
    longitude: float
    # When the host says it last updated its own position (Unix ms), if it says.
    updated_at: int | None = None


class DeviceSnapshotOut(BaseModel):
    """Response for `GET /api/sdr-manager/remote/hosts/{host_id}/devices` — the cached poll snapshot."""

    reachable: bool
    last_error: str | None
    last_polled_at: int | None
    last_success_at: int | None
    api_version: str | None
    status: dict[str, Any] | None  # raw GET /api/status body: {generated_at, sdrs}


class SerialFlashIn(BaseModel):
    """Body for `POST .../devices/{device_id}/serial` — mirrors the host's own `SerialFlashRequest`.

    Validated here too (defence-in-depth, not a substitute for the host's own
    check) so an obviously malformed serial never leaves Sentinel.
    """

    serial: str
    confirm: bool

    @field_validator("serial")
    @classmethod
    def _validate_serial(cls, value: str) -> str:
        import re

        if not re.match(_SERIAL_PATTERN, value):
            raise ValueError("serial must be 1-32 characters of letters, digits, '_' or '-'.")
        return value

    @field_validator("confirm")
    @classmethod
    def _require_true(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("confirm must be true — a destructive hardware write requires explicit intent.")
        return value


class WifiConfigIn(BaseModel):
    """Body for `PUT /api/sdr-manager/remote/hosts/{host_id}/wifi` — mirrors the host's `HotspotConfigRequest`.

    `passphrase` is optional and write-only: omit it to keep the currently
    stored one (the host's own semantics), and it is never present on any
    response this router returns.
    """

    ssid: str
    passphrase: str | None = None
    security: str = "wpa2"
    hidden: bool = True
    enabled: bool = False
    interface: str | None = None
    band: str = "bg"
    channel: int = 0
    gateway_cidr: str | None = None
    confirm_uplink_loss: bool = False

    @field_validator("ssid")
    @classmethod
    def _validate_ssid(cls, value: str) -> str:
        encoded_len = len(value.encode("utf-8"))
        if not (1 <= encoded_len <= 32):
            raise ValueError("ssid must be 1-32 UTF-8 bytes.")
        return value

    @field_validator("security")
    @classmethod
    def _validate_security(cls, value: str) -> str:
        if value not in ("wpa2", "wpa3"):
            raise ValueError("security must be 'wpa2' or 'wpa3'.")
        return value

    @field_validator("band")
    @classmethod
    def _validate_band(cls, value: str) -> str:
        if value not in ("bg", "a"):
            raise ValueError("band must be 'bg' or 'a'.")
        return value

    @field_validator("channel")
    @classmethod
    def _validate_channel(cls, value: int) -> int:
        if not (0 <= value <= 196):
            raise ValueError("channel must be between 0 and 196.")
        return value

    @field_validator("interface")
    @classmethod
    def _validate_interface(cls, value: str | None) -> str | None:
        import re

        if value is not None and not re.match(r"^[A-Za-z0-9_.-]{1,15}$", value):
            raise ValueError("interface must be 1-15 characters of letters, digits, '_', '.', or '-'.")
        return value


class WifiActivationIn(BaseModel):
    """Body shared by `POST .../wifi/enable` and `.../wifi/disable`."""

    confirm_uplink_loss: bool = False


# ── Shared helpers ────────────────────────────────────────────────────────────


async def _get_host_or_404(host_id: int, db: AsyncSession) -> RemoteSdrHost:
    """Fetch a RemoteSdrHost row or raise 404 without leaking anything about its token."""
    host = await db.get(RemoteSdrHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_host", "message": "No such SDR host."})
    return host


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

# The fields the local link owns on the "This machine" row. `name` is the one
# left to the operator: a cosmetic label, nothing the link reads or writes.
_LOCAL_HOST_LINKED_FIELDS = frozenset({"address", "port", "auth_token", "enabled", "transport"})


def _host_to_out(host: RemoteSdrHost) -> RemoteSdrHostOut:
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


def _tls_state(host: RemoteSdrHost, *, certificate_rejected: bool) -> TlsState:
    """How the host's connection is secured, for the Settings host card (see `RemoteSdrHostOut`)."""
    if host.transport == TRANSPORT_HTTP:
        return "insecure"
    if host.tls_certificate_authority:
        return "changed" if certificate_rejected else "pinned"
    return "deployment" if host.is_local else "untrusted"


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


def _raise_for_host_error(exc: SdrManagerApiError) -> NoReturn:
    """Propagate the host's own status code and `{code, message, ...context}` envelope verbatim."""
    raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message, **exc.context})


def _raise_for_unreachable(exc: SdrManagerUnreachableError) -> NoReturn:
    """502: Sentinel never got a response to interpret, so there is no host code to surface.

    The code still says why: `host_unreachable`, or `certificate_rejected` /
    `certificate_untrusted` when the request was refused before it was sent.
    """
    raise HTTPException(status_code=502, detail={"code": exc.code, "message": str(exc)})


# ── Host CRUD ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[RemoteSdrHostOut])
async def list_hosts(db: AsyncSession = Depends(get_db)) -> list[RemoteSdrHostOut]:
    """List every SDR host Sentinel knows about."""
    hosts = (await db.execute(select(RemoteSdrHost).order_by(RemoteSdrHost.id))).scalars().all()
    return [_host_to_out(host) for host in hosts]


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
    return _host_to_out(host)


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
                # the host's own name for itself is the better label when Sentinel
                # has not been given one — it is what the operator set on the Pi.
                # `source` is never None here: the position came out of it.
                name=host.name or source.name,
                address=host.address,
                port=host.port,
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
    host = await _get_host_or_404(host_id, db)
    return _host_to_out(host)


@router.put("/{host_id}", response_model=RemoteSdrHostOut)
async def update_host(host_id: int, body: RemoteSdrHostPatch, db: AsyncSession = Depends(get_db)) -> RemoteSdrHostOut:
    """Update an SDR host's connection details and/or enabled state.

    Restarts the poller (or starts/stops it as appropriate) so a changed
    address, port, token, or enabled flag takes effect immediately rather than
    waiting for the previous poller iteration to notice.
    """
    host = await _get_host_or_404(host_id, db)
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
    return _host_to_out(host)


def _forget_pin(host: RemoteSdrHost) -> None:
    host.tls_certificate_authority = None
    host.tls_fingerprint = None


@router.post("/{host_id}/certificate", response_model=CertificatePreviewOut)
async def preview_host_certificate(host_id: int, db: AsyncSession = Depends(get_db)) -> CertificatePreviewOut:
    """Read the certificate authority a host presents now, and whether it is the pinned one. Stores nothing."""
    host = await _get_host_or_404(host_id, db)
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
    host = await _get_host_or_404(host_id, db)
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
    return _host_to_out(host)


@router.delete("/{host_id}", status_code=204)
async def delete_host(host_id: int, db: AsyncSession = Depends(get_db)) -> None:
    """Forget an SDR host. Does not affect the Pi itself — only Sentinel's record of it."""
    host = await _get_host_or_404(host_id, db)
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
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_health()
    except SdrManagerUnreachableError as exc:
        return HealthProbeResult(reachable=False, detail=str(exc))
    except SdrManagerApiError as exc:
        return HealthProbeResult(reachable=False, detail=f"{exc.code}: {exc.message}")
    return HealthProbeResult(reachable=True, detail="ok", api_version=response.api_version, health=response.data)


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
    host = await _get_host_or_404(host_id, db)
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
    # poller snapshot `_host_to_out` overlays: the live reachability wins, and
    # so does the live API version when the probe reported one (a host that has
    # just gone down keeps the snapshot's last-known version).
    base_fields = _host_to_out(host).model_dump()
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


# ── Cached device snapshot ──────────────────────────────────────────────────────


@router.get("/{host_id}/devices", response_model=DeviceSnapshotOut)
async def get_host_devices(host_id: int, db: AsyncSession = Depends(get_db)) -> DeviceSnapshotOut:
    """Return the fleet poller's cached `GET /api/status` snapshot for one host.

    Served from memory, never a live round-trip, by design: Sentinel's
    device list is a cache refreshed on a 2s poll, and this route surfaces
    exactly that cache plus its own reachability so a dead host still renders
    something instead of blocking the request.
    """
    await _get_host_or_404(host_id, db)
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
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_devices()
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
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
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.patch_device(device_id, patch)
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    await host_poller.refresh_now(host_id)
    return JSONResponse(response.data)


@router.delete("/{host_id}/devices/{device_id}", status_code=204)
async def delete_host_device(host_id: int, device_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    """Proxy `DELETE /api/devices/{device_id}` — removes the host's persisted config for that device."""
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        await client.delete_device(device_id)
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    await host_poller.refresh_now(host_id)
    return Response(status_code=204)


@router.post("/{host_id}/devices/{device_id}/serial", status_code=202)
async def flash_host_device_serial(
    host_id: int, device_id: str, body: SerialFlashIn, db: AsyncSession = Depends(get_db)
) -> JSONResponse:
    """Proxy `POST /api/devices/{device_id}/serial` — begins the host's guarded EEPROM flash."""
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.flash_serial(device_id, body.serial)
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    await host_poller.refresh_now(host_id)
    return JSONResponse(response.data, status_code=202)


# ── WiFi/hotspot proxy ───────────────────────────────────────────────────────────


@router.get("/{host_id}/wifi")
async def get_host_wifi(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `GET /api/hotspot` — the host's response never includes the passphrase."""
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_hotspot()
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.put("/{host_id}/wifi")
async def put_host_wifi(host_id: int, body: WifiConfigIn, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `PUT /api/hotspot` — a full replace, matching the host's own semantics."""
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.put_hotspot(body.model_dump())
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.delete("/{host_id}/wifi", status_code=204)
async def delete_host_wifi(host_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    """Proxy `DELETE /api/hotspot` — forgets the hotspot configuration, including its password."""
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        await client.delete_hotspot()
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    return Response(status_code=204)


@router.post("/{host_id}/wifi/enable")
async def enable_host_wifi(host_id: int, body: WifiActivationIn, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `POST /api/hotspot/enable` — brings the hotspot up provisionally.

    The host rolls this back unless `POST .../wifi/confirm` arrives within its
    own timeout; Sentinel never calls confirm automatically (see that route).
    """
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.enable_hotspot(body.confirm_uplink_loss)
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.post("/{host_id}/wifi/disable")
async def disable_host_wifi(host_id: int, body: WifiActivationIn, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `POST /api/hotspot/disable`."""
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.disable_hotspot(body.confirm_uplink_loss)
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.post("/{host_id}/wifi/confirm")
async def confirm_host_wifi(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `POST /api/hotspot/confirm`.

    Safety-critical (Sentry ADR-0007, carried into sdr-manager-local): this route must only ever be
    reached by an explicit operator action in the UI — never invoked
    automatically after `enable`, and never called speculatively by this
    backend on the operator's behalf.
    """
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.confirm_hotspot()
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.get("/{host_id}/wifi/interfaces")
async def list_host_wifi_interfaces(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `GET /api/hotspot/interfaces`."""
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_hotspot_interfaces()
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    return JSONResponse(response.data)


@router.get("/{host_id}/wifi/clients")
async def list_host_wifi_clients(host_id: int, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Proxy `GET /api/hotspot/clients`."""
    host = await _get_host_or_404(host_id, db)
    client = client_for_host(host)
    try:
        response = await client.get_hotspot_clients()
    except SdrManagerApiError as exc:
        _raise_for_host_error(exc)
    except SdrManagerUnreachableError as exc:
        _raise_for_unreachable(exc)
    return JSONResponse(response.data)
