"""`SdrManagerClient` over HTTPS: the pinned authority decides who gets the console password.

Against real TLS servers (`sdr_manager_remote_tls_hosts`): a host presenting
a certificate its pinned authority signed is talked to; any other is refused
before a byte of the request — the password included — is sent; and an HTTPS
host with no pin gets no connection at all.
"""

from __future__ import annotations

import httpx
import pytest
from sdr_manager_remote_tls_hosts import authority_routes, json_route, make_certificates, serve

from sentinel_sdr_manager_remote.models import AUTH_MODE_PASSWORD, AUTH_MODE_SERVICE, RemoteSdrHost
from sentinel_sdr_manager_remote.services import sdr_manager_client
from sentinel_sdr_manager_remote.services.host_certificates import pinned_context
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    SdrManagerCertificateRejectedError,
    SdrManagerCertificateUntrustedError,
    SdrManagerClient,
    SdrManagerUnreachableError,
    client_for_host,
    forget_sdr_manager_sessions,
)


@pytest.fixture(scope="module")
def certificates(tmp_path_factory):
    return make_certificates(tmp_path_factory.mktemp("tls"))


@pytest.fixture(autouse=True)
def _no_remembered_sessions():
    forget_sdr_manager_sessions()
    yield
    forget_sdr_manager_sessions()


def _https(port: int, pem: str | None, password: str = "console-password", **kwargs) -> SdrManagerClient:
    return SdrManagerClient("127.0.0.1", port, password, transport="https", certificate_authority=pem, **kwargs)


class TestTransport:
    def test_base_url_carries_the_transport(self):
        assert SdrManagerClient("10.0.0.5", 8000, "", transport="https").base_url == "https://10.0.0.5:8000"
        assert SdrManagerClient("10.0.0.5", 8000, "").base_url == "http://10.0.0.5:8000"

    def test_an_unknown_transport_is_refused(self):
        with pytest.raises(ValueError, match="Unknown transport 'ftp'"):
            SdrManagerClient("10.0.0.5", 8000, "", transport="ftp")

    def test_plain_http_verifies_nothing(self):
        assert SdrManagerClient("10.0.0.5", 8000, "")._verify() is True

    def test_a_pin_is_what_https_verifies_against(self, certificates):
        client = _https(8000, certificates.good_authority_pem)

        assert client._verify() is pinned_context(certificates.good_authority_pem)

    def test_this_machine_over_https_trusts_the_deployments_authority(self, monkeypatch):
        sentinel_context = object()
        monkeypatch.setattr(sdr_manager_client, "internal_verify", lambda: sentinel_context)

        client = SdrManagerClient("host.docker.internal", 8000, "", service_token="token", transport="https")

        assert client._verify() is sentinel_context

    def test_a_pin_wins_over_the_deployments_authority(self, certificates, monkeypatch):
        monkeypatch.setattr(sdr_manager_client, "internal_verify", lambda: pytest.fail("not consulted"))

        client = _https(8000, certificates.good_authority_pem, service_token="token")

        assert client._verify() is pinned_context(certificates.good_authority_pem)


class TestPinnedHost:
    async def test_a_host_signed_by_its_pin_is_talked_to(self, certificates):
        routes = authority_routes(certificates.good_authority_pem)
        async with serve(routes, certificate=certificates.good_server, key=certificates.server_key) as port:
            response = await _https(port, certificates.good_authority_pem).get_status()

        assert response.data == {"generated_at": 1, "sdrs": []}

    async def test_a_host_signed_by_another_authority_is_refused(self, certificates):
        # The host's credentials were regenerated, or someone else has its address.
        routes = authority_routes(certificates.evil_authority_pem)
        async with serve(routes, certificate=certificates.evil_server, key=certificates.server_key) as port:
            with pytest.raises(SdrManagerCertificateRejectedError) as raised:
                await _https(port, certificates.good_authority_pem).get_status()

        assert raised.value.code == "certificate_rejected"
        assert "trust it again" in str(raised.value)
        assert isinstance(raised.value, SdrManagerUnreachableError)

    async def test_the_password_never_reaches_a_host_the_pin_rejects(self, certificates):
        # The handshake fails before the request is written, so a 401 that
        # would trigger the sign-in never arrives either.
        received: list[str] = []
        routes = {"/api/status": (401, b"{}"), "/api/auth/login": json_route({})}

        async with serve(
            routes, certificate=certificates.evil_server, key=certificates.server_key, received=received
        ) as port:
            with pytest.raises(SdrManagerCertificateRejectedError):
                await _https(port, certificates.good_authority_pem, password="TOP-SECRET").get_status()

        assert received == []

    async def test_a_signed_host_that_asks_for_the_password_gets_it(self, certificates):
        received: list[str] = []
        routes = {"/api/status": (401, b"{}"), "/api/auth/login": (200, b"{}")}
        async with serve(
            routes, certificate=certificates.good_server, key=certificates.server_key, received=received
        ) as port:
            # The host answers the sign-in without a session cookie, so it
            # fails and the 401 stands: what matters is that it was sent.
            with pytest.raises(sdr_manager_client.SdrManagerApiError):
                await _https(port, certificates.good_authority_pem).get_status()

        assert received == ["/api/status", "/api/auth/login"]

    async def test_a_sign_in_the_host_drops_mid_way_fails_quietly(self, certificates):
        routes = authority_routes(certificates.good_authority_pem)
        async with serve(routes, certificate=certificates.evil_server, key=certificates.server_key) as port:
            assert await _https(port, certificates.good_authority_pem)._sign_in() is False

    async def test_an_unreachable_https_host_is_plainly_unreachable(self, certificates):
        client = _https(1, certificates.good_authority_pem)

        with pytest.raises(SdrManagerUnreachableError) as raised:
            await client.get_status()

        assert type(raised.value) is SdrManagerUnreachableError
        assert raised.value.code == "host_unreachable"


class TestUntrustedHost:
    async def test_no_pin_means_no_connection(self, monkeypatch):
        def never_built(*args, **kwargs):
            raise AssertionError("an untrusted host must not be connected to")

        monkeypatch.setattr(httpx, "AsyncClient", never_built)

        with pytest.raises(SdrManagerCertificateUntrustedError) as raised:
            await _https(8000, None).get_status()

        assert raised.value.code == "certificate_untrusted"
        assert "hasn't been trusted yet" in str(raised.value)


class TestClientForHost:
    def _row(self, **overrides) -> RemoteSdrHost:
        fields = dict(address="10.0.0.5", port=8000, auth_token="pw", auth_mode=AUTH_MODE_PASSWORD)
        fields.update(overrides)
        return RemoteSdrHost(**fields)

    def test_a_row_not_flushed_yet_is_plain_http(self):
        client = client_for_host(self._row())

        assert client.base_url == "http://10.0.0.5:8000"

    def test_a_pinned_row_carries_its_pin(self, certificates):
        row = self._row(transport="https", tls_certificate_authority=certificates.good_authority_pem)

        client = client_for_host(row)

        assert client.base_url == "https://10.0.0.5:8000"
        assert client._verify() is pinned_context(certificates.good_authority_pem)
        assert client._console_password == "pw"
        assert client._service_token is None

    def test_this_machines_row_uses_the_bearer_and_its_transport(self, monkeypatch):
        monkeypatch.setattr(sdr_manager_client, "own_token", lambda: "service-token")

        client = client_for_host(self._row(auth_mode=AUTH_MODE_SERVICE, transport="https", auth_token="ignored"))

        assert client.base_url == "https://10.0.0.5:8000"
        assert client._console_password == ""
        assert client._service_token == "service-token"
