"""Who may use a private dongle: the allow-list, its route and the reservation gate.

These are the security tests for "private": each one proves a caller is refused,
or that the list can't be used to open more than it names. Peers are set on the
test client because the gate reads the connection's address, not anything the
caller sends.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_private_access.py
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from sentinel_sdr_manager_local import database
from sentinel_sdr_manager_local.config import get_settings
from sentinel_sdr_manager_local.models import HostControlSettingsModel
from sentinel_sdr_manager_local.services import private_access as private_access_module
from sentinel_sdr_manager_local.services.device_registry import DeviceRegistry
from sentinel_sdr_manager_local.services.host_control_settings import HostControlSettingsService
from sentinel_sdr_manager_local.services.private_access import (
    LOOPBACK_NETWORKS,
    MAX_ALLOWED_ADDRESSES,
    PrivateAccessList,
    normalize_allowed_address,
    peer_is_local,
)
from sentinel_sdr_manager_local.services.supervisor import SupervisorService

DEVICE_ID = "serial:PRIVATE-1"
PUBLIC_DEVICE_ID = "serial:PUBLIC-1"
RESERVATION_PATH = f"/api/devices/{DEVICE_ID}/reservation"
CLAIM = {"holder": "sentinel:aaa", "label": "Sentinel", "ttl_seconds": 120}
PASSWORD = "a good long password"
LOOPBACK_PEER = "127.0.0.1"
LISTED_PEER = "192.168.1.50"
STRANGER_PEER = "192.168.1.60"
COMPOSE_PEER = "172.28.0.2"


class FixedClock:
    def now_ms(self) -> int:
        return 1_000


@pytest.fixture
def application(
    sdr_manager_local_app_factory: Callable[[], FastAPI], monkeypatch: pytest.MonkeyPatch
) -> Iterator[FastAPI]:
    get_settings.cache_clear()
    records = (
        SimpleNamespace(device_id=DEVICE_ID, visibility="private", record_id=None),
        SimpleNamespace(device_id=PUBLIC_DEVICE_ID, visibility="public", record_id=None),
    )
    monkeypatch.setattr(DeviceRegistry, "list_records", lambda _registry: records)
    yield sdr_manager_local_app_factory()
    get_settings.cache_clear()


@pytest.fixture
def local_client(application: FastAPI) -> Iterator[TestClient]:
    with TestClient(application, client=(LOOPBACK_PEER, 5000)) as client:
        yield client


@pytest.fixture
def signed_in(local_client: TestClient) -> TestClient:
    """This machine's browser, on a console with a password."""
    assert local_client.post("/api/auth/password", json={"new_password": PASSWORD}).status_code < 300
    return local_client


def client_from(application: FastAPI, peer: str, session_source: TestClient) -> TestClient:
    """A client at `peer` holding the same console session, as a remote Sentinel would."""
    client = TestClient(application, client=(peer, 5000))
    client.cookies = session_source.cookies
    return client


def put_addresses(client: TestClient, addresses: list[str]) -> Any:
    return client.put("/api/private-access", json={"addresses": addresses})


class TestEditingTheList:
    def test_starts_empty(self, signed_in: TestClient) -> None:
        assert signed_in.get("/api/private-access").json() == {"addresses": []}

    def test_a_console_with_no_password_cannot_add_anyone(self, local_client: TestClient) -> None:
        response = put_addresses(local_client, [LISTED_PEER])

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "console_password_required"
        assert local_client.get("/api/private-access").json() == {"addresses": []}

    def test_needs_a_session_once_a_password_is_set(self, application: FastAPI, signed_in: TestClient) -> None:
        stranger = TestClient(application, client=(STRANGER_PEER, 5000))

        assert stranger.get("/api/private-access").status_code == 401
        assert put_addresses(stranger, [STRANGER_PEER]).status_code == 401
        assert signed_in.get("/api/private-access").json() == {"addresses": []}

    def test_stores_and_returns_the_list(self, signed_in: TestClient) -> None:
        assert put_addresses(signed_in, [LISTED_PEER]).json() == {"addresses": [LISTED_PEER]}
        assert signed_in.get("/api/private-access").json() == {"addresses": [LISTED_PEER]}

    def test_stores_canonical_forms_without_duplicates(self, signed_in: TestClient) -> None:
        response = put_addresses(signed_in, [f" {LISTED_PEER} ", LISTED_PEER, "::ffff:10.0.0.9", "2001:DB8::1"])

        assert response.json() == {"addresses": [LISTED_PEER, "10.0.0.9", "2001:db8::1"]}

    @pytest.mark.parametrize(
        "bad_address",
        ["192.168.1.0/24", "0.0.0.0", "::", "224.0.0.1", "ff02::1", "fe80::1%eth0", "not-an-ip", "", "1.2.3", "1" * 46],
    )
    def test_refuses_anything_that_is_not_one_usable_address(self, signed_in: TestClient, bad_address: str) -> None:
        assert put_addresses(signed_in, [bad_address]).status_code == 422
        assert signed_in.get("/api/private-access").json() == {"addresses": []}

    def test_one_bad_address_refuses_the_whole_list(self, signed_in: TestClient) -> None:
        assert put_addresses(signed_in, [LISTED_PEER, "0.0.0.0"]).status_code == 422
        assert signed_in.get("/api/private-access").json() == {"addresses": []}

    def test_caps_the_list(self, signed_in: TestClient) -> None:
        addresses = [f"10.0.{index // 250}.{index % 250 + 1}" for index in range(MAX_ALLOWED_ADDRESSES)]

        assert put_addresses(signed_in, addresses).status_code == 200
        assert put_addresses(signed_in, [*addresses, "10.1.0.1"]).status_code == 422

    def test_refuses_unknown_fields(self, signed_in: TestClient) -> None:
        response = signed_in.put("/api/private-access", json={"addresses": [], "networks": ["0.0.0.0/0"]})

        assert response.status_code == 422

    def test_survives_a_restart(
        self, application: FastAPI, signed_in: TestClient, sdr_manager_local_app_factory: Callable[[], FastAPI]
    ) -> None:
        put_addresses(signed_in, [LISTED_PEER])

        with TestClient(sdr_manager_local_app_factory(), client=(LOOPBACK_PEER, 5000)) as restarted:
            restarted.cookies = signed_in.cookies
            assert restarted.get("/api/private-access").json() == {"addresses": [LISTED_PEER]}


class TestClaimingAPrivateDongle:
    def test_this_machine_may(self, signed_in: TestClient) -> None:
        assert signed_in.post(RESERVATION_PATH, json=CLAIM).status_code == 200

    def test_a_console_session_from_elsewhere_is_not_enough(self, application: FastAPI, signed_in: TestClient) -> None:
        response = client_from(application, STRANGER_PEER, signed_in).post(RESERVATION_PATH, json=CLAIM)

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "device_private"

    def test_an_open_console_does_not_let_everyone_in(self, application: FastAPI, local_client: TestClient) -> None:
        stranger = TestClient(application, client=(STRANGER_PEER, 5000))

        assert stranger.post(RESERVATION_PATH, json=CLAIM).status_code == 403

    def test_the_compose_network_is_not_enough_over_http(self, application: FastAPI, signed_in: TestClient) -> None:
        # The gateway proxies browsers from here, so this address proves nothing.
        assert client_from(application, COMPOSE_PEER, signed_in).post(RESERVATION_PATH, json=CLAIM).status_code == 403

    def test_a_listed_address_may(self, application: FastAPI, signed_in: TestClient) -> None:
        put_addresses(signed_in, [LISTED_PEER])

        assert client_from(application, LISTED_PEER, signed_in).post(RESERVATION_PATH, json=CLAIM).status_code == 200

    def test_listing_one_address_lets_in_no_other(self, application: FastAPI, signed_in: TestClient) -> None:
        put_addresses(signed_in, [LISTED_PEER])

        assert client_from(application, STRANGER_PEER, signed_in).post(RESERVATION_PATH, json=CLAIM).status_code == 403

    def test_a_removed_address_is_refused_at_once(self, application: FastAPI, signed_in: TestClient) -> None:
        put_addresses(signed_in, [LISTED_PEER])
        put_addresses(signed_in, [])

        assert client_from(application, LISTED_PEER, signed_in).post(RESERVATION_PATH, json=CLAIM).status_code == 403

    def test_a_forged_forwarded_header_changes_nothing(self, application: FastAPI, signed_in: TestClient) -> None:
        put_addresses(signed_in, [LISTED_PEER])

        response = client_from(application, STRANGER_PEER, signed_in).post(
            RESERVATION_PATH, json=CLAIM, headers={"X-Forwarded-For": LISTED_PEER}
        )

        assert response.status_code == 403

    def test_the_service_bearer_may_from_anywhere(
        self, application: FastAPI, signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(private_access_module, "presents_service_bearer", lambda value: value == "Bearer good")

        response = client_from(application, COMPOSE_PEER, signed_in).post(
            RESERVATION_PATH, json=CLAIM, headers={"Authorization": "Bearer good"}
        )

        assert response.status_code == 200

    def test_a_public_dongle_stays_open_to_anyone(self, application: FastAPI, signed_in: TestClient) -> None:
        path = f"/api/devices/{PUBLIC_DEVICE_ID}/reservation"

        assert client_from(application, STRANGER_PEER, signed_in).post(path, json=CLAIM).status_code == 200


class TestTellingACallerWhatItMayUse:
    def test_this_machine_is_told_yes(self, signed_in: TestClient) -> None:
        assert signed_in.get("/api/status").json()["private_access"] is True

    def test_a_stranger_is_told_no(self, application: FastAPI, signed_in: TestClient) -> None:
        assert client_from(application, STRANGER_PEER, signed_in).get("/api/status").json()["private_access"] is False

    def test_a_listed_sentinel_is_told_yes_until_removed(self, application: FastAPI, signed_in: TestClient) -> None:
        listed = client_from(application, LISTED_PEER, signed_in)

        put_addresses(signed_in, [LISTED_PEER])
        assert listed.get("/api/status").json()["private_access"] is True

        put_addresses(signed_in, [])
        assert listed.get("/api/status").json()["private_access"] is False


class TestChangingTheListRestartsRelays:
    def test_a_change_reconciles_the_supervisor(self, signed_in: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        reconciled: list[bool] = []

        async def reconcile(_supervisor: SupervisorService) -> None:
            reconciled.append(True)

        monkeypatch.setattr(SupervisorService, "reconcile", reconcile)

        put_addresses(signed_in, [LISTED_PEER])

        assert reconciled == [True]

    def test_a_refused_change_does_not(self, local_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
        reconciled: list[bool] = []

        async def reconcile(_supervisor: SupervisorService) -> None:
            reconciled.append(True)

        monkeypatch.setattr(SupervisorService, "reconcile", reconcile)

        put_addresses(local_client, [LISTED_PEER])

        assert reconciled == []


class TestNormalizeAllowedAddress:
    @pytest.mark.parametrize(
        ("raw_address", "expected"),
        [
            ("10.0.0.1", "10.0.0.1"),
            ("  10.0.0.1\n", "10.0.0.1"),
            ("::ffff:10.0.0.1", "10.0.0.1"),
            ("2001:DB8::1", "2001:db8::1"),
        ],
    )
    def test_gives_the_canonical_form(self, raw_address: str, expected: str) -> None:
        assert normalize_allowed_address(raw_address) == expected

    @pytest.mark.parametrize(
        "raw_address", ["10.0.0.0/8", "0.0.0.0", "::", "::ffff:0.0.0.0", "239.1.1.1", "fe80::1%en0", "x"]
    )
    def test_refuses(self, raw_address: str) -> None:
        with pytest.raises(ValueError):
            normalize_allowed_address(raw_address)


class TestPeerIsLocal:
    @pytest.mark.parametrize(
        ("peer_address", "expected"),
        [
            ("127.0.0.1", True),
            ("127.9.9.9", True),
            ("::1", True),
            ("::ffff:127.0.0.1", True),
            ("192.168.1.60", False),
            ("::ffff:192.168.1.60", False),
            ("", False),
            (None, False),
            ("testclient", False),
        ],
    )
    def test_against_loopback(self, peer_address: str | None, expected: bool) -> None:
        assert peer_is_local(peer_address, LOOPBACK_NETWORKS) is expected

    def test_ignores_a_zone_on_the_peer(self) -> None:
        assert peer_is_local("fe80::1%eth0", "fe80::1") is True


class TestPrivateAccessList:
    @staticmethod
    def access_list(extra_networks: str = "", addresses: tuple[str, ...] = ()) -> PrivateAccessList:
        class Store:
            async def private_allowed_addresses(self) -> tuple[str, ...]:
                return addresses

        return PrivateAccessList(Store(), extra_networks)  # type: ignore[arg-type]  # only the read is used

    async def test_is_empty_until_loaded_so_nothing_starts_open(self) -> None:
        access = self.access_list(addresses=(LISTED_PEER,))

        assert access.relay_networks() == LOOPBACK_NETWORKS

        await access.load()
        assert access.relay_networks() == f"{LOOPBACK_NETWORKS},{LISTED_PEER}"

    async def test_the_relay_also_gets_the_compose_network(self) -> None:
        access = self.access_list("  172.28.0.0/24 ", (LISTED_PEER,))
        await access.load()

        assert access.relay_networks() == f"{LOOPBACK_NETWORKS},172.28.0.0/24,{LISTED_PEER}"

    async def test_http_callers_never_get_the_compose_network(self) -> None:
        access = self.access_list("172.28.0.0/24")
        await access.load()

        assert access.caller_may_use_private(None, COMPOSE_PEER) is False

    def test_an_unknown_bearer_is_not_a_local_caller(self) -> None:
        assert self.access_list().caller_may_use_private("Bearer nope", STRANGER_PEER) is False

    def test_no_peer_is_not_a_local_caller(self) -> None:
        assert self.access_list().caller_may_use_private(None, None) is False


class TestStoredList:
    @pytest.fixture
    def store(self, seeded_database: AsyncEngine) -> tuple[HostControlSettingsService, Any]:
        session_factory = async_sessionmaker(seeded_database, expire_on_commit=False)
        service = HostControlSettingsService(session_factory, FixedClock(), forced_hotspot_control_enabled=False)  # type: ignore[arg-type]  # only now_ms is used
        return service, session_factory

    async def write_raw(self, session_factory: Any, value: str) -> None:
        async with session_factory() as session:
            row = await session.get(HostControlSettingsModel, database.SINGLE_ROW_ID)
            row.private_allowed_addresses = value
            await session.commit()

    async def test_round_trips(self, store: tuple[HostControlSettingsService, Any]) -> None:
        service, _ = store

        await service.set_private_allowed_addresses((LISTED_PEER, "10.0.0.9"))

        assert await service.private_allowed_addresses() == (LISTED_PEER, "10.0.0.9")

    @pytest.mark.parametrize("stored", ["not json", json.dumps({"a": 1}), "null"])
    async def test_an_unreadable_value_opens_nothing(
        self, store: tuple[HostControlSettingsService, Any], stored: str
    ) -> None:
        service, session_factory = store
        await self.write_raw(session_factory, stored)

        assert await service.private_allowed_addresses() == ()

    async def test_skips_entries_that_are_not_text(self, store: tuple[HostControlSettingsService, Any]) -> None:
        service, session_factory = store
        await self.write_raw(session_factory, json.dumps([LISTED_PEER, 5, None]))

        assert await service.private_allowed_addresses() == (LISTED_PEER,)
