"""Tests for the "This machine" link (`services/local_link.py`, ADR 0007).

The link asks core's registry for sdr-manager-local and keeps the one `is_local`
row of `remote_sdr_hosts` in step. Core's registry is replaced by a stub
returning `DiscoveredService`s (or raising), the database by a per-test
in-memory one, and the host poller by async mocks, so each test asserts the row
and which poller call the link made.
"""

from __future__ import annotations

import asyncio
import logging
from unittest.mock import AsyncMock

import pytest
from backend.database import Base
from backend.platform.sdk.discovery import DiscoveredService, RegistryUnavailable
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from sentinel_sdr_manager_remote import module as service_module
from sentinel_sdr_manager_remote.models import AUTH_MODE_PASSWORD, AUTH_MODE_SERVICE, RemoteSdrHost
from sentinel_sdr_manager_remote.services import local_link as link_module
from sentinel_sdr_manager_remote.services.local_link import LOCAL_SERVICE_KIND, LocalLink, local_address

LOCAL_URL = "http://host.docker.internal:8000"


@pytest.fixture()
async def session_factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(link_module, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest.fixture(autouse=True)
def poller(monkeypatch):
    """The host poller's start/stop/restart, as mocks the tests can assert on."""
    for method in ("start_host", "stop_host", "restart_host"):
        monkeypatch.setattr(link_module.host_poller, method, AsyncMock())
    return link_module.host_poller


def registry_answers(monkeypatch, answer) -> list[str]:
    """Make core's registry answer `answer` (a list, None, or an exception); returns the kinds asked for."""
    asked: list[str] = []

    async def listing(kind: str):
        asked.append(kind)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(link_module, "list_registered_services", listing)
    return asked


def local_service(internal_url: str = LOCAL_URL, *, available: bool = True, service_id: str = "sdr-manager-local"):
    return DiscoveredService(id=service_id, kind=LOCAL_SERVICE_KIND, internal_url=internal_url, available=available)


async def all_hosts(session_factory) -> list[RemoteSdrHost]:
    async with session_factory() as session:
        return list((await session.execute(select(RemoteSdrHost).order_by(RemoteSdrHost.id))).scalars().all())


async def add_host(session_factory, **overrides) -> int:
    fields = dict(name=None, address="10.0.0.5", port=8000, auth_token="", enabled=True, created_at=1000)
    fields.update(overrides)
    async with session_factory() as session:
        host = RemoteSdrHost(**fields)
        session.add(host)
        await session.commit()
        return host.id


async def add_local_host(session_factory, **overrides) -> int:
    fields = dict(address="host.docker.internal", port=8000, is_local=True, auth_mode=AUTH_MODE_SERVICE)
    fields.update(overrides)
    return await add_host(session_factory, **fields)


# ── local_address ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("internal_url", "expected"),
    [
        (LOCAL_URL, ("host.docker.internal", 8000)),
        ("http://sdr-manager-local:8000/", ("sdr-manager-local", 8000)),
        ("http://192.168.1.20:8123", ("192.168.1.20", 8123)),
        ("http://sdr-manager-local", ("sdr-manager-local", 80)),
    ],
)
def test_local_address_reads_a_plain_http_address(internal_url, expected):
    assert local_address(internal_url) == expected


@pytest.mark.parametrize(
    "internal_url",
    [
        pytest.param("https://sdr-manager-local:8000", id="https"),
        pytest.param("sdr-manager-local:8000", id="no-scheme"),
        pytest.param("http://:8000", id="no-host"),
        pytest.param("http://user:pass@sdr-manager-local:8000", id="credentials"),
        pytest.param("http://user@sdr-manager-local:8000", id="user-only"),
        pytest.param("http://sdr-manager-local:8000/api", id="path"),
        pytest.param("http://sdr-manager-local:8000/?x=1", id="query"),
        pytest.param("http://sdr-manager-local:8000/#top", id="fragment"),
        pytest.param("http://sdr-manager-local:99999", id="port-out-of-range"),
        pytest.param("http://sdr-manager-local:0", id="port-zero"),
        pytest.param("http://sdr-manager-local:port", id="port-not-a-number"),
        pytest.param("http://[::1]:8000", id="ipv6"),
        pytest.param("http://bad!host:8000", id="invalid-hostname"),
        pytest.param("", id="empty"),
    ],
)
def test_local_address_refuses_what_the_client_cannot_use(internal_url):
    assert local_address(internal_url) is None


# ── Linking ────────────────────────────────────────────────────────────────────


async def test_asks_core_for_sdr_manager_local(monkeypatch, session_factory):
    asked = registry_answers(monkeypatch, [])

    await LocalLink().sync_once()

    assert asked == ["sdr-manager-local"]


async def test_a_registered_service_creates_the_this_machine_row(monkeypatch, session_factory, poller):
    registry_answers(monkeypatch, [local_service()])

    await LocalLink().sync_once()

    (host,) = await all_hosts(session_factory)
    assert host.is_local is True
    assert host.auth_mode == AUTH_MODE_SERVICE
    assert host.auth_token == ""
    assert host.enabled is True
    assert (host.address, host.port) == ("host.docker.internal", 8000)
    assert host.created_at > 0
    poller.restart_host.assert_awaited_once_with(host.id)


async def test_linking_is_idempotent(monkeypatch, session_factory, poller):
    registry_answers(monkeypatch, [local_service()])
    link = LocalLink()
    await link.sync_once()
    (first,) = await all_hosts(session_factory)
    poller.restart_host.reset_mock()

    await link.sync_once()
    await link.sync_once()

    (host,) = await all_hosts(session_factory)
    assert (host.id, host.created_at, host.address, host.enabled) == (first.id, first.created_at, first.address, True)
    # An unchanged tick restarts nothing; it only makes sure a poller is running.
    poller.restart_host.assert_not_awaited()
    assert poller.start_host.await_count == 2
    poller.start_host.assert_awaited_with(host.id)


async def test_the_first_available_usable_service_is_the_one_linked(monkeypatch, session_factory, caplog):
    registry_answers(
        monkeypatch,
        [
            local_service("http://down:8000", available=False, service_id="first"),
            local_service("https://wrong-scheme:8000", service_id="second"),
            local_service("http://sdr-manager-local:8000", service_id="third"),
        ],
    )

    with caplog.at_level(logging.WARNING):
        await LocalLink().sync_once()

    (host,) = await all_hosts(session_factory)
    assert (host.address, host.port) == ("sdr-manager-local", 8000)
    assert "second registered an unusable address 'https://wrong-scheme:8000'" in caplog.text


async def test_an_operator_row_at_the_same_address_is_adopted(monkeypatch, session_factory, poller):
    # Added by hand before the link first ran, with radios already made from it.
    operator_id = await add_host(
        session_factory,
        name="My box",
        address="host.docker.internal",
        port=8000,
        auth_token="console-password",
        auth_mode=AUTH_MODE_PASSWORD,
        enabled=False,
    )
    registry_answers(monkeypatch, [local_service()])

    await LocalLink().sync_once()

    (host,) = await all_hosts(session_factory)
    assert host.id == operator_id
    assert host.name == "My box"
    assert host.is_local is True
    assert host.auth_mode == AUTH_MODE_SERVICE
    # The bearer replaces the password, which is not kept for no one to use.
    assert host.auth_token == ""
    assert host.enabled is True
    poller.restart_host.assert_awaited_once_with(operator_id)


async def test_an_operator_row_elsewhere_is_left_alone(monkeypatch, session_factory):
    operator_id = await add_host(session_factory, address="10.0.0.5", auth_token="pw")
    registry_answers(monkeypatch, [local_service()])

    await LocalLink().sync_once()

    operator, local = await all_hosts(session_factory)
    assert (operator.id, operator.is_local, operator.auth_token) == (operator_id, False, "pw")
    assert local.is_local is True


async def test_a_moved_service_readdresses_the_row(monkeypatch, session_factory, poller):
    local_id = await add_local_host(session_factory)
    registry_answers(monkeypatch, [local_service("http://192.168.1.20:8123")])

    await LocalLink().sync_once()

    (host,) = await all_hosts(session_factory)
    assert (host.id, host.address, host.port) == (local_id, "192.168.1.20", 8123)
    poller.restart_host.assert_awaited_once_with(local_id)


async def test_a_move_onto_an_operator_rows_address_is_refused(monkeypatch, session_factory, poller, caplog):
    local_id = await add_local_host(session_factory)
    operator_id = await add_host(session_factory, address="192.168.1.20", port=8123, auth_token="pw")
    registry_answers(monkeypatch, [local_service("http://192.168.1.20:8123")])

    with caplog.at_level(logging.WARNING):
        await LocalLink().sync_once()

    local, operator = await all_hosts(session_factory)
    assert (local.id, local.address, local.port) == (local_id, "host.docker.internal", 8000)
    assert (operator.id, operator.is_local, operator.auth_token) == (operator_id, False, "pw")
    poller.restart_host.assert_not_awaited()
    assert "another SDR host is registered" in caplog.text


@pytest.mark.parametrize(
    ("drift", "expected"),
    [
        pytest.param({"enabled": False}, {"enabled": True}, id="disabled"),
        pytest.param(
            {"auth_mode": AUTH_MODE_PASSWORD, "auth_token": "pw"},
            {"auth_mode": AUTH_MODE_SERVICE, "auth_token": ""},
            id="password-mode",
        ),
    ],
)
async def test_a_drifted_row_is_put_back(monkeypatch, session_factory, poller, drift, expected):
    local_id = await add_local_host(session_factory, **drift)
    registry_answers(monkeypatch, [local_service()])

    await LocalLink().sync_once()

    (host,) = await all_hosts(session_factory)
    assert {field: getattr(host, field) for field in expected} == expected
    poller.restart_host.assert_awaited_once_with(local_id)


# ── Absence ────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "registered",
    [
        pytest.param([], id="nothing-registered"),
        pytest.param([local_service(available=False)], id="failing-probes"),
        pytest.param([local_service("https://sdr-manager-local:8000")], id="unusable-address"),
    ],
)
async def test_an_absent_service_disables_the_row_without_deleting_it(monkeypatch, session_factory, poller, registered):
    local_id = await add_local_host(session_factory, name="This machine")
    registry_answers(monkeypatch, registered)

    await LocalLink().sync_once()

    (host,) = await all_hosts(session_factory)
    assert (host.id, host.name, host.is_local, host.enabled) == (local_id, "This machine", True, False)
    poller.stop_host.assert_awaited_once_with(local_id)


async def test_an_already_disabled_row_is_left_as_it_is(monkeypatch, session_factory, poller):
    await add_local_host(session_factory, enabled=False)
    registry_answers(monkeypatch, [])

    await LocalLink().sync_once()

    poller.stop_host.assert_not_awaited()


async def test_absence_with_no_row_creates_nothing(monkeypatch, session_factory, poller):
    registry_answers(monkeypatch, [])

    await LocalLink().sync_once()

    assert await all_hosts(session_factory) == []
    poller.stop_host.assert_not_awaited()


async def test_a_returning_service_re_enables_the_same_row(monkeypatch, session_factory, poller):
    local_id = await add_local_host(session_factory)
    link = LocalLink()
    registry_answers(monkeypatch, [])
    await link.sync_once()

    registry_answers(monkeypatch, [local_service()])
    await link.sync_once()

    (host,) = await all_hosts(session_factory)
    assert (host.id, host.enabled) == (local_id, True)
    poller.restart_host.assert_awaited_once_with(local_id)


@pytest.mark.parametrize(
    "answer",
    [
        pytest.param(None, id="no-core-to-ask"),
        pytest.param(RegistryUnavailable("core unreachable"), id="core-unreachable"),
    ],
)
async def test_not_knowing_changes_nothing(monkeypatch, session_factory, poller, answer):
    await add_local_host(session_factory)
    registry_answers(monkeypatch, answer)

    await LocalLink().sync_once()

    (host,) = await all_hosts(session_factory)
    assert host.enabled is True
    poller.stop_host.assert_not_awaited()
    poller.restart_host.assert_not_awaited()
    poller.start_host.assert_not_awaited()


async def test_not_knowing_creates_nothing(monkeypatch, session_factory):
    registry_answers(monkeypatch, RegistryUnavailable("core unreachable"))

    await LocalLink().sync_once()

    assert await all_hosts(session_factory) == []


# ── The one-row guarantee ─────────────────────────────────────────────────────


async def test_the_database_holds_at_most_one_local_row(session_factory):
    await add_local_host(session_factory)

    with pytest.raises(IntegrityError):
        await add_local_host(session_factory, address="elsewhere")


async def test_any_number_of_operator_rows_is_allowed(session_factory):
    await add_host(session_factory, address="10.0.0.5")
    await add_host(session_factory, address="10.0.0.6")
    await add_local_host(session_factory)

    assert [host.is_local for host in await all_hosts(session_factory)] == [False, False, True]


# ── The background task ───────────────────────────────────────────────────────


async def test_the_task_syncs_every_interval_and_survives_a_failing_tick(monkeypatch, caplog):
    ticks = 0
    third_tick = asyncio.Event()

    async def sync_once() -> None:
        nonlocal ticks
        ticks += 1
        if ticks == 1:
            raise RuntimeError("boom")
        if ticks == 3:
            third_tick.set()

    monkeypatch.setattr(link_module.get_settings(), "local_link_interval_s", 0.001)
    link = LocalLink()
    monkeypatch.setattr(link, "sync_once", sync_once)

    with caplog.at_level(logging.ERROR):
        link.start()
        await asyncio.wait_for(third_tick.wait(), timeout=2)
        await link.stop()

    assert ticks >= 3
    assert "local link: sync failed" in caplog.text


async def test_start_is_a_no_op_while_running_and_stop_cancels(monkeypatch):
    started = asyncio.Event()

    async def sync_once() -> None:
        started.set()

    monkeypatch.setattr(link_module.get_settings(), "local_link_interval_s", 3600)
    link = LocalLink()
    monkeypatch.setattr(link, "sync_once", sync_once)

    link.start()
    task = link._task
    link.start()
    assert link._task is task
    await asyncio.wait_for(started.wait(), timeout=2)

    await link.stop()

    assert task.cancelled()
    assert link._task is None


async def test_start_after_the_task_ended_starts_a_new_one(monkeypatch):
    monkeypatch.setattr(link_module.get_settings(), "local_link_interval_s", 3600)
    link = LocalLink()
    monkeypatch.setattr(link, "sync_once", AsyncMock())
    link.start()
    first = link._task
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first

    link.start()

    assert link._task is not first
    await link.stop()


async def test_stop_without_start_is_a_no_op():
    await LocalLink().stop()


# ── The service lifecycle ─────────────────────────────────────────────────────


async def test_the_lifecycle_starts_the_link_after_the_pollers_and_stops_it_first(monkeypatch):
    calls: list[str] = []

    async def start_all() -> None:
        calls.append("pollers started")

    async def stop_all() -> None:
        calls.append("pollers stopped")

    async def stop_link() -> None:
        calls.append("link stopped")

    monkeypatch.setattr(service_module.host_poller, "start_all", start_all)
    monkeypatch.setattr(service_module.host_poller, "stop_all", stop_all)
    monkeypatch.setattr(service_module.local_link, "start", lambda: calls.append("link started"))
    monkeypatch.setattr(service_module.local_link, "stop", stop_link)

    await service_module._start()
    await service_module._stop()

    assert calls == ["pollers started", "link started", "link stopped", "pollers stopped"]
