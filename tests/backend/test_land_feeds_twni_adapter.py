"""Tests for the ``twni`` adapter — TrafficWatchNI (Northern Ireland) cameras.

Every upstream call goes through `httpx.MockTransport`; no real network call is
made. The adapter drives the site the way a browser does (CSRF-tokened POST for
the camera list, popup fragment per camera for its image URL), so the tests pin
that protocol and the image-host allow-list it implies.
"""

from __future__ import annotations

import httpx
import pytest

from backend.services.land_feeds.adapters.twni import TwniAdapter
from backend.services.land_feeds.base import (
    FeedOffline,
    FeedRefNotFound,
    FeedUpstreamError,
)
from backend.services.land_feeds.schema import FeedConfig

_REAL_ASYNC_CLIENT = httpx.AsyncClient
_PAGE = '<meta name="_csrf" content="tok-123"><meta name="_csrf_header" content="X-CSRF-TOKEN">'
_POPUP = (
    '<img class="w-100 cctvImage" src="https://cctv.trafficwatchni.com/125.jpg?cache=1789470000000" '
    'alt="CCTV Camera image for M1- Blaris West - J9" />'
)


def _twni_config(**overrides) -> FeedConfig:
    base = {
        "id": "twni",
        "name": "TrafficWatchNI",
        "category": "traffic-cameras",
        "provider": "twni",
        "url": "https://www.trafficwatchni.com",
        "enabled": True,
        "refreshSeconds": 300,
        "auth": {"type": "none"},
    }
    base.update(overrides)
    return FeedConfig(**base)


def _patch_client(monkeypatch, handler):
    def _client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _client_factory)


def _row(
    camera_id="174",
    latitude=54.4913,
    longitude=-6.0788,
    summary="M1-  Blaris West - J9",
):
    return {
        "id": camera_id,
        "latitude": latitude,
        "longitude": longitude,
        "summary": summary,
    }


def _handler_for(rows, *, page=_PAGE, popup=_POPUP, image_status=200, seen=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if request.url.host == "cctv.trafficwatchni.com":
            return httpx.Response(
                image_status,
                content=b"\xff\xd8jpeg",
                headers={"content-type": "application/octet-stream"},
            )
        if request.url.path == "/twni/cameras":
            return httpx.Response(200, text=page)
        if request.url.path == "/twni/map/mapData":
            return httpx.Response(200, json={"mapData": {"CCTV_CAMERAS": rows}})
        if request.url.path == "/twni/cameras/cctvMapPopup":
            return httpx.Response(200, text=popup)
        return httpx.Response(404)

    return handler


class TestFetch:
    async def test_lists_cameras_from_the_map_data_with_the_browser_protocol(
        self, monkeypatch
    ):
        seen: list[httpx.Request] = []
        _patch_client(monkeypatch, _handler_for([_row()], seen=seen))
        snapshot = await TwniAdapter().fetch(_twni_config(), None)
        assert len(snapshot.features) == 1
        properties = snapshot.features[0].properties
        assert properties.id == "twni:174"
        assert properties.name == "M1- Blaris West - J9"  # whitespace collapsed
        assert properties.state == "live"
        assert properties.image_url == "/api/land/feeds/twni/image/174"
        assert snapshot.features[0].geometry["coordinates"] == [-6.0788, 54.4913]
        page_request, data_request = seen
        assert page_request.method == "GET"
        assert data_request.method == "POST"
        assert data_request.headers["X-CSRF-TOKEN"] == "tok-123"
        assert data_request.headers["X-Requested-With"] == "XMLHttpRequest"
        assert b"selectedTypes=CCTV_CAMERAS" in data_request.content
        assert "Mozilla" in data_request.headers["User-Agent"]

    async def test_uses_the_default_csrf_header_when_the_page_names_none(
        self, monkeypatch
    ):
        seen: list[httpx.Request] = []
        page = '<meta name="_csrf" content="tok-xyz">'
        _patch_client(monkeypatch, _handler_for([_row()], page=page, seen=seen))
        await TwniAdapter().fetch(_twni_config(), None)
        assert seen[1].headers["X-CSRF-TOKEN"] == "tok-xyz"

    async def test_page_without_a_csrf_token_is_an_upstream_error(self, monkeypatch):
        _patch_client(monkeypatch, _handler_for([_row()], page="<html>no token</html>"))
        with pytest.raises(FeedUpstreamError, match="CSRF"):
            await TwniAdapter().fetch(_twni_config(), None)

    async def test_unexpected_shape_and_http_errors_are_upstream_errors(
        self, monkeypatch
    ):
        def bad_shape(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/twni/cameras":
                return httpx.Response(200, text=_PAGE)
            return httpx.Response(200, json={"mapData": {}})

        _patch_client(monkeypatch, bad_shape)
        with pytest.raises(
            FeedUpstreamError, match="unexpected TrafficWatchNI response shape"
        ):
            await TwniAdapter().fetch(_twni_config(), None)
        _patch_client(monkeypatch, lambda request: httpx.Response(503))
        with pytest.raises(FeedUpstreamError):
            await TwniAdapter().fetch(_twni_config(), None)

    async def test_malformed_rows_are_skipped_not_fatal(self, monkeypatch):
        rows = [
            "not a dict",
            _row(camera_id=""),
            _row(camera_id="bad/ref"),
            _row(camera_id="1", latitude="n"),
            _row(camera_id="2", longitude=None),
            _row(camera_id="3", summary=""),
            _row(),
        ]
        _patch_client(monkeypatch, _handler_for(rows))
        snapshot = await TwniAdapter().fetch(_twni_config(), None)
        assert [feature.properties.id for feature in snapshot.features] == [
            "twni:3",
            "twni:174",
        ]
        assert snapshot.features[0].properties.name == "Camera 3"

    async def test_probe_reports_count_reachability_and_emptiness(self, monkeypatch):
        _patch_client(monkeypatch, _handler_for([_row(), _row(camera_id="175")]))
        result = await TwniAdapter().probe(_twni_config(), None)
        assert (result.ok, result.feature_count, result.message) == (
            True,
            2,
            "2 cameras",
        )
        _patch_client(monkeypatch, _handler_for([]))
        result = await TwniAdapter().probe(_twni_config(), None)
        assert result.ok is True
        assert result.feature_count == 0
        _patch_client(monkeypatch, lambda request: httpx.Response(500))
        result = await TwniAdapter().probe(_twni_config(), None)
        assert result.ok is False
        assert "could not reach" in result.message


class TestImage:
    async def _primed(self, monkeypatch, **handler_kwargs) -> TwniAdapter:
        _patch_client(monkeypatch, _handler_for([_row()], **handler_kwargs))
        adapter = TwniAdapter()
        await adapter.fetch(_twni_config(), None)
        return adapter

    async def test_unknown_ref_is_not_found(self, monkeypatch):
        adapter = await self._primed(monkeypatch)
        with pytest.raises(FeedRefNotFound):
            await adapter.image(_twni_config(), None, "999")

    async def test_resolves_the_blob_url_from_the_popup_once_then_caches_it(
        self, monkeypatch
    ):
        seen: list[httpx.Request] = []
        adapter = await self._primed(monkeypatch, seen=seen)
        seen.clear()
        body, content_type = await adapter.image(_twni_config(), None, "174")
        assert body.startswith(b"\xff\xd8")
        # The blob store says octet-stream; the proxy knows it is a JPEG.
        assert content_type == "image/jpeg"
        popup_request, image_request = seen
        assert popup_request.url.path == "/twni/cameras/cctvMapPopup"
        assert popup_request.url.params["id"] == "174"
        assert image_request.url.host == "cctv.trafficwatchni.com"
        assert image_request.headers["Referer"].startswith(
            "https://www.trafficwatchni.com"
        )
        seen.clear()
        await adapter.image(_twni_config(), None, "174")
        assert [request.url.host for request in seen] == ["cctv.trafficwatchni.com"]

    async def test_passes_through_a_real_image_content_type(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "cctv.trafficwatchni.com":
                return httpx.Response(
                    200, content=b"png", headers={"content-type": "image/png"}
                )
            return _handler_for([_row()])(request)

        _patch_client(monkeypatch, handler)
        adapter = TwniAdapter()
        await adapter.fetch(_twni_config(), None)
        _body, content_type = await adapter.image(_twni_config(), None, "174")
        assert content_type == "image/png"

    async def test_popup_without_an_image_means_the_camera_is_offline(
        self, monkeypatch
    ):
        adapter = await self._primed(monkeypatch, popup="<div>no camera image</div>")
        with pytest.raises(FeedOffline):
            await adapter.image(_twni_config(), None, "174")

    async def test_popup_image_on_a_foreign_host_is_ignored(self, monkeypatch):
        foreign = '<img class="cctvImage" src="https://evil.example/125.jpg">'
        adapter = await self._primed(monkeypatch, popup=foreign)
        with pytest.raises(FeedOffline):
            await adapter.image(_twni_config(), None, "174")

    async def test_image_404_is_offline_and_other_failures_forget_the_cached_mapping(
        self, monkeypatch
    ):
        adapter = await self._primed(monkeypatch, image_status=404)
        with pytest.raises(FeedOffline):
            await adapter.image(_twni_config(), None, "174")

        _patch_client(monkeypatch, _handler_for([_row()], image_status=403))
        with pytest.raises(FeedUpstreamError, match="HTTP 403"):
            await adapter.image(_twni_config(), None, "174")
        # The mapping was dropped, so the next request re-reads the popup.
        seen: list[httpx.Request] = []
        _patch_client(monkeypatch, _handler_for([_row()], seen=seen))
        await adapter.image(_twni_config(), None, "174")
        assert seen[0].url.path == "/twni/cameras/cctvMapPopup"

    async def test_network_and_size_failures_are_upstream_errors(self, monkeypatch):
        adapter = await self._primed(monkeypatch)

        def broken(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom")

        _patch_client(monkeypatch, broken)
        with pytest.raises(FeedUpstreamError, match="boom"):
            await adapter.image(_twni_config(), None, "174")

        def oversized(request: httpx.Request) -> httpx.Response:
            if request.url.host == "cctv.trafficwatchni.com":
                return httpx.Response(
                    200, content=b"x", headers={"content-length": str(10**9)}
                )
            return _handler_for([_row()])(request)

        _patch_client(monkeypatch, oversized)
        with pytest.raises(FeedUpstreamError, match="declares"):
            await adapter.image(_twni_config(), None, "174")
