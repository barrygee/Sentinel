"""The outbound guard for operator-typed URLs: destination check + capped body read.

Run with:  uv run --project backend pytest tests/backend/test_platform_outbound_http.py
"""

from __future__ import annotations

import asyncio
import socket
from collections.abc import AsyncIterator

import httpx
import pytest

from backend.config import settings
from backend.platform import outbound_http
from backend.platform.outbound_http import (
    OutboundUrlRefused,
    UpstreamResponseTooLarge,
    UpstreamUnreachable,
    check_outbound_url,
    read_capped_text,
)

COMPOSE_SUBNET = "172.28.0.0/24"


@pytest.fixture(autouse=True)
def _compose_subnet_is_internal(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin the internal networks so the tests don't depend on the environment."""
    monkeypatch.setattr(settings, "guard_internal_networks", COMPOSE_SUBNET)


def _address_record(address: str) -> tuple:
    """One getaddrinfo result for `address` (IPv6 sockaddrs carry 4 fields)."""
    if ":" in address:
        return (socket.AF_INET6, socket.SOCK_STREAM, 6, "", (address, 0, 0, 0))
    return (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 0))


def _resolve_names_to(
    monkeypatch: pytest.MonkeyPatch, addresses: list[str], lookups: list[tuple]
) -> None:
    """Make the running loop's getaddrinfo answer `addresses`, recording each (host, port, type) asked."""
    loop = asyncio.get_running_loop()

    async def fake_getaddrinfo(host, port, *, type=0, **_kwargs):  # noqa: A002 — mirrors getaddrinfo's keyword
        lookups.append((host, port, type))
        return [_address_record(address) for address in addresses]

    monkeypatch.setattr(loop, "getaddrinfo", fake_getaddrinfo)


def _fail_name_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    loop = asyncio.get_running_loop()

    async def failing_getaddrinfo(*_args, **_kwargs):
        raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")

    monkeypatch.setattr(loop, "getaddrinfo", failing_getaddrinfo)


# ── check_outbound_url: URL shape ────────────────────────────────────────────


class TestUrlShape:
    @pytest.mark.parametrize(
        "url",
        [
            "ftp://celestrak.org/tle.txt",
            "file:///etc/passwd",
            "gopher://203.0.113.10/",
            "javascript:alert(1)",
            "celestrak.org/tle.txt",
            "",
        ],
    )
    async def test_refuses_schemes_other_than_http_and_https(self, url: str) -> None:
        with pytest.raises(OutboundUrlRefused, match="only http and https"):
            await check_outbound_url(url)

    async def test_refuses_a_url_without_a_host(self) -> None:
        with pytest.raises(OutboundUrlRefused, match="no host"):
            await check_outbound_url("http:///tle.txt")

    @pytest.mark.parametrize(
        "url", ["http://203.0.113.10:99999/", "http://203.0.113.10:notaport/"]
    )
    async def test_refuses_an_invalid_port(self, url: str) -> None:
        with pytest.raises(OutboundUrlRefused, match="port is not valid"):
            await check_outbound_url(url)

    async def test_scheme_is_case_insensitive(self) -> None:
        await check_outbound_url("HTTPS://203.0.113.10/tle.txt")


# ── check_outbound_url: literal addresses (no DNS) ───────────────────────────


class TestLiteralAddresses:
    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1:8000/internal/registry",
            "http://127.255.255.254/",
            "http://0.0.0.0:2019/config/",
            "http://169.254.169.254/latest/meta-data/",
            "http://224.0.0.1/",
            "http://255.255.255.255/",
            "http://[::1]/",
            "http://[::]/",
            "http://[fe80::1]/",
            "http://[ff02::1]/",
            # IPv4-mapped IPv6 reaches the IPv4 address it wraps.
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:169.254.169.254]/",
            "http://[::ffff:172.28.0.5]/",
        ],
    )
    async def test_refuses_loopback_link_local_multicast_and_unspecified(
        self, url: str
    ) -> None:
        with pytest.raises(OutboundUrlRefused, match="not allowed as a data source"):
            await check_outbound_url(url)

    async def test_refuses_the_compose_network(self) -> None:
        with pytest.raises(OutboundUrlRefused):
            await check_outbound_url("http://172.28.0.5:8000/internal/settings")

    async def test_compose_network_comes_from_the_setting(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Same address, no internal networks configured: it is just a private LAN address.
        monkeypatch.setattr(settings, "guard_internal_networks", "")
        await check_outbound_url("http://172.28.0.5:8000/")

    async def test_address_beside_the_compose_network_is_allowed(self) -> None:
        await check_outbound_url("http://172.28.1.5/tle.txt")

    @pytest.mark.parametrize(
        "url",
        [
            "http://192.168.1.50/tle/active.txt",  # an off-grid LAN mirror
            "http://10.0.0.7:8080/tle.txt",
            "https://203.0.113.10/tle.txt",
            "http://[2001:db8::10]/tle.txt",
        ],
    )
    async def test_allows_lan_and_internet_addresses(self, url: str) -> None:
        await check_outbound_url(url)

    async def test_literal_address_is_not_looked_up(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        lookups: list[tuple] = []
        _resolve_names_to(monkeypatch, ["127.0.0.1"], lookups)
        await check_outbound_url("http://192.168.1.50/")
        assert lookups == []


# ── check_outbound_url: host names ───────────────────────────────────────────


class TestHostNames:
    async def test_allows_a_name_that_resolves_to_public_addresses(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        lookups: list[tuple] = []
        _resolve_names_to(monkeypatch, ["203.0.113.10", "2001:db8::10"], lookups)
        await check_outbound_url(
            "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
        )
        assert lookups == [("celestrak.org", 443, socket.SOCK_STREAM)]

    async def test_http_name_is_looked_up_on_port_80(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        lookups: list[tuple] = []
        _resolve_names_to(monkeypatch, ["192.168.1.50"], lookups)
        await check_outbound_url("http://mirror.lan/tle.txt")
        assert lookups == [("mirror.lan", 80, socket.SOCK_STREAM)]

    async def test_explicit_port_is_used_for_the_lookup(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        lookups: list[tuple] = []
        _resolve_names_to(monkeypatch, ["192.168.1.50"], lookups)
        await check_outbound_url("http://mirror.lan:8080/tle.txt")
        assert lookups == [("mirror.lan", 8080, socket.SOCK_STREAM)]

    async def test_refuses_a_name_that_resolves_to_loopback(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _resolve_names_to(monkeypatch, ["127.0.0.1"], [])
        with pytest.raises(OutboundUrlRefused):
            await check_outbound_url("http://localhost/")

    async def test_refuses_a_compose_service_name(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _resolve_names_to(monkeypatch, ["172.28.0.3"], [])
        with pytest.raises(OutboundUrlRefused):
            await check_outbound_url(
                "http://app:8000/internal/settings/secrets/sea/aisstreamKey"
            )

    async def test_one_refused_record_refuses_the_whole_name(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # A public record must not vouch for a loopback one returned alongside it.
        _resolve_names_to(monkeypatch, ["203.0.113.10", "127.0.0.1"], [])
        with pytest.raises(OutboundUrlRefused):
            await check_outbound_url("http://rebind.example/")

    async def test_refuses_a_link_local_record_with_a_zone_id(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _resolve_names_to(monkeypatch, ["fe80::1%eth0"], [])
        with pytest.raises(OutboundUrlRefused):
            await check_outbound_url("http://printer.local/")

    async def test_unresolvable_name_is_unreachable_not_refused(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _fail_name_resolution(monkeypatch)
        with pytest.raises(
            UpstreamUnreachable, match="no-such-host.invalid does not resolve"
        ) as raised:
            await check_outbound_url("http://no-such-host.invalid/")
        assert not isinstance(raised.value, OutboundUrlRefused)


# ── read_capped_text ─────────────────────────────────────────────────────────


class _ChunkStream(httpx.AsyncByteStream):
    """A response body delivered chunk by chunk, counting how many were read."""

    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.chunks_read = 0

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self.chunks:
            self.chunks_read += 1
            yield chunk


class _UnreadableStream(httpx.AsyncByteStream):
    """A body that fails if anyone reads it."""

    async def __aiter__(self) -> AsyncIterator[bytes]:
        raise AssertionError("the body was read")
        yield b""  # pragma: no cover — makes this an async generator


def _response(
    stream: httpx.AsyncByteStream, headers: dict[str, str] | None = None
) -> httpx.Response:
    return httpx.Response(200, headers=headers or {}, stream=stream)


class TestReadCappedText:
    async def test_returns_a_body_under_the_limit(self) -> None:
        response = _response(_ChunkStream([b"ISS ", b"(ZARYA)"]))
        assert await read_capped_text(response, max_bytes=100) == "ISS (ZARYA)"

    async def test_a_body_exactly_at_the_limit_is_accepted(self) -> None:
        response = _response(_ChunkStream([b"x" * 10]), {"content-length": "10"})
        assert await read_capped_text(response, max_bytes=10) == "x" * 10

    async def test_declared_oversize_is_refused_without_reading(self) -> None:
        response = _response(_UnreadableStream(), {"content-length": "11"})
        with pytest.raises(UpstreamResponseTooLarge, match="11 bytes; the limit is 10"):
            await read_capped_text(response, max_bytes=10)

    async def test_undeclared_oversize_stops_at_the_limit(self) -> None:
        stream = _ChunkStream([b"x" * 6, b"x" * 6, b"x" * 6, b"x" * 6])
        with pytest.raises(UpstreamResponseTooLarge, match="over the 10-byte limit"):
            await read_capped_text(_response(stream), max_bytes=10)
        # Stopped on the chunk that crossed the limit, not after draining the body.
        assert stream.chunks_read == 2

    async def test_a_lying_content_length_is_still_capped(self) -> None:
        stream = _ChunkStream([b"x" * 50])
        with pytest.raises(UpstreamResponseTooLarge):
            await read_capped_text(
                _response(stream, {"content-length": "5"}), max_bytes=10
            )

    async def test_a_non_numeric_content_length_is_ignored(self) -> None:
        response = _response(_ChunkStream([b"abc"]), {"content-length": "lots"})
        assert await read_capped_text(response, max_bytes=10) == "abc"

    async def test_decodes_with_the_declared_charset(self) -> None:
        response = _response(
            _ChunkStream(["Satélite".encode("latin-1")]),
            {"content-type": "text/plain; charset=latin-1"},
        )
        assert await read_capped_text(response, max_bytes=100) == "Satélite"

    async def test_undecodable_bytes_are_replaced_not_raised(self) -> None:
        response = _response(
            _ChunkStream([b"ok\xff"]), {"content-type": "text/plain; charset=utf-8"}
        )
        assert await read_capped_text(response, max_bytes=100) == "ok�"

    async def test_falls_back_to_utf8_when_httpx_has_no_encoding(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        response = _response(_ChunkStream(["é".encode()]))
        monkeypatch.setattr(httpx.Response, "encoding", property(lambda _self: None))
        assert await read_capped_text(response, max_bytes=100) == "é"


def test_always_refused_networks_cover_ipv4_and_ipv6_loopback() -> None:
    """Guard against a refactor dropping the fixed list down to IPv4 only."""
    networks = {str(network) for network in outbound_http._ALWAYS_REFUSED_NETWORKS}
    assert {"127.0.0.0/8", "::1/128", "169.254.0.0/16", "fe80::/10"} <= networks
