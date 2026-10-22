"""Typed async HTTP client for one SDR host's SDR Manager API (ADR 0007).

sdr-manager-local stays the source of truth for SDR device configuration; this
Sentinel is a full remote client of its `/api` surface. This module is that
client — one instance per host, built from a `RemoteSdrHost` row. It does not
reimplement any of the host's validation (port allocation, name uniqueness,
device state) — it only shapes the HTTP call and translates the response into
either a value or one of two typed errors, so a caller can always tell "the
host was unreachable" apart from "the host rejected the request".

Security notes:
- `address` is operator input used to build a URL, so it is validated against
  a strict hostname/IPv4 allow-list before ever reaching httpx — no scheme, no
  embedded credentials, no path, no port suffix (the port is a separate,
  independently-bounded field).
- The console password is never logged, never included in an exception
  message, and never echoed back by any caller of this module. Nor is the
  service bearer (this machine's own sdr-manager-local only), which is this
  process's own HTTP credential, read fresh per client and never stored.
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx
from backend.platform.service_credentials import own_token

from sentinel_sdr_manager_remote.config import get_settings
from sentinel_sdr_manager_remote.models import AUTH_MODE_SERVICE, RemoteSdrHost

# The SDR Manager API's wire contract (sdr-manager-local). Duplicated here
# rather than imported: the host is usually another machine, and the two
# packages may not import each other; the contract suite pins both ends.
RESERVATION_HOLDER_HEADER = "X-Sdr-Manager-Reservation-Holder"
"""Proves to the host which reservation holder is making a request (its `routers/devices.py`)."""

SESSION_COOKIE_NAME = "sdr_manager_session"
"""The host's session cookie (its `services/console_auth.py`)."""

API_VERSION_HEADER = "X-Sdr-Manager-Api-Version"
"""Stamped on every `/api` response, errors included (its `api_version.py`)."""

# Session cookies outlive the clients that obtained them. A client is built per
# call (see `SdrManagerClient`), so a cookie held only on the instance was thrown
# away after every poll: each one went 401 → sign in → retry, a login against
# the host every few seconds for as long as the poller ran. Keyed by a digest of
# the password as well as the address, so a host edited to a new password never
# presents the session its old one earned.
_session_cookies: dict[tuple[str, int, str], str] = {}


def forget_sdr_manager_sessions() -> None:
    """Drop every remembered SDR Manager session cookie (tests, and nothing else needs it)."""
    _session_cookies.clear()


# RFC-1123-ish hostname: labels of 1-63 alphanumerics/hyphens/underscores (no
# leading/trailing hyphen), dot-separated, 253 characters overall. Deliberately
# does not accept a trailing dot or wildcards — this is a concrete host to
# connect to, not a DNS pattern.
#
# Underscores are allowed despite RFC 1123 forbidding them, matching the same
# decision in sdr-manager-local's `routers/host_resolution.py`. They turn up often enough
# in real LAN names (Windows and mDNS both emit them) that rejecting one would
# leave an operator unable to add their Pi by the only name they have for it,
# with nothing but a validation error to explain why.
_HOSTNAME_RE = re.compile(r"^(?!-)[A-Za-z0-9_-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9_-]{1,63}(?<!-))*$")

# Substrings that mean the operator pasted a URL, a credential, or a path
# rather than a bare host — reject outright rather than trying to parse them.
_FORBIDDEN_ADDRESS_SUBSTRINGS = ("://", "@", "/", " ", "\t", "\n")


def validate_host_address(address: str) -> str:
    """Validate an operator-supplied SDR host address.

    Accepts a bare IPv4 literal or an RFC-1123-style hostname only. Rejects
    anything that looks like a URL, embedded credentials, a path, or an IPv6
    literal/port suffix (the port is configured separately and independently
    bounded). Raises ``ValueError`` with an operator-facing message on
    rejection; callers surface that message directly to the client as a 422.
    """
    candidate = address.strip()
    if not candidate:
        raise ValueError("Host address must not be empty.")
    if len(candidate) > 253:
        raise ValueError("Host address is too long.")
    for forbidden in _FORBIDDEN_ADDRESS_SUBSTRINGS:
        if forbidden in candidate:
            raise ValueError(
                "Host address must be a bare hostname or IPv4 address — no scheme, credentials, path, or whitespace."
            )
    if ":" in candidate:
        raise ValueError("Host address must not include a port and may not be an IPv6 literal — use the port field.")
    try:
        ipaddress.IPv4Address(candidate)
        return candidate
    except ValueError:
        pass
    if not _HOSTNAME_RE.match(candidate):
        raise ValueError("Host address must be a valid hostname or IPv4 address.")
    return candidate


def validate_host_port(port: int) -> int:
    """Constrain a SDR host port to the valid TCP port range."""
    if not (1 <= port <= 65535):
        raise ValueError("Port must be between 1 and 65535.")
    return port


class SdrManagerUnreachableError(Exception):
    """Raised when a SDR host could not be reached at all (DNS/connect/timeout).

    Distinct from `SdrManagerApiError`: this means Sentinel never got an HTTP
    response to interpret, so there is no host-authored `{code, message}` to
    surface — only Sentinel's own description of the network failure.
    """


class SdrManagerApiError(Exception):
    """Raised when the host answered with a non-2xx status.

    Carries the host's own error envelope (`code`, `message`, and any extra
    context keys) verbatim, so a caller surfaces the host's rejection rather than inventing its own.
    """

    def __init__(self, status_code: int, code: str, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(f"SDR Manager API error {status_code} {code}: {message}")
        self.status_code = status_code
        self.code = code
        self.message = message
        self.context = context or {}


@dataclass
class SdrManagerResponse:
    """A successful SDR Manager API response — the decoded JSON body plus the observed API version."""

    data: Any
    api_version: str | None


class SdrManagerClient:
    """Async client for one SDR host's `/api` surface.

    Construct one per call (or short-lived per poll) from a `RemoteSdrHost` row;
    it is cheap — the underlying `httpx.AsyncClient` is opened and closed per
    request rather than held open, since SDR hosts are polled at a low,
    known rate and this avoids managing a long-lived connection pool per host
    across process restarts/config edits.
    """

    def __init__(
        self,
        address: str,
        port: int,
        console_password: str,
        *,
        connect_timeout_s: float | None = None,
        read_timeout_s: float | None = None,
        service_token: str | None = None,
    ) -> None:
        """`console_password` is the host's console password, not a bearer token.

        Another machine's SDR Manager API has no token auth: one console
        password, proved by a signed session cookie, is all it accepts — an
        `Authorization: Bearer` header would be ignored, leaving every
        management call 401 against a protected host.

        `service_token` is the exception: this machine's own sdr-manager-local
        accepts sdr-manager-remote's HTTP credential as a bearer (ADR 0007), so
        a client given one presents it on every request and never signs in.
        Use `client_for_host`, which decides that from the host's row.
        """
        self._address = validate_host_address(address)
        self._port = validate_host_port(port)
        self._console_password = console_password
        self._service_token = service_token
        self._session_key = (
            self._address,
            self._port,
            hashlib.sha256(console_password.encode()).hexdigest(),
        )
        connect = connect_timeout_s if connect_timeout_s is not None else get_settings().connect_timeout_s
        read = read_timeout_s if read_timeout_s is not None else get_settings().read_timeout_s
        self._timeout = httpx.Timeout(connect=connect, read=read, write=read, pool=read)

    @property
    def base_url(self) -> str:
        """The validated `http://host:port` this client talks to."""
        return f"http://{self._address}:{self._port}"

    def _headers(self) -> dict[str, str]:
        """Request headers, carrying the session cookie once one has been obtained.

        The cookie is set by hand rather than by an `httpx` cookie jar: a client
        is constructed per request here (see the class docstring), so a jar would
        be discarded before it could ever be reused. It comes from the
        process-wide `_session_cookies` for the same reason.
        """
        headers = {"Accept": "application/json"}
        if self._service_token is not None:
            # Bearer mode carries no session: an empty token (no credential
            # file) sends nothing, and a protected host then answers 401.
            if self._service_token:
                headers["Authorization"] = f"Bearer {self._service_token}"
            return headers
        session_cookie = _session_cookies.get(self._session_key)
        if session_cookie:
            headers["Cookie"] = f"{SESSION_COOKIE_NAME}={session_cookie}"
        return headers

    async def _sign_in(self) -> bool:
        """Exchange the console password for a session cookie. False if it cannot.

        Silent about *why* it failed, deliberately: the host answers every auth
        failure identically on purpose, so there is nothing here to distinguish
        a wrong password from a password that was since changed.
        """
        # Whatever happens next, the remembered session was just refused.
        _session_cookies.pop(self._session_key, None)
        if not self._console_password:
            return False
        url = f"{self.base_url}/api/auth/login"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(url, json={"password": self._console_password})
        except httpx.HTTPError:
            return False
        if response.status_code >= 400:
            return False
        cookie = response.cookies.get(SESSION_COOKIE_NAME)
        if not cookie:
            return False
        _session_cookies[self._session_key] = cookie
        return True

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        holder: str | None = None,
    ) -> SdrManagerResponse:
        """Perform one request, translating transport/HTTP failures into the typed errors above.

        Signs in and retries **once** on a 401. A session outlives many requests
        but not for ever — it lapses, and it is invalidated outright whenever the
        operator changes the host's password — so the first call after that would
        otherwise fail for a reason the caller can do nothing about. Retried once
        only: a second 401 means the password is wrong, and looping on it would
        turn a typo into a login flood. Never in bearer mode: there is no
        password to sign in with, and a refused bearer is not going to change.
        """
        response = await self._send(method, path, json_body=json_body, holder=holder)
        if response.status_code == 401 and self._service_token is None and await self._sign_in():
            response = await self._send(method, path, json_body=json_body, holder=holder)

        api_version = response.headers.get(API_VERSION_HEADER)
        if response.status_code >= 400:
            code, message, context = _parse_error_envelope(response)
            raise SdrManagerApiError(response.status_code, code, message, context)
        if response.status_code == 204 or not response.content:
            return SdrManagerResponse(data=None, api_version=api_version)
        try:
            payload = response.json()
        except ValueError as exc:
            raise SdrManagerApiError(
                response.status_code, "invalid_response", "The SDR host returned a non-JSON response."
            ) from exc
        return SdrManagerResponse(data=payload, api_version=api_version)

    async def _send(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        holder: str | None = None,
    ) -> httpx.Response:
        """One HTTP round trip, with transport failures raised as `SdrManagerUnreachableError`."""
        url = f"{self.base_url}{path}"
        headers = self._headers()
        if holder:
            headers[RESERVATION_HOLDER_HEADER] = holder
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                return await client.request(method, url, headers=headers, json=json_body)
        except httpx.TimeoutException as exc:
            raise SdrManagerUnreachableError(f"Timed out reaching SDR host {self._address}:{self._port}.") from exc
        except httpx.HTTPError as exc:
            raise SdrManagerUnreachableError(f"Could not reach SDR host {self._address}:{self._port}.") from exc

    # ── health / status ──────────────────────────────────────────────────────
    async def get_health(self) -> SdrManagerResponse:
        """`GET /api/health` — unauthenticated liveness probe."""
        return await self._request("GET", "/api/health")

    async def get_status(self) -> SdrManagerResponse:
        """`GET /api/status` — the live per-device snapshot the fleet poller caches."""
        return await self._request("GET", "/api/status")

    # ── devices ──────────────────────────────────────────────────────────────
    async def get_sdr_export(self) -> SdrManagerResponse:
        """`GET /api/v1/sdrs` — the versioned, unauthenticated export of public devices.

        Unauthenticated by design (Sentry's ADR-0010, kept by sdr-manager-local), so this is the one
        device view that still works against a host whose password Sentinel
        does not hold — which is why the decoder's config lookup uses it rather
        than `/api/devices`.
        """
        return await self._request("GET", "/api/v1/sdrs")

    async def get_devices(self) -> SdrManagerResponse:
        """`GET /api/devices` — configured + detected devices, port suggestion, constraints."""
        return await self._request("GET", "/api/devices")

    async def patch_device(
        self, device_id: str, patch: dict[str, Any], *, holder: str | None = None
    ) -> SdrManagerResponse:
        """`PATCH /api/devices/{device_id}` — partial update; the host validates and may reject.

        `holder` proves we are the device's current reservation holder. The host
        refuses tuning changes to a claimed device from anyone else, so a caller
        that holds a lease must present it or be refused by its own lock.
        """
        return await self._request(
            "PATCH",
            f"/api/devices/{_encode_path_segment(device_id)}",
            json_body=patch,
            holder=holder,
        )

    async def acquire_reservation(
        self,
        device_id: str,
        *,
        holder: str,
        label: str,
        ttl_seconds: int,
        force: bool = False,
    ) -> SdrManagerResponse:
        """`POST /api/devices/{id}/reservation` — claim the device, or renew our claim.

        Acquire and renew are one call on the host's side, so a renewal that
        arrives after the lease lapsed simply becomes a fresh claim rather than
        an error this caller would have to distinguish and retry.
        """
        return await self._request(
            "POST",
            f"/api/devices/{_encode_path_segment(device_id)}/reservation",
            json_body={
                "holder": holder,
                "label": label,
                "ttl_seconds": ttl_seconds,
                "force": force,
            },
        )

    async def release_reservation(self, device_id: str, *, holder: str) -> SdrManagerResponse:
        """`DELETE /api/devices/{id}/reservation` — give the device back.

        Best effort by nature: the lease expires on its own, so a release that
        never lands costs a couple of minutes of a device nobody is using, not a
        device locked for ever.
        """
        return await self._request(
            "DELETE",
            f"/api/devices/{_encode_path_segment(device_id)}/reservation",
            holder=holder,
        )

    async def delete_device(self, device_id: str) -> SdrManagerResponse:
        """`DELETE /api/devices/{device_id}` — remove a persisted (not-present) device's config."""
        return await self._request("DELETE", f"/api/devices/{_encode_path_segment(device_id)}")

    async def flash_serial(self, device_id: str, serial: str) -> SdrManagerResponse:
        """`POST /api/devices/{device_id}/serial` — begin an EEPROM serial flash. Always confirmed."""
        return await self._request(
            "POST",
            f"/api/devices/{_encode_path_segment(device_id)}/serial",
            json_body={"serial": serial, "confirm": True},
        )

    # ── hotspot ──────────────────────────────────────────────────────────────
    async def get_hotspot(self) -> SdrManagerResponse:
        """`GET /api/hotspot` — current hotspot configuration and state."""
        return await self._request("GET", "/api/hotspot")

    async def get_hotspot_interfaces(self) -> SdrManagerResponse:
        """`GET /api/hotspot/interfaces` — candidate wireless interfaces."""
        return await self._request("GET", "/api/hotspot/interfaces")

    async def get_hotspot_clients(self) -> SdrManagerResponse:
        """`GET /api/hotspot/clients` — DHCP leases the hotspot has issued."""
        return await self._request("GET", "/api/hotspot/clients")

    async def put_hotspot(self, body: dict[str, Any]) -> SdrManagerResponse:
        """`PUT /api/hotspot` — full-replace the hotspot configuration."""
        return await self._request("PUT", "/api/hotspot", json_body=body)

    async def enable_hotspot(self, confirm_uplink_loss: bool = False) -> SdrManagerResponse:
        """`POST /api/hotspot/enable` — bring the hotspot up provisionally (rolls back unless confirmed)."""
        return await self._request(
            "POST", "/api/hotspot/enable", json_body={"confirm_uplink_loss": confirm_uplink_loss}
        )

    async def disable_hotspot(self, confirm_uplink_loss: bool = False) -> SdrManagerResponse:
        """`POST /api/hotspot/disable` — stop the hotspot and clear its autoconnect flag."""
        return await self._request(
            "POST", "/api/hotspot/disable", json_body={"confirm_uplink_loss": confirm_uplink_loss}
        )

    async def confirm_hotspot(self) -> SdrManagerResponse:
        """`POST /api/hotspot/confirm` — cancel the pending rollback of a just-enabled hotspot.

        Safety-critical (Sentry ADR-0007, carried into sdr-manager-local): must only be invoked when
        the operator explicitly confirms, never automatically after `enable`.
        """
        return await self._request("POST", "/api/hotspot/confirm")

    async def delete_hotspot(self) -> SdrManagerResponse:
        """`DELETE /api/hotspot` — forget the hotspot configuration entirely, including its password."""
        return await self._request("DELETE", "/api/hotspot")


def client_for_host(host: RemoteSdrHost) -> SdrManagerClient:
    """The client for one host's row: its console password, or for this machine the service bearer.

    Copies what it needs from the row, so the client outlives the session the
    row was loaded in.
    """
    if host.auth_mode == AUTH_MODE_SERVICE:
        return SdrManagerClient(host.address, host.port, "", service_token=own_token())
    return SdrManagerClient(host.address, host.port, host.auth_token)


def _encode_path_segment(value: str) -> str:
    """Percent-encode one path segment (device ids contain ':' and '.', e.g. "usb:1-1.4.2")."""
    return quote(value, safe="")


def _parse_error_envelope(response: httpx.Response) -> tuple[str, str, dict[str, Any]]:
    """Extract `(code, message, context)` from the host's `{"detail": {"code", "message", ...}}` envelope.

    Falls back to a generic `upstream_error` when the body doesn't match the
    expected shape (e.g. a proxy/500 page instead of the host itself), so a
    malformed upstream response never raises an unhandled exception here.

    Three shapes arrive in practice:
    - `{"detail": {"code": ..., "message": ...}}` — the host's own envelope, the
      one that carries a code worth branching on.
    - `{"detail": [ {loc, msg}, ... ]}` — FastAPI's *Pydantic* 422, raised
      before the request ever reaches the host's own validation. There is no
      host-authored code here, but the field-level messages are the most
      useful thing an operator can be shown, so they are flattened into the
      message rather than discarded behind a bare "HTTP 422".
    - `{"detail": "some string"}` — a plain `HTTPException(detail=str)`.
    """
    generic_message = f"The SDR host returned HTTP {response.status_code}."
    try:
        body = response.json()
    except ValueError:
        return "upstream_error", generic_message, {}

    detail = body.get("detail") if isinstance(body, dict) else None

    if isinstance(detail, dict):
        code = str(detail.get("code", "upstream_error"))
        message = str(detail.get("message", generic_message))
        context = {key: value for key, value in detail.items() if key not in ("code", "message")}
        return code, message, context

    if isinstance(detail, list):
        return "validation_error", _describe_validation_errors(detail, generic_message), {"errors": detail}

    if isinstance(detail, str):
        return "upstream_error", detail, {}

    return "upstream_error", generic_message, {}


def _describe_validation_errors(errors: list[Any], fallback: str) -> str:
    """Render FastAPI's list-shaped 422 body as one operator-readable sentence.

    `loc` is a path like `["body", "output_port"]`; the leading `"body"`/`"query"`
    segment names the part of the request rather than the field, so it is dropped
    to leave the field name the operator actually recognises.
    """
    described: list[str] = []
    for entry in errors:
        if not isinstance(entry, dict):
            continue
        message = str(entry.get("msg", "")).strip()
        if not message:
            continue
        location = [str(part) for part in entry.get("loc", []) if str(part) not in ("body", "query", "path")]
        described.append(f"{'.'.join(location)}: {message}" if location else message)
    return "; ".join(described) if described else fallback
