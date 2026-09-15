"""Tests for the `durham` provider adapter (Durham County Council traffic
cameras) — an ArcGIS feature-layer query plus a plain per-camera JPEG.

Every upstream call goes through `httpx.MockTransport`; no real network call
is ever made.
"""

from __future__ import annotations

import httpx
import pytest

from backend.services.land_feeds.adapters.durham import DurhamAdapter
from backend.services.land_feeds.base import (
    FeedOffline,
    FeedRefNotFound,
    FeedUpstreamError,
)
from backend.services.land_feeds.schema import FeedConfig

_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _durham_config(**overrides) -> FeedConfig:
    base = {
        "id": "durham-cc",
        "name": "Durham County Council",
        "category": "traffic-cameras",
        "provider": "durham",
        "url": "https://spatial.durham.gov.uk/arcgis/rest/services/External/VectorPoint/MapServer/30",
        "enabled": True,
        "refreshSeconds": 60,
        "auth": {"type": "none"},
    }
    base.update(overrides)
    return FeedConfig(**base)


def _patch_client(monkeypatch, handler):
    def _client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _client_factory)


def _arcgis_feature(
    *,
    uss="DUTMC_24",
    status="Live",
    longitude=-1.58,
    latitude=54.78,
    name="Framwellgate",
):
    return {
        "attributes": {
            "USS_Camera_Number": uss,
            "Status": status,
            "Camera_Nam": name,
            "Camera_Des": "View towards the City Centre",
            "Camera_Vie": "West",
            "Link": "https://www.durham.gov.uk/article/6134",
        },
        "geometry": {"x": longitude, "y": latitude},
    }


class TestFetchParsesArcgisFeatures:
    async def test_live_camera_produces_one_live_feature(self, monkeypatch):
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, json={"features": [_arcgis_feature()]}),
        )
        adapter = DurhamAdapter()
        snapshot = await adapter.fetch(_durham_config(), None)
        assert len(snapshot.features) == 1
        feature = snapshot.features[0]
        assert feature.properties.state == "live"
        assert feature.properties.id == "durham-cc:dutmc_24"
        assert (
            feature.properties.image_url == "/api/land/feeds/durham-cc/image/dutmc_24"
        )
        assert feature.geometry == {"type": "Point", "coordinates": [-1.58, 54.78]}

    async def test_status_other_than_live_is_offline(self, monkeypatch):
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(
                200, json={"features": [_arcgis_feature(status="Not Working")]}
            ),
        )
        snapshot = await DurhamAdapter().fetch(_durham_config(), None)
        assert snapshot.features[0].properties.state == "offline"

    async def test_uss_number_failing_the_ref_pattern_is_skipped(self, monkeypatch):
        # A ref that fails FEED_REF_PATTERN (e.g. contains a slash) must never
        # be minted, since it would break the /image/{ref} path contract.
        bad = _arcgis_feature(uss="bad/ref")
        good = _arcgis_feature(uss="DUTMC_99")
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, json={"features": [bad, good]}),
        )
        snapshot = await DurhamAdapter().fetch(_durham_config(), None)
        assert [feature.properties.id for feature in snapshot.features] == [
            "durham-cc:dutmc_99"
        ]

    @pytest.mark.parametrize(
        "malformed_feature",
        [
            {
                "attributes": {"USS_Camera_Number": ""},
                "geometry": {"x": -1.5, "y": 54.7},
            },  # blank ref
            {
                "attributes": {"USS_Camera_Number": "DUTMC_1"},
                "geometry": {},
            },  # missing coords
            {
                "attributes": {"USS_Camera_Number": "DUTMC_1"},
                "geometry": {"x": -1.5},
            },  # missing latitude
            {
                "attributes": {"USS_Camera_Number": "DUTMC_1"},
                "geometry": {"x": "not-a-number", "y": 54.7},
            },
            "not-a-dict",
        ],
    )
    async def test_malformed_rows_are_skipped_not_fatal(
        self, monkeypatch, malformed_feature
    ):
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, json={"features": [malformed_feature]}),
        )
        snapshot = await DurhamAdapter().fetch(_durham_config(), None)
        assert snapshot.features == []

    async def test_camera_name_falls_back_when_blank(self, monkeypatch):
        feature = _arcgis_feature(name="")
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, json={"features": [feature]}),
        )
        snapshot = await DurhamAdapter().fetch(_durham_config(), None)
        assert snapshot.features[0].properties.name == "Camera dutmc_24"


class TestFetchUpstreamFailures:
    async def test_non_2xx_status_raises_upstream_error(self, monkeypatch):
        _patch_client(monkeypatch, lambda request: httpx.Response(500))
        with pytest.raises(FeedUpstreamError):
            await DurhamAdapter().fetch(_durham_config(), None)

    async def test_non_json_body_raises_upstream_error(self, monkeypatch):
        _patch_client(
            monkeypatch, lambda request: httpx.Response(200, content=b"not json")
        )
        with pytest.raises(FeedUpstreamError):
            await DurhamAdapter().fetch(_durham_config(), None)

    async def test_unexpected_shape_raises_upstream_error(self, monkeypatch):
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, json={"no_features_key": True}),
        )
        with pytest.raises(FeedUpstreamError, match="unexpected ArcGIS response shape"):
            await DurhamAdapter().fetch(_durham_config(), None)


class TestProbe:
    async def test_probe_reports_camera_count(self, monkeypatch):
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, json={"features": [_arcgis_feature()]}),
        )
        result = await DurhamAdapter().probe(_durham_config(), None)
        assert result.ok is True and result.feature_count == 1

    async def test_probe_reports_reachable_but_empty(self, monkeypatch):
        _patch_client(
            monkeypatch, lambda request: httpx.Response(200, json={"features": []})
        )
        result = await DurhamAdapter().probe(_durham_config(), None)
        assert result.ok is True and result.feature_count == 0
        assert "no cameras" in result.message

    async def test_probe_reports_failure_without_raising(self, monkeypatch):
        _patch_client(monkeypatch, lambda request: httpx.Response(500))
        result = await DurhamAdapter().probe(_durham_config(), None)
        assert result.ok is False


class TestImage:
    async def _fetched_adapter(self, monkeypatch) -> DurhamAdapter:
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, json={"features": [_arcgis_feature()]}),
        )
        adapter = DurhamAdapter()
        await adapter.fetch(_durham_config(), None)
        return adapter

    async def test_unknown_ref_raises_ref_not_found(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        with pytest.raises(FeedRefNotFound):
            await adapter.image(_durham_config(), None, "unknown-ref")

    async def test_image_returns_bytes_and_content_type(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(
                200, content=b"jpeg", headers={"content-type": "image/jpeg"}
            ),
        )
        body, content_type = await adapter.image(_durham_config(), None, "dutmc_24")
        assert body == b"jpeg"
        assert content_type == "image/jpeg"

    async def test_image_404_is_offline(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(monkeypatch, lambda request: httpx.Response(404))
        with pytest.raises(FeedOffline):
            await adapter.image(_durham_config(), None, "dutmc_24")

    async def test_image_server_error_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(monkeypatch, lambda request: httpx.Response(502))
        with pytest.raises(FeedUpstreamError):
            await adapter.image(_durham_config(), None, "dutmc_24")

    async def test_image_network_error_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)

        def _raise_transport_error(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        _patch_client(monkeypatch, _raise_transport_error)
        with pytest.raises(FeedUpstreamError):
            await adapter.image(_durham_config(), None, "dutmc_24")

    async def test_oversized_image_is_upstream_error(self, monkeypatch):
        adapter = await self._fetched_adapter(monkeypatch)
        _patch_client(
            monkeypatch,
            lambda request: httpx.Response(200, headers={"content-length": "99999999"}),
        )
        with pytest.raises(FeedUpstreamError, match="declares"):
            await adapter.image(_durham_config(), None, "dutmc_24")
