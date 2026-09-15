"""Tests for the `snapshot` provider adapter — the SSRF boundary for Land
live feeds, since its target host is entirely user-supplied.

`_assert_public_host` is exercised directly against every address class it
claims to refuse (private, loopback, link-local, reserved, IPv6 equivalents,
and an unresolvable host), each via a monkeypatched `socket.getaddrinfo` so no
real DNS lookup happens. The adapter's `fetch`/`image`/`probe` are then
exercised through `httpx.MockTransport` to prove the guard is actually wired
into the request path, not just present as a standalone function.
"""

from __future__ import annotations

import socket

import httpx
import pytest

from backend.services.land_feeds.adapters.snapshot import (
    SnapshotAdapter,
    SsrfBlockedHost,
    _assert_public_host,
)
from backend.services.land_feeds.base import FeedOffline, FeedUpstreamError
from backend.services.land_feeds.schema import FeedConfig

# Captured once, before any test monkeypatches `httpx.AsyncClient` — every
# `_patch_client` helper below must build on the *real* class, not whatever
# the previous test left `httpx.AsyncClient` pointing at.
_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _sockaddr_for(address: str) -> tuple:
    """A getaddrinfo-shaped sockaddr tuple for an IPv4 or IPv6 literal."""
    return (address, 0) if ":" not in address else (address, 0, 0, 0)


def _fake_getaddrinfo(address: str):
    def _impl(hostname, *_args, **_kwargs):
        family = socket.AF_INET6 if ":" in address else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 6, "", _sockaddr_for(address))]

    return _impl


def _snapshot_config(**overrides) -> FeedConfig:
    base = {
        "id": "roadside-cam",
        "name": "Roadside Cam",
        "category": "webcams",
        "provider": "snapshot",
        "url": "https://cam.example.org/still.jpg",
        "enabled": True,
        "refreshSeconds": 60,
        "location": {"latitude": 51.5, "longitude": -0.1},
        "auth": {"type": "none"},
    }
    base.update(overrides)
    return FeedConfig(**base)


class TestAssertPublicHostAddressClasses:
    """Every non-public address class `_assert_public_host` claims to block."""

    @pytest.mark.parametrize(
        "address",
        [
            "10.0.0.5",  # private
            "192.168.1.1",  # private
            "172.16.0.1",  # private
            "127.0.0.1",  # loopback
            "169.254.1.1",  # link-local
            "0.0.0.0",  # reserved
            "::1",  # IPv6 loopback
            "fe80::1",  # IPv6 link-local
            "fc00::1",  # IPv6 unique-local (private)
        ],
    )
    def test_blocked_addresses_raise(self, monkeypatch, address):
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo(address))
        with pytest.raises(SsrfBlockedHost, match="non-public address"):
            _assert_public_host("https://internal.example/path")

    def test_public_address_is_allowed(self, monkeypatch):
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
        _assert_public_host("https://public.example/path")  # does not raise

    def test_unresolvable_host_raises(self, monkeypatch):
        def _raise(*_args, **_kwargs):
            raise OSError("name resolution failed")

        monkeypatch.setattr(socket, "getaddrinfo", _raise)
        with pytest.raises(SsrfBlockedHost, match="could not resolve"):
            _assert_public_host("https://does-not-resolve.example/path")

    def test_url_without_a_hostname_raises(self):
        with pytest.raises(SsrfBlockedHost, match="no hostname"):
            _assert_public_host("https:///path-only")


class TestSnapshotFetchIsGatedBySsrf:
    async def test_fetch_refuses_a_url_resolving_privately(self, monkeypatch):
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.1.2.3"))
        adapter = SnapshotAdapter()
        with pytest.raises(SsrfBlockedHost):
            await adapter.fetch(_snapshot_config(), None)

    async def test_probe_reports_ssrf_block_without_raising(self, monkeypatch):
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("127.0.0.1"))
        adapter = SnapshotAdapter()
        result = await adapter.probe(_snapshot_config(), None)
        assert result.ok is False
        assert "non-public" in result.message

    async def test_image_refuses_a_url_that_now_resolves_privately(self, monkeypatch):
        """DNS can change between config-save and the image request — the
        guard must run again on every fetch, not just once at config time."""
        adapter = SnapshotAdapter()
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200, content=b"jpeg-bytes", headers={"content-type": "image/jpeg"}
            )

        def _client_factory(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            return _REAL_ASYNC_CLIENT(*args, **kwargs)

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory)
        await adapter.fetch(_snapshot_config(), None)

        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.0.0.1"))
        with pytest.raises(SsrfBlockedHost):
            await adapter.image(_snapshot_config(), None, "snapshot")


class TestSnapshotFetchHappyAndErrorPaths:
    def _patch_client(self, monkeypatch, handler):
        def _client_factory(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            return _REAL_ASYNC_CLIENT(*args, **kwargs)

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory)

    async def test_fetch_emits_one_feature_at_the_configured_location(
        self, monkeypatch
    ):
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
        self._patch_client(monkeypatch, lambda request: httpx.Response(200))
        adapter = SnapshotAdapter()
        snapshot = await adapter.fetch(_snapshot_config(), None)
        assert len(snapshot.features) == 1
        feature = snapshot.features[0]
        assert feature.geometry == {"type": "Point", "coordinates": [-0.1, 51.5]}
        assert feature.properties.state == "live"
        assert (
            feature.properties.image_url
            == "/api/land/feeds/roadside-cam/image/snapshot"
        )

    async def test_fetch_raises_upstream_error_on_http_failure(self, monkeypatch):
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
        self._patch_client(monkeypatch, lambda request: httpx.Response(500))
        adapter = SnapshotAdapter()
        with pytest.raises(FeedUpstreamError):
            await adapter.fetch(_snapshot_config(), None)

    async def test_probe_reports_upstream_failure_without_raising(self, monkeypatch):
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
        self._patch_client(monkeypatch, lambda request: httpx.Response(503))
        adapter = SnapshotAdapter()
        result = await adapter.probe(_snapshot_config(), None)
        assert result.ok is False
        assert result.message == "could not reach the snapshot URL"

    async def test_probe_reports_success_with_feature_count(self, monkeypatch):
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
        self._patch_client(monkeypatch, lambda request: httpx.Response(200))
        adapter = SnapshotAdapter()
        result = await adapter.probe(_snapshot_config(), None)
        assert result.ok is True
        assert result.feature_count == 1


class TestSnapshotImage:
    def _patch_client(self, monkeypatch, handler):
        def _client_factory(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            return _REAL_ASYNC_CLIENT(*args, **kwargs)

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory)

    async def _fetched_adapter(self, monkeypatch) -> SnapshotAdapter:
        monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
        self._patch_client(monkeypatch, lambda request: httpx.Response(200))
        adapter = SnapshotAdapter()
        await adapter.fetch(_snapshot_config(), None)
        return adapter

    async def test_unknown_ref_raises_ref_not_found(self, monkeypatch):
        from backend.services.land_feeds.base import FeedRefNotFound

        adapter = await self._fetched_adapter(monkeypatch)
        with pytest.raises(FeedRefNotFound):
            await adapter.image(_snapshot_config(), None, "does-not-exist")

    async def test_image_returns_bytes_and_content_type(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        self._patch_client(
            monkeypatch,
            lambda request: httpx.Response(
                200, content=b"bytes", headers={"content-type": "image/jpeg"}
            ),
        )
        body, content_type = await adapter.image(_snapshot_config(), None, "snapshot")
        assert body == b"bytes"
        assert content_type == "image/jpeg"

    async def test_image_404_is_reported_as_offline(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        self._patch_client(monkeypatch, lambda request: httpx.Response(404))
        with pytest.raises(FeedOffline):
            await adapter.image(_snapshot_config(), None, "snapshot")

    async def test_image_server_error_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        self._patch_client(monkeypatch, lambda request: httpx.Response(500))
        with pytest.raises(FeedUpstreamError):
            await adapter.image(_snapshot_config(), None, "snapshot")

    async def test_image_network_error_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)

        def _raise_transport_error(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        self._patch_client(monkeypatch, _raise_transport_error)
        with pytest.raises(FeedUpstreamError):
            await adapter.image(_snapshot_config(), None, "snapshot")

    async def test_oversized_image_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        self._patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, headers={"content-length": "99999999"}),
        )
        with pytest.raises(FeedUpstreamError, match="declares"):
            await adapter.image(_snapshot_config(), None, "snapshot")


class TestSnapshotAuthHeaderAndQueryParamInjection:
    def test_api_key_goes_to_header_when_configured(self):
        adapter = SnapshotAdapter()
        config = _snapshot_config(auth={"type": "apiKey", "headerName": "X-Api-Key"})
        headers, params = adapter._headers_and_params(
            config, {"apiKey": "secret-value"}
        )
        assert headers["X-Api-Key"] == "secret-value"
        assert params == {}

    def test_api_key_goes_to_query_param_when_configured(self):
        adapter = SnapshotAdapter()
        config = _snapshot_config(auth={"type": "apiKey", "queryParam": "key"})
        headers, params = adapter._headers_and_params(
            config, {"apiKey": "secret-value"}
        )
        assert params["key"] == "secret-value"

    def test_no_credential_means_no_auth_material_is_added(self):
        adapter = SnapshotAdapter()
        config = _snapshot_config(auth={"type": "apiKey", "headerName": "X-Api-Key"})
        headers, params = adapter._headers_and_params(config, None)
        assert "X-Api-Key" not in headers
        assert params == {}

    def test_basic_auth_requires_both_username_and_password(self):
        adapter = SnapshotAdapter()
        config = _snapshot_config(auth={"type": "basic"})
        assert adapter._auth(config, {"username": "bob"}) is None
        auth = adapter._auth(config, {"username": "bob", "password": "hunter2"})
        assert isinstance(auth, httpx.BasicAuth)

    def test_no_auth_type_means_no_basic_auth_object(self):
        adapter = SnapshotAdapter()
        config = _snapshot_config(auth={"type": "none"})
        assert adapter._auth(config, {"username": "bob", "password": "hunter2"}) is None
