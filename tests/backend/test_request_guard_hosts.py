"""The DNS-rebinding defence: browsers only reach Sentinel under an allowed Host.

A page on a name an attacker owns, pointed at Sentinel's address, makes
requests whose Origin and Host agree, so the browser checks alone admit it.
These tests prove the Host check refuses it, admits IPs, localhost and the
names in SENTINEL_ALLOWED_HOSTS, and leaves Sentinel's own callers alone.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_hosts.py
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI, WebSocket
from starlette.datastructures import Headers
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.platform.security.access import AccessRules, qualifies
from backend.platform.security.hosts import (
    configured_allowed_hosts,
    host_is_allowed,
    normalise_host,
)
from backend.platform.security.install import install_request_guard
from backend.platform.security.policy import (
    DEFAULT_POLICY_PATH,
    GuardPolicy,
    read_policy,
)
from tests.backend.request_guard_helpers import (
    INTERNAL_ADDRESS,
    LAN_BROWSER_ADDRESS,
    OPERATOR_ADDRESS,
    SAME_ORIGIN_FETCH,
    minimal_policy_data,
    pin_guard_settings,
    write_policy,
)

ALLOWED_NAME = "sentinel.lan"
REBOUND_HOST = "evil.example:8080"


def host_checking_policy_data() -> dict[str, Any]:
    """The small test policy with the Host check on `page` and `browser`, as the shipped policy has it."""
    data = minimal_policy_data()
    for name in ("page", "browser"):
        data["access_classes"][name]["require_allowed_host"] = True
    return data


def request_headers(**values: str) -> Headers:
    """Case-insensitive request headers, as Starlette gives the middleware."""
    return Headers({name.replace("_", "-"): value for name, value in values.items()})


@pytest.fixture(autouse=True)
def _known_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    policy_file = write_policy(tmp_path, host_checking_policy_data())
    pin_guard_settings(
        monkeypatch,
        guard_policy_file=str(policy_file),
        sentinel_allowed_hosts=ALLOWED_NAME,
    )


class TestNormaliseHost:
    @pytest.mark.parametrize(
        ("host_header", "expected"),
        [
            ("sentinel.lan", "sentinel.lan"),
            ("sentinel.lan:8080", "sentinel.lan"),
            ("Sentinel.LAN:8080", "sentinel.lan"),
            ("sentinel.lan.:8080", "sentinel.lan"),
            (" sentinel.lan ", "sentinel.lan"),
            ("192.168.1.20:8080", "192.168.1.20"),
            ("[fe80::1]:8080", "fe80::1"),
            ("[::1]", "::1"),
        ],
    )
    def test_the_name_without_port_case_or_trailing_dot(
        self, host_header: str, expected: str
    ) -> None:
        assert normalise_host(host_header) == expected

    @pytest.mark.parametrize("host_header", ["", "   ", ":8080", ".", "[::1"])
    def test_nothing_usable_is_none(self, host_header: str) -> None:
        assert normalise_host(host_header) is None


class TestHostIsAllowed:
    @pytest.mark.parametrize(
        "host_header",
        [
            "192.168.1.20:8080",
            "10.0.0.5",
            "[fe80::1]:8080",
            "[::1]:8080",
            "127.0.0.1:8080",
        ],
    )
    def test_any_ip_address(self, host_header: str) -> None:
        # A rebinding attack needs a name: a browser sends an IP only when the user typed it.
        assert host_is_allowed(host_header, frozenset())

    @pytest.mark.parametrize(
        "host_header",
        ["localhost", "localhost:8080", "LOCALHOST:8080", "app.localhost:8080"],
    )
    def test_localhost_and_its_subdomains(self, host_header: str) -> None:
        assert host_is_allowed(host_header, frozenset())

    def test_a_listed_name_however_it_is_written(self) -> None:
        allowed = frozenset({ALLOWED_NAME})
        assert host_is_allowed("sentinel.lan:8080", allowed)
        assert host_is_allowed("SENTINEL.lan.:8080", allowed)

    @pytest.mark.parametrize(
        "host_header",
        [
            REBOUND_HOST,
            "sentinel.lan.evil.example",
            "notlocalhost:8080",
            "localhost.evil.example",
            "pi.local:8080",
        ],
    )
    def test_any_other_name_is_refused(self, host_header: str) -> None:
        assert not host_is_allowed(host_header, frozenset({ALLOWED_NAME}))

    @pytest.mark.parametrize("host_header", ["", ":8080", "[::1"])
    def test_a_missing_or_broken_host_is_refused(self, host_header: str) -> None:
        assert not host_is_allowed(host_header, frozenset({ALLOWED_NAME}))


class TestConfiguredAllowedHosts:
    def test_empty_is_no_names(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, sentinel_allowed_hosts="")
        assert configured_allowed_hosts() == frozenset()

    def test_names_are_normalised_and_blanks_dropped(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        pin_guard_settings(
            monkeypatch, sentinel_allowed_hosts=" Sentinel.LAN. , ,pi.local"
        )
        assert configured_allowed_hosts() == frozenset({"sentinel.lan", "pi.local"})

    @pytest.mark.parametrize(
        "entry",
        [
            "sentinel.lan:8080",
            "http://sentinel.lan",
            "sentinel.lan/app",
            "[::1]",
            ":8080",
            "user@sentinel.lan",
        ],
    )
    def test_anything_but_a_bare_name_is_an_error_naming_it(
        self, monkeypatch: pytest.MonkeyPatch, entry: str
    ) -> None:
        pin_guard_settings(monkeypatch, sentinel_allowed_hosts=f"pi.local,{entry}")
        with pytest.raises(ValueError, match="SENTINEL_ALLOWED_HOSTS") as error:
            configured_allowed_hosts()
        assert repr(entry) in str(error.value)

    def test_a_bad_entry_stops_the_rules_compiling(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # So a service refuses to start rather than silently locking the user out.
        pin_guard_settings(monkeypatch, sentinel_allowed_hosts="sentinel.lan:8080")
        with pytest.raises(ValueError, match="not a bare host name"):
            AccessRules(GuardPolicy.model_validate(host_checking_policy_data()), "core")


class TestCallerClasses:
    @pytest.fixture
    def rules(self) -> AccessRules:
        return AccessRules(
            GuardPolicy.model_validate(host_checking_policy_data()), "core"
        )

    def test_only_host_checking_classes_carry_the_names(
        self, rules: AccessRules
    ) -> None:
        assert rules.classes["page"].allowed_hosts == frozenset({ALLOWED_NAME})
        assert rules.classes["browser"].allowed_hosts == frozenset({ALLOWED_NAME})
        assert rules.classes["internal"].allowed_hosts == frozenset()

    def test_a_page_visitor_under_an_allowed_host(self, rules: AccessRules) -> None:
        for host in ("192.168.1.20:8080", "localhost:8080", "sentinel.lan:8080"):
            assert qualifies(
                rules.classes["page"],
                LAN_BROWSER_ADDRESS,
                request_headers(host=host),
                "GET",
            )

    def test_a_rebound_page_is_no_page_visitor(self, rules: AccessRules) -> None:
        assert not qualifies(
            rules.classes["page"],
            LAN_BROWSER_ADDRESS,
            request_headers(host=REBOUND_HOST),
            "GET",
        )

    def test_a_rebound_change_is_refused_although_its_origin_matches_its_host(
        self, rules: AccessRules
    ) -> None:
        # Exactly what the Origin check alone used to admit.
        rebound = request_headers(host=REBOUND_HOST, origin=f"http://{REBOUND_HOST}")
        assert not qualifies(
            rules.classes["browser"], LAN_BROWSER_ADDRESS, rebound, "PUT"
        )
        honest = request_headers(
            host="192.168.1.20:8080", origin="http://192.168.1.20:8080"
        )
        assert qualifies(rules.classes["browser"], LAN_BROWSER_ADDRESS, honest, "PUT")

    def test_a_rebound_request_is_refused_whatever_fetch_metadata_says(
        self, rules: AccessRules
    ) -> None:
        rebound = request_headers(
            host=REBOUND_HOST, **{"sec_fetch_site": "same-origin"}
        )
        assert not qualifies(
            rules.classes["browser"], LAN_BROWSER_ADDRESS, rebound, "GET"
        )

    def test_sentinels_own_processes_are_not_checked(self, rules: AccessRules) -> None:
        # Decoders and services call through `gateway:8080` and by container name.
        assert qualifies(
            rules.classes["internal"],
            INTERNAL_ADDRESS,
            request_headers(host="gateway:8080"),
            "GET",
        )
        with_credential = request_headers(host="app:8000", authorization="Bearer token")
        assert qualifies(
            rules.classes["service"], INTERNAL_ADDRESS, with_credential, "GET"
        )

    def test_the_operator_is_not_checked(self, rules: AccessRules) -> None:
        assert qualifies(
            rules.classes["operator"],
            OPERATOR_ADDRESS,
            request_headers(host="any.name"),
            "GET",
        )


class TestUnlistedHost:
    @pytest.fixture
    def rules(self) -> AccessRules:
        return AccessRules(
            GuardPolicy.model_validate(host_checking_policy_data()), "core"
        )

    def test_names_the_host_a_host_checking_rule_refused(
        self, rules: AccessRules
    ) -> None:
        rule = rules.rule_for("GET", "/api/things/1")
        assert (
            rules.unlisted_host(rule, request_headers(host=REBOUND_HOST))
            == "evil.example"
        )

    def test_keeps_an_unparsable_host_as_sent(self, rules: AccessRules) -> None:
        rule = rules.rule_for("GET", "/api/things/1")
        assert rules.unlisted_host(rule, request_headers(host="[::1")) == "[::1"

    def test_none_when_the_host_is_allowed(self, rules: AccessRules) -> None:
        rule = rules.rule_for("GET", "/api/things/1")
        assert (
            rules.unlisted_host(rule, request_headers(host="sentinel.lan:8080")) is None
        )

    def test_none_for_a_rule_whose_classes_dont_check_host(
        self, rules: AccessRules
    ) -> None:
        rule = rules.rule_for("GET", "/internal/ping")
        assert rules.unlisted_host(rule, request_headers(host=REBOUND_HOST)) is None

    def test_a_class_the_profile_doesnt_define_is_skipped(self) -> None:
        data = host_checking_policy_data()
        data["route_rules"].insert(
            0,
            {
                "paths": ["/api/both"],
                "methods": ["GET"],
                "access": ["internal", "page"],
            },
        )
        rules = AccessRules(GuardPolicy.model_validate(data), "core")
        del rules.classes["internal"]
        rule = rules.rule_for("GET", "/api/both")
        assert (
            rules.unlisted_host(rule, request_headers(host=REBOUND_HOST))
            == "evil.example"
        )


class TestShippedPolicy:
    def test_only_the_browser_facing_classes_check_host(self) -> None:
        classes = read_policy(DEFAULT_POLICY_PATH).access_classes
        checking = {
            name
            for name, definition in classes.items()
            if definition.require_allowed_host
        }
        assert checking == {"page", "browser"}


def build_app() -> FastAPI:
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

    install_request_guard(app, service_name="core")
    return app


@pytest.fixture
def client_from() -> Iterator[Any]:
    """`client_from(address)`: a started TestClient whose requests come from `address`."""
    clients: list[TestClient] = []
    app = build_app()

    def open_client(address: str) -> TestClient:
        client = TestClient(app, client=(address, 50000), raise_server_exceptions=False)
        client.__enter__()
        clients.append(client)
        return client

    yield open_client
    for client in clients:
        client.__exit__(None, None, None)


class TestThroughTheGuard:
    @pytest.mark.parametrize(
        "host",
        ["192.168.1.20:8080", "localhost:8080", "[fe80::1]:8080", "sentinel.lan:8080"],
    )
    def test_the_page_and_its_api_under_an_allowed_host(
        self, client_from: Any, host: str
    ) -> None:
        browser = client_from(LAN_BROWSER_ADDRESS)
        assert browser.get("/", headers={"host": host}).status_code == 200
        assert (
            browser.get(
                "/api/things/1", headers={"host": host, **SAME_ORIGIN_FETCH}
            ).status_code
            == 200
        )
        change = browser.put(
            "/api/things/1", headers={"host": host, "origin": f"http://{host}"}
        )
        assert change.status_code == 200

    def test_a_rebound_page_gets_a_404(self, client_from: Any) -> None:
        assert (
            client_from(LAN_BROWSER_ADDRESS)
            .get("/", headers={"host": REBOUND_HOST})
            .status_code
            == 404
        )

    def test_a_rebound_read_and_change_get_a_404(self, client_from: Any) -> None:
        browser = client_from(LAN_BROWSER_ADDRESS)
        rebound = {"host": REBOUND_HOST, "origin": f"http://{REBOUND_HOST}"}
        assert browser.get("/api/things/1", headers=rebound).status_code == 404
        assert browser.put("/api/things/1", headers=rebound).status_code == 404

    def test_a_rebound_websocket_is_refused(self, client_from: Any) -> None:
        browser = client_from(LAN_BROWSER_ADDRESS)
        rebound = {"host": REBOUND_HOST, "origin": f"http://{REBOUND_HOST}"}
        with (
            pytest.raises(WebSocketDisconnect),
            browser.websocket_connect("/ws/live", headers=rebound),
        ):
            pass

    def test_the_websocket_under_an_allowed_host(self, client_from: Any) -> None:
        browser = client_from(LAN_BROWSER_ADDRESS)
        allowed = {"host": "sentinel.lan:8080", "origin": "http://sentinel.lan:8080"}
        with browser.websocket_connect("/ws/live", headers=allowed) as socket:
            assert socket.receive_text() == "hello"

    def test_sentinels_processes_reach_their_routes_by_container_name(
        self, client_from: Any
    ) -> None:
        internal = client_from(INTERNAL_ADDRESS)
        assert internal.get("/health", headers={"host": "app:8000"}).status_code == 200
        credentialed = {"host": "gateway:8080", "authorization": "Bearer token"}
        assert internal.get("/internal/ping", headers=credentialed).status_code == 200

    def test_the_refusal_log_names_the_host_to_add(
        self, client_from: Any, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            client_from(LAN_BROWSER_ADDRESS).get("/", headers={"host": "pi.local:8080"})
        assert any(
            "route is for page; host 'pi.local' is not an IP, localhost or in SENTINEL_ALLOWED_HOSTS"
            in message
            for message in caplog.messages
        )

    def test_a_refusal_for_another_reason_doesnt_blame_the_host(
        self, client_from: Any, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            response = client_from(LAN_BROWSER_ADDRESS).get(
                "/internal/ping", headers={"host": REBOUND_HOST}
            )
        assert response.status_code == 404
        refusals = [
            message for message in caplog.messages if "guard access refused" in message
        ]
        assert refusals and all(
            "SENTINEL_ALLOWED_HOSTS" not in message for message in refusals
        )
