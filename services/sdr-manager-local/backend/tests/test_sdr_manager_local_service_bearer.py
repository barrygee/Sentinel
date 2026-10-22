"""Tests for the service bearer (`service_auth.py`) and where `require_console_session` accepts it (ADR 0007).

This Sentinel's own sdr-manager-remote manages these SDRs with its HTTP
credential instead of the console password. What must hold: that credential
opens every management route on a locked console, on both mounts; no other
caller's credential does, core's included; and a refused bearer is answered
exactly as a missing cookie is.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_service_bearer.py
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from backend.config import settings as backend_settings
from backend.platform import service_access
from backend.platform.nats_permissions import CORE_USER
from backend.platform.service_access import CallerAccess
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.backend.service_credentials_test_helpers import TOKENS, accept_callers, bearer

from sentinel_sdr_manager_local.service_auth import presents_service_bearer

PASSWORD = "a good long password"

MANAGEMENT_ROUTES = [
    pytest.param("/api/status", id="status"),
    pytest.param("/api/devices", id="devices"),
    pytest.param("/api/hotspot", id="hotspot"),
    pytest.param("/api/config", id="config"),
    pytest.param("/api/sdr-manager/local/status", id="status-gateway-mount"),
    pytest.param("/api/sdr-manager/local/devices", id="devices-gateway-mount"),
]
"""Both mounts: the gateway's (`/api/sdr-manager/local`) and other managers' (`/api`)."""


@pytest.fixture(autouse=True)
def accepted_callers(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """This process verifies every caller's credential, as service-credentials sets it up."""
    return accept_callers(monkeypatch, tmp_path)


@pytest.fixture
def locked(sdr_manager_local_app_factory: Callable[[], FastAPI]) -> Iterator[TestClient]:
    """A signed-out client against a console with a password set."""
    with TestClient(sdr_manager_local_app_factory(), raise_server_exceptions=False) as test_client:
        assert test_client.post("/api/auth/password", json={"new_password": PASSWORD}).status_code == 204
        test_client.post("/api/auth/logout")
        yield test_client


# ── presents_service_bearer ────────────────────────────────────────────────────


class TestPresentsServiceBearer:
    def test_sdr_manager_remotes_credential_is_accepted(self) -> None:
        assert presents_service_bearer(bearer("sdr-manager-remote")["Authorization"]) is True

    @pytest.mark.parametrize(
        "authorization",
        [
            pytest.param(None, id="no-header"),
            pytest.param("", id="empty-header"),
            pytest.param("Bearer ", id="empty-token"),
            pytest.param(f"Basic {TOKENS['sdr-manager-remote']}", id="another-scheme"),
            pytest.param(f"bearer {TOKENS['sdr-manager-remote']}", id="lower-case-scheme"),
            pytest.param("Bearer not-anyones-credential", id="unknown-token"),
        ],
    )
    def test_anything_but_a_bearer_credential_is_refused(self, authorization: str | None) -> None:
        assert presents_service_bearer(authorization) is False

    @pytest.mark.parametrize("caller", ["sdr", "radio", "air", "sdr-manager-local", "voice-decoder"])
    def test_another_callers_valid_credential_is_refused(self, caller: str) -> None:
        assert presents_service_bearer(bearer(caller)["Authorization"]) is False

    def test_cores_credential_is_refused(self) -> None:
        # Core passes every other `may_*` check; managing SDRs is deliberately not one.
        assert presents_service_bearer(bearer(CORE_USER)["Authorization"]) is False

    def test_the_grant_not_the_name_decides(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # The same credential, with `manages_local_sdrs` taken away, is refused:
        # proof the check reads the access table rather than the caller's name.
        monkeypatch.setitem(
            service_access.CALLER_ACCESS, "sdr-manager-remote", CallerAccess(registers_as="sdr-manager-remote")
        )

        assert presents_service_bearer(bearer("sdr-manager-remote")["Authorization"]) is False

    def test_refused_when_this_process_has_no_accepted_callers(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Outside Docker there is no list to check against, so nothing is trusted.
        monkeypatch.setattr(backend_settings, "accepted_callers_file", "")

        assert presents_service_bearer(bearer("sdr-manager-remote")["Authorization"]) is False

    def test_refused_when_the_accepted_callers_list_omits_it(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        accept_callers(monkeypatch, tmp_path, callers=["sdr"])

        assert presents_service_bearer(bearer("sdr-manager-remote")["Authorization"]) is False


# ── On the management routes ────────────────────────────────────────────────────


class TestOnALockedConsole:
    @pytest.mark.parametrize("route", MANAGEMENT_ROUTES)
    def test_the_service_bearer_opens_every_management_route(self, locked: TestClient, route: str) -> None:
        assert locked.get(route, headers=bearer("sdr-manager-remote")).status_code == 200

    @pytest.mark.parametrize("route", MANAGEMENT_ROUTES)
    def test_without_it_the_route_stays_locked(self, locked: TestClient, route: str) -> None:
        assert locked.get(route).status_code == 401

    @pytest.mark.parametrize("caller", ["sdr", CORE_USER])
    def test_another_callers_credential_is_answered_like_no_credential(self, locked: TestClient, caller: str) -> None:
        refused = locked.get("/api/status", headers=bearer(caller))
        anonymous = locked.get("/api/status")

        assert refused.status_code == 401
        assert refused.json() == anonymous.json()

    def test_the_bearer_does_not_sign_the_client_in(self, locked: TestClient) -> None:
        # It is checked per request and earns no session: the next request
        # without it is locked again.
        locked.get("/api/status", headers=bearer("sdr-manager-remote"))

        assert locked.get("/api/status").status_code == 401
        assert locked.get("/api/auth/state").json()["authenticated"] is False

    def test_the_bearer_cannot_change_the_password(self, locked: TestClient) -> None:
        # Password changes still need the current password, whoever is asking.
        response = locked.post(
            "/api/auth/password", json={"new_password": "another long password"}, headers=bearer("sdr-manager-remote")
        )

        assert response.status_code != 204
        assert locked.post("/api/auth/login", json={"password": PASSWORD}).status_code == 204

    def test_the_token_is_never_logged(self, locked: TestClient, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.DEBUG):
            locked.get("/api/status", headers=bearer("sdr-manager-remote"))
            locked.get("/api/status", headers=bearer("sdr"))

        assert TOKENS["sdr-manager-remote"] not in caplog.text
        assert TOKENS["sdr"] not in caplog.text
