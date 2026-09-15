"""Tests for the ``utmc`` adapter — Tyne & Wear + Durham UTMC cameras.

Every upstream call goes through `httpx.MockTransport`; no real network call is
made. The adapter is Basic-authenticated, so the tests pin that the credential
is required, is sent on every request (list and image), and never leaks into a
feature.
"""

from __future__ import annotations

import base64
import json

import httpx
import pytest

from backend.services.land_feeds.adapters.utmc import (
    UtmcAdapter,
    UtmcCredentialMissing,
    _parse_timestamp,
)
from backend.services.land_feeds.base import (
    FeedOffline,
    FeedRefNotFound,
    FeedUpstreamError,
)
from backend.services.land_feeds.schema import FeedConfig

_REAL_ASYNC_CLIENT = httpx.AsyncClient
_CREDENTIAL = {"username": "barry", "password": "s3cret"}


def _utmc_config(**overrides) -> FeedConfig:
    base = {
        "id": "utmc-tyne-wear",
        "name": "Tyne & Wear + Durham UTMC",
        "category": "traffic-cameras",
        "provider": "utmc",
        "url": "https://www.netraveldata.co.uk/api/v2",
        "enabled": True,
        "refreshSeconds": 60,
        "auth": {"type": "basic"},
    }
    base.update(overrides)
    return FeedConfig(**base)


def _patch_client(monkeypatch, handler):
    def _client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _client_factory)


def _static_entry(
    code="CCTV007", latitude=54.9755, longitude=-1.6252, **definition_overrides
):
    definition = {
        "shortDescription": "A167 Durham Road",
        "longDescription": "A167 Durham Road - Outside St George's Church",
        "point": {
            "easting": 999999,
            "northing": 199999,
            "latitude": latitude,
            "longitude": longitude,
        },
    }
    definition.update(definition_overrides)
    return {"systemCodeNumber": code, "definitions": [definition]}


def _dynamic_entry(
    code="CCTV007", image="https://www.netraveldata.co.uk/api/v2/cctv/images/BBC01a.jpg"
):
    return {
        "systemCodeNumber": code,
        "dynamics": [{"image": image, "lastUpdated": "2026-09-15T12:19:32.419+0000"}],
    }


def _expected_basic_header() -> str:
    return "Basic " + base64.b64encode(b"barry:s3cret").decode()


def _handler_for(static_entries, dynamic_entries, image_status=200, seen_auth=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen_auth is not None:
            seen_auth.append(request.headers.get("authorization"))
        if request.url.path.endswith("/cctv/static"):
            return httpx.Response(200, json=static_entries)
        if request.url.path.endswith("/cctv/dynamic"):
            return httpx.Response(200, json=dynamic_entries)
        if "/cctv/images/" in request.url.path:
            return httpx.Response(
                image_status,
                content=b"\xff\xd8jpeg",
                headers={"content-type": "image/jpeg"},
            )
        return httpx.Response(404)

    return handler


class TestCredentialHandling:
    async def test_fetch_without_a_credential_raises_before_any_request(
        self, monkeypatch
    ):
        calls = []
        _patch_client(
            monkeypatch,
            lambda request: calls.append(request) or httpx.Response(200, json=[]),
        )
        with pytest.raises(UtmcCredentialMissing):
            await UtmcAdapter().fetch(_utmc_config(), None)
        with pytest.raises(UtmcCredentialMissing):
            await UtmcAdapter().fetch(_utmc_config(), {"username": "only"})
        assert calls == []

    async def test_probe_without_a_credential_explains_what_to_enter(self, monkeypatch):
        _patch_client(monkeypatch, _handler_for([], []))
        result = await UtmcAdapter().probe(_utmc_config(), {})
        assert result.ok is False
        assert "username and password" in result.message

    async def test_every_request_carries_basic_auth(self, monkeypatch):
        seen_auth: list[str | None] = []
        _patch_client(
            monkeypatch,
            _handler_for([_static_entry()], [_dynamic_entry()], seen_auth=seen_auth),
        )
        adapter = UtmcAdapter()
        await adapter.fetch(_utmc_config(), _CREDENTIAL)
        await adapter.image(_utmc_config(), _CREDENTIAL, "cctv007")
        assert seen_auth == [_expected_basic_header()] * 3

    async def test_rejected_credentials_surface_as_a_readable_upstream_error(
        self, monkeypatch
    ):
        _patch_client(monkeypatch, lambda request: httpx.Response(401))
        with pytest.raises(FeedUpstreamError, match="rejected the username/password"):
            await UtmcAdapter().fetch(_utmc_config(), _CREDENTIAL)
        result = await UtmcAdapter().probe(_utmc_config(), _CREDENTIAL)
        assert result.ok is False
        assert "rejected" in result.message


class TestFetch:
    async def test_joins_static_and_dynamic_into_a_live_feature_with_a_proxied_image(
        self, monkeypatch
    ):
        _patch_client(monkeypatch, _handler_for([_static_entry()], [_dynamic_entry()]))
        snapshot = await UtmcAdapter().fetch(_utmc_config(), _CREDENTIAL)
        assert len(snapshot.features) == 1
        feature = snapshot.features[0]
        properties = feature.properties
        assert feature.geometry["coordinates"] == [-1.6252, 54.9755]
        assert properties.id == "utmc-tyne-wear:cctv007"
        assert properties.name == "A167 Durham Road"
        assert properties.description.startswith("A167 Durham Road - Outside")
        assert properties.state == "live"
        assert properties.image_url == "/api/land/feeds/utmc-tyne-wear/image/cctv007"
        assert properties.updated_at == "2026-09-15T12:19:32.419000Z"
        # The Basic-auth'd upstream URL never reaches the browser.
        assert "netraveldata" not in json.dumps(properties.model_dump(by_alias=True))

    async def test_camera_without_dynamics_is_offline_with_no_image(self, monkeypatch):
        _patch_client(monkeypatch, _handler_for([_static_entry()], []))
        snapshot = await UtmcAdapter().fetch(_utmc_config(), _CREDENTIAL)
        properties = snapshot.features[0].properties
        assert properties.state == "offline"
        assert properties.image_url is None
        assert properties.updated_at is None

    async def test_falls_back_to_the_code_number_when_the_description_is_blank(
        self, monkeypatch
    ):
        _patch_client(
            monkeypatch, _handler_for([_static_entry(shortDescription="  ")], [])
        )
        snapshot = await UtmcAdapter().fetch(_utmc_config(), _CREDENTIAL)
        assert snapshot.features[0].properties.name == "CCTV007"

    async def test_malformed_rows_are_skipped_not_fatal(self, monkeypatch):
        static_entries = [
            "not a dict",
            {"systemCodeNumber": "", "definitions": [{}]},
            {"systemCodeNumber": "NODEFS", "definitions": []},
            {"systemCodeNumber": "NOPOINT", "definitions": ["x"]},
            {
                "systemCodeNumber": "BADLAT",
                "definitions": [{"point": {"latitude": "n", "longitude": 1}}],
            },
            {
                "systemCodeNumber": "BAD/REF",
                "definitions": [{"point": {"latitude": 1, "longitude": 1}}],
            },
            _static_entry(),
        ]
        dynamic_entries = [
            "not a dict",
            {"systemCodeNumber": "", "dynamics": [{}]},
            {"systemCodeNumber": "X", "dynamics": "nope"},
            {"systemCodeNumber": "Y", "dynamics": ["not a dict"]},
            {
                "systemCodeNumber": "Z",
                "dynamics": [{"image": "http://insecure/img.jpg"}],
            },
            _dynamic_entry(),
        ]
        _patch_client(monkeypatch, _handler_for(static_entries, dynamic_entries))
        snapshot = await UtmcAdapter().fetch(_utmc_config(), _CREDENTIAL)
        assert [feature.properties.id for feature in snapshot.features] == [
            "utmc-tyne-wear:cctv007"
        ]

    async def test_unexpected_response_shape_or_http_error_is_an_upstream_error(
        self, monkeypatch
    ):
        _patch_client(
            monkeypatch, lambda request: httpx.Response(200, json={"not": "a list"})
        )
        with pytest.raises(FeedUpstreamError, match="unexpected UTMC response shape"):
            await UtmcAdapter().fetch(_utmc_config(), _CREDENTIAL)
        _patch_client(monkeypatch, lambda request: httpx.Response(500))
        with pytest.raises(FeedUpstreamError):
            await UtmcAdapter().fetch(_utmc_config(), _CREDENTIAL)

    async def test_probe_reports_cameras_and_how_many_are_publishing(self, monkeypatch):
        _patch_client(
            monkeypatch,
            _handler_for(
                [_static_entry(), _static_entry(code="CCTV008")], [_dynamic_entry()]
            ),
        )
        result = await UtmcAdapter().probe(_utmc_config(), _CREDENTIAL)
        assert result.ok is True
        assert result.feature_count == 2
        assert result.message == "2 cameras, 1 publishing images"

    async def test_probe_with_no_cameras_is_ok_but_says_so(self, monkeypatch):
        _patch_client(monkeypatch, _handler_for([], []))
        result = await UtmcAdapter().probe(_utmc_config(), _CREDENTIAL)
        assert result.ok is True
        assert result.feature_count == 0


class TestImage:
    async def test_unknown_ref_is_not_found(self, monkeypatch):
        _patch_client(monkeypatch, _handler_for([], []))
        with pytest.raises(FeedRefNotFound):
            await UtmcAdapter().image(_utmc_config(), _CREDENTIAL, "nope")

    async def test_image_without_a_credential_raises(self, monkeypatch):
        _patch_client(monkeypatch, _handler_for([_static_entry()], [_dynamic_entry()]))
        adapter = UtmcAdapter()
        await adapter.fetch(_utmc_config(), _CREDENTIAL)
        with pytest.raises(UtmcCredentialMissing):
            await adapter.image(_utmc_config(), None, "cctv007")

    async def test_image_is_proxied_with_its_content_type(self, monkeypatch):
        _patch_client(monkeypatch, _handler_for([_static_entry()], [_dynamic_entry()]))
        adapter = UtmcAdapter()
        await adapter.fetch(_utmc_config(), _CREDENTIAL)
        body, content_type = await adapter.image(_utmc_config(), _CREDENTIAL, "cctv007")
        assert body.startswith(b"\xff\xd8")
        assert content_type == "image/jpeg"

    @pytest.mark.parametrize(
        ("status", "expected"),
        [(404, FeedOffline), (500, FeedUpstreamError)],
    )
    async def test_image_status_mapping(self, monkeypatch, status, expected):
        _patch_client(
            monkeypatch,
            _handler_for([_static_entry()], [_dynamic_entry()], image_status=status),
        )
        adapter = UtmcAdapter()
        await adapter.fetch(_utmc_config(), _CREDENTIAL)
        with pytest.raises(expected):
            await adapter.image(_utmc_config(), _CREDENTIAL, "cctv007")

    async def test_oversized_and_network_failures_are_upstream_errors(
        self, monkeypatch
    ):
        adapter = UtmcAdapter()
        _patch_client(monkeypatch, _handler_for([_static_entry()], [_dynamic_entry()]))
        await adapter.fetch(_utmc_config(), _CREDENTIAL)

        def oversized(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200, content=b"x", headers={"content-length": str(10**9)}
            )

        _patch_client(monkeypatch, oversized)
        with pytest.raises(FeedUpstreamError, match="declares"):
            await adapter.image(_utmc_config(), _CREDENTIAL, "cctv007")

        def broken(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom")

        _patch_client(monkeypatch, broken)
        with pytest.raises(FeedUpstreamError, match="boom"):
            await adapter.image(_utmc_config(), _CREDENTIAL, "cctv007")


class TestTimestampParsing:
    @pytest.mark.parametrize(
        ("raw", "expected_iso"),
        [
            ("2026-09-15T12:19:32.419+0000", "2026-09-15T12:19:32.419000+00:00"),
            ("2026-09-15T13:19:32+01:00", "2026-09-15T12:19:32+00:00"),
            ("2026-09-15T12:19:32", "2026-09-15T12:19:32+00:00"),
        ],
    )
    def test_parses_the_feed_stamp_variants_to_utc(self, raw, expected_iso):
        assert _parse_timestamp(raw).isoformat() == expected_iso

    @pytest.mark.parametrize("raw", [None, "", "   ", "not a date", 12345])
    def test_unparseable_stamps_are_none(self, raw):
        assert _parse_timestamp(raw) is None
