"""Request body limits at the gateway (`gateway/caddy.json`, `gateway/radio-host-caddy.json`).

The request guard reads only `Content-Length`, so a chunked upload skips its
size checks. Caddy counts the bytes that actually arrive, which makes these
routes the real limit. Caddy applies a `request_body` handler only to the routes
after it, so each must come first.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.platform.security.policy import DEFAULT_POLICY_PATH, read_policy

GATEWAY_DIRECTORY = Path(__file__).resolve().parents[2] / "gateway"
GENERAL_LIMIT_BYTES = 16 * 1024 * 1024
RECORDING_PATH = "/api/sdr/recordings/stop"


def server_routes(config_name: str, server_name: str) -> list[dict]:
    config = json.loads((GATEWAY_DIRECTORY / config_name).read_text())
    return config["apps"]["http"]["servers"][server_name]["routes"]


def limit_of(route: dict) -> int:
    (handler,) = route["handle"]
    assert handler["handler"] == "request_body"
    return handler["max_size"]


def limit_for_path(routes: list[dict], request_path: str) -> list[int]:
    """Every limit that applies to `request_path`, following the two matcher shapes in use."""
    limits = []
    for route in routes:
        if route["handle"][0]["handler"] != "request_body":
            continue
        (matcher,) = route.get("match", [{}])
        if "path" in matcher and request_path not in matcher["path"]:
            continue
        if any(request_path in negated["path"] for negated in matcher.get("not", [])):
            continue
        limits.append(limit_of(route))
    return limits


class TestBrowserServer:
    def routes(self) -> list[dict]:
        return server_routes("caddy.json", "sentinel")

    def test_the_limits_come_before_every_other_route(self) -> None:
        assert [route["handle"][0]["handler"] for route in self.routes()[:2]] == [
            "request_body",
            "request_body",
        ]
        assert all(
            route["handle"][0]["handler"] != "request_body"
            for route in self.routes()[2:]
        )

    @pytest.mark.parametrize(
        "request_path",
        ["/api/settings/air", "/api/anything", "/", "/api/sdr/recordings"],
    )
    def test_an_ordinary_path_gets_exactly_the_general_limit(
        self, request_path: str
    ) -> None:
        assert limit_for_path(self.routes(), request_path) == [GENERAL_LIMIT_BYTES]

    def test_the_recording_upload_gets_exactly_one_larger_limit(self) -> None:
        guard_limit = (
            read_policy(DEFAULT_POLICY_PATH)
            .route_groups["recording_upload"]
            .max_request_bytes
        )

        assert limit_for_path(self.routes(), RECORDING_PATH) == [guard_limit]

    def test_neither_limit_stops_the_chain(self) -> None:
        assert not any(route.get("terminal") for route in self.routes()[:2])


@pytest.mark.parametrize(
    ("config_name", "server_name"),
    [("caddy.json", "service_entrypoint"), ("radio-host-caddy.json", "radio_host")],
)
class TestServiceServers:
    def test_the_first_route_limits_every_path(
        self, config_name: str, server_name: str
    ) -> None:
        first_route = server_routes(config_name, server_name)[0]

        assert "match" not in first_route
        assert limit_of(first_route) == GENERAL_LIMIT_BYTES

    def test_no_later_route_raises_it(self, config_name: str, server_name: str) -> None:
        later_handlers = [
            route["handle"][0]["handler"]
            for route in server_routes(config_name, server_name)[1:]
        ]

        assert "request_body" not in later_handlers


@pytest.mark.parametrize(
    ("config_name", "server_name"),
    [
        ("caddy.json", "sentinel"),
        ("caddy.json", "service_entrypoint"),
        ("radio-host-caddy.json", "radio_host"),
    ],
)
class TestAnOversizedBodyIsReportedAsOne:
    """Every gateway error used to reach the catch-all, so a body over the limit read as a 503."""

    def error_routes(self, config_name: str, server_name: str) -> list[dict]:
        config = json.loads((GATEWAY_DIRECTORY / config_name).read_text())
        return config["apps"]["http"]["servers"][server_name]["errors"]["routes"]

    def test_the_first_error_route_answers_413_for_a_413(
        self, config_name: str, server_name: str
    ) -> None:
        first_route = self.error_routes(config_name, server_name)[0]

        assert first_route["match"] == [
            {"expression": "{http.error.status_code} == 413"}
        ]
        assert first_route["handle"][0]["status_code"] == 413
        assert json.loads(first_route["handle"][0]["body"]) == {
            "detail": "Request body too large"
        }

    def test_every_other_error_still_answers_503(
        self, config_name: str, server_name: str
    ) -> None:
        last_route = self.error_routes(config_name, server_name)[-1]

        assert "match" not in last_route
        assert last_route["handle"][0]["status_code"] == 503
