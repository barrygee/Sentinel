"""
tests/backend/test_platform_settings_client.py

Unit tests for backend/platform/settings_client.py — how a module writes a
setting it doesn't own (B7). A write must both store the value and announce
`settings.changed.<namespace>`, exactly like PUT /api/settings/{ns}/{key}, so a
level-triggered reconciler can't tell a background writer from the UI.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.db_helpers import get_setting
from backend.platform import settings_client as settings_client_module
from backend.platform.bus import bus
from backend.platform.settings_client import (
    SettingsUnavailable,
    read_namespace,
    read_setting,
    settings_are_remote,
    write_setting,
)


@pytest.fixture
async def db(test_engine, db_setup) -> AsyncIterator[AsyncSession]:
    session_factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest.fixture
def announcements() -> Iterator[list[tuple[str, dict[str, Any]]]]:
    """Record every settings.changed.* event published on the process bus."""
    received: list[tuple[str, dict[str, Any]]] = []
    unsubscribe = bus.subscribe(
        "settings.changed.radiotest",
        lambda payload: received.append(("radiotest", payload)),
    )
    try:
        yield received
    finally:
        unsubscribe()


class TestReadSetting:
    async def test_returns_the_stored_value(self, db):
        await write_setting(db, "radiotest", "radios", [{"id": 1}])

        assert await read_setting(db, "radiotest", "radios") == [{"id": 1}]

    async def test_returns_the_default_when_unset(self, db):
        assert await read_setting(db, "radiotest", "missing", default=[]) == []


class TestWriteSetting:
    async def test_stores_then_announces_the_namespace_and_key(self, db, announcements):
        await write_setting(db, "radiotest", "radios", [{"id": 1, "port": 4343}])

        assert await get_setting(db, "radiotest", "radios") == [{"id": 1, "port": 4343}]
        assert len(announcements) == 1
        _, payload = announcements[0]
        assert payload["keys"] == ["radios"]
        # The subscriber reads through the same session that committed.
        assert payload["db"] is db

    async def test_the_value_is_committed_before_subscribers_run(self, db):
        seen: list[Any] = []

        async def reader(payload: dict[str, Any]) -> None:
            seen.append(await get_setting(payload["db"], "radiotest", "radios"))

        unsubscribe = bus.subscribe("settings.changed.radiotest", reader)
        try:
            await write_setting(db, "radiotest", "radios", ["new"])
        finally:
            unsubscribe()

        assert seen == [["new"]]

    async def test_a_failing_subscriber_is_swallowed_by_default(self, db):
        def broken(payload: dict[str, Any]) -> None:
            raise RuntimeError("reconcile failed")

        unsubscribe = bus.subscribe("settings.changed.radiotest", broken)
        try:
            await write_setting(db, "radiotest", "radios", [])
        finally:
            unsubscribe()

        # Still stored: a background writer's loop must survive a bad reaction.
        assert await get_setting(db, "radiotest", "radios") == []

    async def test_raise_errors_surfaces_a_failing_subscriber(self, db):
        def broken(payload: dict[str, Any]) -> None:
            raise RuntimeError("reconcile failed")

        unsubscribe = bus.subscribe("settings.changed.radiotest", broken)
        try:
            with pytest.raises(RuntimeError, match="reconcile failed"):
                await write_setting(db, "radiotest", "radios", [], raise_errors=True)
        finally:
            unsubscribe()

    async def test_other_namespaces_are_not_announced(self, db, announcements):
        await write_setting(db, "othertest", "radios", [])

        assert announcements == []


# ── Remote mode: a service in its own container reaches core over HTTP (P6) ──

CORE_URL = "http://core.test:8000"


class FakeCore:
    """Stands in for core's settings API; records every request it receives."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.namespaces: dict[str, Any] = {}
        self.status = 200
        self.unreachable = False

    def answer(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.unreachable:
            raise httpx.ConnectError("connection refused", request=request)
        if self.status != 200:
            return httpx.Response(self.status, json={"detail": "nope"})
        if request.method == "GET":
            namespace = request.url.path.rsplit("/", 1)[-1]
            return httpx.Response(200, json=self.namespaces.get(namespace, {}))
        return httpx.Response(200, json={"status": "ok"})


@pytest.fixture
def fake_core(monkeypatch) -> FakeCore:
    core = FakeCore()
    real_client = httpx.AsyncClient
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL + "/")
    monkeypatch.setattr(
        settings_client_module.httpx,
        "AsyncClient",
        lambda **options: real_client(transport=httpx.MockTransport(core.answer), **options),
    )
    return core


class TestSettingsAreRemote:
    def test_false_in_the_monolith(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_core_url", "")
        assert settings_are_remote() is False

    def test_true_when_core_has_an_address(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
        assert settings_are_remote() is True


class TestReadNamespaceLocally:
    async def test_returns_parsed_values_without_secrets(self, db, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_core_url", "")
        await write_setting(db, "sea", "enabled", True)
        await write_setting(db, "sea", "aisstreamApiKey", "secret-key")

        values = await read_namespace(db, "sea")

        assert values["enabled"] is True
        assert "aisstreamApiKey" not in values

    async def test_an_unknown_namespace_is_empty(self, db, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_core_url", "")
        assert await read_namespace(db, "nothinghere") == {}


class TestRemoteReads:
    async def test_read_namespace_gets_cores_settings_api(self, fake_core):
        fake_core.namespaces["space"] = {"onlineUrl": "https://example.test/tle"}

        assert await read_namespace(None, "space") == {"onlineUrl": "https://example.test/tle"}
        assert [(request.method, str(request.url)) for request in fake_core.requests] == [
            ("GET", f"{CORE_URL}/api/settings/space")
        ]

    async def test_a_non_object_body_reads_as_empty(self, fake_core):
        fake_core.namespaces["space"] = ["not", "an", "object"]

        assert await read_namespace(None, "space") == {}

    async def test_read_setting_picks_the_key_or_the_default(self, fake_core):
        fake_core.namespaces["space"] = {"satelliteRadio": {"25544": {"downlink_hz": 145800000}}}

        assert await read_setting(None, "space", "satelliteRadio") == {"25544": {"downlink_hz": 145800000}}
        assert await read_setting(None, "space", "missing", default="fallback") == "fallback"

    async def test_an_error_status_raises_settings_unavailable(self, fake_core):
        fake_core.status = 500

        with pytest.raises(SettingsUnavailable, match="500"):
            await read_namespace(None, "space")

    async def test_an_unreachable_core_raises_settings_unavailable(self, fake_core):
        fake_core.unreachable = True

        with pytest.raises(SettingsUnavailable, match="unreachable"):
            await read_setting(None, "space", "onlineUrl")


class TestRemoteWrites:
    async def test_write_puts_the_value_to_core_and_skips_the_local_bus(self, fake_core, announcements):
        await write_setting(None, "radiotest", "radios", [{"id": 1}])

        (request,) = fake_core.requests
        assert request.method == "PUT"
        assert str(request.url) == f"{CORE_URL}/api/settings/radiotest/radios"
        assert json.loads(request.content) == {"value": [{"id": 1}]}
        # Core's settings router stores and announces; announcing here too would
        # deliver every change twice.
        assert announcements == []

    async def test_a_refused_write_raises_settings_unavailable(self, fake_core):
        fake_core.status = 400

        with pytest.raises(SettingsUnavailable, match="400"):
            await write_setting(None, "radiotest", "radios", [])
