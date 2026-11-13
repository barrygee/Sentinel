"""Tests for the poller keeping `sdr.radios` in step with a Sentinel host's SDRs.

A host set to add its SDRs automatically (`auto_add_sdrs`) makes every public
SDR with an output port a radio, adopts a radio typed in at the same address
and port, and drops the radio of an SDR made private. Every host has its
mirrors' ports followed and its pre-rename `sentry_*` radios renamed.

Run with:  uv run --project backend pytest services/sdr-manager-remote/backend/tests/test_sdr_manager_remote_radio_sync.py
"""

from __future__ import annotations

import logging
from typing import Any

import pytest
from backend.database import Base
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from sentinel_sdr_manager_remote.models import RemoteSdrHost
from sentinel_sdr_manager_remote.services import host_poller as poller_module
from sentinel_sdr_manager_remote.services import sdr_manager_client as client_module
from sentinel_sdr_manager_remote.services.sdr_manager_client import SdrManagerResponse

HOST_ID = 7
HOST_ADDRESS = "192.168.5.67"


def device(**overrides: Any) -> dict[str, Any]:
    return {
        "device_id": "usb:1-1.1",
        "name": "RTL-SDR V4",
        "present": True,
        "enabled": True,
        "visibility": "public",
        "notes": "loft",
        "antenna": "D777",
        "output": {"iq_port": 1234, "control_port": 1236, "host": "172.17.0.2"},
        **overrides,
    }


def mirror(**overrides: Any) -> dict[str, Any]:
    return {
        "id": 3,
        "name": "RTL-SDR V4",
        "host": HOST_ADDRESS,
        "port": 1234,
        "sdr_manager_host_id": HOST_ID,
        "sdr_manager_device_id": "usb:1-1.1",
        **overrides,
    }


class SettingsStore:
    """Stands in for core's `sdr.radios` setting, counting writes."""

    def __init__(self, radios: Any) -> None:
        self.radios = radios
        self.writes = 0
        self.reads = 0

    async def read_setting(self, _db: Any, namespace: str, key: str, default: Any = None) -> Any:
        assert (namespace, key) == ("sdr", "radios")
        self.reads += 1
        return self.radios

    async def write_setting(self, _db: Any, namespace: str, key: str, value: Any) -> None:
        assert (namespace, key) == ("sdr", "radios")
        self.writes += 1
        self.radios = value


@pytest.fixture
def settings_store(monkeypatch: pytest.MonkeyPatch):
    """Install a `SettingsStore` holding the given radios as the poller's settings client."""

    def install(radios: Any) -> SettingsStore:
        store = SettingsStore(radios)
        monkeypatch.setattr(poller_module, "read_setting", store.read_setting)
        monkeypatch.setattr(poller_module, "write_setting", store.write_setting)
        monkeypatch.setattr(poller_module, "now_ms", lambda: 1_800_000_000_000)
        return store

    return install


async def sync(*devices: Any, auto_add_sdrs: bool, may_use_private: bool = False) -> None:
    await poller_module.HostPoller()._sync_device_radios(
        HOST_ID,
        HOST_ADDRESS,
        {"generated_at": 0, "sdrs": list(devices)},
        auto_add_sdrs=auto_add_sdrs,
        may_use_private=may_use_private,
    )


class TestAddingAutomatically:
    async def test_a_public_sdr_with_a_port_becomes_a_radio(self, settings_store, caplog) -> None:
        store = settings_store([{"id": 4, "name": "Shed", "host": "10.0.0.9", "port": 1234}])

        with caplog.at_level(logging.INFO, logger=poller_module.__name__):
            await sync(device(), auto_add_sdrs=True)

        assert store.writes == 1
        assert store.radios[1] == {
            "id": 5,
            "created_at": 1_800_000_000_000,
            "name": "RTL-SDR V4",
            # The address the operator registered, not the host's own view of itself.
            "host": HOST_ADDRESS,
            "port": 1234,
            "description": "",
            "enabled": True,
            "bandwidth": None,
            "rf_gain": None,
            "agc": None,
            "sdr_manager_host_id": HOST_ID,
            "sdr_manager_device_id": "usb:1-1.1",
            "notes": "loft",
            "antenna": "D777",
            "visibility": "public",
        }
        assert "Radio 5 added for device usb:1-1.1 on SDR host 7" in caplog.text

    async def test_the_first_radio_is_number_one_and_an_unnamed_sdr_is_named_by_its_id(self, settings_store) -> None:
        store = settings_store([])

        await sync(device(name="", notes=None, antenna=None), auto_add_sdrs=True)

        assert store.radios[0]["id"] == 1
        assert store.radios[0]["name"] == "usb:1-1.1"
        assert store.radios[0]["notes"] == ""
        assert store.radios[0]["antenna"] == ""

    async def test_ids_skip_radios_without_a_whole_number_id(self, settings_store) -> None:
        store = settings_store(["junk", {"id": "9"}, {"id": 2}])

        await sync(device(), auto_add_sdrs=True)

        assert store.radios[-1]["id"] == 3

    async def test_every_public_sdr_is_added_once(self, settings_store) -> None:
        store = settings_store([])

        await sync(
            device(),
            device(device_id="usb:1-1.2", name="Garage", output={"iq_port": 1238}),
            auto_add_sdrs=True,
        )
        await sync(
            device(),
            device(device_id="usb:1-1.2", name="Garage", output={"iq_port": 1238}),
            auto_add_sdrs=True,
        )

        assert [radio["name"] for radio in store.radios] == ["RTL-SDR V4", "Garage"]
        # The second poll found both already there.
        assert store.writes == 1

    @pytest.mark.parametrize("output", [None, {}, {"iq_port": "1234"}])
    async def test_an_sdr_not_set_up_has_nothing_to_listen_to(self, settings_store, output) -> None:
        store = settings_store([])

        await sync(device(output=output), auto_add_sdrs=True)

        assert store.radios == []
        assert store.writes == 0

    async def test_a_private_sdr_is_not_added(self, settings_store) -> None:
        store = settings_store([])

        await sync(device(visibility="private"), auto_add_sdrs=True)

        assert store.radios == []
        assert store.writes == 0

    async def test_a_private_sdr_this_sentinel_may_use_becomes_a_radio(self, settings_store) -> None:
        store = settings_store([])

        await sync(device(visibility="private"), auto_add_sdrs=True, may_use_private=True)

        assert [radio["name"] for radio in store.radios] == ["RTL-SDR V4"]

    async def test_a_private_sdr_this_sentinel_may_use_keeps_its_radio(self, settings_store) -> None:
        store = settings_store([mirror()])

        await sync(device(visibility="private"), auto_add_sdrs=True, may_use_private=True)

        assert store.radios == [mirror()]

    async def test_making_an_sdr_private_removes_its_radio(self, settings_store, caplog) -> None:
        manual = {"id": 4, "name": "Shed", "host": "10.0.0.9", "port": 1234}
        store = settings_store([mirror(), manual])

        with caplog.at_level(logging.INFO, logger=poller_module.__name__):
            await sync(device(visibility="private"), auto_add_sdrs=True)

        assert store.radios == [manual]
        assert "Radio 3 removed: device usb:1-1.1 was made private on its host" in caplog.text

    async def test_an_unplugged_sdr_keeps_its_radio(self, settings_store) -> None:
        # A loose USB plug must never cost the operator their radio.
        store = settings_store([mirror()])

        await sync(device(present=False), auto_add_sdrs=True)

        assert store.radios == [mirror()]
        assert store.writes == 0

    async def test_a_radio_typed_in_at_the_sdrs_address_is_adopted_not_duplicated(self, settings_store, caplog) -> None:
        typed_in = {"id": 2, "name": "Pi dongle", "host": HOST_ADDRESS, "port": 1234, "sdr_manager_host_id": None}
        store = settings_store([typed_in])

        with caplog.at_level(logging.INFO, logger=poller_module.__name__):
            await sync(device(), auto_add_sdrs=True)

        assert store.radios == [
            {**typed_in, "sdr_manager_host_id": HOST_ID, "sdr_manager_device_id": "usb:1-1.1"},
        ]
        assert "Radio 2 adopted as the mirror of device usb:1-1.1" in caplog.text

    @pytest.mark.parametrize(
        "other",
        [
            {"id": 2, "host": "10.0.0.9", "port": 1234},  # another machine
            {"id": 2, "host": HOST_ADDRESS, "port": 1300},  # another port
            {"id": 2, "host": HOST_ADDRESS, "port": 1234, "sdr_manager_host_id": 99},  # another host's mirror
        ],
    )
    async def test_only_a_typed_in_radio_at_the_same_address_and_port_is_adopted(self, settings_store, other) -> None:
        store = settings_store([dict(other)])

        await sync(device(), auto_add_sdrs=True)

        assert store.radios[0] == other
        assert store.radios[1]["sdr_manager_device_id"] == "usb:1-1.1"


class TestAddingManually:
    async def test_nothing_is_added_without_auto_add(self, settings_store) -> None:
        store = settings_store([])

        await sync(device(), auto_add_sdrs=False)

        assert store.radios == []
        assert store.writes == 0

    async def test_a_typed_in_radio_is_left_alone(self, settings_store) -> None:
        typed_in = {"id": 2, "host": HOST_ADDRESS, "port": 1234, "sdr_manager_host_id": None}
        store = settings_store([dict(typed_in)])

        await sync(device(), auto_add_sdrs=False)

        assert store.radios == [typed_in]

    async def test_a_private_sdr_keeps_the_radio_the_operator_added(self, settings_store) -> None:
        store = settings_store([mirror()])

        await sync(device(visibility="private"), auto_add_sdrs=False)

        assert store.radios == [mirror()]
        assert store.writes == 0


class TestFollowingAndRenaming:
    @pytest.mark.parametrize("auto_add_sdrs", [False, True])
    async def test_a_mirror_follows_its_sdr_to_a_new_port(self, settings_store, caplog, auto_add_sdrs) -> None:
        store = settings_store([mirror()])

        with caplog.at_level(logging.INFO, logger=poller_module.__name__):
            await sync(device(output={"iq_port": 4343}), auto_add_sdrs=auto_add_sdrs)

        assert store.radios == [mirror(port=4343)]
        assert "Radio 3 followed device usb:1-1.1 from port 1234 to 4343" in caplog.text

    async def test_a_mirror_on_the_right_port_is_not_rewritten(self, settings_store) -> None:
        store = settings_store([mirror()])

        await sync(device(), auto_add_sdrs=True)

        assert store.writes == 0

    async def test_a_mirror_keeps_its_port_while_its_sdr_has_none(self, settings_store) -> None:
        store = settings_store([mirror()])

        await sync(device(output=None), auto_add_sdrs=False)

        assert store.radios == [mirror()]

    async def test_a_pre_rename_radio_is_renamed_and_still_counts_as_the_mirror(self, settings_store) -> None:
        legacy = {"id": 3, "name": "RTL-SDR V4", "host": HOST_ADDRESS, "port": 1234}
        legacy |= {"sentry_host_id": HOST_ID, "sentry_device_id": "usb:1-1.1"}
        store = settings_store([legacy])

        await sync(device(), auto_add_sdrs=True)

        assert store.radios == [mirror()]
        assert store.writes == 1

    async def test_a_pre_rename_radio_is_renamed_on_a_manual_host_too(self, settings_store) -> None:
        store = settings_store([{"id": 3, "sentry_host_id": 1}])

        await sync(device(), auto_add_sdrs=False)

        assert store.radios == [{"id": 3, "sdr_manager_host_id": 1, "sdr_manager_device_id": None}]

    async def test_a_radio_with_both_names_keeps_the_new_ones(self, settings_store) -> None:
        store = settings_store([mirror(sentry_host_id=99, sentry_device_id="usb:9")])

        await sync(device(), auto_add_sdrs=False)

        assert store.radios == [mirror()]


class TestNothingToDo:
    @pytest.mark.parametrize(
        "payload",
        [None, {}, {"sdrs": None}, {"sdrs": "junk"}],
    )
    async def test_a_reply_without_a_device_list_reads_and_writes_nothing(self, settings_store, payload) -> None:
        """No list (an older or broken host) is not "no devices": nothing may be deleted on it."""
        store = settings_store([mirror()])

        await poller_module.HostPoller()._sync_device_radios(HOST_ID, HOST_ADDRESS, payload, auto_add_sdrs=True)

        assert store.reads == 0
        assert store.writes == 0

    @pytest.mark.parametrize("sdrs", [[], ["junk", {"name": "no id"}, {"device_id": 5}]])
    async def test_a_list_with_no_usable_sdrs_writes_nothing_when_the_host_has_no_radios(
        self, settings_store, sdrs
    ) -> None:
        store = settings_store([mirror(sdr_manager_host_id=HOST_ID + 1)])

        await poller_module.HostPoller()._sync_device_radios(HOST_ID, HOST_ADDRESS, {"sdrs": sdrs}, auto_add_sdrs=False)

        assert store.writes == 0


class TestDeletedOnTheHost:
    """A device its host no longer lists was deleted there (its Forget), so its radio goes."""

    async def test_the_radio_of_a_device_no_longer_listed_is_removed(self, settings_store) -> None:
        store = settings_store([mirror(), mirror(id=4, sdr_manager_device_id="serial:KEPT", port=1238)])

        await sync(device(device_id="serial:KEPT", output={"iq_port": 1238, "control_port": 1240}), auto_add_sdrs=False)

        assert [radio["id"] for radio in store.radios] == [4]
        assert store.writes == 1

    async def test_the_last_device_deleted_takes_the_last_radio(self, settings_store) -> None:
        store = settings_store([mirror()])

        await sync(auto_add_sdrs=False)

        assert store.radios == []

    async def test_an_unplugged_dongle_keeps_its_radio(self, settings_store) -> None:
        """Still listed, not present: a loose plug must never cost the operator its radio."""
        store = settings_store([mirror()])

        await sync(device(present=False), auto_add_sdrs=False)

        assert [radio["id"] for radio in store.radios] == [3]
        assert store.writes == 0

    async def test_another_hosts_radios_and_radios_added_by_ip_are_left_alone(self, settings_store) -> None:
        other_host = mirror(id=5, sdr_manager_host_id=HOST_ID + 1)
        by_ip = {"id": 6, "name": "Shed", "host": HOST_ADDRESS, "port": 1300, "sdr_manager_host_id": None}
        store = settings_store([other_host, by_ip])

        await sync(auto_add_sdrs=False)

        assert store.radios == [other_host, by_ip]
        assert store.writes == 0

    async def test_a_radios_setting_that_is_not_a_list_is_left_alone(self, settings_store) -> None:
        store = settings_store({"not": "a list"})

        await sync(device(), auto_add_sdrs=True)

        assert store.radios == {"not": "a list"}
        assert store.writes == 0


class TestFromThePoll:
    @pytest.fixture
    async def session_factory(self, monkeypatch: pytest.MonkeyPatch):
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
        monkeypatch.setattr(poller_module, "AsyncSessionLocal", factory)
        yield factory
        await engine.dispose()

    async def poll_host(
        self,
        session_factory,
        monkeypatch,
        *,
        auto_add_sdrs: bool | None,
        is_local: bool = False,
        status_fields: dict[str, Any] | None = None,
        reported_device: dict[str, Any] | None = None,
    ) -> poller_module.HostPoller:
        columns: dict[str, Any] = {} if auto_add_sdrs is None else {"auto_add_sdrs": auto_add_sdrs}
        columns["is_local"] = is_local
        async with session_factory() as session:
            host = RemoteSdrHost(name="Pi", address=HOST_ADDRESS, port=8000, auth_token="tok", created_at=1, **columns)
            session.add(host)
            await session.commit()
            host_id = host.id

        class StatusClient:
            def __init__(self, *_args: Any, **_connection: Any) -> None:
                pass

            async def get_status(self) -> SdrManagerResponse:
                body = {"generated_at": 0, "sdrs": [reported_device or device()], **(status_fields or {})}
                return SdrManagerResponse(data=body, api_version="1")

            async def get_sdr_export(self) -> SdrManagerResponse:
                return SdrManagerResponse(data={}, api_version="1")

        monkeypatch.setattr(client_module, "SdrManagerClient", StatusClient)
        poller = poller_module.HostPoller()
        assert await poller._poll_once(host_id) is True
        self.polled_host_id = host_id
        return poller

    async def test_a_host_set_to_add_automatically_gets_its_radios(
        self, session_factory, settings_store, monkeypatch
    ) -> None:
        store = settings_store([])

        await self.poll_host(session_factory, monkeypatch, auto_add_sdrs=True)

        assert [radio["name"] for radio in store.radios] == ["RTL-SDR V4"]
        assert store.radios[0]["host"] == HOST_ADDRESS

    async def test_a_host_that_allows_this_sentinel_gives_it_private_sdrs(
        self, session_factory, settings_store, monkeypatch
    ) -> None:
        store = settings_store([])

        poller = await self.poll_host(
            session_factory,
            monkeypatch,
            auto_add_sdrs=True,
            status_fields={"private_access": True},
            reported_device=device(visibility="private"),
        )

        assert [radio["name"] for radio in store.radios] == ["RTL-SDR V4"]
        assert poller.get_snapshot(self.polled_host_id).may_use_private is True

    async def test_a_host_that_refuses_this_sentinel_keeps_its_private_sdrs(
        self, session_factory, settings_store, monkeypatch
    ) -> None:
        store = settings_store([])

        poller = await self.poll_host(
            session_factory,
            monkeypatch,
            auto_add_sdrs=True,
            status_fields={"private_access": False},
            reported_device=device(visibility="private"),
        )

        assert store.radios == []
        assert poller.get_snapshot(self.polled_host_id).may_use_private is False

    async def test_an_older_host_that_says_nothing_counts_as_refusing(
        self, session_factory, settings_store, monkeypatch
    ) -> None:
        store = settings_store([])

        poller = await self.poll_host(
            session_factory, monkeypatch, auto_add_sdrs=True, reported_device=device(visibility="private")
        )

        assert store.radios == []
        assert poller.get_snapshot(self.polled_host_id).may_use_private is False

    async def test_this_machine_may_always_use_its_own_private_sdrs(
        self, session_factory, settings_store, monkeypatch
    ) -> None:
        store = settings_store([])

        poller = await self.poll_host(
            session_factory,
            monkeypatch,
            auto_add_sdrs=True,
            is_local=True,
            reported_device=device(visibility="private"),
        )

        assert [radio["name"] for radio in store.radios] == ["RTL-SDR V4"]
        assert poller.get_snapshot(self.polled_host_id).may_use_private is True

    async def test_a_new_host_adds_manually_unless_told_otherwise(
        self, session_factory, settings_store, monkeypatch
    ) -> None:
        store = settings_store([])

        await self.poll_host(session_factory, monkeypatch, auto_add_sdrs=None)

        assert store.radios == []
