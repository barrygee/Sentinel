"""Tests for the "This machine" row on `/api/sdr-manager/remote/hosts` (ADR 0007).

The local link owns that row (`is_local`), so the router must refuse to delete
or readdress it (409 `local_host_managed`) while leaving its label to the
operator, and must call it with the service bearer rather than a password.
The row is seeded straight into the test database: no API creates one.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from tests.backend.service_credentials_test_helpers import bearer, present_credential

from sentinel_sdr_manager_remote.models import AUTH_MODE_SERVICE, RemoteSdrHost
from sentinel_sdr_manager_remote.routers import hosts as hosts_router

HOSTS = "/api/sdr-manager/remote/hosts"


@pytest.fixture(autouse=True)
def _stub_host_poller(monkeypatch):
    """No real polling tasks; the calls are asserted instead."""
    for method in ("start_host", "stop_host", "restart_host", "refresh_now"):
        monkeypatch.setattr(hosts_router.host_poller, method, AsyncMock())


@pytest.fixture()
def sessions(test_engine, db_setup):
    return sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


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
            created_at=1000,
        )
        session.add(host)
        await session.commit()
        return host.id


async def stored_local_host(sessions) -> RemoteSdrHost:
    async with sessions() as session:
        return (await session.execute(select(RemoteSdrHost).where(RemoteSdrHost.is_local.is_(True)))).scalar_one()


def _install_mock_transport(monkeypatch, handler) -> list[httpx.Request]:
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


# ── is_local in responses ─────────────────────────────────────────────────────


def test_the_listing_marks_the_local_row_and_only_it(client, local_host_id):
    created = client.post(HOSTS, json={"address": "10.0.0.5", "auth_token": "pw"}).json()

    listed = {host["id"]: host for host in client.get(HOSTS).json()}

    assert listed[local_host_id]["is_local"] is True
    assert listed[local_host_id]["auth_token_set"] is False
    assert listed[created["id"]]["is_local"] is False
    assert created["is_local"] is False


def test_a_single_read_carries_is_local(client, local_host_id):
    assert client.get(f"{HOSTS}/{local_host_id}").json()["is_local"] is True


# ── 409 local_host_managed ────────────────────────────────────────────────────


async def test_the_local_row_cannot_be_deleted(client, sessions, local_host_id):
    response = client.delete(f"{HOSTS}/{local_host_id}")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "local_host_managed"
    assert (await stored_local_host(sessions)).id == local_host_id
    hosts_router.host_poller.stop_host.assert_not_awaited()


@pytest.mark.parametrize(
    "change",
    [
        pytest.param({"address": "10.0.0.9"}, id="address"),
        pytest.param({"port": 8001}, id="port"),
        # Unchanged values are refused too: the link owns these fields outright.
        pytest.param({"address": "host.docker.internal", "port": 8000}, id="same-address"),
        pytest.param({"auth_token": "a password"}, id="auth-token"),
        pytest.param({"enabled": False}, id="disable"),
        pytest.param({"enabled": True}, id="enable"),
        pytest.param({"name": "Renamed", "address": "10.0.0.9"}, id="name-with-address"),
    ],
)
async def test_the_local_row_cannot_be_readdressed_or_toggled(client, sessions, local_host_id, change):
    response = client.put(f"{HOSTS}/{local_host_id}", json=change)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "local_host_managed"
    host = await stored_local_host(sessions)
    assert (host.name, host.address, host.port, host.auth_token, host.enabled) == (
        None,
        "host.docker.internal",
        8000,
        "",
        True,
    )
    hosts_router.host_poller.restart_host.assert_not_awaited()


@pytest.mark.parametrize(
    ("name", "stored"),
    [
        pytest.param("This machine", "This machine", id="set"),
        pytest.param("   ", None, id="blank-clears"),
        pytest.param(None, None, id="null-clears"),
    ],
)
async def test_the_local_rows_name_is_the_operators(client, sessions, local_host_id, name, stored):
    response = client.put(f"{HOSTS}/{local_host_id}", json={"name": name})

    assert response.status_code == 200
    assert response.json()["name"] == stored
    assert response.json()["is_local"] is True
    host = await stored_local_host(sessions)
    assert (host.name, host.address, host.enabled) == (stored, "host.docker.internal", True)


def test_an_operator_host_cannot_take_the_local_rows_address(client, local_host_id):
    response = client.post(HOSTS, json={"address": "host.docker.internal", "port": 8000})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "host_conflict"


def test_an_operator_host_cannot_be_moved_onto_the_local_rows_address(client, local_host_id):
    operator = client.post(HOSTS, json={"address": "10.0.0.5"}).json()

    response = client.put(f"{HOSTS}/{operator['id']}", json={"address": "host.docker.internal"})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "host_conflict"


def test_operator_hosts_can_still_be_deleted(client, local_host_id):
    operator = client.post(HOSTS, json={"address": "10.0.0.5"}).json()

    assert client.delete(f"{HOSTS}/{operator['id']}").status_code == 204


# ── Calls to this machine use the service bearer ──────────────────────────────


def test_a_proxied_call_to_the_local_row_presents_the_service_bearer(client, local_host_id, monkeypatch, tmp_path):
    present_credential(monkeypatch, tmp_path, "sdr-manager-remote")
    received = _install_mock_transport(monkeypatch, lambda request: httpx.Response(200, json={"devices": []}))

    response = client.get(f"{HOSTS}/{local_host_id}/devices/records")

    assert response.status_code == 200
    (request,) = received
    assert str(request.url) == "http://host.docker.internal:8000/api/devices"
    assert request.headers["Authorization"] == bearer("sdr-manager-remote")["Authorization"]


def test_a_refused_bearer_is_surfaced_without_a_sign_in(client, local_host_id, monkeypatch, tmp_path):
    present_credential(monkeypatch, tmp_path, "sdr-manager-remote")
    received = _install_mock_transport(
        monkeypatch,
        lambda request: httpx.Response(
            401, json={"detail": {"code": "unauthenticated", "message": "Sign in to continue."}}
        ),
    )

    response = client.get(f"{HOSTS}/{local_host_id}/devices/records")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"
    assert [request.url.path for request in received] == ["/api/devices"]
