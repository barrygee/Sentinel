"""
tests/backend/test_platform_settings_client.py

Unit tests for backend/platform/settings_client.py — how a module writes a
setting it doesn't own (B7). A write must both store the value and announce
`settings.changed.<namespace>`, exactly like PUT /api/settings/{ns}/{key}, so a
level-triggered reconciler can't tell a background writer from the UI.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator, Iterator
from types import SimpleNamespace
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
    SETTINGS_CACHE_TTL_S,
    SETTINGS_STALE_IF_ERROR_S,
    SettingsUnavailable,
    close_core_client,
    delete_secret,
    forget_cached_settings,
    read_namespace,
    read_secret,
    read_setting,
    settings_are_remote,
    wait_for_core,
    write_secret,
    write_setting,
)
from tests.backend.service_credentials_test_helpers import bearer, present_credential


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
        # Secrets by "namespace/key", as core's /internal/settings/secrets/ holds them.
        self.secrets: dict[str, Any] = {}
        self.status = 200
        self.unreachable = False

    def answer(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.unreachable:
            raise httpx.ConnectError("connection refused", request=request)
        if self.status != 200:
            return httpx.Response(self.status, json={"detail": "nope"})
        if request.url.path.startswith("/internal/settings/secrets/"):
            secret_path = request.url.path.removeprefix("/internal/settings/secrets/")
            if request.method == "GET":
                return httpx.Response(200, json={"value": self.secrets.get(secret_path, "")})
            if request.method == "PUT":
                self.secrets[secret_path] = json.loads(request.content)["value"]
            else:
                self.secrets.pop(secret_path, None)
            return httpx.Response(204)
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


# ── secrets (P6.4) ────────────────────────────────────────────────────────────

SECRET_URL = f"{CORE_URL}/internal/settings/secrets/sea/aisstreamApiKey"


class TestSecretsLocally:
    """In the monolith the secret is a user_settings row like any other."""

    @pytest.fixture(autouse=True)
    def monolith(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_core_url", "")

    async def test_unset_reads_as_empty(self, db):
        assert await read_secret(db, "sea", "aisstreamApiKey") == ""

    async def test_write_then_read(self, db):
        await write_secret(db, "sea", "aisstreamApiKey", "abcdef0123456789")

        assert await read_secret(db, "sea", "aisstreamApiKey") == "abcdef0123456789"
        assert await get_setting(db, "sea", "aisstreamApiKey") == "abcdef0123456789"

    async def test_writing_a_secret_is_not_announced(self, db):
        heard: list[dict] = []
        unsubscribe = bus.subscribe("settings.changed.sea", heard.append)
        try:
            await write_secret(db, "sea", "aisstreamApiKey", "abcdef0123456789")
        finally:
            unsubscribe()

        assert heard == []

    async def test_delete_removes_the_row(self, db):
        await write_secret(db, "sea", "aisstreamApiKey", "abcdef0123456789")

        await delete_secret(db, "sea", "aisstreamApiKey")

        assert await get_setting(db, "sea", "aisstreamApiKey", default="gone") == "gone"

    async def test_delete_leaves_other_keys_alone(self, db):
        await write_setting(db, "sea", "enabled", True)
        await write_secret(db, "sea", "aisstreamApiKey", "abcdef0123456789")

        await delete_secret(db, "sea", "aisstreamApiKey")

        assert await get_setting(db, "sea", "enabled") is True

    async def test_a_non_string_value_reads_as_empty(self, db):
        await write_setting(db, "sea", "aisstreamApiKey", 12345)

        assert await read_secret(db, "sea", "aisstreamApiKey") == ""


class TestSecretsRemotely:
    """In a service's container they go to core's internal route, with the service's own credential."""

    @pytest.fixture(autouse=True)
    def credential(self, monkeypatch, tmp_path):
        present_credential(monkeypatch, tmp_path, "sea")

    async def test_read_gets_the_internal_route_with_its_credential(self, fake_core):
        fake_core.secrets["sea/aisstreamApiKey"] = "abcdef0123456789"

        assert await read_secret(None, "sea", "aisstreamApiKey") == "abcdef0123456789"
        (request,) = fake_core.requests
        assert (request.method, str(request.url)) == ("GET", SECRET_URL)
        assert request.headers["Authorization"] == bearer("sea")["Authorization"]

    async def test_an_unset_secret_reads_as_empty(self, fake_core):
        assert await read_secret(None, "sea", "aisstreamApiKey") == ""

    async def test_a_non_string_answer_reads_as_empty(self, fake_core):
        fake_core.secrets["sea/aisstreamApiKey"] = None

        assert await read_secret(None, "sea", "aisstreamApiKey") == ""

    async def test_write_puts_the_value_with_its_credential(
        self, fake_core, announcements
    ):
        await write_secret(None, "sea", "aisstreamApiKey", "abcdef0123456789")

        (request,) = fake_core.requests
        assert (request.method, str(request.url)) == ("PUT", SECRET_URL)
        assert request.headers["Authorization"] == bearer("sea")["Authorization"]
        assert json.loads(request.content) == {"value": "abcdef0123456789"}
        assert fake_core.secrets == {"sea/aisstreamApiKey": "abcdef0123456789"}

    async def test_delete_deletes_with_its_credential(self, fake_core):
        fake_core.secrets["sea/aisstreamApiKey"] = "abcdef0123456789"

        await delete_secret(None, "sea", "aisstreamApiKey")

        (request,) = fake_core.requests
        assert (request.method, str(request.url)) == ("DELETE", SECRET_URL)
        assert request.headers["Authorization"] == bearer("sea")["Authorization"]
        assert fake_core.secrets == {}

    async def test_never_uses_the_public_settings_api(self, fake_core):
        await write_secret(None, "sea", "aisstreamApiKey", "abcdef0123456789")
        await read_secret(None, "sea", "aisstreamApiKey")
        await delete_secret(None, "sea", "aisstreamApiKey")

        assert not any("/api/settings" in str(request.url) for request in fake_core.requests)

    @pytest.mark.parametrize(
        "call",
        [
            lambda: read_secret(None, "sea", "aisstreamApiKey"),
            lambda: write_secret(None, "sea", "aisstreamApiKey", "abcdef0123456789"),
            lambda: delete_secret(None, "sea", "aisstreamApiKey"),
        ],
        ids=["read", "write", "delete"],
    )
    async def test_without_a_credential_nothing_is_sent(
        self, fake_core, monkeypatch, call
    ):
        monkeypatch.setattr(settings, "service_http_credentials_file", "")

        with pytest.raises(SettingsUnavailable, match="no HTTP credential"):
            await call()
        assert fake_core.requests == []

    @pytest.mark.parametrize("status", [401, 404, 503])
    async def test_a_refusal_raises_settings_unavailable(self, fake_core, status):
        fake_core.status = status

        with pytest.raises(SettingsUnavailable, match=str(status)):
            await read_secret(None, "sea", "aisstreamApiKey")

    async def test_an_unreachable_core_raises_settings_unavailable(self, fake_core):
        fake_core.unreachable = True

        with pytest.raises(SettingsUnavailable, match="unreachable"):
            await write_secret(None, "sea", "aisstreamApiKey", "abcdef0123456789")


class FakeClock:
    """Stands in for the settings client's `time` module, so the cache's age is set, not waited for.

    Only the client's own module is patched: asyncio's loop reads the real
    `time.monotonic`, which must keep moving.
    """

    def __init__(self) -> None:
        self.now = 1000.0

    def monotonic(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class HeldCore(FakeCore):
    """A fake core whose GETs wait until `release` is set, so reads can overlap a write or each other."""

    def __init__(self) -> None:
        super().__init__()
        self.release = asyncio.Event()

    async def answer(self, request: httpx.Request) -> httpx.Response:  # type: ignore[override]
        if request.method == "GET":
            await self.release.wait()
        return super().answer(request)


def gets(core: FakeCore) -> list[str]:
    """The URLs of every GET core received, in order."""
    return [str(request.url) for request in core.requests if request.method == "GET"]


AIR_URL = f"{CORE_URL}/api/settings/air"


class TestRemoteReadCache:
    """Remote reads are reused for SETTINGS_CACHE_TTL_S, shared while in flight,
    dropped on this service's own writes, and stand in while core is down."""

    @pytest.fixture
    def clock(self, monkeypatch) -> FakeClock:
        fake_clock = FakeClock()
        monkeypatch.setattr(settings_client_module, "time", fake_clock)
        return fake_clock

    @pytest.fixture
    def held_core(self, monkeypatch) -> HeldCore:
        core = HeldCore()
        real_client = httpx.AsyncClient
        monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL + "/")
        monkeypatch.setattr(
            settings_client_module.httpx,
            "AsyncClient",
            lambda **options: real_client(transport=httpx.MockTransport(core.answer), **options),
        )
        return core

    async def test_a_read_inside_the_ttl_is_served_from_the_cache(self, fake_core, clock):
        fake_core.namespaces["air"] = {"refresh": 30}

        assert await read_namespace(None, "air") == {"refresh": 30}
        fake_core.namespaces["air"] = {"refresh": 60}
        clock.advance(SETTINGS_CACHE_TTL_S - 0.1)

        assert await read_namespace(None, "air") == {"refresh": 30}
        assert gets(fake_core) == [AIR_URL]

    async def test_a_read_at_the_ttl_goes_back_to_core(self, fake_core, clock):
        fake_core.namespaces["air"] = {"refresh": 30}
        await read_namespace(None, "air")
        fake_core.namespaces["air"] = {"refresh": 60}
        clock.advance(SETTINGS_CACHE_TTL_S)

        assert await read_namespace(None, "air") == {"refresh": 60}
        assert gets(fake_core) == [AIR_URL, AIR_URL]

    async def test_each_namespace_is_cached_on_its_own(self, fake_core, clock):
        fake_core.namespaces = {"air": {"a": 1}, "app": {"b": 2}}

        assert await read_namespace(None, "air") == {"a": 1}
        assert await read_namespace(None, "app") == {"b": 2}
        assert await read_setting(None, "air", "a") == 1
        assert gets(fake_core) == [AIR_URL, f"{CORE_URL}/api/settings/app"]

    async def test_a_caller_mutating_its_answer_does_not_change_the_next(self, fake_core, clock):
        fake_core.namespaces["air"] = {"sources": ["adsb.lol"]}

        first = await read_namespace(None, "air")
        first["sources"].append("tampered")
        first["added"] = True

        assert await read_namespace(None, "air") == {"sources": ["adsb.lol"]}

    async def test_reads_share_one_client(self, fake_core, clock):
        await read_namespace(None, "air")
        client = settings_client_module._shared_client

        clock.advance(SETTINGS_CACHE_TTL_S)
        await read_namespace(None, "air")

        assert client is not None
        assert settings_client_module._shared_client is client

    async def test_concurrent_reads_share_one_request(self, held_core, clock):
        held_core.namespaces["air"] = {"refresh": 30}

        readers = [asyncio.create_task(read_namespace(None, "air")) for _ in range(3)]
        await asyncio.sleep(0)
        held_core.release.set()

        assert await asyncio.gather(*readers) == [{"refresh": 30}] * 3
        assert gets(held_core) == [AIR_URL]

    async def test_one_reader_giving_up_does_not_cancel_the_shared_read(self, held_core, clock):
        held_core.namespaces["air"] = {"refresh": 30}
        quitter = asyncio.create_task(read_namespace(None, "air"))
        stayer = asyncio.create_task(read_namespace(None, "air"))
        await asyncio.sleep(0.01)

        quitter.cancel()
        held_core.release.set()

        assert await stayer == {"refresh": 30}
        with pytest.raises(asyncio.CancelledError):
            await quitter
        # And the answer was still cached for the next caller.
        assert await read_namespace(None, "air") == {"refresh": 30}
        assert gets(held_core) == [AIR_URL]

    async def test_a_failed_read_is_not_cached(self, fake_core, clock):
        fake_core.unreachable = True
        with pytest.raises(SettingsUnavailable):
            await read_namespace(None, "air")

        fake_core.unreachable = False
        fake_core.namespaces["air"] = {"refresh": 30}

        assert await read_namespace(None, "air") == {"refresh": 30}
        assert settings_client_module._reads_in_flight == {}

    async def test_a_read_nobody_waits_for_any_more_still_settles(self, held_core, clock):
        held_core.unreachable = True
        quitter = asyncio.create_task(read_namespace(None, "air"))
        await asyncio.sleep(0.01)
        (shared_read,) = settings_client_module._reads_in_flight.values()

        quitter.cancel()
        held_core.release.set()
        with pytest.raises(asyncio.CancelledError):
            await quitter
        with contextlib.suppress(SettingsUnavailable):
            await shared_read
        await asyncio.sleep(0)  # done callbacks run on the next loop tick

        assert settings_client_module._reads_in_flight == {}
        assert settings_client_module._cached_reads == {}

    async def test_a_cancelled_read_stores_nothing(self):
        read: asyncio.Future[bytes] = asyncio.get_running_loop().create_future()
        settings_client_module._reads_in_flight[AIR_URL] = read
        read.cancel()

        settings_client_module._settle_read(AIR_URL, read)

        assert settings_client_module._cached_reads == {}
        assert settings_client_module._reads_in_flight == {AIR_URL: read}

    async def test_its_own_write_drops_the_cached_namespace(self, fake_core, clock):
        fake_core.namespaces["air"] = {"refresh": 30}
        await read_namespace(None, "air")

        await write_setting(None, "air", "refresh", 60)
        fake_core.namespaces["air"] = {"refresh": 60}

        assert await read_namespace(None, "air") == {"refresh": 60}
        assert gets(fake_core) == [AIR_URL, AIR_URL]

    async def test_a_write_leaves_other_namespaces_cached(self, fake_core, clock):
        fake_core.namespaces["app"] = {"mode": "online"}
        await read_namespace(None, "app")

        await write_setting(None, "air", "refresh", 60)
        await read_namespace(None, "app")

        assert gets(fake_core) == [f"{CORE_URL}/api/settings/app"]

    async def test_a_failed_write_still_drops_the_cached_namespace(self, fake_core, clock):
        fake_core.namespaces["air"] = {"refresh": 30}
        await read_namespace(None, "air")
        fake_core.status = 503

        with pytest.raises(SettingsUnavailable):
            await write_setting(None, "air", "refresh", 60)

        fake_core.status = 200
        fake_core.namespaces["air"] = {"refresh": 60}
        assert await read_namespace(None, "air") == {"refresh": 60}

    async def test_a_read_in_flight_during_a_write_is_not_cached(self, held_core, clock):
        held_core.namespaces["air"] = {"refresh": 30}
        reader = asyncio.create_task(read_namespace(None, "air"))
        await asyncio.sleep(0.01)

        await write_setting(None, "air", "refresh", 60)
        held_core.release.set()
        # The read that started before the write still answers its own caller...
        assert await reader == {"refresh": 30}

        # ...but the next read asks core again rather than reusing that answer.
        held_core.namespaces["air"] = {"refresh": 60}
        assert await read_namespace(None, "air") == {"refresh": 60}
        assert gets(held_core) == [AIR_URL, AIR_URL]

    async def test_the_last_good_answer_stands_in_while_core_is_down(self, fake_core, clock, caplog):
        fake_core.namespaces["air"] = {"refresh": 30}
        await read_namespace(None, "air")
        clock.advance(SETTINGS_STALE_IF_ERROR_S - 1)
        fake_core.unreachable = True

        with caplog.at_level(logging.WARNING, logger=settings_client_module.logger.name):
            assert await read_namespace(None, "air") == {"refresh": 30}
            assert await read_namespace(None, "air") == {"refresh": 30}

        stale_warnings = [record for record in caplog.records if "serving cached settings" in record.message]
        assert len(stale_warnings) == 1
        assert gets(fake_core) == [AIR_URL, AIR_URL, AIR_URL]

    async def test_a_new_outage_after_recovery_is_logged_again(self, fake_core, clock, caplog):
        fake_core.namespaces["air"] = {"refresh": 30}
        await read_namespace(None, "air")

        with caplog.at_level(logging.WARNING, logger=settings_client_module.logger.name):
            for _outage in range(2):
                clock.advance(SETTINGS_CACHE_TTL_S)
                fake_core.unreachable = True
                await read_namespace(None, "air")
                clock.advance(SETTINGS_CACHE_TTL_S)
                fake_core.unreachable = False
                await read_namespace(None, "air")

        stale_warnings = [record for record in caplog.records if "serving cached settings" in record.message]
        assert len(stale_warnings) == 2

    async def test_an_answer_too_old_to_stand_in_raises(self, fake_core, clock):
        fake_core.namespaces["air"] = {"refresh": 30}
        await read_namespace(None, "air")
        clock.advance(SETTINGS_STALE_IF_ERROR_S)
        fake_core.unreachable = True

        with pytest.raises(SettingsUnavailable, match="unreachable"):
            await read_namespace(None, "air")

    async def test_a_refusal_also_falls_back_to_the_last_good_answer(self, fake_core, clock):
        fake_core.namespaces["air"] = {"refresh": 30}
        await read_namespace(None, "air")
        clock.advance(SETTINGS_CACHE_TTL_S)
        fake_core.status = 503

        assert await read_namespace(None, "air") == {"refresh": 30}


class TestRemoteSecretCache:
    @pytest.fixture(autouse=True)
    def credential(self, monkeypatch, tmp_path):
        present_credential(monkeypatch, tmp_path, "sea")

    @pytest.fixture(autouse=True)
    def clock(self, monkeypatch) -> FakeClock:
        fake_clock = FakeClock()
        monkeypatch.setattr(settings_client_module, "time", fake_clock)
        return fake_clock

    async def test_a_secret_read_inside_the_ttl_is_served_from_the_cache(self, fake_core):
        fake_core.secrets["sea/aisstreamApiKey"] = "first-key-0123456"

        assert await read_secret(None, "sea", "aisstreamApiKey") == "first-key-0123456"
        fake_core.secrets["sea/aisstreamApiKey"] = "second-key-012345"

        assert await read_secret(None, "sea", "aisstreamApiKey") == "first-key-0123456"
        assert gets(fake_core) == [SECRET_URL]

    async def test_a_non_object_answer_reads_as_empty(self, fake_core, monkeypatch):
        def answer_a_list(request: httpx.Request) -> httpx.Response:
            fake_core.requests.append(request)
            return httpx.Response(200, json=["not", "an", "object"])

        monkeypatch.setattr(fake_core, "answer", answer_a_list)

        assert await read_secret(None, "sea", "aisstreamApiKey") == ""

    @pytest.mark.parametrize(
        "change",
        [
            lambda: write_secret(None, "sea", "aisstreamApiKey", "second-key-012345"),
            lambda: delete_secret(None, "sea", "aisstreamApiKey"),
        ],
        ids=["write", "delete"],
    )
    async def test_its_own_change_drops_the_cached_secret(self, fake_core, change):
        fake_core.secrets["sea/aisstreamApiKey"] = "first-key-0123456"
        await read_secret(None, "sea", "aisstreamApiKey")

        await change()
        await read_secret(None, "sea", "aisstreamApiKey")

        assert gets(fake_core) == [SECRET_URL, SECRET_URL]

    @pytest.mark.parametrize(
        "change",
        [
            lambda: write_secret(None, "sea", "aisstreamApiKey", "second-key-012345"),
            lambda: delete_secret(None, "sea", "aisstreamApiKey"),
        ],
        ids=["write", "delete"],
    )
    async def test_a_failed_change_still_drops_the_cached_secret(self, fake_core, change):
        fake_core.secrets["sea/aisstreamApiKey"] = "first-key-0123456"
        await read_secret(None, "sea", "aisstreamApiKey")
        fake_core.status = 503

        with pytest.raises(SettingsUnavailable):
            await change()

        fake_core.status = 200
        await read_secret(None, "sea", "aisstreamApiKey")
        assert gets(fake_core) == [SECRET_URL, SECRET_URL]


class TestCoreClientLifetime:
    async def test_close_closes_the_shared_client_and_forgets_it(self, fake_core):
        await read_namespace(None, "air")
        client = settings_client_module._shared_client
        assert client is not None

        await close_core_client()

        assert client.is_closed
        assert settings_client_module._shared_client is None

    async def test_close_without_a_client_does_nothing(self):
        assert settings_client_module._shared_client is None

        await close_core_client()

        assert settings_client_module._shared_client is None

    async def test_a_read_after_close_opens_a_new_client(self, fake_core):
        await read_namespace(None, "air")
        await close_core_client()

        await read_setting(None, "app", "mode")

        assert settings_client_module._shared_client is not None
        assert not settings_client_module._shared_client.is_closed

    async def test_forget_drops_the_client_and_every_cached_read(self, fake_core):
        await read_namespace(None, "air")
        settings_client_module._stale_reads_logged.add(AIR_URL)

        forget_cached_settings()

        assert settings_client_module._shared_client is None
        assert settings_client_module._cached_reads == {}
        assert settings_client_module._reads_in_flight == {}
        assert settings_client_module._stale_reads_logged == set()


class TestWaitForCore:
    @pytest.fixture
    def sleeps(self, monkeypatch) -> list[float]:
        """Every wait between attempts, recorded instead of slept."""
        slept: list[float] = []

        async def sleep(seconds):
            slept.append(seconds)

        monkeypatch.setattr(settings_client_module.asyncio, "sleep", sleep)
        return slept

    async def test_returns_at_once_in_the_monolith(self, monkeypatch, sleeps):
        monkeypatch.setattr(settings, "sentinel_core_url", "")

        def no_http(**options):
            raise AssertionError("the monolith is core; there is nothing to wait for")

        monkeypatch.setattr(settings_client_module.httpx, "AsyncClient", no_http)

        await wait_for_core("Land APRS station cleanup")

        assert sleeps == []

    async def test_returns_once_core_answers(self, fake_core, sleeps):
        await wait_for_core("Land APRS station cleanup")

        assert [(request.method, str(request.url)) for request in fake_core.requests] == [
            ("GET", f"{CORE_URL}/api/settings/app")
        ]
        assert sleeps == []

    async def test_retries_while_core_is_unreachable_or_refusing(self, fake_core, sleeps, monkeypatch, caplog):
        replies = iter(["unreachable", 503, 200])

        def answer(request):
            fake_core.requests.append(request)
            reply = next(replies)
            if reply == "unreachable":
                raise httpx.ConnectError("connection refused", request=request)
            return httpx.Response(reply, json={})

        monkeypatch.setattr(fake_core, "answer", answer)
        caplog.set_level("INFO", logger=settings_client_module.__name__)

        await wait_for_core("Land APRS station cleanup")

        assert len(fake_core.requests) == 3
        assert sleeps == [settings_client_module.CORE_WAIT_RETRY_S] * 2
        # One line while waiting, naming the work held up — not one per attempt.
        waiting_lines = [record for record in caplog.records if "waiting for core" in record.getMessage()]
        assert len(waiting_lines) == 1
        assert waiting_lines[0].levelname == "INFO"
        assert waiting_lines[0].getMessage().startswith("Land APRS station cleanup: waiting for core to answer")

    def core_lines(self, caplog) -> list[tuple[str, str]]:
        return [
            (record.levelname, record.getMessage())
            for record in caplog.records
            if record.name == settings_client_module.__name__
        ]

    async def test_says_it_connected_when_core_answers_first_time(self, fake_core, sleeps, caplog):
        caplog.set_level("INFO", logger=settings_client_module.__name__)

        await wait_for_core("space service startup")

        assert self.core_lines(caplog) == [("INFO", f"space service startup: connected to core at {CORE_URL}/")]

    async def test_says_how_long_it_waited_once_core_answers(self, fake_core, sleeps, monkeypatch, caplog):
        replies = iter(["unreachable", "unreachable", 200])

        def answer(request):
            fake_core.requests.append(request)
            if next(replies) == "unreachable":
                raise httpx.ConnectError("connection refused", request=request)
            return httpx.Response(200, json={})

        clock = iter([100.0, 116.34])  # started, then answered
        monkeypatch.setattr(fake_core, "answer", answer)
        # Only the settings client's clock: asyncio needs the real one.
        monkeypatch.setattr(settings_client_module, "time", SimpleNamespace(monotonic=lambda: next(clock)))
        caplog.set_level("INFO", logger=settings_client_module.__name__)

        await wait_for_core("land service startup")

        assert self.core_lines(caplog) == [
            (
                "INFO",
                "land service startup: waiting for core to answer "
                "(core settings API unreachable: connection refused)",
            ),
            ("INFO", f"land service startup: connected to core at {CORE_URL}/ after 16.3 s"),
        ]

    async def test_logs_nothing_in_the_monolith(self, monkeypatch, sleeps, caplog):
        monkeypatch.setattr(settings, "sentinel_core_url", "")
        caplog.set_level("INFO", logger=settings_client_module.__name__)

        await wait_for_core("land service startup")

        assert self.core_lines(caplog) == []

    async def test_retries_every_two_seconds(self):
        assert settings_client_module.CORE_WAIT_RETRY_S == 2.0
