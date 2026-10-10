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
    SettingsUnavailable,
    delete_secret,
    read_namespace,
    read_secret,
    read_setting,
    settings_are_remote,
    wait_for_core,
    write_secret,
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
JOIN_TOKEN = "service-join-token"


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
    """In a service's container they go to core's join-token-gated internal route."""

    @pytest.fixture(autouse=True)
    def join_token(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_join_token", JOIN_TOKEN)

    async def test_read_gets_the_internal_route_with_the_join_token(self, fake_core):
        fake_core.secrets["sea/aisstreamApiKey"] = "abcdef0123456789"

        assert await read_secret(None, "sea", "aisstreamApiKey") == "abcdef0123456789"
        (request,) = fake_core.requests
        assert (request.method, str(request.url)) == ("GET", SECRET_URL)
        assert request.headers["Authorization"] == f"Bearer {JOIN_TOKEN}"

    async def test_an_unset_secret_reads_as_empty(self, fake_core):
        assert await read_secret(None, "sea", "aisstreamApiKey") == ""

    async def test_a_non_string_answer_reads_as_empty(self, fake_core):
        fake_core.secrets["sea/aisstreamApiKey"] = None

        assert await read_secret(None, "sea", "aisstreamApiKey") == ""

    async def test_write_puts_the_value_with_the_join_token(self, fake_core, announcements):
        await write_secret(None, "sea", "aisstreamApiKey", "abcdef0123456789")

        (request,) = fake_core.requests
        assert (request.method, str(request.url)) == ("PUT", SECRET_URL)
        assert request.headers["Authorization"] == f"Bearer {JOIN_TOKEN}"
        assert json.loads(request.content) == {"value": "abcdef0123456789"}
        assert fake_core.secrets == {"sea/aisstreamApiKey": "abcdef0123456789"}

    async def test_delete_deletes_with_the_join_token(self, fake_core):
        fake_core.secrets["sea/aisstreamApiKey"] = "abcdef0123456789"

        await delete_secret(None, "sea", "aisstreamApiKey")

        (request,) = fake_core.requests
        assert (request.method, str(request.url)) == ("DELETE", SECRET_URL)
        assert request.headers["Authorization"] == f"Bearer {JOIN_TOKEN}"
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
    async def test_without_a_join_token_yet_nothing_is_sent(self, fake_core, monkeypatch, call):
        # Core writes the shared token file at start; until then there is none.
        monkeypatch.setattr(settings, "sentinel_join_token", "")
        monkeypatch.setattr(settings, "sentinel_join_token_file", "")

        with pytest.raises(SettingsUnavailable, match="join token"):
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
