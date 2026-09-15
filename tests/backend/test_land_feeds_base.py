"""Tests for `backend.services.land_feeds.base.download_capped` — the shared
streaming-with-a-byte-cap helper every image/clip adapter proxy call goes
through.

Uses `httpx.MockTransport` so no real network call is ever made; each test
drives a specific upstream shape (declared Content-Length, undeclared length,
error status, success) through the real streaming code path.
"""

from __future__ import annotations

import httpx
import pytest

from backend.services.land_feeds.base import (
    FeedAdapter,
    FeedAssetTooLarge,
    FeedRefNotFound,
    RefMapMixin,
    download_capped,
)


def _client_for(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


class TestDeclaredContentLengthOverCap:
    """A server that honestly declares an oversized body is refused up front,
    based on the declared length alone (before the cap-checked byte-counting
    loop even needs to run)."""

    async def test_raises_with_the_declared_and_cap_sizes_in_the_message(self):
        def handler(request: httpx.Request) -> httpx.Response:
            # The body itself is small — only the *declared* length matters
            # for this check, proving it fires independently of actual size.
            return httpx.Response(
                200, headers={"content-length": "1000"}, content=b"tiny"
            )

        async with _client_for(handler) as client:
            with pytest.raises(
                FeedAssetTooLarge, match="declares 1000 bytes, cap is 10"
            ):
                await download_capped(
                    client, "https://example.org/image.jpg", max_bytes=10
                )


class TestUndeclaredBodyOverCapMidStream:
    """A server that omits (or lies about) Content-Length is still bounded by
    counting bytes as they arrive."""

    async def test_raises_once_the_cap_is_exceeded_mid_stream(self):
        def handler(request: httpx.Request) -> httpx.Response:
            # httpx computes Content-Length from `content=` automatically;
            # strip it to simulate an upstream that omits the header entirely
            # (chunked transfer-encoding, no declared length).
            response = httpx.Response(200, content=b"x" * 50)
            del response.headers["content-length"]
            return response

        async with _client_for(handler) as client:
            with pytest.raises(FeedAssetTooLarge, match="body exceeded 10 bytes"):
                await download_capped(
                    client, "https://example.org/image.jpg", max_bytes=10
                )

    async def test_a_lying_content_length_under_the_cap_is_still_bounded(self):
        def handler(request: httpx.Request) -> httpx.Response:
            response = httpx.Response(200, content=b"x" * 50)
            response.headers["content-length"] = "5"  # understates the real body size
            return response

        async with _client_for(handler) as client:
            with pytest.raises(FeedAssetTooLarge, match="body exceeded 10 bytes"):
                await download_capped(
                    client, "https://example.org/image.jpg", max_bytes=10
                )


class TestErrorStatusReturnsEmptyBody:
    @pytest.mark.parametrize("status_code", [400, 404, 500, 503])
    async def test_four_hundred_and_above_returns_empty_body_without_raising(
        self, status_code
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code, content=b"error detail that must not leak"
            )

        async with _client_for(handler) as client:
            status, headers, body = await download_capped(
                client, "https://example.org/image.jpg", max_bytes=1024
            )
        assert status == status_code
        assert body == b""
        assert isinstance(headers, dict)


class TestSuccessPath:
    async def test_returns_status_headers_and_full_body_within_the_cap(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                headers={"content-type": "image/jpeg"},
                content=b"a-small-jpeg-body",
            )

        async with _client_for(handler) as client:
            status, headers, body = await download_capped(
                client, "https://example.org/image.jpg", max_bytes=1024
            )
        assert status == 200
        assert body == b"a-small-jpeg-body"
        assert headers["content-type"] == "image/jpeg"

    async def test_forwards_headers_params_and_auth_to_the_request(self):
        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["headers"] = request.headers
            seen["url"] = str(request.url)
            return httpx.Response(200, content=b"ok")

        async with _client_for(handler) as client:
            await download_capped(
                client,
                "https://example.org/image.jpg",
                max_bytes=1024,
                headers={"X-Custom": "yes"},
                params={"token": "abc"},
                auth=("user", "pass"),
            )
        assert seen["headers"]["x-custom"] == "yes"
        assert "token=abc" in seen["url"]
        assert "authorization" in {key.lower() for key in seen["headers"].keys()}

    async def test_does_not_follow_redirects(self):
        """Adapters resolve the exact upstream URL themselves; following a
        redirect here could walk off an allow-listed host, so the client must
        never chase a 3xx automatically."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                302, headers={"location": "https://attacker.example/steal"}
            )

        async with _client_for(handler) as client:
            status, headers, body = await download_capped(
                client, "https://example.org/image.jpg", max_bytes=1024
            )
        # A bare 302 is below the >=400 branch, so it is returned as-is
        # (the caller decides what to do with it) rather than silently
        # chased to a different host.
        assert status == 302
        assert body == b""


class TestRefMapMixin:
    """Direct tests of the ref-bookkeeping shared by every adapter that mints
    opaque refs — `_remember_ref`/`_resolve_ref`/`_replace_ref_map`."""

    def test_remember_then_resolve_round_trips(self):
        mixin = RefMapMixin()
        mixin._remember_ref("feed-a", "ref-1", "https://example.org/a.jpg")
        assert mixin._resolve_ref("feed-a", "ref-1") == "https://example.org/a.jpg"

    def test_unknown_ref_resolves_to_none(self):
        mixin = RefMapMixin()
        assert mixin._resolve_ref("feed-a", "no-such-ref") is None

    def test_ref_from_a_different_feed_does_not_resolve(self):
        """Refs are scoped per feed id — a ref minted by one feed must never
        resolve against another feed's upstream."""
        mixin = RefMapMixin()
        mixin._remember_ref("feed-a", "ref-1", "https://example.org/a.jpg")
        assert mixin._resolve_ref("feed-b", "ref-1") is None

    def test_expired_ref_resolves_to_none(self, monkeypatch):
        import time as time_module

        mixin = RefMapMixin()
        current_time = [1000.0]
        monkeypatch.setattr(time_module, "monotonic", lambda: current_time[0])
        mixin._remember_ref("feed-a", "ref-1", "https://example.org/a.jpg")
        current_time[0] += RefMapMixin._REF_TTL_SECONDS + 1
        assert mixin._resolve_ref("feed-a", "ref-1") is None

    def test_replace_ref_map_swaps_in_a_fresh_map_atomically(self):
        mixin = RefMapMixin()
        mixin._remember_ref("feed-a", "old-ref", "https://example.org/old.jpg")
        mixin._replace_ref_map(
            "feed-a", {"new-ref": mixin._ref_entry("https://example.org/new.jpg")}
        )
        assert mixin._resolve_ref("feed-a", "old-ref") is None
        assert mixin._resolve_ref("feed-a", "new-ref") == "https://example.org/new.jpg"


class _MinimalAdapter(FeedAdapter):
    """A concrete class relying entirely on `FeedAdapter`'s inherited default
    method bodies — used to test the Protocol's own default `clip()`
    fallback, since every real Land feed adapter builds on `RefMapMixin`
    instead of inheriting from this Protocol directly."""


class TestFeedAdapterDefaultClip:
    async def test_default_clip_implementation_raises_ref_not_found(self):
        adapter = _MinimalAdapter()
        with pytest.raises(FeedRefNotFound, match="does not expose clips"):
            await adapter.clip(config=None, credential=None, ref="anything")
