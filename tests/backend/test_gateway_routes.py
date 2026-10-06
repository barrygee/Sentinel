"""The gateway routing table built from the registry (backend/core/gateway_routes.py).

Pins the longest-prefix order the gateway relies on, the Caddy JSON each route
becomes, and — against the monolith's real manifests — which service every
public path actually lands on (plan §4.4).
"""

import json

import pytest

from backend.core.gateway_routes import (
    CORE_SERVICE_ID,
    GatewayRoute,
    caddy_routes,
    routing_table,
)
from backend.core.service_registry import RegisteredService
from backend.modules import MANIFESTS
from backend.platform.service_manifest import RESERVED_ROUTE_PREFIXES, ServiceManifest

CORE_URL = "http://app:8000"


def make_registration(
    service_id: str = "weather",
    *,
    routes: list[str] | None = None,
    internal_url: str | None = None,
    ui: bool = False,
    available: bool = True,
) -> RegisteredService:
    body: dict = {
        "id": service_id,
        "kind": "section",
        "version": "0.1.0",
        "internalUrl": internal_url or f"http://{service_id}:8000",
        "routes": routes if routes is not None else [f"/api/{service_id}/"],
    }
    if ui:
        body["ui"] = {"remoteEntry": f"/remotes/{service_id}/remoteEntry.js"}
    return RegisteredService(
        manifest=ServiceManifest.model_validate(body),
        instance_id=f"{service_id}-1",
        in_process=False,
        registered_at_ms=0,
        available=available,
    )


def first_match(path: str, routes: list[dict]) -> int:
    """Index of the first Caddy route whose path matcher takes `path` — the gateway's choice."""
    for index, route in enumerate(routes):
        for pattern in route["match"][0]["path"]:
            if (pattern.endswith("*") and path.startswith(pattern[:-1])) or path == pattern:
                return index
    raise AssertionError(f"no route matches {path}")


class TestRoutingTable:
    def test_lists_every_core_reserved_prefix_for_core(self):
        table = routing_table([], CORE_URL)

        assert {route.prefix for route in table} == set(RESERVED_ROUTE_PREFIXES)
        assert all(route.service_id == CORE_SERVICE_ID for route in table)
        assert all(route.internal_url == CORE_URL and route.available for route in table)

    def test_orders_longest_prefix_first(self):
        table = routing_table(
            [
                make_registration("sdr", routes=["/api/sdr/"]),
                make_registration("radio-hub", routes=["/api/sdr/radios"]),
            ],
            CORE_URL,
        )

        lengths = [len(route.prefix) for route in table]
        assert lengths == sorted(lengths, reverse=True)
        prefixes = [route.prefix for route in table]
        assert prefixes.index("/api/sdr/radios") < prefixes.index("/api/sdr/")

    def test_core_keeps_a_tie_with_a_service_of_the_same_length(self):
        # "/api/settings" and "/api/weather1" are both 13 characters.
        assert len("/api/settings") == len("/api/weather1")
        table = routing_table([make_registration("weather", routes=["/api/weather1"])], CORE_URL)

        prefixes = [route.prefix for route in table]
        assert prefixes.index("/api/settings") < prefixes.index("/api/weather1")

    def test_adds_the_remote_prefix_only_for_a_service_with_a_ui(self):
        table = routing_table(
            [make_registration("sea", ui=True), make_registration("radio-hub", routes=["/api/sdr/radios"])],
            CORE_URL,
        )

        remote_routes = [route for route in table if route.prefix.startswith("/remotes/")]
        assert remote_routes == [GatewayRoute("/remotes/sea/", "sea", "http://sea:8000", True)]

    def test_carries_each_service_s_url_and_availability(self):
        table = routing_table([make_registration("weather", available=False)], CORE_URL)

        (weather,) = [route for route in table if route.service_id == "weather"]
        assert weather == GatewayRoute("/api/weather/", "weather", "http://weather:8000", False)


class TestCaddyRoutes:
    def test_a_directory_prefix_matches_everything_below_it(self):
        (route,) = caddy_routes([GatewayRoute("/api/sea/", "sea", "http://sea:8000", True)])

        assert route["match"] == [{"path": ["/api/sea/*"]}]

    def test_a_bare_prefix_matches_the_exact_path_and_below_it(self):
        (route,) = caddy_routes([GatewayRoute("/api/sdr/radios", "radio-hub", CORE_URL, True)])

        assert route["match"] == [{"path": ["/api/sdr/radios", "/api/sdr/radios/*"]}]

    def test_every_route_is_terminal(self):
        routes = caddy_routes(routing_table([make_registration()], CORE_URL))

        assert routes and all(route["terminal"] is True for route in routes)

    @pytest.mark.parametrize(
        ("internal_url", "dial"),
        [
            ("http://sea:8000", "sea:8000"),
            ("http://sea", "sea:80"),
            ("http://10.0.0.5:9000", "10.0.0.5:9000"),
        ],
    )
    def test_proxies_plain_http_to_the_host_and_port(self, internal_url, dial):
        (route,) = caddy_routes([GatewayRoute("/api/sea/", "sea", internal_url, True)])

        assert route["handle"] == [{"handler": "reverse_proxy", "upstreams": [{"dial": dial}]}]

    def test_proxies_https_over_tls_on_443_by_default(self):
        (route,) = caddy_routes([GatewayRoute("/api/sea/", "sea", "https://sea.example", True)])

        assert route["handle"] == [
            {
                "handler": "reverse_proxy",
                "upstreams": [{"dial": "sea.example:443"}],
                "transport": {"protocol": "http", "tls": {}},
            }
        ]

    def test_puts_a_service_s_base_path_back_in_front_of_the_request(self):
        (route,) = caddy_routes([GatewayRoute("/api/sea/", "sea", "http://host:8000/sea", True)])

        rewrite, proxy = route["handle"]
        assert rewrite == {"handler": "rewrite", "uri": "/sea{http.request.uri}"}
        assert proxy["upstreams"] == [{"dial": "host:8000"}]

    def test_an_unavailable_service_gets_a_json_503_without_a_dial(self):
        (route,) = caddy_routes([GatewayRoute("/api/sea/", "sea", "http://sea:8000", False)])

        (handler,) = route["handle"]
        assert handler["handler"] == "static_response"
        assert handler["status_code"] == 503
        assert handler["headers"]["Content-Type"] == ["application/json"]
        assert json.loads(handler["body"]) == {"detail": "sea is unavailable"}


class TestTheMonolithsRoutes:
    """Every public path, routed through the table the monolith's own manifests produce."""

    @pytest.fixture
    def table(self) -> list[GatewayRoute]:
        registrations = [
            RegisteredService(manifest=manifest, instance_id="core", in_process=True, registered_at_ms=0)
            for manifest in MANIFESTS
        ]
        return routing_table(registrations, CORE_URL)

    @pytest.mark.parametrize(
        ("path", "service_id"),
        [
            # Core's notifications sit inside Air's prefix and must stay core's.
            ("/api/air/messages", CORE_SERVICE_ID),
            ("/api/air/messages/stream", CORE_SERVICE_ID),
            ("/api/air/aircraft", "air"),
            # Air's Sentry dongle sits inside the SDR section's prefix (plan §4.4).
            ("/api/sdr/adsb/source", "air"),
            ("/api/sdr/radios", "radio-hub"),
            ("/api/sdr/radios/3", "radio-hub"),
            ("/api/sdr/connect", "radio-hub"),
            ("/api/sdr/status/3", "radio-hub"),
            ("/api/sdr/aprs/start", "radio-hub"),
            ("/api/sdr/ais/status/3", "radio-hub"),
            ("/api/sdr/decoders/register", "radio-hub"),
            ("/api/sdr/sentry-hosts/locations", "radio-hub"),
            ("/ws/sdr/3/iq", "radio-hub"),
            ("/api/sdr/groups", "sdr"),
            ("/api/sdr/data/bandplan", "sdr"),
            ("/api/space/tle/list", "space"),
            ("/api/sea/vessels", "sea"),
            ("/api/land/repeaters", "land"),
            ("/api/settings/app", CORE_SERVICE_ID),
            ("/api/app/sections", CORE_SERVICE_ID),
            ("/remotes/sea/remoteEntry.js", "sea"),
        ],
    )
    def test_each_path_reaches_its_owner(self, table, path, service_id):
        # caddy_routes keeps the table's order, so the index maps back to it.
        assert table[first_match(path, caddy_routes(table))].service_id == service_id

    def test_nothing_is_routed_under_internal(self, table):
        patterns = [pattern for route in caddy_routes(table) for pattern in route["match"][0]["path"]]
        assert patterns and not any(pattern.startswith("/internal") for pattern in patterns)
