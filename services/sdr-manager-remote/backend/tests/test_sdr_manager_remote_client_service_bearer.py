"""Tests for the client's service-bearer mode and `client_for_host` (ADR 0007).

This machine's own sdr-manager-local takes sdr-manager-remote's HTTP credential
as a bearer, so its row (`auth_mode='service'`) gets a client that presents it
on every request and never signs in. Every other row keeps the console
password. No network: requests go through an `httpx.MockTransport`.
"""

from __future__ import annotations

import httpx
import pytest
from backend.config import settings
from tests.backend.service_credentials_test_helpers import TOKENS, bearer, present_credential

from sentinel_sdr_manager_remote.models import AUTH_MODE_PASSWORD, AUTH_MODE_SERVICE, RemoteSdrHost
from sentinel_sdr_manager_remote.services import sdr_manager_client as client_module
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    SESSION_COOKIE_NAME,
    SdrManagerApiError,
    SdrManagerClient,
    SdrManagerUnreachableError,
    client_for_host,
)


def _install_mock_transport(monkeypatch, handler) -> list[httpx.Request]:
    """Route every httpx.AsyncClient through `handler`; returns the requests it saw."""
    received: list[httpx.Request] = []

    def recording(request: httpx.Request) -> httpx.Response:
        received.append(request)
        return handler(request)

    class _MockedAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs) -> None:
            kwargs["transport"] = httpx.MockTransport(recording)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _MockedAsyncClient)
    return received


def _status_ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"generated_at": 1, "sdrs": []})


def _locked(request: httpx.Request) -> httpx.Response:
    """A protected host: every management call is 401; a login would succeed."""
    if request.url.path == "/api/auth/login":
        return httpx.Response(204, headers={"set-cookie": f"{SESSION_COOKIE_NAME}=fresh; Path=/"})
    return httpx.Response(401, json={"detail": {"code": "unauthenticated", "message": "Sign in to continue."}})


def _host(**overrides) -> RemoteSdrHost:
    fields = dict(id=1, address="sdr-manager-local", port=8000, auth_token="", auth_mode=AUTH_MODE_SERVICE)
    fields.update(overrides)
    return RemoteSdrHost(**fields)


# ── bearer mode ────────────────────────────────────────────────────────────────


async def test_bearer_mode_presents_the_token_and_no_cookie(monkeypatch):
    received = _install_mock_transport(monkeypatch, _status_ok)

    await SdrManagerClient("sdr-manager-local", 8000, "", service_token="the-token").get_status()

    (request,) = received
    assert request.headers["Authorization"] == "Bearer the-token"
    assert "cookie" not in request.headers


async def test_bearer_mode_ignores_a_remembered_session_for_the_same_host(monkeypatch):
    # A session earned with an empty password at this address must not ride
    # along with the bearer; the bearer is the whole credential.
    password_client = SdrManagerClient("sdr-manager-local", 8000, "")
    client_module._session_cookies[password_client._session_key] = "stale-session"
    received = _install_mock_transport(monkeypatch, _status_ok)

    await SdrManagerClient("sdr-manager-local", 8000, "", service_token="the-token").get_status()

    assert "cookie" not in received[0].headers


async def test_a_401_in_bearer_mode_is_raised_without_signing_in(monkeypatch):
    received = _install_mock_transport(monkeypatch, _locked)

    with pytest.raises(SdrManagerApiError) as raised:
        await SdrManagerClient("sdr-manager-local", 8000, "unused", service_token="the-token").get_status()

    assert raised.value.status_code == 401
    assert raised.value.code == "unauthenticated"
    assert [request.url.path for request in received] == ["/api/status"]


async def test_an_empty_service_token_sends_no_authorization_header(monkeypatch):
    # No credential file: nothing is sent, so a protected host answers 401
    # rather than receiving a malformed `Bearer ` header.
    received = _install_mock_transport(monkeypatch, _status_ok)

    await SdrManagerClient("sdr-manager-local", 8000, "", service_token="").get_status()

    assert "authorization" not in received[0].headers
    assert "cookie" not in received[0].headers


async def test_bearer_mode_also_carries_the_reservation_holder(monkeypatch):
    received = _install_mock_transport(monkeypatch, lambda request: httpx.Response(200, json={}))

    await SdrManagerClient("sdr-manager-local", 8000, "", service_token="the-token").patch_device(
        "usb:1-1", {"gain_db": 10}, holder="instance-1"
    )

    assert received[0].headers["Authorization"] == "Bearer the-token"
    assert received[0].headers[client_module.RESERVATION_HOLDER_HEADER] == "instance-1"


async def test_the_token_never_appears_in_an_unreachable_error(monkeypatch):
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    _install_mock_transport(monkeypatch, refuse)

    with pytest.raises(SdrManagerUnreachableError) as raised:
        await SdrManagerClient("sdr-manager-local", 8000, "", service_token="SECRET-SERVICE-TOKEN").get_status()

    assert "SECRET-SERVICE-TOKEN" not in str(raised.value)


# ── client_for_host ────────────────────────────────────────────────────────────


async def test_a_service_row_presents_this_services_own_credential(monkeypatch, tmp_path):
    present_credential(monkeypatch, tmp_path, "sdr-manager-remote")
    received = _install_mock_transport(monkeypatch, _status_ok)

    client = client_for_host(_host())
    await client.get_status()

    assert client.base_url == "http://sdr-manager-local:8000"
    assert received[0].headers["Authorization"] == bearer("sdr-manager-remote")["Authorization"]


async def test_a_service_row_never_signs_in_even_when_refused(monkeypatch, tmp_path):
    present_credential(monkeypatch, tmp_path, "sdr-manager-remote")
    received = _install_mock_transport(monkeypatch, _locked)

    with pytest.raises(SdrManagerApiError):
        await client_for_host(_host(auth_token="left-over-password")).get_status()

    assert "/api/auth/login" not in [request.url.path for request in received]


async def test_a_service_row_without_a_credential_file_sends_nothing(monkeypatch):
    monkeypatch.setattr(settings, "service_http_credentials_file", "")
    received = _install_mock_transport(monkeypatch, _status_ok)

    await client_for_host(_host()).get_status()

    assert "authorization" not in received[0].headers


async def test_a_password_row_signs_in_with_its_password_and_no_bearer(monkeypatch, tmp_path):
    present_credential(monkeypatch, tmp_path, "sdr-manager-remote")
    received = _install_mock_transport(monkeypatch, _locked)

    with pytest.raises(SdrManagerApiError):
        await client_for_host(
            _host(address="10.0.0.5", auth_token="console-password", auth_mode=AUTH_MODE_PASSWORD)
        ).get_status()

    paths = [request.url.path for request in received]
    assert paths == ["/api/status", "/api/auth/login", "/api/status"]
    assert received[1].content == b'{"password":"console-password"}'
    # The service's own credential never goes to another machine.
    assert all(TOKENS["sdr-manager-remote"] not in request.headers.get("authorization", "") for request in received)
    assert all("authorization" not in request.headers for request in received)
