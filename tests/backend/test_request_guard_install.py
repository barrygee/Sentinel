"""The request guard installed on an app, end to end: who gets in, who gets a 404.

A small app with the test policy, called from real addresses (TestClient's
`client`), over HTTP and WebSocket: every caller class admitted where its rule
says, refused everywhere else, and the refusals look like a missing route.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_install.py
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI, WebSocket
from guard import PureASGISecurityMiddleware, SecurityMiddleware, ip_ban_manager
from starlette.routing import Mount
from starlette.staticfiles import StaticFiles
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.platform.security import install as install_module
from backend.platform.security.access_middleware import AccessControlMiddleware, ServedRoutes
from backend.platform.security.install import STATUS_PATH, install_request_guard
from backend.platform.security.route_groups import RouteClassificationError
from backend.platform.security.route_inventory import RouteEntry
from tests.backend.request_guard_helpers import (
    INTERNAL_ADDRESS,
    INTERNET_ADDRESS,
    LAN_BROWSER_ADDRESS,
    OPERATOR_ADDRESS,
    SAME_ORIGIN_FETCH,
    minimal_policy_data,
    pin_guard_settings,
    write_policy,
)
from tests.backend.service_credentials_test_helpers import accept_callers, bearer


def build_app() -> FastAPI:
    """Every route the test policy has a rule for (FastAPI's own docs pages off: they have none)."""
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/internal/ping")
    async def internal_ping() -> dict[str, str]:
        return {"pong": "yes"}

    @app.get("/api/things/{thing_id}")
    async def read_thing(thing_id: str) -> dict[str, str]:
        return {"thing": thing_id}

    @app.put("/api/things/{thing_id}")
    async def save_thing(thing_id: str) -> dict[str, str]:
        return {"saved": thing_id}

    @app.websocket("/ws/live")
    async def live(websocket: WebSocket) -> None:
        await websocket.accept()
        await websocket.send_text("hello")
        await websocket.close()

    @app.get("/{full_path:path}")
    async def shell(full_path: str) -> dict[str, str]:
        return {"page": full_path}

    return app


@pytest.fixture
def policy_file(tmp_path: Path) -> Path:
    return write_policy(tmp_path)


@pytest.fixture(autouse=True)
def _guarded_settings(monkeypatch: pytest.MonkeyPatch, policy_file: Path) -> None:
    pin_guard_settings(monkeypatch, guard_policy_file=str(policy_file))


def guarded_app() -> FastAPI:
    app = build_app()
    install_request_guard(app, service_name="core")
    return app


@pytest.fixture
def client_from() -> Iterator[Any]:
    """`client_from(address)`: a started TestClient whose requests come from `address`."""
    clients: list[TestClient] = []
    app = guarded_app()

    def open_client(address: str) -> TestClient:
        client = TestClient(app, client=(address, 50000), raise_server_exceptions=False)
        client.__enter__()
        clients.append(client)
        return client

    yield open_client
    for client in clients:
        client.__exit__(None, None, None)


class TestBrowser:
    def test_the_spa_on_the_lan_gets_its_api(self, client_from: Any) -> None:
        response = client_from(LAN_BROWSER_ADDRESS).get("/api/things/7", headers=SAME_ORIGIN_FETCH)

        assert (response.status_code, response.json()) == (200, {"thing": "7"})

    def test_over_plain_http_no_coop_or_coep_but_the_other_security_headers(self, client_from: Any) -> None:
        served = client_from(LAN_BROWSER_ADDRESS).get("/api/things/7", headers=SAME_ORIGIN_FETCH)
        refused = client_from(INTERNET_ADDRESS).get("/api/things/7", headers=SAME_ORIGIN_FETCH)

        for response in (served, refused):
            assert "cross-origin-opener-policy" not in response.headers
            assert "cross-origin-embedder-policy" not in response.headers
            assert response.headers["cross-origin-resource-policy"] == "same-origin"
            assert response.headers["x-content-type-options"] == "nosniff"
        assert (served.status_code, refused.status_code) == (200, 404)

    def test_over_https_coop_and_coep_are_sent(self, monkeypatch: pytest.MonkeyPatch, policy_file: Path) -> None:
        pin_guard_settings(monkeypatch, guard_policy_file=str(policy_file), guard_enforce_https=True)
        app = build_app()
        install_request_guard(app, service_name="core")
        with TestClient(app, base_url="https://testserver", client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            response = client.get("/api/things/7", headers=SAME_ORIGIN_FETCH)

        assert response.status_code == 200
        assert response.headers["cross-origin-opener-policy"] == "same-origin"
        assert response.headers["cross-origin-embedder-policy"] == "require-corp"

    def test_the_spa_over_plain_http_reads_its_api(self, client_from: Any) -> None:
        # Browsers send Fetch Metadata only to secure origins, and no Origin on a read.
        response = client_from(LAN_BROWSER_ADDRESS).get("/api/things/7")

        assert (response.status_code, response.json()) == (200, {"thing": "7"})

    def test_the_spa_over_plain_http_changes_things_with_its_origin(self, client_from: Any) -> None:
        response = client_from(LAN_BROWSER_ADDRESS).put("/api/things/7", headers={"origin": "http://testserver"})

        assert response.status_code == 200

    def test_a_change_without_fetch_metadata_or_origin_gets_a_404(self, client_from: Any) -> None:
        response = client_from(LAN_BROWSER_ADDRESS).put("/api/things/7")

        assert (response.status_code, response.json()) == (404, {"detail": "Not Found"})
        assert response.headers["cache-control"] == "no-store"

    def test_another_site_over_plain_http_gets_a_404(self, client_from: Any) -> None:
        response = client_from(LAN_BROWSER_ADDRESS).put("/api/things/7", headers={"origin": "http://evil.example"})

        assert response.status_code == 404

    def test_another_site_driving_the_browser_gets_a_404(self, client_from: Any) -> None:
        response = client_from(LAN_BROWSER_ADDRESS).put("/api/things/7", headers={"sec-fetch-site": "cross-site"})

        assert response.status_code == 404

    def test_the_internet_gets_a_404_even_with_browser_headers(self, client_from: Any) -> None:
        assert client_from(INTERNET_ADDRESS).get("/api/things/7", headers=SAME_ORIGIN_FETCH).status_code == 404

    def test_the_internet_cant_open_the_page_either(self, client_from: Any) -> None:
        assert client_from(INTERNET_ADDRESS).get("/").status_code == 404

    def test_a_lan_visitor_opens_the_page(self, client_from: Any) -> None:
        assert client_from(LAN_BROWSER_ADDRESS).get("/settings/app").json() == {"page": "settings/app"}

    def test_a_method_no_rule_names_gets_a_404_not_a_405(self, client_from: Any) -> None:
        # Probing can't tell a refused route from a missing one.
        assert client_from(LAN_BROWSER_ADDRESS).delete("/api/things/7", headers=SAME_ORIGIN_FETCH).status_code == 404


class TestInternalAndOperator:
    def test_health_for_sentinels_processes(self, client_from: Any) -> None:
        assert client_from(INTERNAL_ADDRESS).get("/health").status_code == 200

    def test_health_for_the_operator(self, client_from: Any) -> None:
        assert client_from(OPERATOR_ADDRESS).get("/health").status_code == 200

    def test_health_refused_to_a_browser(self, client_from: Any) -> None:
        assert client_from(LAN_BROWSER_ADDRESS).get("/health", headers=SAME_ORIGIN_FETCH).status_code == 404

    def test_an_internal_route_needs_the_credential_header(self, client_from: Any) -> None:
        internal = client_from(INTERNAL_ADDRESS)

        assert internal.get("/internal/ping").status_code == 404
        assert internal.get("/internal/ping", headers={"Authorization": "Bearer anything"}).status_code == 200

    def test_a_credential_header_from_the_lan_gets_a_404(self, client_from: Any) -> None:
        response = client_from(LAN_BROWSER_ADDRESS).get("/internal/ping", headers={"Authorization": "Bearer x"})

        assert response.status_code == 404

    def test_a_client_cant_claim_an_internal_address(self, client_from: Any) -> None:
        # No proxy is trusted here, so X-Forwarded-For is ignored.
        response = client_from(LAN_BROWSER_ADDRESS).get("/health", headers={"X-Forwarded-For": INTERNAL_ADDRESS})

        assert response.status_code == 404

    def test_only_the_trusted_gateway_may_say_who_the_client_is(self, monkeypatch: pytest.MonkeyPatch) -> None:
        gateway = "172.28.0.2"
        pin_guard_settings(monkeypatch, guard_policy_file=str(Path(str(install_module.settings.guard_policy_file))))
        monkeypatch.setattr(install_module.settings, "guard_trusted_proxies", gateway)
        with TestClient(guarded_app(), client=(gateway, 50000), raise_server_exceptions=False) as through_gateway:
            browser = through_gateway.get(
                "/api/things/1", headers={**SAME_ORIGIN_FETCH, "X-Forwarded-For": LAN_BROWSER_ADDRESS}
            )
            internet = through_gateway.get(
                "/api/things/1", headers={**SAME_ORIGIN_FETCH, "X-Forwarded-For": INTERNET_ADDRESS}
            )

        assert (browser.status_code, internet.status_code) == (200, 404)


class TestRefusalModes:
    def test_log_mode_lets_a_refused_caller_through_and_says_so(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setattr(install_module.settings, "guard_access_enforcement", "log")
        with (
            caplog.at_level(logging.WARNING, logger="sentinel.guard"),
            TestClient(guarded_app(), client=(LAN_BROWSER_ADDRESS, 50000)) as client,
        ):
            response = client.get("/health")

        assert response.status_code == 200
        assert "guard access would refuse: GET /health from 192.168.1.50 (route is for internal, operator)" in (
            caplog.messages
        )

    def test_passive_mode_refuses_nothing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(install_module.settings, "guard_passive_mode", True)
        with TestClient(guarded_app(), client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            assert client.get("/health").status_code == 200

    def test_a_refusal_with_no_rule_says_so(self, client_from: Any, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            client_from(LAN_BROWSER_ADDRESS).delete("/api/things/7", headers=SAME_ORIGIN_FETCH)

        assert any("no rule covers this route" in message for message in caplog.messages)


class TestFastapiGuardChecks:
    def test_a_group_rate_limit_answers_429_as_json(self, client_from: Any) -> None:
        # The test policy's `health` group allows 5 a minute. Sentinel's own
        # network is exempt from limits by default, so call from the operator's.
        operator = client_from(OPERATOR_ADDRESS)
        responses = [operator.get("/health") for _ in range(6)]
        statuses = [response.status_code for response in responses]

        assert statuses[0] == 200
        assert statuses[-1] == 429
        # Admitted until the limit, refused from then on.
        assert statuses == sorted(statuses)
        assert set(statuses) == {200, 429}
        assert "detail" in responses[-1].json()
        assert responses[-1].headers["retry-after"]

    def test_sentinels_own_processes_are_exempt_from_limits(self, client_from: Any) -> None:
        internal = client_from(INTERNAL_ADDRESS)

        assert {internal.get("/health").status_code for _ in range(8)} == {200}

    def test_an_injection_attempt_is_refused(self, client_from: Any) -> None:
        response = client_from(LAN_BROWSER_ADDRESS).get(
            "/api/things/7", params={"q": "1' UNION SELECT password FROM users--"}, headers=SAME_ORIGIN_FETCH
        )

        assert response.status_code == 400
        assert "detail" in response.json()

    def test_a_lan_address_in_a_settings_write_is_not_an_attack(self, client_from: Any) -> None:
        # Sentinel's settings hold LAN URLs; SSRF scanning would refuse them.
        response = client_from(LAN_BROWSER_ADDRESS).put(
            "/api/things/7",
            params={"url": "http://192.168.1.30:8000"},
            headers={**SAME_ORIGIN_FETCH, "Referer": "http://localhost:8080/settings"},
        )

        assert response.status_code == 200

    def test_a_blocklisted_address_is_refused_before_access(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(install_module.settings, "guard_ip_blocklist", LAN_BROWSER_ADDRESS)
        with TestClient(guarded_app(), client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            response = client.get("/api/things/7", headers=SAME_ORIGIN_FETCH)

        assert response.status_code == 403
        assert response.headers["content-type"] == "application/json"


class TestWebSockets:
    def test_the_spa_opens_its_socket(self, client_from: Any) -> None:
        with client_from(LAN_BROWSER_ADDRESS).websocket_connect("/ws/live", headers=SAME_ORIGIN_FETCH) as socket:
            assert socket.receive_text() == "hello"

    def test_a_refused_handshake_is_closed_before_accept(self, client_from: Any) -> None:
        with pytest.raises(WebSocketDisconnect) as closed:
            with client_from(LAN_BROWSER_ADDRESS).websocket_connect("/ws/live"):
                pass

        assert closed.value.code == 1008

    def test_another_site_cant_open_it(self, client_from: Any) -> None:
        with pytest.raises(WebSocketDisconnect):
            with client_from(LAN_BROWSER_ADDRESS).websocket_connect(
                "/ws/live", headers={"origin": "http://evil.example", "host": "sentinel.lan"}
            ):
                pass

    def test_fastapi_guards_own_checks_run_on_the_handshake(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(install_module.settings, "guard_ip_blocklist", LAN_BROWSER_ADDRESS)
        with TestClient(guarded_app(), client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            with pytest.raises(WebSocketDisconnect):
                with client.websocket_connect("/ws/live", headers=SAME_ORIGIN_FETCH):
                    pass

    def test_passive_mode_logs_a_handshake_it_would_close(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setattr(install_module.settings, "guard_ip_blocklist", LAN_BROWSER_ADDRESS)
        monkeypatch.setattr(install_module.settings, "guard_passive_mode", True)
        with (
            caplog.at_level(logging.WARNING, logger="sentinel.guard"),
            TestClient(guarded_app(), client=(LAN_BROWSER_ADDRESS, 50000)) as client,
            client.websocket_connect("/ws/live", headers=SAME_ORIGIN_FETCH) as socket,
        ):
            assert socket.receive_text() == "hello"

        assert any(message.startswith("guard would close websocket /ws/live") for message in caplog.messages)


class TestStatusRoute:
    def test_answers_a_service_with_its_credential(
        self, client_from: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        accept_callers(monkeypatch, tmp_path)

        response = client_from(INTERNAL_ADDRESS).get(STATUS_PATH, headers=bearer("space"))

        assert response.status_code == 200
        assert response.json() == {
            "profile": "core",
            "passive_mode": False,
            "access_enforcement": "enforce",
            "shared_state": False,
            "emergency_mode": False,
            "https_enforced": False,
            "countries_configured": False,
            "clouds_blocked": [],
        }

    def test_refuses_a_wrong_credential(
        self, client_from: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        accept_callers(monkeypatch, tmp_path)

        response = client_from(INTERNAL_ADDRESS).get(STATUS_PATH, headers={"Authorization": "Bearer wrong"})

        assert response.status_code == 401

    def test_refuses_a_credential_without_the_bearer_prefix(
        self, client_from: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        accept_callers(monkeypatch, tmp_path)
        token = bearer("space")["Authorization"].removeprefix("Bearer ")

        assert client_from(INTERNAL_ADDRESS).get(STATUS_PATH, headers={"Authorization": token}).status_code == 401

    def test_is_off_where_no_callers_are_accepted(self, client_from: Any) -> None:
        response = client_from(INTERNAL_ADDRESS).get(STATUS_PATH, headers=bearer("space"))

        assert response.status_code == 503

    def test_is_a_404_to_a_browser(self, client_from: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        accept_callers(monkeypatch, tmp_path)

        response = client_from(LAN_BROWSER_ADDRESS).get(STATUS_PATH, headers={**bearer("space"), **SAME_ORIGIN_FETCH})

        assert response.status_code == 404


class TestInstall:
    def test_disabled_adds_nothing(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        monkeypatch.setattr(install_module.settings, "guard_enabled", False)
        app = build_app()

        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            install_request_guard(app, service_name="core")

        assert app.user_middleware == []
        assert STATUS_PATH not in {getattr(route, "path", None) for route in app.routes}
        assert "GUARD_ENABLED=false" in caplog.text

    def test_fastapi_guard_outside_the_access_layer(self) -> None:
        # Starlette runs the last-added middleware first.
        app = guarded_app()

        assert [middleware.cls for middleware in app.user_middleware] == [SecurityMiddleware, AccessControlMiddleware]
        assert app.state.guard_decorator is not None

    def test_the_streaming_middleware_when_the_profile_asks(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        data = minimal_policy_data()
        data["defaults"]["middleware"] = "pure_asgi"
        pin_guard_settings(monkeypatch, guard_policy_file=str(write_policy(tmp_path, data)))

        assert guarded_app().user_middleware[0].cls is PureASGISecurityMiddleware

    def test_behaviour_tracking_is_made_fail_open(self, monkeypatch: pytest.MonkeyPatch) -> None:
        wrapped: list[Any] = []
        monkeypatch.setattr(install_module, "make_behavior_tracking_fail_open", wrapped.append)

        app = guarded_app()

        assert wrapped == [app.state.guard_decorator.behavior_tracker]

    def test_not_when_redis_failures_should_refuse(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        data = minimal_policy_data()
        data["defaults"]["redis_fail_open"] = False
        pin_guard_settings(monkeypatch, guard_policy_file=str(write_policy(tmp_path, data)))
        wrapped: list[Any] = []
        monkeypatch.setattr(install_module, "make_behavior_tracking_fail_open", wrapped.append)

        guarded_app()

        assert wrapped == []

    def test_an_unclassified_route_stops_startup(self) -> None:
        app = build_app()

        @app.post("/api/brand-new")
        async def brand_new() -> None:
            return None

        install_request_guard(app, service_name="core")

        with pytest.raises(RouteClassificationError, match="POST /api/brand-new"):
            with TestClient(app):
                pass

    def test_a_route_mounted_after_install_is_still_checked(self) -> None:
        # sdr-manager-local mounts its API after create_service() returns.
        app = guarded_app()
        late = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

        @late.get("/late")
        async def late_route() -> None:
            return None

        app.mount("/mounted", late)

        with pytest.raises(RouteClassificationError, match="GET /mounted/late"):
            with TestClient(app):
                pass

    def test_an_unknown_profile_stops_install(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(install_module.settings, "guard_profile", "nowhere")

        with pytest.raises(KeyError, match="nowhere"):
            guarded_app()

    def test_the_apps_own_lifespan_still_runs(self) -> None:
        events: list[str] = []
        app = build_app()

        @app.on_event("startup")
        async def started() -> None:
            events.append("started")

        install_request_guard(app, service_name="core")
        with TestClient(app):
            pass

        assert events == ["started"]

    def test_the_status_route_comes_before_a_catch_all(self) -> None:
        # Core's SPA catch-all is registered before the guard is installed.
        paths = [getattr(route, "path", None) for route in guarded_app().routes]

        assert paths.index(STATUS_PATH) < paths.index("/{full_path:path}")


@pytest.fixture
def no_bans() -> Iterator[None]:
    """fastapi-guard keeps one ban manager per process: start and end each test with none."""
    ip_ban_manager.banned_ips.clear()
    ip_ban_manager.banned_networks = []
    yield
    ip_ban_manager.banned_ips.clear()
    ip_ban_manager.banned_networks = []


def scanner_rule_app(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, *, serve_puts: bool = True) -> FastAPI:
    """The test app under a strict scanner rule: 3 404s in a minute bans for an hour.

    Sentinel's own network isn't exempt here, so only the ban rules can keep it unbanned.
    """
    data = minimal_policy_data()
    data["defaults"]["behavior_rules"] = [
        {
            "type": "return_pattern",
            "pattern": "status:404",
            "threshold": 3,
            "window_seconds": 60,
            "action": "ban",
            "ban_duration_seconds": 3600,
        }
    ]
    pin_guard_settings(monkeypatch, guard_policy_file=str(write_policy(tmp_path, data)), guard_exempt_ips="192.0.2.1")
    app = build_app()
    if not serve_puts:
        app.router.routes = [route for route in app.router.routes if "PUT" not in getattr(route, "methods", set())]
    install_request_guard(app, service_name="core")
    return app


@pytest.mark.usefixtures("no_bans")
class TestRestartsBanNobody:
    def test_a_route_served_by_another_service_is_a_503(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        # While the gateway catches up after core restarts, a request can land
        # on a service that doesn't serve it.
        app = scanner_rule_app(monkeypatch, tmp_path, serve_puts=False)
        with TestClient(app, client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            response = client.put("/api/things/7", headers=SAME_ORIGIN_FETCH)

        assert response.status_code == 503
        assert response.json() == {"detail": "This route's service is unavailable; try again shortly"}
        assert (response.headers["retry-after"], response.headers["cache-control"]) == ("5", "no-store")

    def test_a_browser_polling_through_a_route_gap_is_not_banned(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        app = scanner_rule_app(monkeypatch, tmp_path, serve_puts=False)
        with TestClient(app, client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            statuses = {client.put("/api/things/7", headers=SAME_ORIGIN_FETCH).status_code for _ in range(10)}
            afterwards = client.get("/api/things/7", headers=SAME_ORIGIN_FETCH)

        assert statuses == {503}
        assert afterwards.status_code == 200

    def test_sentinels_own_process_is_never_banned_even_for_real_404s(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        with TestClient(scanner_rule_app(monkeypatch, tmp_path), client=(INTERNAL_ADDRESS, 50000)) as client:
            statuses = {client.post("/no-such-route").status_code for _ in range(10)}
            afterwards = client.get("/health")

        assert statuses == {404}
        assert afterwards.status_code == 200
        assert INTERNAL_ADDRESS not in ip_ban_manager.banned_ips

    def test_a_client_repeating_404s_is_still_banned(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        # fastapi-guard counts a 404 rule per path, so the repeats are on one.
        with TestClient(scanner_rule_app(monkeypatch, tmp_path), client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            probes = [client.post("/no-such-route").status_code for _ in range(4)]
            afterwards = client.get("/api/things/7", headers=SAME_ORIGIN_FETCH)

        assert probes[:3] == [404, 404, 404]
        assert afterwards.status_code == 403
        assert LAN_BROWSER_ADDRESS in ip_ban_manager.banned_ips

    def test_a_route_the_app_serves_still_answers_normally(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        with TestClient(scanner_rule_app(monkeypatch, tmp_path), client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            assert client.put("/api/things/7", headers=SAME_ORIGIN_FETCH).json() == {"saved": "7"}

    def test_a_catch_all_serves_whatever_it_matches(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        # Core's SPA catch-all answers any GET, so core never says 503 for one.
        app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

        @app.get("/health")
        async def health() -> dict[str, str]:
            return {"status": "ok"}

        @app.get("/{full_path:path}")
        async def shell(full_path: str) -> dict[str, str]:
            return {"page": full_path}

        pin_guard_settings(monkeypatch, guard_policy_file=str(write_policy(tmp_path)))
        install_request_guard(app, service_name="core")
        with TestClient(app, client=(LAN_BROWSER_ADDRESS, 50000)) as client:
            response = client.get("/api/things/7", headers=SAME_ORIGIN_FETCH)

        assert (response.status_code, response.json()) == (200, {"page": "api/things/7"})


class TestServedRoutes:
    def test_until_routes_are_known_everything_counts_as_served(self) -> None:
        assert ServedRoutes().serves("DELETE", "/anything")

    def test_head_counts_as_get(self) -> None:
        served = ServedRoutes()
        served.learn([RouteEntry("GET", "/api/things/{thing_id}", None)])

        assert served.serves("HEAD", "/api/things/7")
        assert not served.serves("PUT", "/api/things/7")
        assert not served.serves("GET", "/api/other")


@pytest.mark.usefixtures("no_bans")
class TestStaticFilesArentRateLimited:
    """A page load fetches about a hundred bundle files; they mustn't spend the client's request budget.

    fastapi-guard's rate counter is per process, so each test calls from an
    address no other test uses.
    """

    def static_app(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> FastAPI:
        (tmp_path / "files").mkdir()
        (tmp_path / "files" / "bundle.js").write_text("export {}", encoding="utf-8")
        data = minimal_policy_data()
        data["defaults"]["rate_limit"] = {"requests": 5, "window_seconds": 60}
        data["defaults"]["auto_ban"] = {"count_rate_limit_violations": False}
        data["route_groups"]["spa_shell"] = {"description": "the bundle", "bypass": ["rate_limit"]}
        data["route_rules"].insert(
            0, {"paths": ["/spa-assets/**"], "methods": ["GET"], "access": ["page"], "group": "spa_shell"}
        )
        pin_guard_settings(
            monkeypatch, guard_policy_file=str(write_policy(tmp_path, data)), guard_exempt_ips="192.0.2.1"
        )
        app = build_app()
        app.router.routes.insert(0, Mount("/spa-assets", StaticFiles(directory=tmp_path / "files")))
        install_request_guard(app, service_name="core")
        return app

    def test_the_bundle_isnt_counted(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        with TestClient(self.static_app(monkeypatch, tmp_path), client=("192.168.77.10", 50000)) as client:
            statuses = {client.get("/spa-assets/bundle.js").status_code for _ in range(20)}

        assert statuses == {200}

    def test_the_api_still_is(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        with TestClient(self.static_app(monkeypatch, tmp_path), client=("192.168.77.11", 50000)) as client:
            statuses = [client.get("/api/things/1", headers=SAME_ORIGIN_FETCH).status_code for _ in range(8)]

        assert statuses[0] == 200
        assert statuses[-1] == 429


class TestScanningOnlyWhereInputEnters:
    """Detection off by default, on for a group: a read isn't scanned, a write in that group is."""

    def app(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> FastAPI:
        data = minimal_policy_data()
        data["defaults"]["detection"] = {"enabled": False}
        data["route_groups"]["settings_write"]["detection"] = {"enabled": True}
        pin_guard_settings(monkeypatch, guard_policy_file=str(write_policy(tmp_path, data)))
        return guarded_app()

    injection = {"q": "1' UNION SELECT password FROM users--"}

    def test_a_read_isnt_scanned(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        with TestClient(self.app(monkeypatch, tmp_path), client=("192.168.78.10", 50000)) as client:
            response = client.get("/api/things/7", params=self.injection, headers=SAME_ORIGIN_FETCH)

        assert response.status_code == 200

    def test_a_write_in_a_scanned_group_is(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        with TestClient(self.app(monkeypatch, tmp_path), client=("192.168.78.11", 50000)) as client:
            response = client.put("/api/things/7", params=self.injection, headers=SAME_ORIGIN_FETCH)

        assert response.status_code == 400


@pytest.mark.usefixtures("no_bans")
class TestScannerUserAgents:
    """Sentinel's access layer refuses scanning tools by a word in their User-Agent."""

    def app(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, **settings: object) -> FastAPI:
        data = minimal_policy_data()
        data["defaults"]["blocked_user_agents"] = ["sqlmap", "nikto"]
        pin_guard_settings(monkeypatch, guard_policy_file=str(write_policy(tmp_path, data)), **settings)
        return guarded_app()

    @pytest.mark.parametrize("user_agent", ["sqlmap/1.7.2#stable (https://sqlmap.org)", "Mozilla/5.00 (Nikto/2.5.0)"])
    def test_a_scanner_is_refused_whatever_the_case(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, user_agent: str
    ) -> None:
        with TestClient(self.app(monkeypatch, tmp_path), client=("192.168.79.10", 50000)) as client:
            response = client.get("/api/things/7", headers={**SAME_ORIGIN_FETCH, "User-Agent": user_agent})

        assert (response.status_code, response.json()) == (403, {"detail": "Forbidden"})
        assert response.headers["cache-control"] == "no-store"

    def test_a_browser_is_not(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        with TestClient(self.app(monkeypatch, tmp_path), client=("192.168.79.11", 50000)) as client:
            response = client.get(
                "/api/things/7", headers={**SAME_ORIGIN_FETCH, "User-Agent": "Mozilla/5.0 (Macintosh) Chrome/154.0"}
            )

        assert response.status_code == 200

    def test_sentinels_own_network_is_exempt(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        with TestClient(self.app(monkeypatch, tmp_path), client=(INTERNAL_ADDRESS, 50000)) as client:
            response = client.get("/health", headers={"User-Agent": "sqlmap/1.7"})

        assert response.status_code == 200

    def test_passive_mode_logs_and_lets_it_through(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        with (
            caplog.at_level(logging.WARNING, logger="sentinel.guard"),
            TestClient(
                self.app(monkeypatch, tmp_path, guard_passive_mode=True), client=("192.168.79.12", 50000)
            ) as client,
        ):
            response = client.get("/api/things/7", headers={**SAME_ORIGIN_FETCH, "User-Agent": "sqlmap/1.7"})

        assert response.status_code == 200
        assert (
            "guard would block: GET /api/things/7 from 192.168.79.12 (user_agent: a scanning tool)" in caplog.messages
        )

    def test_a_scanners_websocket_is_closed(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        with TestClient(self.app(monkeypatch, tmp_path), client=("192.168.79.13", 50000)) as client:
            with pytest.raises(WebSocketDisconnect) as closed:
                with client.websocket_connect("/ws/live", headers={**SAME_ORIGIN_FETCH, "User-Agent": "nikto"}):
                    pass

        assert closed.value.code == 1008
