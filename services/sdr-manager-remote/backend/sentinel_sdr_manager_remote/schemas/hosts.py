"""Request and response models for `/api/sdr-manager/remote/hosts` and its device and Wi-Fi routes."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, field_validator, model_validator

from sentinel_sdr_manager_remote.models import TRANSPORT_HTTPS
from sentinel_sdr_manager_remote.services.host_certificates import (
    normalize_fingerprint,
)
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    validate_host_address,
    validate_host_port,
)

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
    # What the host's own operator named it (`source.machine_name` of its
    # export), from the poller's last snapshot; null when it gives none. Shown
    # when this Sentinel's operator hasn't labelled the host (`name`).
    machine_name: str | None = None
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
    # The operator's name for that machine, if its SDR Manager publishes one.
    machine_name: str | None = None
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
    # This Sentinel's own SDR Manager: its position is this machine's, so the UI
    # names it as this machine and merges it with this machine's own entry.
    is_local: bool = False
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
