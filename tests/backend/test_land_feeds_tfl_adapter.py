"""Tests for the `tfl-jamcams` provider adapter (Transport for London
JamCams) — the TfL Unified API list call, its asset-host allow-list, and the
still/clip proxy split.
"""

from __future__ import annotations

import httpx
import pytest

from backend.services.land_feeds.adapters.tfl_jamcams import TflJamCamsAdapter
from backend.services.land_feeds.base import (
    FeedOffline,
    FeedRefNotFound,
    FeedUpstreamError,
)
from backend.services.land_feeds.schema import FeedConfig

_REAL_ASYNC_CLIENT = httpx.AsyncClient
_ALLOWED_IMAGE_URL = "https://jamcams.tfl.gov.uk/00002.00865.jpg"
_ALLOWED_VIDEO_URL = (
    "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.mp4"
)


def _tfl_config(**overrides) -> FeedConfig:
    base = {
        "id": "tfl-jamcams",
        "name": "TfL JamCams",
        "category": "traffic-cameras",
        "provider": "tfl-jamcams",
        "url": "https://api.tfl.gov.uk",
        "enabled": True,
        "refreshSeconds": 300,
        "auth": {"type": "apiKey", "queryParam": "app_key", "optional": True},
    }
    base.update(overrides)
    return FeedConfig(**base)


def _patch_client(monkeypatch, handler):
    def _client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _client_factory)


def _place(
    *,
    place_id="JamCams_00002.00865",
    lat=51.5,
    lon=-0.1,
    available="true",
    image_url=_ALLOWED_IMAGE_URL,
    video_url=_ALLOWED_VIDEO_URL,
    common_name="A1 Test Street",
):
    props = [
        {"key": "available", "value": available},
        {"key": "imageUrl", "value": image_url},
        {"key": "videoUrl", "value": video_url},
        {"key": "view", "value": "Southbound"},
    ]
    return {
        "id": place_id,
        "lat": lat,
        "lon": lon,
        "commonName": common_name,
        "additionalProperties": props,
    }


class TestFetchParsesPlaces:
    async def test_live_camera_with_image_and_clip(self, monkeypatch):
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[_place()]))
        snapshot = await TflJamCamsAdapter().fetch(_tfl_config(), None)
        assert len(snapshot.features) == 1
        feature = snapshot.features[0]
        assert feature.properties.state == "live"
        assert (
            feature.properties.image_url
            == "/api/land/feeds/tfl-jamcams/image/00002.00865"
        )
        assert (
            feature.properties.clip_url
            == "/api/land/feeds/tfl-jamcams/clip/00002.00865"
        )

    async def test_available_false_is_offline(self, monkeypatch):
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, json=[_place(available="false")]),
        )
        snapshot = await TflJamCamsAdapter().fetch(_tfl_config(), None)
        assert snapshot.features[0].properties.state == "offline"

    async def test_disallowed_asset_host_is_dropped_not_proxied(self, monkeypatch):
        """An imageUrl/videoUrl outside the TfL asset allow-list must never be
        surfaced as a proxyable image/clip URL — this is the negative test
        proving the asset-host gate holds."""
        evil = _place(
            image_url="https://evil.example/x.jpg",
            video_url="https://evil.example/x.mp4",
        )
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[evil]))
        snapshot = await TflJamCamsAdapter().fetch(_tfl_config(), None)
        feature = snapshot.features[0]
        assert feature.properties.image_url is None
        assert feature.properties.clip_url is None
        assert feature.properties.state == "offline"  # no allowed image means not live

    async def test_subdomain_of_allowed_host_is_accepted(self, monkeypatch):
        place = _place(
            image_url="https://foo.s3-eu-west-1.amazonaws.com/x.jpg", video_url=""
        )
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[place]))
        snapshot = await TflJamCamsAdapter().fetch(_tfl_config(), None)
        assert snapshot.features[0].properties.image_url is not None

    async def test_non_https_asset_url_is_rejected(self, monkeypatch):
        place = _place(image_url="http://jamcams.tfl.gov.uk/x.jpg", video_url="")
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[place]))
        snapshot = await TflJamCamsAdapter().fetch(_tfl_config(), None)
        assert snapshot.features[0].properties.image_url is None

    @pytest.mark.parametrize(
        "malformed_place",
        [
            {"id": "JamCams_1", "lat": None, "lon": -0.1, "additionalProperties": []},
            {"id": "JamCams_1", "lat": 51.5, "lon": "nan", "additionalProperties": []},
            {
                "id": "bad id with spaces",
                "lat": 51.5,
                "lon": -0.1,
                "additionalProperties": [],
            },
            "not-a-dict",
        ],
    )
    async def test_malformed_rows_are_skipped_not_fatal(
        self, monkeypatch, malformed_place
    ):
        _patch_client(
            monkeypatch, lambda request: httpx.Response(200, json=[malformed_place])
        )
        snapshot = await TflJamCamsAdapter().fetch(_tfl_config(), None)
        assert snapshot.features == []

    async def test_place_id_without_prefix_uses_the_whole_id_as_ref(self, monkeypatch):
        place = _place(place_id="00002.00865")
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[place]))
        snapshot = await TflJamCamsAdapter().fetch(_tfl_config(), None)
        assert snapshot.features[0].properties.id == "tfl-jamcams:00002.00865"

    async def test_missing_common_name_falls_back_to_jamcam_ref(self, monkeypatch):
        place = _place(common_name="")
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[place]))
        snapshot = await TflJamCamsAdapter().fetch(_tfl_config(), None)
        assert snapshot.features[0].properties.name == "JamCam 00002.00865"


class TestFetchUpstreamFailuresAndAuth:
    async def test_non_2xx_status_raises_upstream_error(self, monkeypatch):
        _patch_client(monkeypatch, lambda request: httpx.Response(500))
        with pytest.raises(FeedUpstreamError):
            await TflJamCamsAdapter().fetch(_tfl_config(), None)

    async def test_non_list_response_raises_upstream_error(self, monkeypatch):
        _patch_client(
            monkeypatch, lambda request: httpx.Response(200, json={"not": "a list"})
        )
        with pytest.raises(FeedUpstreamError, match="unexpected TfL response shape"):
            await TflJamCamsAdapter().fetch(_tfl_config(), None)

    async def test_app_key_is_sent_when_a_credential_exists(self, monkeypatch):
        seen_urls = []
        _patch_client(
            monkeypatch,
            lambda request: (
                seen_urls.append(str(request.url)),
                httpx.Response(200, json=[]),
            )[1],
        )
        await TflJamCamsAdapter().fetch(_tfl_config(), {"apiKey": "secret-key"})
        assert "app_key=secret-key" in seen_urls[0]

    async def test_app_key_is_omitted_when_no_credential_is_configured(
        self, monkeypatch
    ):
        seen_urls = []
        _patch_client(
            monkeypatch,
            lambda request: (
                seen_urls.append(str(request.url)),
                httpx.Response(200, json=[]),
            )[1],
        )
        await TflJamCamsAdapter().fetch(_tfl_config(), None)
        assert "app_key" not in seen_urls[0]

    async def test_min_interval_seconds_is_sixty(self):
        # TfL's own anonymous rate budget floor — the poller must never poll
        # this adapter faster than this regardless of a smaller refreshSeconds.
        assert TflJamCamsAdapter().min_interval_seconds == 60.0

    async def test_supports_clips_is_true(self):
        assert TflJamCamsAdapter().supports_clips is True


class TestProbe:
    async def test_probe_reports_camera_count(self, monkeypatch):
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[_place()]))
        result = await TflJamCamsAdapter().probe(_tfl_config(), None)
        assert result.ok is True and result.feature_count == 1

    async def test_probe_reports_failure_without_raising(self, monkeypatch):
        _patch_client(monkeypatch, lambda request: httpx.Response(500))
        result = await TflJamCamsAdapter().probe(_tfl_config(), None)
        assert result.ok is False


class TestImageAndClipProxy:
    async def _fetched_adapter(self, monkeypatch) -> TflJamCamsAdapter:
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[_place()]))
        adapter = TflJamCamsAdapter()
        await adapter.fetch(_tfl_config(), None)
        return adapter

    async def test_image_unknown_ref_raises_ref_not_found(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        with pytest.raises(FeedRefNotFound):
            await adapter.image(_tfl_config(), None, "unknown")

    async def test_image_returns_bytes(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(
                200, content=b"still", headers={"content-type": "image/jpeg"}
            ),
        )
        body, content_type = await adapter.image(_tfl_config(), None, "00002.00865")
        assert body == b"still"
        assert content_type == "image/jpeg"

    async def test_image_404_is_offline(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(monkeypatch, lambda request: httpx.Response(404))
        with pytest.raises(FeedOffline):
            await adapter.image(_tfl_config(), None, "00002.00865")

    async def test_clip_unknown_ref_raises_ref_not_found(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        with pytest.raises(FeedRefNotFound):
            await adapter.clip(_tfl_config(), None, "unknown")

    async def test_clip_returns_bytes(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(
                200, content=b"mp4-bytes", headers={"content-type": "video/mp4"}
            ),
        )
        body, content_type = await adapter.clip(_tfl_config(), None, "00002.00865")
        assert body == b"mp4-bytes"
        assert content_type == "video/mp4"

    async def test_clip_of_a_camera_with_no_clip_is_ref_not_found(self, monkeypatch):
        """A camera can offer a still without a clip; requesting the clip ref
        must not silently fall back to the image ref namespace."""
        place = _place(video_url="")
        _patch_client(monkeypatch, lambda request: httpx.Response(200, json=[place]))
        adapter = TflJamCamsAdapter()
        await adapter.fetch(_tfl_config(), None)
        with pytest.raises(FeedRefNotFound):
            await adapter.clip(_tfl_config(), None, "00002.00865")

    async def test_oversized_clip_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(
                200, headers={"content-length": str(64 * 1024 * 1024)}
            ),
        )
        with pytest.raises(FeedUpstreamError, match="declares"):
            await adapter.clip(_tfl_config(), None, "00002.00865")

    async def test_image_network_error_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)

        def _raise_transport_error(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        _patch_client(monkeypatch, _raise_transport_error)
        with pytest.raises(FeedUpstreamError):
            await adapter.image(_tfl_config(), None, "00002.00865")

    async def test_image_server_error_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(monkeypatch, lambda request: httpx.Response(500))
        with pytest.raises(FeedUpstreamError):
            await adapter.image(_tfl_config(), None, "00002.00865")
