"""Guards for HTTP fetches whose URL an operator typed (a TLE feed, a mirror).

Sentinel fetches some data from URLs set in Settings, and Settings is writable
by any browser on the LAN. Without a check, such a URL is a way to make a
service container send requests on the caller's behalf (server-side request
forgery): to the compose network (core's `/internal/*`, redis, NATS, the
gateway), to its own loopback, or to a cloud metadata address. This module
refuses those destinations while leaving LAN and internet hosts usable, since
an off-grid mirror on the LAN is a normal source.

It also caps how much of a response is read, so a URL that streams forever, or
answers with gigabytes, can't exhaust a service's memory.

Known limit: the address is checked by resolving the host name before the
request, and httpx resolves it again to connect. A DNS server that answers
differently the second time could still slip past. Callers are LAN browsers
only (the request guard), which is what keeps that residual risk acceptable.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

import httpx
from backend.config import settings
from backend.platform.security.networks import split_setting

ALLOWED_SCHEMES = frozenset({"http", "https"})

# Never a legitimate place for a typed URL to point, whatever the deployment.
_ALWAYS_REFUSED_NETWORKS = tuple(
    ipaddress.ip_network(network)
    for network in (
        "0.0.0.0/8",  # "this host" — connects to the container itself on Linux
        "127.0.0.0/8",  # loopback: the container's own services
        "169.254.0.0/16",  # link-local, incl. cloud metadata (169.254.169.254)
        "224.0.0.0/4",  # multicast
        "255.255.255.255/32",  # broadcast
        "::/128",  # unspecified
        "::1/128",  # loopback
        "fe80::/10",  # link-local
        "ff00::/8",  # multicast
    )
)


class OutboundUrlRefused(ValueError):
    """The URL isn't usable as an upstream: bad scheme, no host, or a refused address."""


class UpstreamUnreachable(Exception):
    """The upstream's host name doesn't resolve."""


class UpstreamResponseTooLarge(Exception):
    """The upstream answered with more bytes than the caller allows."""


def _refused_networks() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    # The compose network is read at call time so tests and `.env` changes apply.
    internal_networks = [
        ipaddress.ip_network(network, strict=False) for network in split_setting(settings.guard_internal_networks)
    ]
    return [*_ALWAYS_REFUSED_NETWORKS, *internal_networks]


def _is_refused_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # `::ffff:127.0.0.1` reaches loopback just like `127.0.0.1`, so judge the IPv4 inside.
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return any(address.version == network.version and address in network for network in _refused_networks())


async def _resolve_addresses(host: str, port: int) -> set[str]:
    loop = asyncio.get_running_loop()
    try:
        address_records = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise UpstreamUnreachable(f"{host} does not resolve") from error
    # Each record is (family, type, proto, canonname, sockaddr); sockaddr[0] is the address.
    return {str(record[4][0]) for record in address_records}


async def check_outbound_url(url: str) -> None:
    """Refuse `url` unless it is http(s) and every address its host resolves to is allowed.

    Raises:
        OutboundUrlRefused: wrong scheme, no host, or a loopback / link-local /
            multicast / compose-network destination.
        UpstreamUnreachable: the host name doesn't resolve.
    """
    parts = urlsplit(url)
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise OutboundUrlRefused("only http and https URLs can be used")
    host = parts.hostname
    if not host:
        raise OutboundUrlRefused("the URL has no host")
    try:
        port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    except ValueError as error:  # a port outside 0–65535 or not a number
        raise OutboundUrlRefused("the URL's port is not valid") from error

    # A literal address needs no lookup; a name is judged by everything it resolves to,
    # so one allowed record can't vouch for a refused one.
    try:
        candidate_addresses = {str(ipaddress.ip_address(host))}
    except ValueError:
        candidate_addresses = await _resolve_addresses(host, port)

    for candidate in candidate_addresses:
        # Strip an IPv6 zone id (`fe80::1%eth0`) before parsing.
        if _is_refused_address(ipaddress.ip_address(candidate.split("%", 1)[0])):
            raise OutboundUrlRefused("that address is not allowed as a data source")


async def read_capped_text(response: httpx.Response, max_bytes: int) -> str:
    """Read a streamed response's body as text, refusing more than `max_bytes`.

    Checks the declared Content-Length first (no download at all for an honest
    oversize answer), then counts while reading, because the header can be
    absent or wrong.

    Raises:
        UpstreamResponseTooLarge: the body is, or claims to be, over `max_bytes`.
    """
    declared_length = response.headers.get("content-length", "")
    if declared_length.isdigit() and int(declared_length) > max_bytes:
        raise UpstreamResponseTooLarge(f"response is {declared_length} bytes; the limit is {max_bytes}")

    body = bytearray()
    async for chunk in response.aiter_bytes():
        body.extend(chunk)
        if len(body) > max_bytes:
            raise UpstreamResponseTooLarge(f"response is over the {max_bytes}-byte limit")
    return body.decode(response.encoding or "utf-8", errors="replace")
