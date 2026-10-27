"""The SDR Manager API contract: sdr-manager-remote's client against sdr-manager-local (ADR 0007).

Both ends of the API live in this repo and can be renamed freely, which is
exactly how they drift apart: a field renamed on one side reads as missing on
the other, and nothing fails until a Pi in the field stops showing its
dongles. Here the real `SdrManagerClient` talks to the real sdr-manager-local
app, on simulated hardware (two RTL-SDRs: `serial:SIM-ADSB-01` and
`usb:1-1.2`), and the replies are handed to the code that reads them — the
host poller's port following, the reservation proxy, the hosts router and the
radio hub's availability check — so a reply that parses but means nothing to
its reader fails too.

Covered: every client method, the error envelope each family of failure
comes back in, the version, holder and session wire names, and the console
password flow. Not covered: the event stream, which no remote consumer reads
yet.

Run with:  uv run --project backend pytest tests/contract/sdr_manager_api
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from sentinel_radio import radios as radio_hub_radios
from sentinel_sdr_manager_local.api_version import (
    MANAGEMENT_API_VERSION,
    MANAGEMENT_API_VERSION_HEADER,
)
from sentinel_sdr_manager_local.routers.devices import HOLDER_HEADER
from sentinel_sdr_manager_local.services.console_auth import (
    SESSION_COOKIE_NAME as LOCAL_SESSION_COOKIE_NAME,
)
from sentinel_sdr_manager_remote.models import RemoteSdrHost
from sentinel_sdr_manager_remote.routers.hosts import _coerce_source
from sentinel_sdr_manager_remote.services import reservations
from sentinel_sdr_manager_remote.services.host_poller import HostSnapshot, host_poller
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    API_VERSION_HEADER,
    RESERVATION_HOLDER_HEADER,
    SESSION_COOKIE_NAME,
    SdrManagerApiError,
    SdrManagerClient,
)

from tests.contract.sdr_manager_api.conftest import (
    CONSOLE_PASSWORD,
    HOST_ADDRESS,
    HOST_PORT,
    RunningHost,
)

ADSB_DEVICE_ID = "serial:SIM-ADSB-01"
SECOND_DEVICE_ID = "usb:1-1.2"
ADSB_IQ_PORT = 4343
HOLDER = "sentinel:contract-a"
OTHER_HOLDER = "sentinel:contract-b"
HOST_ID = 1


def open_client() -> SdrManagerClient:
    """A client for a host with no console password set, as Sentinel holds it."""
    return SdrManagerClient(HOST_ADDRESS, HOST_PORT, "")


async def wait_for_devices(client: SdrManagerClient) -> list[dict[str, Any]]:
    """The simulated dongles, once the host's first hotplug sweep has found them."""
    for _attempt in range(100):
        devices = (await client.get_devices()).data["devices"]
        if len(devices) == 2:
            return devices
        await asyncio.sleep(0.05)
    raise AssertionError("sdr-manager-local never detected its simulated dongles")


async def configure_adsb_dongle(
    client: SdrManagerClient, **changes: Any
) -> dict[str, Any]:
    """Give the ADS-B dongle a name and an output port, as an operator would on first use."""
    await wait_for_devices(client)
    response = await client.patch_device(
        ADSB_DEVICE_ID,
        {
            "name": "ADSB",
            "output_port": ADSB_IQ_PORT,
            "visibility": "public",
            **changes,
        },
    )
    return response.data


async def host_snapshot(client: SdrManagerClient) -> HostSnapshot:
    """What the host poller caches after one successful poll of this host."""
    status = await client.get_status()
    snapshot = HostSnapshot(host_id=HOST_ID)
    snapshot.reachable = True
    snapshot.status_payload = status.data
    snapshot.api_version = status.api_version
    snapshot.export_payload = (await client.get_sdr_export()).data
    return snapshot


async def api_error(call: Any) -> SdrManagerApiError:
    """The `SdrManagerApiError` an awaited call raises; fails the test if it succeeds."""
    with pytest.raises(SdrManagerApiError) as raised:
        await call
    return raised.value


class TestWireNames:
    """The names each side spells independently, so a rename on one side alone fails here."""

    def test_the_version_header(self) -> None:
        assert (
            API_VERSION_HEADER
            == MANAGEMENT_API_VERSION_HEADER
            == "X-Sdr-Manager-Api-Version"
        )

    def test_the_reservation_holder_header(self) -> None:
        assert (
            RESERVATION_HOLDER_HEADER
            == HOLDER_HEADER
            == "X-Sdr-Manager-Reservation-Holder"
        )

    def test_the_session_cookie(self) -> None:
        assert SESSION_COOKIE_NAME == LOCAL_SESSION_COOKIE_NAME == "sdr_manager_session"


class TestReads:
    async def test_every_read_reports_the_api_version(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        reads = [
            client.get_health,
            client.get_status,
            client.get_sdr_export,
            client.get_devices,
            client.get_hotspot,
            client.get_hotspot_interfaces,
            client.get_hotspot_clients,
        ]

        versions = {(await read()).api_version for read in reads}

        assert versions == {str(MANAGEMENT_API_VERSION)}

    async def test_health(self, sdr_manager_local: RunningHost) -> None:
        health = (await open_client().get_health()).data

        assert health["status"] == "ok"
        assert health["database"] == "ok"

    async def test_devices_lists_both_dongles_with_a_port_suggestion(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()

        devices = await wait_for_devices(client)
        listing = (await client.get_devices()).data

        assert {device["device_id"] for device in devices} == {
            ADSB_DEVICE_ID,
            SECOND_DEVICE_ID,
        }
        assert all(device["present"] is True for device in devices)
        assert isinstance(listing["port_suggestion"], int)
        assert {"port_min", "port_max", "reserved", "in_use"} <= set(
            listing["constraints"]
        )

    async def test_the_export_identifies_the_host_as_sdr_manager(
        self, sdr_manager_local: RunningHost
    ) -> None:
        export = (await open_client().get_sdr_export()).data

        source = _coerce_source(export)

        assert source is not None
        assert (source.name, source.host, source.http_port) == (
            "sdr-manager",
            HOST_ADDRESS,
            HOST_PORT,
        )
        assert isinstance(source.version, str) and source.version
        assert source.location is not None
        assert isinstance(export["control_port_offset"], int)

    async def test_hotspot_reads_answer_on_a_machine_without_networkmanager(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()

        hotspot = (await client.get_hotspot()).data
        interfaces = (await client.get_hotspot_interfaces()).data
        clients = (await client.get_hotspot_clients()).data

        assert hotspot["available"] is False
        assert "nm_unavailable" in hotspot["warnings"]
        assert interfaces["interfaces"] == []
        assert "clients" in clients


class TestWhatTheReadersReadFromTheReplies:
    """The replies, handed to the sdr-manager-remote and radio hub code that consumes them."""

    async def test_a_configured_dongle_has_the_address_the_poller_follows(
        self, sdr_manager_local: RunningHost, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)
        snapshot = await host_snapshot(client)
        monkeypatch.setattr(
            host_poller,
            "get_snapshot",
            lambda host_id: snapshot if host_id == HOST_ID else None,
        )

        address = reservations._stream_address(HOST_ID, ADSB_DEVICE_ID)

        assert address == (HOST_ADDRESS, ADSB_IQ_PORT)

    async def test_the_hub_reads_a_configured_dongle_as_available(
        self, sdr_manager_local: RunningHost, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)
        snapshot = await host_snapshot(client)
        monkeypatch.setattr(host_poller, "all_snapshots", lambda: [snapshot])
        mirrored_radio = {
            "id": 1,
            "sdr_manager_host_id": HOST_ID,
            "sdr_manager_device_id": ADSB_DEVICE_ID,
        }

        assert await radio_hub_radios.device_availability(mirrored_radio) == (True, "")

    async def test_the_hub_reads_a_dongle_without_a_port_as_unavailable(
        self, sdr_manager_local: RunningHost, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = open_client()
        await wait_for_devices(client)
        snapshot = await host_snapshot(client)
        monkeypatch.setattr(host_poller, "all_snapshots", lambda: [snapshot])
        mirrored_radio = {
            "id": 1,
            "sdr_manager_host_id": HOST_ID,
            "sdr_manager_device_id": SECOND_DEVICE_ID,
        }

        available, reason = await radio_hub_radios.device_availability(mirrored_radio)

        assert available is False
        assert "output port" in reason

    async def test_the_hub_reads_a_disabled_dongle_as_disabled(
        self, sdr_manager_local: RunningHost, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client, enabled=False)
        snapshot = await host_snapshot(client)
        monkeypatch.setattr(host_poller, "all_snapshots", lambda: [snapshot])
        mirrored_radio = {
            "id": 1,
            "sdr_manager_host_id": HOST_ID,
            "sdr_manager_device_id": ADSB_DEVICE_ID,
        }

        available, reason = await radio_hub_radios.device_availability(mirrored_radio)

        assert available is False
        assert "disabled" in reason

    async def test_the_reservation_proxy_finds_a_public_dongle_in_the_export(
        self, sdr_manager_local: RunningHost
    ) -> None:
        await configure_adsb_dongle(open_client())
        stored_host = RemoteSdrHost(
            id=HOST_ID,
            address=HOST_ADDRESS,
            port=HOST_PORT,
            auth_token="",
            enabled=True,
        )

        async def get(model: type, host_id: int) -> RemoteSdrHost | None:
            return stored_host if (model, host_id) == (RemoteSdrHost, HOST_ID) else None

        reply = await reservations._on_device_address(
            {
                "db": SimpleNamespace(get=get),
                "host_id": HOST_ID,
                "device_id": ADSB_DEVICE_ID,
            }
        )

        assert reply == {
            "ok": True,
            "found": True,
            "host": HOST_ADDRESS,
            "port": ADSB_IQ_PORT,
        }

    async def test_a_private_dongle_is_left_out_of_the_export(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client, visibility="private")

        export = (await client.get_sdr_export()).data

        assert export["sdrs"] == []


class TestDeviceWrites:
    async def test_a_patch_configures_the_device_and_returns_it(
        self, sdr_manager_local: RunningHost
    ) -> None:
        device = await configure_adsb_dongle(open_client())

        assert device["device_id"] == ADSB_DEVICE_ID
        assert (device["name"], device["output_port"]) == ("ADSB", ADSB_IQ_PORT)
        # The device id carries ':' and is sent percent-encoded as one path segment.
        assert f"/api/devices/{ADSB_DEVICE_ID.replace(':', '%3A')}" in [
            request.url.raw_path.decode()
            for request in sdr_manager_local.requests
            if request.method == "PATCH"
        ]

    async def test_an_invalid_patch_is_a_validation_error_naming_the_field(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await wait_for_devices(client)

        error = await api_error(client.patch_device(ADSB_DEVICE_ID, {"output_port": 1}))

        assert (error.status_code, error.code) == (422, "validation_error")
        assert error.message.startswith("output_port: ")
        assert error.context["errors"][0]["loc"] == ["body", "output_port"]

    async def test_an_unknown_device_is_not_found(
        self, sdr_manager_local: RunningHost
    ) -> None:
        error = await api_error(
            open_client().patch_device("usb:9-9", {"name": "Nothing"})
        )

        assert (error.status_code, error.code) == (404, "unknown_device")

    async def test_a_present_device_cannot_be_deleted(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)

        error = await api_error(client.delete_device(ADSB_DEVICE_ID))

        assert (error.status_code, error.code) == (409, "device_present")

    async def test_a_serial_flash_starts_and_asks_for_a_replug(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)

        operation = (await client.flash_serial(ADSB_DEVICE_ID, "SIM-ADSB-02")).data

        assert operation["device_id"] == ADSB_DEVICE_ID
        assert operation["status"] == "in_progress"
        assert operation["requires_replug"] is True
        assert isinstance(operation["operation_id"], str)


class TestReservations:
    async def test_a_claim_returns_the_expiry_the_proxy_tells_the_hub(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)

        reservation = (
            await client.acquire_reservation(
                ADSB_DEVICE_ID, holder=HOLDER, label="AIR", ttl_seconds=60
            )
        ).data

        assert (
            reservation["device_id"],
            reservation["holder"],
            reservation["label"],
        ) == (ADSB_DEVICE_ID, HOLDER, "AIR")
        # The proxy forwards `expires_at` to the radio hub as an int of Unix ms.
        assert isinstance(reservation["expires_at"], int)
        assert reservation["expires_at"] - reservation["reserved_at"] == 60_000

    async def test_the_holder_renews_its_own_claim(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)
        first = (
            await client.acquire_reservation(
                ADSB_DEVICE_ID, holder=HOLDER, label="AIR", ttl_seconds=60
            )
        ).data

        renewed = (
            await client.acquire_reservation(
                ADSB_DEVICE_ID, holder=HOLDER, label="AIR", ttl_seconds=120
            )
        ).data

        assert renewed["holder"] == HOLDER
        assert renewed["expires_at"] > first["expires_at"]

    async def test_another_claimant_is_refused_with_who_holds_it(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)
        held = (
            await client.acquire_reservation(
                ADSB_DEVICE_ID, holder=HOLDER, label="AIR", ttl_seconds=60
            )
        ).data

        error = await api_error(
            client.acquire_reservation(
                ADSB_DEVICE_ID, holder=OTHER_HOLDER, label="Other", ttl_seconds=60
            )
        )

        assert (error.status_code, error.code) == (409, "device_reserved")
        assert error.context == {
            "holder": HOLDER,
            "label": "AIR",
            "expires_at": held["expires_at"],
        }

    async def test_force_takes_the_claim_over(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)
        await client.acquire_reservation(
            ADSB_DEVICE_ID, holder=HOLDER, label="AIR", ttl_seconds=60
        )

        taken = (
            await client.acquire_reservation(
                ADSB_DEVICE_ID,
                holder=OTHER_HOLDER,
                label="Other",
                ttl_seconds=60,
                force=True,
            )
        ).data

        assert taken["holder"] == OTHER_HOLDER

    async def test_only_the_holder_may_retune_a_claimed_dongle(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)
        await client.acquire_reservation(
            ADSB_DEVICE_ID, holder=HOLDER, label="AIR", ttl_seconds=60
        )

        refused = await api_error(
            client.patch_device(ADSB_DEVICE_ID, {"center_hz": 1_090_000_000})
        )
        retuned = (
            await client.patch_device(
                ADSB_DEVICE_ID, {"center_hz": 1_090_000_000}, holder=HOLDER
            )
        ).data

        assert (refused.status_code, refused.code) == (409, "device_reserved")
        assert retuned["center_hz"] == 1_090_000_000

    async def test_only_the_holder_may_release(
        self, sdr_manager_local: RunningHost
    ) -> None:
        client = open_client()
        await configure_adsb_dongle(client)
        await client.acquire_reservation(
            ADSB_DEVICE_ID, holder=HOLDER, label="AIR", ttl_seconds=60
        )

        refused = await api_error(
            client.release_reservation(ADSB_DEVICE_ID, holder=OTHER_HOLDER)
        )
        released = await client.release_reservation(ADSB_DEVICE_ID, holder=HOLDER)
        reclaimed = (
            await client.acquire_reservation(
                ADSB_DEVICE_ID, holder=OTHER_HOLDER, label="Other", ttl_seconds=60
            )
        ).data

        assert (refused.status_code, refused.code) == (409, "device_reserved")
        assert released.data is None  # 204: nothing to decode
        assert reclaimed["holder"] == OTHER_HOLDER


class TestHotspotWrites:
    @pytest.mark.parametrize(
        "write",
        [
            lambda client: client.put_hotspot({"ssid": "Sentinel"}),
            lambda client: client.enable_hotspot(),
            lambda client: client.disable_hotspot(confirm_uplink_loss=True),
            lambda client: client.confirm_hotspot(),
            lambda client: client.delete_hotspot(),
        ],
        ids=["put", "enable", "disable", "confirm", "delete"],
    )
    async def test_refused_while_hotspot_control_is_off(
        self, sdr_manager_local: RunningHost, write: Any
    ) -> None:
        error = await api_error(write(open_client()))

        assert (error.status_code, error.code) == (403, "hotspot_control_disabled")
        assert error.message


class TestConsolePassword:
    """A host with a console password: sdr-manager-remote signs in with it, never with a bearer token."""

    @pytest.fixture
    async def protected(self, sdr_manager_local: RunningHost) -> RunningHost:
        async with httpx.AsyncClient(
            base_url=f"http://{HOST_ADDRESS}:{HOST_PORT}"
        ) as browser:
            response = await browser.post(
                "/api/auth/password", json={"new_password": CONSOLE_PASSWORD}
            )
        assert response.status_code == 204
        sdr_manager_local.requests.clear()
        return sdr_manager_local

    async def test_signs_in_once_and_reuses_the_session(
        self, protected: RunningHost
    ) -> None:
        client = SdrManagerClient(HOST_ADDRESS, HOST_PORT, CONSOLE_PASSWORD)

        await client.get_devices()
        await client.get_status()
        await SdrManagerClient(HOST_ADDRESS, HOST_PORT, CONSOLE_PASSWORD).get_hotspot()

        assert protected.paths("POST").count("/api/auth/login") == 1
        assert all(
            SESSION_COOKIE_NAME in request.headers.get("cookie", "")
            for request in protected.requests[2:]
        )

    async def test_a_wrong_password_is_tried_once_then_reported(
        self, protected: RunningHost
    ) -> None:
        error = await api_error(
            SdrManagerClient(HOST_ADDRESS, HOST_PORT, "not-the-password").get_devices()
        )

        assert error.status_code == 401
        assert protected.paths() == ["/api/devices", "/api/auth/login"]

    async def test_without_a_password_it_never_tries_to_sign_in(
        self, protected: RunningHost
    ) -> None:
        error = await api_error(open_client().get_devices())

        assert error.status_code == 401
        assert "/api/auth/login" not in protected.paths()

    async def test_the_export_and_health_stay_open(
        self, protected: RunningHost
    ) -> None:
        client = open_client()

        assert (await client.get_health()).data["status"] == "ok"
        assert (await client.get_sdr_export()).data["source"]["name"] == "sdr-manager"
        assert "/api/auth/login" not in protected.paths()

    async def test_a_lapsed_session_is_replaced_by_signing_in_again(
        self, protected: RunningHost
    ) -> None:
        client = SdrManagerClient(HOST_ADDRESS, HOST_PORT, CONSOLE_PASSWORD)
        await client.get_devices()
        # Changing the password away and back invalidates every session issued
        # before, including the one this client remembers.
        async with httpx.AsyncClient(
            base_url=f"http://{HOST_ADDRESS}:{HOST_PORT}"
        ) as browser:
            for current, new in (
                (CONSOLE_PASSWORD, "interim-password"),
                ("interim-password", CONSOLE_PASSWORD),
            ):
                response = await browser.post(
                    "/api/auth/password",
                    json={"new_password": new, "current_password": current},
                )
                assert response.status_code == 204
        protected.requests.clear()

        devices = (await client.get_devices()).data

        assert "devices" in devices
        assert protected.paths() == ["/api/devices", "/api/auth/login", "/api/devices"]
