"""Trust on first use for SDR hosts: fetch, fingerprint and pin each host's certificate authority.

Every Sentinel deployment has its own certificate authority (`service-credentials`),
and its sdr-manager-local serves HTTPS with a certificate that authority signed.
No public trust store knows it, so this Sentinel learns it from the host once:

1. `fetch_host_certificate_authority` reads the authority from the host's
   public `GET /api/tls/certificate-authority` over a connection that checks
   nothing yet, then proves the host holds a certificate that authority signed
   with a second, verified request. The operator compares the fingerprint it
   reports with the one the host shows (its Settings, its logs) before trusting it.
2. Once trusted, the PEM is stored on the host's row, and every request to
   that host verifies against it alone (`pinned_context`). A host presenting
   anything else is refused before the console password is sent.

The authority is pinned rather than the server certificate because the host's
certificate is reissued with a new key on every renewal or host name change,
while the authority lasts ten years: pinning the leaf would break every
Sentinel managing the host each time. Host names are not checked (the
authority is the host's own and signs only its own services, and operators
add hosts by IP address as often as by name).

Python 3.12 has no way to read the chain a server sent (`get_unverified_chain`
is 3.13), which is why the authority comes from an endpoint, not the handshake.
"""

from __future__ import annotations

import hashlib
import re
import ssl
from dataclasses import dataclass
from functools import lru_cache

import httpx

CERTIFICATE_AUTHORITY_PATH = "/api/tls/certificate-authority"
"""sdr-manager-local's public endpoint: `{"certificate_authority": "<PEM>"}`."""

MAX_CERTIFICATE_AUTHORITY_BYTES = 16 * 1024
"""Far above one PEM certificate, far below anything worth buffering from a stranger."""

_PEM_CERTIFICATE_PATTERN = re.compile(r"-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----")
_FINGERPRINT_SEPARATORS = re.compile(r"[\s:]")


class HostCertificateError(Exception):
    """The host's certificate authority could not be read or doesn't hold up. The message is operator-facing."""


class HostOffersNoTlsError(HostCertificateError):
    """The host answered, but not with TLS: it serves plain HTTP (an SDR host from before HTTPS)."""


@dataclass(frozen=True)
class HostCertificateAuthority:
    """One host's certificate authority, as read from the host and not yet trusted."""

    pem: str
    fingerprint: str
    subject: str
    not_valid_after: str


def certificate_fingerprint(pem: str) -> str:
    """SHA-256 of the certificate's DER bytes, as `AA:BB:…` (the form `openssl x509 -fingerprint` prints)."""
    digest = hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem)).hexdigest().upper()
    return ":".join(digest[index : index + 2] for index in range(0, len(digest), 2))


def normalize_fingerprint(fingerprint: str) -> str:
    """An operator's fingerprint in the canonical form: colons and spaces optional, any case.

    Raises `ValueError` unless it is exactly a SHA-256 digest.
    """
    digits = _FINGERPRINT_SEPARATORS.sub("", fingerprint).upper()
    if not re.fullmatch(r"[0-9A-F]{64}", digits):
        raise ValueError("A certificate fingerprint is 64 hexadecimal digits (SHA-256).")
    return ":".join(digits[index : index + 2] for index in range(0, len(digits), 2))


def parse_certificate_authority(pem: str) -> HostCertificateAuthority:
    """Check that `pem` is exactly one certificate authority's certificate and describe it.

    Raises `HostCertificateError` for anything else — a server certificate, a
    bundle, junk — because pinning any of those would either fail every
    connection or trust more than the one host.
    """
    certificates = _PEM_CERTIFICATE_PATTERN.findall(pem)
    if len(certificates) != 1:
        raise HostCertificateError("The SDR host sent no certificate authority, or more than one.")
    certificate = certificates[0].strip() + "\n"
    context = _context_trusting_only(certificate)
    # get_ca_certs lists only certificates whose basic constraints say CA.
    authorities = context.get_ca_certs()
    if len(authorities) != 1:
        raise HostCertificateError("The SDR host sent a certificate that is not a certificate authority.")
    details = authorities[0]
    return HostCertificateAuthority(
        pem=certificate,
        fingerprint=certificate_fingerprint(certificate),
        subject=_describe_name(details.get("subject", ())),
        not_valid_after=str(details.get("notAfter", "")),
    )


def _context_trusting_only(certificate: str) -> ssl.SSLContext:
    """A context holding just this certificate, or `HostCertificateError` when OpenSSL can't load it."""
    try:
        return ssl.create_default_context(cadata=certificate)
    except (ssl.SSLError, ValueError) as error:
        raise HostCertificateError("The SDR host sent a certificate that can't be read.") from error


def _describe_name(name: object) -> str:
    """`((('commonName', 'X'),),)` → `CN=X`, for showing the operator whose authority it is."""
    short = {"commonName": "CN", "organizationName": "O", "organizationalUnitName": "OU", "countryName": "C"}
    parts: list[str] = []
    for relative_name in name if isinstance(name, tuple) else ():
        for attribute in relative_name:
            if isinstance(attribute, tuple) and len(attribute) == 2:
                parts.append(f"{short.get(attribute[0], attribute[0])}={attribute[1]}")
    return ", ".join(parts)


@lru_cache(maxsize=64)
def pinned_context(certificate_authority_pem: str) -> ssl.SSLContext:
    """An SSL context that trusts this one authority and nothing else (no public CAs).

    Cached by PEM: a client is built per request, and loading a context each
    time would cost a parse per poll per host.
    """
    context = ssl.create_default_context(cadata=certificate_authority_pem)
    # See the module docstring: the pin, not the name, says which host this is.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_REQUIRED
    return context


def _unverified_context() -> ssl.SSLContext:
    """For the one request that reads an authority to show the operator; never for a password."""
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context


def is_tls_refusal(error: BaseException) -> bool:
    """Whether a transport error was a certificate the pin rejected (rather than no route, a timeout…)."""
    return _cause_of_type(error, ssl.SSLCertVerificationError) is not None


def _is_not_tls(error: BaseException) -> bool:
    """Whether the TLS handshake failed because the other end doesn't speak TLS at all."""
    cause = _cause_of_type(error, ssl.SSLError)
    return cause is not None and not isinstance(cause, ssl.SSLCertVerificationError)


def _cause_of_type[ErrorType: BaseException](error: BaseException, wanted: type[ErrorType]) -> ErrorType | None:
    """Walk httpx → httpcore → ssl's exception chain for the first `wanted`."""
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        if isinstance(current, wanted):
            return current
        seen.add(id(current))
        current = current.__cause__ or current.__context__
    return None


async def fetch_host_certificate_authority(
    address: str, port: int, *, timeout: httpx.Timeout
) -> HostCertificateAuthority:
    """Read a host's certificate authority and check the host really serves a certificate it signed.

    `address` and `port` must already be validated (`validate_host_address`/
    `validate_host_port`). Raises `HostOffersNoTlsError` for a host that serves
    plain HTTP, `HostCertificateError` for anything else wrong with what it
    sent, and `httpx.HTTPError` when it can't be reached at all.
    """
    base_url = f"https://{address}:{port}"
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=_unverified_context()) as client:
            async with client.stream("GET", f"{base_url}{CERTIFICATE_AUTHORITY_PATH}") as response:
                if response.status_code != 200:
                    raise HostCertificateError(
                        f"The SDR host didn't provide its certificate authority (HTTP {response.status_code})."
                    )
                body = await _read_capped(response)
    except httpx.HTTPError as error:
        if _is_not_tls(error):
            raise HostOffersNoTlsError("The SDR host doesn't offer HTTPS.") from error
        raise
    try:
        pem = httpx.Response(200, content=body).json().get("certificate_authority")
    except (ValueError, AttributeError) as error:
        raise HostCertificateError("The SDR host's certificate authority reply isn't valid.") from error
    if not isinstance(pem, str):
        raise HostCertificateError("The SDR host's certificate authority reply isn't valid.")
    authority = parse_certificate_authority(pem)

    # Anyone can send a PEM: prove the server's own certificate chains to it.
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=pinned_context(authority.pem)) as client:
            await client.get(f"{base_url}/api/health")
    except httpx.HTTPError as error:
        if is_tls_refusal(error):
            raise HostCertificateError(
                "The SDR host's certificate isn't signed by the certificate authority it sent."
            ) from error
        raise
    return authority


async def _read_capped(response: httpx.Response) -> bytes:
    """The body, refusing one larger than `MAX_CERTIFICATE_AUTHORITY_BYTES` without buffering it."""
    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > MAX_CERTIFICATE_AUTHORITY_BYTES:
            raise HostCertificateError("The SDR host's certificate authority reply is too large.")
        chunks.append(chunk)
    return b"".join(chunks)
