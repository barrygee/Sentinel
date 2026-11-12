"""Trust on first use through `/api/sdr-manager/remote/hosts` (`routers/hosts.py`).

The certificate read itself (`fetch_host_certificate_authority`) has its own
tests against real TLS servers; here it is replaced by a fake that returns a
chosen authority or raises a chosen failure, so the router's half is pinned
down: what an operator is shown, that a host is pinned only by the fingerprint
they checked and only while the host still presents it, what forgets a pin,
and which `tls_state` a host reports.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from sentinel_sdr_manager_remote.models import AUTH_MODE_SERVICE, RemoteSdrHost
from sentinel_sdr_manager_remote.routers import hosts as hosts_router
from sentinel_sdr_manager_remote.services.host_certificates import (
    HostCertificateAuthority,
    HostCertificateError,
    HostOffersNoTlsError,
)
from sentinel_sdr_manager_remote.services.host_poller import HostSnapshot

HOSTS = "/api/sdr-manager/remote/hosts"
GOOD = HostCertificateAuthority(
    pem="-----BEGIN CERTIFICATE-----\ngood\n-----END CERTIFICATE-----\n",
    fingerprint=":".join(["AA"] * 32),
    subject="CN=Roof Pi authority",
    not_valid_after="Nov 10 12:00:00 2036 GMT",
)
NEW = HostCertificateAuthority(
    pem="-----BEGIN CERTIFICATE-----\nnew\n-----END CERTIFICATE-----\n",
    fingerprint=":".join(["BB"] * 32),
    subject="CN=Roof Pi authority",
    not_valid_after="Nov 11 12:00:00 2036 GMT",
)


@pytest.fixture(autouse=True)
def poller(monkeypatch):
    """No real polling tasks; the calls are asserted instead."""
    for method in ("start_host", "stop_host", "restart_host", "refresh_now"):
        monkeypatch.setattr(hosts_router.host_poller, method, AsyncMock())
    return hosts_router.host_poller


class FakeFetch:
    """Stands in for `fetch_host_certificate_authority`: answers `outcome`, records each call."""

    def __init__(self) -> None:
        self.outcome: HostCertificateAuthority | Exception = GOOD
        self.calls: list[tuple[str, int]] = []

    async def __call__(self, address: str, port: int, *, timeout: httpx.Timeout) -> HostCertificateAuthority:
        assert isinstance(timeout, httpx.Timeout)
        self.calls.append((address, port))
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


@pytest.fixture
def fetch(monkeypatch) -> FakeFetch:
    fake = FakeFetch()
    monkeypatch.setattr(hosts_router, "fetch_host_certificate_authority", fake)
    return fake


@pytest.fixture()
def sessions(test_engine, db_setup):
    return sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


async def stored(sessions, host_id: int) -> RemoteSdrHost:
    async with sessions() as session:
        return (await session.execute(select(RemoteSdrHost).where(RemoteSdrHost.id == host_id))).scalar_one()


def add_https_host(client, **overrides) -> dict:
    body = {"address": "10.0.0.5", "port": 8000, "auth_token": "pw", "tls_fingerprint": GOOD.fingerprint}
    body.update(overrides)
    response = client.post(HOSTS, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def add_http_host(client, **overrides) -> dict:
    body = {"address": "10.0.0.6", "port": 8000, "auth_token": "pw", "transport": "http"}
    body.update(overrides)
    response = client.post(HOSTS, json=body)
    assert response.status_code == 201, response.text
    return response.json()


# ── previewing a host not added yet ────────────────────────────────────────────


class TestPreviewNewHost:
    def test_shows_what_the_host_presents_and_stores_nothing(self, client, fetch):
        response = client.post(f"{HOSTS}/certificate", json={"address": "10.0.0.5", "port": 8123})

        assert response.status_code == 200
        assert response.json() == {
            "tls_available": True,
            "detail": "ok",
            "fingerprint": GOOD.fingerprint,
            "subject": GOOD.subject,
            "not_valid_after": GOOD.not_valid_after,
            "matches_pinned": None,
        }
        assert fetch.calls == [("10.0.0.5", 8123)]
        assert client.get(HOSTS).json() == []

    def test_the_port_defaults_to_8000(self, client, fetch):
        client.post(f"{HOSTS}/certificate", json={"address": "pi.local"})

        assert fetch.calls == [("pi.local", 8000)]

    def test_a_host_without_tls_is_a_result_not_an_error(self, client, fetch):
        fetch.outcome = HostOffersNoTlsError("The SDR host doesn't offer HTTPS.")

        response = client.post(f"{HOSTS}/certificate", json={"address": "10.0.0.5"})

        assert response.status_code == 200
        body = response.json()
        assert body["tls_available"] is False
        assert "unencrypted" in body["detail"]
        assert body["fingerprint"] is None

    def test_a_host_sending_a_bad_authority_is_a_502(self, client, fetch):
        fetch.outcome = HostCertificateError(
            "The SDR host's certificate isn't signed by the certificate authority it sent."
        )

        response = client.post(f"{HOSTS}/certificate", json={"address": "10.0.0.5"})

        assert response.status_code == 502
        assert response.json()["detail"] == {
            "code": "certificate_invalid",
            "message": "The SDR host's certificate isn't signed by the certificate authority it sent.",
        }

    def test_no_answer_is_a_502_naming_the_host(self, client, fetch):
        fetch.outcome = httpx.ConnectError("refused")

        response = client.post(f"{HOSTS}/certificate", json={"address": "10.0.0.5", "port": 8001})

        assert response.status_code == 502
        assert response.json()["detail"] == {
            "code": "host_unreachable",
            "message": "Could not reach SDR host 10.0.0.5:8001.",
        }

    @pytest.mark.parametrize(
        "body",
        [
            pytest.param({"address": "http://10.0.0.5"}, id="url"),
            pytest.param({"address": "10.0.0.5", "port": 0}, id="port-zero"),
            pytest.param({"address": "10.0.0.5", "port": 70000}, id="port-too-big"),
            pytest.param({}, id="no-address"),
        ],
    )
    def test_a_bad_address_never_leaves_sentinel(self, client, fetch, body):
        response = client.post(f"{HOSTS}/certificate", json=body)

        assert response.status_code == 422
        assert fetch.calls == []


# ── adding a host ──────────────────────────────────────────────────────────────


class TestAddHost:
    def test_https_is_the_default_and_pins_the_checked_authority(self, client, fetch, sessions):
        created = add_https_host(client)

        assert created["transport"] == "https"
        assert created["tls_fingerprint"] == GOOD.fingerprint
        assert created["tls_state"] == "pinned"
        assert fetch.calls == [("10.0.0.5", 8000)]

    async def test_the_pin_is_stored_on_the_row(self, client, fetch, sessions):
        created = add_https_host(client)

        row = await stored(sessions, created["id"])
        assert (row.transport, row.tls_certificate_authority, row.tls_fingerprint) == (
            "https",
            GOOD.pem,
            GOOD.fingerprint,
        )

    def test_the_fingerprint_can_be_typed_any_way(self, client, fetch):
        created = add_https_host(client, tls_fingerprint="aa" * 32)

        assert created["tls_fingerprint"] == GOOD.fingerprint

    def test_https_without_a_fingerprint_is_refused(self, client, fetch):
        response = client.post(HOSTS, json={"address": "10.0.0.5"})

        assert response.status_code == 422
        assert "tls_fingerprint is required over HTTPS" in response.text
        assert fetch.calls == []

    def test_a_malformed_fingerprint_is_refused(self, client, fetch):
        response = client.post(HOSTS, json={"address": "10.0.0.5", "tls_fingerprint": "AA:BB"})

        assert response.status_code == 422
        assert "64 hexadecimal digits" in response.text
        assert fetch.calls == []

    def test_an_unknown_transport_is_refused(self, client, fetch):
        response = client.post(HOSTS, json={"address": "10.0.0.5", "transport": "ftp"})

        assert response.status_code == 422

    def test_a_host_presenting_another_authority_now_is_not_added(self, client, fetch):
        # Swapped between the operator's check and the add: refuse, and say
        # what it presents now so the operator can compare again.
        fetch.outcome = NEW

        response = client.post(HOSTS, json={"address": "10.0.0.5", "tls_fingerprint": GOOD.fingerprint})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "certificate_changed"
        assert response.json()["detail"]["fingerprint"] == NEW.fingerprint
        assert client.get(HOSTS).json() == []

    def test_a_host_that_stopped_offering_tls_is_not_added(self, client, fetch):
        fetch.outcome = HostOffersNoTlsError("The SDR host doesn't offer HTTPS.")

        response = client.post(HOSTS, json={"address": "10.0.0.5", "tls_fingerprint": GOOD.fingerprint})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "host_offers_no_tls"
        assert client.get(HOSTS).json() == []

    def test_plain_http_is_added_without_reading_any_certificate(self, client, fetch):
        created = add_http_host(client)

        assert created["transport"] == "http"
        assert created["tls_fingerprint"] is None
        assert created["tls_state"] == "insecure"
        assert fetch.calls == []

    def test_an_explicit_null_fingerprint_is_no_fingerprint(self, client, fetch):
        assert add_http_host(client, tls_fingerprint=None)["tls_fingerprint"] is None
        response = client.post(HOSTS, json={"address": "10.0.0.7", "tls_fingerprint": None})
        assert response.status_code == 422
        assert "tls_fingerprint is required over HTTPS" in response.text

    def test_a_duplicate_is_refused_before_any_certificate_read(self, client, fetch):
        add_https_host(client)
        fetch.calls.clear()

        response = client.post(HOSTS, json={"address": "10.0.0.5", "tls_fingerprint": GOOD.fingerprint})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "host_conflict"
        assert fetch.calls == []


# ── previewing and trusting an existing host ───────────────────────────────────


class TestPreviewExistingHost:
    def test_says_whether_it_is_the_pinned_authority(self, client, fetch):
        host = add_https_host(client)

        assert client.post(f"{HOSTS}/{host['id']}/certificate").json()["matches_pinned"] is True
        fetch.outcome = NEW
        assert client.post(f"{HOSTS}/{host['id']}/certificate").json()["matches_pinned"] is False

    def test_a_plain_http_host_has_nothing_to_match(self, client, fetch):
        host = add_http_host(client)

        body = client.post(f"{HOSTS}/{host['id']}/certificate").json()

        assert body["matches_pinned"] is None
        assert body["fingerprint"] == GOOD.fingerprint
        assert fetch.calls == [("10.0.0.6", 8000)]

    def test_an_unknown_host_is_a_404(self, client, fetch):
        assert client.post(f"{HOSTS}/999/certificate").status_code == 404
        assert fetch.calls == []


class TestTrustHostCertificate:
    async def test_moves_a_plain_http_host_to_https_and_keeps_its_password(self, client, fetch, sessions, poller):
        host = add_http_host(client)

        response = client.put(f"{HOSTS}/{host['id']}/certificate", json={"fingerprint": GOOD.fingerprint})

        assert response.status_code == 200
        body = response.json()
        assert (body["transport"], body["tls_state"], body["tls_fingerprint"]) == ("https", "pinned", GOOD.fingerprint)
        assert body["auth_token_set"] is True
        row = await stored(sessions, host["id"])
        assert row.tls_certificate_authority == GOOD.pem
        assert row.auth_token == "pw"
        poller.restart_host.assert_awaited_with(host["id"])

    async def test_replaces_a_pin_after_the_hosts_credentials_changed(self, client, fetch, sessions):
        host = add_https_host(client)
        fetch.outcome = NEW

        response = client.put(f"{HOSTS}/{host['id']}/certificate", json={"fingerprint": "bb" * 32})

        assert response.json()["tls_fingerprint"] == NEW.fingerprint
        assert (await stored(sessions, host["id"])).tls_certificate_authority == NEW.pem

    async def test_a_fingerprint_that_no_longer_matches_changes_nothing(self, client, fetch, sessions, poller):
        host = add_https_host(client)
        poller.restart_host.reset_mock()
        fetch.outcome = NEW

        response = client.put(f"{HOSTS}/{host['id']}/certificate", json={"fingerprint": GOOD.fingerprint})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "certificate_changed"
        assert (await stored(sessions, host["id"])).tls_certificate_authority == GOOD.pem
        poller.restart_host.assert_not_awaited()

    def test_a_disabled_host_is_not_started(self, client, fetch, poller):
        host = add_http_host(client, enabled=False)

        response = client.put(f"{HOSTS}/{host['id']}/certificate", json={"fingerprint": GOOD.fingerprint})

        assert response.status_code == 200
        poller.restart_host.assert_not_awaited()

    def test_a_malformed_fingerprint_is_refused(self, client, fetch):
        host = add_http_host(client)

        response = client.put(f"{HOSTS}/{host['id']}/certificate", json={"fingerprint": "nope"})

        assert response.status_code == 422
        assert fetch.calls == []

    def test_an_unknown_host_is_a_404(self, client, fetch):
        response = client.put(f"{HOSTS}/999/certificate", json={"fingerprint": GOOD.fingerprint})

        assert response.status_code == 404


# ── what forgets a pin ─────────────────────────────────────────────────────────


class TestEditsForgetThePin:
    @pytest.mark.parametrize(
        "edit",
        [
            pytest.param({"address": "10.0.0.9"}, id="address"),
            pytest.param({"port": 8001}, id="port"),
        ],
    )
    async def test_a_new_address_or_port_is_trusted_afresh(self, client, fetch, sessions, edit):
        host = add_https_host(client)

        body = client.put(f"{HOSTS}/{host['id']}", json=edit).json()

        assert (body["transport"], body["tls_state"], body["tls_fingerprint"]) == ("https", "untrusted", None)
        assert (await stored(sessions, host["id"])).tls_certificate_authority is None

    async def test_moving_to_plain_http_forgets_the_pin(self, client, fetch, sessions):
        host = add_https_host(client)

        body = client.put(f"{HOSTS}/{host['id']}", json={"transport": "http"}).json()

        assert (body["transport"], body["tls_state"], body["tls_fingerprint"]) == ("http", "insecure", None)
        assert (await stored(sessions, host["id"])).tls_certificate_authority is None

    def test_moving_to_https_leaves_it_untrusted_until_checked(self, client, fetch):
        host = add_http_host(client)

        body = client.put(f"{HOSTS}/{host['id']}", json={"transport": "https"}).json()

        assert (body["transport"], body["tls_state"]) == ("https", "untrusted")

    @pytest.mark.parametrize(
        "edit",
        [
            pytest.param({"name": "Roof"}, id="name"),
            pytest.param({"auth_token": "new-password"}, id="password"),
            pytest.param({"transport": "https"}, id="same-transport"),
            pytest.param({"address": "10.0.0.5", "port": 8000}, id="same-address"),
        ],
    )
    def test_other_edits_keep_it(self, client, fetch, edit):
        host = add_https_host(client)

        body = client.put(f"{HOSTS}/{host['id']}", json=edit).json()

        assert (body["tls_state"], body["tls_fingerprint"]) == ("pinned", GOOD.fingerprint)


# ── this machine ───────────────────────────────────────────────────────────────


@pytest.fixture()
async def local_host_id(sessions) -> int:
    async with sessions() as session:
        host = RemoteSdrHost(
            address="host.docker.internal",
            port=8000,
            auth_token="",
            auth_mode=AUTH_MODE_SERVICE,
            is_local=True,
            enabled=True,
            transport="https",
            created_at=1000,
        )
        session.add(host)
        await session.commit()
        return host.id


class TestThisMachine:
    def test_over_https_it_is_verified_by_the_deployment(self, client, local_host_id):
        assert client.get(f"{HOSTS}/{local_host_id}").json()["tls_state"] == "deployment"

    @pytest.mark.parametrize(
        ("method", "body"),
        [pytest.param("post", None, id="preview"), pytest.param("put", {"fingerprint": "aa" * 32}, id="trust")],
    )
    def test_its_certificate_is_not_the_operators_to_trust(self, client, fetch, local_host_id, method, body):
        response = getattr(client, method)(f"{HOSTS}/{local_host_id}/certificate", json=body)

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "local_host_managed"
        assert fetch.calls == []

    def test_its_transport_is_the_links_to_change(self, client, local_host_id):
        response = client.put(f"{HOSTS}/{local_host_id}", json={"transport": "http"})

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "local_host_managed"


# ── tls_state from the poller, and refused requests ────────────────────────────


class TestStateAndRefusals:
    def test_a_pin_the_last_poll_rejected_reads_changed(self, client, fetch, monkeypatch):
        host = add_https_host(client)
        snapshot = HostSnapshot(host_id=host["id"], certificate_rejected=True)
        monkeypatch.setattr(hosts_router.host_poller, "get_snapshot", lambda host_id: snapshot)

        assert client.get(f"{HOSTS}/{host['id']}").json()["tls_state"] == "changed"

    def test_a_rejection_on_a_host_without_a_pin_is_still_untrusted(self, client, fetch, monkeypatch):
        host = add_https_host(client)
        client.put(f"{HOSTS}/{host['id']}", json={"port": 8001})
        snapshot = HostSnapshot(host_id=host["id"], certificate_rejected=True)
        monkeypatch.setattr(hosts_router.host_poller, "get_snapshot", lambda host_id: snapshot)

        assert client.get(f"{HOSTS}/{host['id']}").json()["tls_state"] == "untrusted"

    def test_a_proxied_call_to_an_untrusted_host_says_why_it_was_not_sent(self, client, fetch, monkeypatch):
        host = add_https_host(client)
        client.put(f"{HOSTS}/{host['id']}", json={"address": "10.0.0.9"})

        def never_built(*args, **kwargs):
            raise AssertionError("an untrusted host must not be connected to")

        monkeypatch.setattr(httpx, "AsyncClient", never_built)

        response = client.get(f"{HOSTS}/{host['id']}/wifi")

        assert response.status_code == 502
        assert response.json()["detail"]["code"] == "certificate_untrusted"

    def test_a_connection_test_to_an_untrusted_host_reports_it(self, client, fetch):
        host = add_https_host(client)
        client.put(f"{HOSTS}/{host['id']}", json={"address": "10.0.0.9"})

        body = client.post(f"{HOSTS}/{host['id']}/test").json()

        assert body["reachable"] is False
        assert "hasn't been trusted yet" in body["detail"]
