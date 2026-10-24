"""Tests for the sdr-manager-local service as it runs: `service.py`, `contract_app.py`, `manifest.py`.

The SDR Manager API is mounted twice (the gateway never strips a prefix), it
must answer identically on both, carry the renamed `X-Sdr-Manager-*` headers
and `sdr_manager_session` cookie, keep serving while core is down, and publish
Sentinel's Location setting as this machine's position.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_service.py
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from backend.platform import settings_client
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.types import Message, Receive, Scope, Send

from sentinel_sdr_manager_local.api_version import MANAGEMENT_API_VERSION_HEADER
from sentinel_sdr_manager_local.contract_app import ReferrerPolicyMiddleware
from sentinel_sdr_manager_local.example_fixtures import SDR_MANAGER_LOCAL_VERSION
from sentinel_sdr_manager_local.manifest import GATEWAY_API_PREFIX, SERVICE_ID, manifest
from sentinel_sdr_manager_local.routers import events
from sentinel_sdr_manager_local.routers.config import EXPORT_FILENAME
from sentinel_sdr_manager_local.routers.devices import HOLDER_HEADER
from sentinel_sdr_manager_local.routers.sdrs import API_VERSION_HEADER as EXPORT_API_VERSION_HEADER
from sentinel_sdr_manager_local.services.console_auth import SESSION_COOKIE_NAME

PASSWORD = "a good long password"

# Answered identically by both mounts; their volatile timestamps are stripped first.
READ_ROUTES = ["/auth/state", "/health", "/status", "/devices", "/hotspot", "/config", "/v1/sdrs", "/sdrs"]
VOLATILE_KEYS = {"generated_at", "uptime_s"}


def _without_volatile(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _without_volatile(item) for key, item in value.items() if key not in VOLATILE_KEYS}
    if isinstance(value, list):
        return [_without_volatile(item) for item in value]
    return value


@pytest.fixture
def client(sdr_manager_local_app_factory: Callable[[], FastAPI]) -> Iterator[TestClient]:
    with TestClient(sdr_manager_local_app_factory(), raise_server_exceptions=False) as test_client:
        yield test_client


class TestTheRenamedContract:
    def test_names(self) -> None:
        assert MANAGEMENT_API_VERSION_HEADER == "X-Sdr-Manager-Api-Version"
        assert EXPORT_API_VERSION_HEADER == "X-Sdr-Manager-Sdr-Api-Version"
        assert HOLDER_HEADER == "X-Sdr-Manager-Reservation-Holder"
        assert SESSION_COOKIE_NAME == "sdr_manager_session"
        assert EXPORT_FILENAME == "sdr-manager-local-config.json"

    @pytest.mark.parametrize("prefix", ["/api", GATEWAY_API_PREFIX])
    def test_every_response_carries_the_api_version(self, client: TestClient, prefix: str) -> None:
        for route in ("/health", "/status", "/no-such-route"):
            response = client.get(prefix + route)
            assert response.headers[MANAGEMENT_API_VERSION_HEADER] == "1", route
            assert response.headers["referrer-policy"] == "no-referrer", route

    @pytest.mark.parametrize("prefix", ["/api", GATEWAY_API_PREFIX])
    def test_the_export_carries_its_own_version(self, client: TestClient, prefix: str) -> None:
        response = client.get(prefix + "/v1/sdrs")

        assert response.headers[EXPORT_API_VERSION_HEADER] == "1"
        assert response.json()["source"]["version"] == SDR_MANAGER_LOCAL_VERSION

    def test_the_session_cookie_is_named_for_sdr_manager_and_covers_both_mounts(self, client: TestClient) -> None:
        response = client.post("/api/auth/password", json={"new_password": PASSWORD})

        assert response.status_code == 204
        cookie = response.headers["set-cookie"]
        assert cookie.startswith(f"{SESSION_COOKIE_NAME}=")
        # Path=/ so a sign-in on one mount is a sign-in on the other.
        assert "Path=/" in cookie
        assert "sentry" not in cookie.lower()


class TestTwoMounts:
    def test_both_mounts_answer_every_read_identically(self, client: TestClient) -> None:
        for route in READ_ROUTES:
            manager = client.get("/api" + route)
            gateway = client.get(GATEWAY_API_PREFIX + route)

            assert manager.status_code == gateway.status_code == 200, route
            assert _without_volatile(manager.json()) == _without_volatile(gateway.json()), route

    def test_both_mounts_share_one_state(self, client: TestClient) -> None:
        client.post(f"{GATEWAY_API_PREFIX}/auth/password", json={"new_password": PASSWORD})
        client.cookies.clear()

        # The password set through the gateway's mount locks the managers' mount too…
        assert client.get("/api/status").status_code == 401
        assert client.get(f"{GATEWAY_API_PREFIX}/status").status_code == 401
        # …and a session from one mount opens the other.
        assert client.post("/api/auth/login", json={"password": PASSWORD}).status_code == 204
        assert client.get(f"{GATEWAY_API_PREFIX}/status").status_code == 200

    def test_the_gateway_mount_wins_over_the_shorter_one(self, client: TestClient) -> None:
        # Were `/api` matched first, this would look for a route
        # `/sdr-manager/local/health` in the API and 404.
        assert client.get(f"{GATEWAY_API_PREFIX}/health").status_code == 200

    def test_the_outer_health_is_cores_probe(self, client: TestClient) -> None:
        body = client.get("/health").json()

        assert body["service"] == SERVICE_ID
        assert body["status"] == "ok"
        assert MANAGEMENT_API_VERSION_HEADER not in client.get("/health").headers

    def test_the_schema_is_published_but_no_docs_pages(self, client: TestClient) -> None:
        assert client.get("/api/openapi.json").json()["info"]["title"] == "SDR Manager API"
        assert client.get("/api/docs").status_code == 404
        assert client.get("/api/redoc").status_code == 404

    def test_the_removed_location_routes_are_gone(self, client: TestClient) -> None:
        assert client.get("/api/location").status_code == 404
        assert client.put("/api/location", json={"latitude": 1, "longitude": 2}).status_code in {404, 405}


class TestServesBeforeCore:
    def test_answers_while_core_never_does(
        self, sdr_manager_local_app_factory: Callable[[], FastAPI], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The real wait (the suite's autouse fixture makes core always answer):
        # with core unreachable it never returns, and nothing must wait on it.
        monkeypatch.setattr("backend.platform.sdk.wait_for_core", settings_client.wait_for_core)
        monkeypatch.setattr(settings_client, "CORE_WAIT_RETRY_S", 0.01)
        app = sdr_manager_local_app_factory()

        with TestClient(app, raise_server_exceptions=False) as client:
            assert client.get("/api/health").status_code == 200
            assert client.get(f"{GATEWAY_API_PREFIX}/devices").status_code == 200
            assert client.get("/health").json()["registered"] is False
            assert app.state.registrar.registered is False


@pytest.fixture
def core_location(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Core answers `app.location` with whatever the test sets."""
    answer: dict[str, Any] = {"value": {"latitude": "54.95149", "longitude": "-1.53586"}}

    async def read_setting(_db: Any, namespace: str, key: str, default: Any = None) -> Any:
        assert (namespace, key) == ("app", "location")
        return answer["value"]

    monkeypatch.setattr(settings_client, "read_setting", read_setting)
    return answer


def _wait_for_location(client: TestClient) -> dict[str, Any]:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        location = client.get("/api/v1/sdrs").json()["source"]["location"]
        if location["latitude"] is not None:
            return location  # type: ignore[no-any-return]
        time.sleep(0.01)
    raise AssertionError("the location never arrived from core")


class TestPublishesSentinelsLocation:
    def test_on_the_export_status_and_both_mounts(self, core_location: dict[str, Any], client: TestClient) -> None:
        location = _wait_for_location(client)

        assert (location["latitude"], location["longitude"]) == (54.95149, -1.53586)
        for route in ("/api/status", f"{GATEWAY_API_PREFIX}/status", f"{GATEWAY_API_PREFIX}/v1/sdrs"):
            body = client.get(route).json()
            published = body["location"] if "location" in body else body["source"]["location"]
            assert (published["latitude"], published["longitude"]) == (54.95149, -1.53586), route

    def test_in_the_event_stream_snapshot(self, core_location: dict[str, Any], client: TestClient) -> None:
        _wait_for_location(client)
        container = client.app.state.contract_app.state.container  # type: ignore[attr-defined]

        async def first_two_frames() -> list[str]:
            stream = events._event_stream(
                container.device_registry,
                container.event_bus,
                container.health_service,
                container.clock,
                container.location_source,
                "sdr-host.lan",
            )
            frames = [await anext(stream), await anext(stream)]
            await stream.aclose()
            return frames

        retry, snapshot = client.portal.call(first_two_frames)  # type: ignore[union-attr]

        assert retry == "retry: 3000\n\n"
        assert snapshot.startswith("event: snapshot\n")
        assert '"latitude": 54.95149' in snapshot

    def test_a_setting_cleared_in_sentinel_stops_being_published(
        self, core_location: dict[str, Any], client: TestClient
    ) -> None:
        _wait_for_location(client)
        container = client.app.state.contract_app.state.container  # type: ignore[attr-defined]

        core_location["value"] = {"latitude": "", "longitude": ""}
        client.portal.call(container.location_source.refresh)  # type: ignore[union-attr]

        location = client.get("/api/v1/sdrs").json()["source"]["location"]
        assert (location["latitude"], location["longitude"]) == (None, None)


class TestConfigWithoutAPosition:
    def test_the_export_has_no_location_section(self, client: TestClient) -> None:
        exported = client.get("/api/config").json()

        assert "location" not in exported
        downloaded = client.get("/api/config/download")
        assert f'filename="{EXPORT_FILENAME}"' in downloaded.headers["content-disposition"]
        assert "location" not in downloaded.json()

    def test_a_file_with_a_location_section_is_refused(self, client: TestClient) -> None:
        file = {"version": 1, "location": {"latitude": 1, "longitude": 2}}

        response = client.post("/api/config", json={"config": file})

        assert response.status_code == 422
        assert any(error["loc"][-1] == "location" for error in response.json()["detail"])

    def test_apply_location_is_no_longer_an_option(self, client: TestClient) -> None:
        response = client.post("/api/config", json={"config": {"version": 1}, "apply_location": True})

        assert response.status_code == 422

    def test_an_import_reports_no_location_outcome(self, client: TestClient) -> None:
        result = client.post("/api/config", json={"config": {"version": 1}}).json()

        assert "location_applied" not in result
        assert "location_detail" not in result


class TestCors:
    def test_closed_by_default(self, client: TestClient) -> None:
        response = client.get("/api/health", headers={"Origin": "http://elsewhere.test"})

        assert "access-control-allow-origin" not in response.headers

    def test_opened_only_to_the_listed_origins(
        self, sdr_manager_local_app_factory: Callable[[], FastAPI], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SDR_MANAGER_LOCAL_CORS_ORIGINS", "http://dev.test:5173")
        from sentinel_sdr_manager_local.config import get_settings

        get_settings.cache_clear()
        with TestClient(sdr_manager_local_app_factory(), raise_server_exceptions=False) as client:
            allowed = client.get("/api/health", headers={"Origin": "http://dev.test:5173"})
            refused = client.get("/api/health", headers={"Origin": "http://elsewhere.test"})

        assert allowed.headers["access-control-allow-origin"] == "http://dev.test:5173"
        assert "access-control-allow-origin" not in refused.headers


async def test_the_referrer_middleware_passes_non_http_scopes_through_untouched() -> None:
    seen: list[str] = []

    async def inner(scope: Scope, _receive: Receive, _send: Send) -> None:
        seen.append(scope["type"])

    async def receive() -> Message:
        return {"type": "lifespan.startup"}

    async def send(_message: Message) -> None:
        raise AssertionError("nothing is sent for a lifespan scope here")

    await ReferrerPolicyMiddleware(inner)({"type": "lifespan"}, receive, send)

    assert seen == ["lifespan"]


class TestManifest:
    def test_routes_the_gateway_prefix_to_this_service(self) -> None:
        assert manifest.id == SERVICE_ID == "sdr-manager-local"
        assert manifest.kind == "sdr-manager-local"
        assert manifest.routes == [f"{GATEWAY_API_PREFIX}/"]
        assert manifest.health == "/health"

    def test_serves_its_own_ui_remote(self) -> None:
        # The THIS MACHINE group of Settings › SDR Manager.
        assert manifest.ui is not None
        assert manifest.ui.remote_entry == "/remotes/sdr-manager-local/remoteEntry.js"


def test_the_reported_version_is_sentinels() -> None:
    from backend.modules.manifest import SENTINEL_VERSION

    assert SDR_MANAGER_LOCAL_VERSION == SENTINEL_VERSION
