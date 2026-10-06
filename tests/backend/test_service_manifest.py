"""ServiceManifest validation (backend/platform/service_manifest.py).

Core routes a registered service's prefixes through the gateway and the shell
runs its remote entry, so these pin exactly what a manifest may claim.
"""

import pytest
from pydantic import ValidationError

from backend.platform.service_manifest import (
    ServiceManifest,
    remote_entry_path,
    route_is_reserved,
)


def manifest_body(**overrides) -> dict:
    body = {
        "id": "weather",
        "kind": "section",
        "version": "0.1.0",
        "internalUrl": "http://weather:8000",
        "routes": ["/api/weather/"],
        "ui": {"remoteEntry": "/remotes/weather/remoteEntry.js", "exposes": ["./register"]},
    }
    body.update(overrides)
    return body


def validate(**overrides) -> ServiceManifest:
    return ServiceManifest.model_validate(manifest_body(**overrides))


class TestValidManifest:
    def test_a_full_manifest_validates_with_defaults_filled_in(self):
        manifest = ServiceManifest.model_validate(
            {
                "id": "weather",
                "kind": "section",
                "version": "0.1.0",
                "internalUrl": "http://weather:8000",
            }
        )

        assert manifest.contracts == "^1"
        assert manifest.nav_order == 1000
        assert manifest.display_name == ""
        assert manifest.routes == []
        assert manifest.ui is None
        assert manifest.health == "/health"

    def test_keeps_plan_fields_the_registry_does_not_act_on_yet(self):
        manifest = validate(requires=["radio-hub"], settings={"namespace": "weather"})

        wire = manifest.to_wire()
        assert wire["requires"] == ["radio-hub"]
        assert wire["settings"] == {"namespace": "weather"}

    def test_to_wire_uses_the_camel_case_names_and_drops_unset_optionals(self):
        wire = validate(displayName="WX", navOrder=60, ui=None).to_wire()

        assert wire["displayName"] == "WX"
        assert wire["navOrder"] == 60
        assert wire["internalUrl"] == "http://weather:8000"
        assert "ui" not in wire
        assert "display_name" not in wire

    def test_strips_a_trailing_slash_from_the_internal_url(self):
        assert validate(internalUrl="https://wx.lan:9000/").internal_url == "https://wx.lan:9000"

    @pytest.mark.parametrize("kind", ["section", "radio-hub", "decoder"])
    def test_accepts_each_service_kind(self, kind: str):
        assert validate(kind=kind).kind == kind

    @pytest.mark.parametrize("contracts", ["1", "^1", "^1.2", "1.x", "^1.2.3", "1.x.x"])
    def test_accepts_contracts_major_one(self, contracts: str):
        assert validate(contracts=contracts).contracts == contracts

    @pytest.mark.parametrize(
        "route",
        ["/api/weather/", "/api/weather", "/ws/weather/", "/api/sdr/radios", "/api/a/b/c/d/"],
    )
    def test_accepts_prefixes_under_api_and_ws(self, route: str):
        assert validate(routes=[route]).routes == [route]

    def test_a_section_may_own_air_beside_the_core_notifications_prefix(self):
        assert validate(routes=["/api/air/"]).routes == ["/api/air/"]


class TestRejectedManifest:
    @pytest.mark.parametrize("bad_id", ["", "Air", "1air", "-air", "air_2", "a ir", "a" * 33])
    def test_rejects_an_id_that_cannot_be_a_url_segment(self, bad_id: str):
        with pytest.raises(ValidationError, match="id must be"):
            validate(id=bad_id, ui=None)

    def test_rejects_an_unknown_kind(self):
        with pytest.raises(ValidationError):
            validate(kind="plugin")

    @pytest.mark.parametrize("contracts", ["^2", "2.0", "^0.9", ">=1", "^1.2.3.4"])
    def test_rejects_any_other_contracts_major(self, contracts: str):
        with pytest.raises(ValidationError, match="contracts 1.x"):
            validate(contracts=contracts)

    def test_rejects_an_empty_version(self):
        with pytest.raises(ValidationError):
            validate(version="")

    @pytest.mark.parametrize(
        "internal_url",
        [
            "ftp://weather:8000",
            "weather:8000",
            "http://",
            "http://weather:8000/?x=1",
            "http://weather:8000/#frag",
            "javascript:alert(1)",
        ],
    )
    def test_rejects_an_internal_url_that_is_not_plain_http(self, internal_url: str):
        with pytest.raises(ValidationError, match="internalUrl"):
            validate(internalUrl=internal_url)

    @pytest.mark.parametrize(
        "route",
        [
            "/api/",
            "/api",
            "/ws/",
            "/assets/tiles/",
            "/remotes/weather/",
            "/api/Weather/",
            "/api/weather//x",
            "api/weather/",
            "/api/../settings/",
            "/api/a/b/c/d/e/",
        ],
    )
    def test_rejects_a_route_outside_a_named_api_or_ws_prefix(self, route: str):
        with pytest.raises(ValidationError, match="must be a lowercase prefix"):
            validate(routes=[route])

    @pytest.mark.parametrize(
        "route",
        ["/api/app/", "/api/app/sections", "/api/settings/", "/api/offline-map/x/", "/api/air/messages"],
    )
    def test_rejects_a_route_core_keeps(self, route: str):
        with pytest.raises(ValidationError, match="reserved for core"):
            validate(routes=[route])

    def test_rejects_a_repeated_route(self):
        with pytest.raises(ValidationError, match="must not repeat"):
            validate(routes=["/api/weather/", "/api/weather/"])

    def test_rejects_more_routes_than_the_limit(self):
        with pytest.raises(ValidationError):
            validate(routes=[f"/api/weather/r{index}/" for index in range(33)])

    @pytest.mark.parametrize("health", ["health", "//evil.example/health"])
    def test_rejects_a_health_check_that_is_not_a_path_on_the_service(self, health: str):
        with pytest.raises(ValidationError, match="health must be a path"):
            validate(health=health)

    @pytest.mark.parametrize(
        "remote_entry",
        [
            "/remotes/air/remoteEntry.js",
            "https://evil.example/remotes/weather/remoteEntry.js",
            "/remotes/weather/other.js",
        ],
    )
    def test_rejects_a_remote_entry_outside_its_own_remotes_directory(self, remote_entry: str):
        with pytest.raises(ValidationError, match="ui.remoteEntry must be /remotes/weather/remoteEntry.js"):
            validate(ui={"remoteEntry": remote_entry})


class TestHelpers:
    @pytest.mark.parametrize(
        ("route", "reserved"),
        [
            ("/api/app", True),
            ("/api/app/", True),
            ("/api/app/sections", True),
            ("/api/apps/", False),
            ("/api/air/", False),
            ("/api/air/messages/", True),
            ("/api/air/messagesx", False),
            ("/api/openapi.json", True),
        ],
    )
    def test_route_is_reserved_compares_whole_segments(self, route: str, reserved: bool):
        assert route_is_reserved(route) is reserved

    def test_remote_entry_path_is_under_the_service_id(self):
        assert remote_entry_path("sea") == "/remotes/sea/remoteEntry.js"
