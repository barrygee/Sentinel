"""The request guard's operator commands: check the policy, list routes, list and lift bans.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_cli.py
"""

from __future__ import annotations

import json
import runpy
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI

from backend.platform.security import cli
from tests.backend.request_guard_helpers import pin_guard_settings, write_policy


@pytest.fixture(autouse=True)
def _test_policy(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    pin_guard_settings(monkeypatch, guard_policy_file=str(write_policy(tmp_path)))


class TestCheckPolicy:
    def test_validates_every_profile(self, capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
        assert cli.check_policy([]) == 0

        output = capsys.readouterr().out
        assert f"policy: {tmp_path / 'guard-policy.json'}" in output
        assert "  core: 6 route rules, 1000/60s per address, in-memory state, classic middleware" in output
        assert "  other: 7 route rules" in output
        assert output.rstrip().endswith("ok")

    def test_only_the_named_profiles(self, capsys: pytest.CaptureFixture[str]) -> None:
        cli.check_policy(["other"])

        output = capsys.readouterr().out
        assert "  other:" in output
        assert "  core:" not in output

    def test_an_unknown_profile_is_an_error(self) -> None:
        with pytest.raises(KeyError, match="nowhere"):
            cli.check_policy(["nowhere"])


def app_module(*extra_paths: str) -> SimpleNamespace:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    async def read_thing(thing_id: str) -> None:
        return None

    app.add_api_route("/api/things/{thing_id}", read_thing, methods=["GET"])
    for path in extra_paths:
        app.add_api_route(path, read_thing, methods=["POST"])
    return SimpleNamespace(app=app, other_app=app)


class TestListRoutes:
    def test_prints_each_route_with_its_rule(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        monkeypatch.setattr(cli.importlib, "import_module", lambda name: app_module())

        assert cli.list_routes("some.module:app", "core", as_json=False) == 0

        line = capsys.readouterr().out.strip()
        assert line.split() == ["GET", "/api/things/{thing_id}", "browser", "default"]

    def test_json(self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
        monkeypatch.setattr(cli.importlib, "import_module", lambda name: app_module())

        cli.list_routes("some.module:other_app", "core", as_json=True)

        assert json.loads(capsys.readouterr().out) == [
            {
                "method": "GET",
                "path": "/api/things/{thing_id}",
                "endpoint": f"{__name__}.app_module.<locals>.read_thing",
                "access": ["browser"],
                "group": "default",
            }
        ]

    def test_the_attribute_defaults_to_app(self, monkeypatch: pytest.MonkeyPatch) -> None:
        imported: list[str] = []
        monkeypatch.setattr(cli.importlib, "import_module", lambda name: imported.append(name) or app_module())

        assert cli.list_routes("some.module", "core", as_json=False) == 0
        assert imported == ["some.module"]

    def test_an_unclassified_route_fails_the_command(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        monkeypatch.setattr(cli.importlib, "import_module", lambda name: app_module("/api/brand-new"))

        assert cli.list_routes("some.module:app", "core", as_json=False) == 1

        captured = capsys.readouterr()
        assert "UNCLASSIFIED" in captured.out
        assert "1 route(s) have no rule" in captured.err


class FakeConnection:
    async def ttl(self, key: str) -> int:
        return {"banned_ips:192.168.1.50": 1200, "banned_networks:10.9.0.0/16": 300}[key]


class FakeRedisManager:
    """Stands in for fastapi-guard's RedisManager."""

    instances: list[FakeRedisManager] = []

    def __init__(self, config: Any) -> None:
        self.config = config
        self.closed = False
        FakeRedisManager.instances.append(self)

    async def initialize(self) -> None:
        return None

    async def keys(self, pattern: str) -> list[str]:
        return {
            "banned_ips:*": ["banned_ips:192.168.1.50"],
            "banned_networks:*": ["banned_networks:10.9.0.0/16"],
        }[pattern]

    @asynccontextmanager
    async def get_connection(self) -> AsyncIterator[FakeConnection]:
        yield FakeConnection()

    async def close(self) -> None:
        self.closed = True


class FakeBanManager:
    def __init__(self, ban_result: bool = True) -> None:
        self.ban_result = ban_result
        self.calls: list[tuple[Any, ...]] = []

    async def initialize_redis(self, redis: Any) -> None:
        self.calls.append(("initialize_redis", redis))

    async def ban_ip(self, address: str, seconds: int, reason: str) -> bool:
        self.calls.append(("ban_ip", address, seconds, reason))
        return self.ban_result

    async def unban_ip(self, address: str) -> None:
        self.calls.append(("unban_ip", address))


@pytest.fixture
def shared_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> FakeBanManager:
    """The CLI pointed at fake Redis and a fake ban manager, with GUARD_REDIS_URL set."""
    pin_guard_settings(
        monkeypatch, guard_policy_file=str(write_policy(tmp_path)), guard_redis_url="redis://redis:6379/0"
    )
    FakeRedisManager.instances = []
    ban_manager = FakeBanManager()
    monkeypatch.setattr(cli, "RedisManager", FakeRedisManager)
    monkeypatch.setattr(cli, "ip_ban_manager", ban_manager)
    return ban_manager


class TestBans:
    def test_without_shared_state_there_are_no_bans_to_manage(self) -> None:
        with pytest.raises(SystemExit, match="GUARD_REDIS_URL is not set"):
            cli.main(["bans"])

    def test_lists_banned_addresses_and_networks_with_time_left(
        self, shared_state: FakeBanManager, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert cli.main(["bans"]) == 0

        lines = [line.split() for line in capsys.readouterr().out.splitlines()]
        assert lines == [["192.168.1.50", "1200", "s", "left"], ["10.9.0.0/16", "300", "s", "left"]]
        assert FakeRedisManager.instances[0].closed

    def test_ban(self, shared_state: FakeBanManager, capsys: pytest.CaptureFixture[str]) -> None:
        assert cli.main(["ban", "192.168.1.66", "--seconds", "86400"]) == 0

        assert ("ban_ip", "192.168.1.66", 86400, "operator") in shared_state.calls
        assert capsys.readouterr().out.strip() == "banned 192.168.1.66 for 86400 s"
        assert FakeRedisManager.instances[0].closed

    def test_ban_defaults_to_an_hour(self, shared_state: FakeBanManager) -> None:
        cli.main(["ban", "192.168.1.66"])

        assert ("ban_ip", "192.168.1.66", 3600, "operator") in shared_state.calls

    def test_a_refused_ban_fails_the_command(
        self, shared_state: FakeBanManager, capsys: pytest.CaptureFixture[str]
    ) -> None:
        shared_state.ban_result = False

        assert cli.main(["ban", "127.0.0.1"]) == 1
        assert "refused to ban 127.0.0.1" in capsys.readouterr().out

    def test_unban(self, shared_state: FakeBanManager, capsys: pytest.CaptureFixture[str]) -> None:
        assert cli.main(["unban", "192.168.1.66"]) == 0

        assert ("unban_ip", "192.168.1.66") in shared_state.calls
        assert capsys.readouterr().out.strip() == "unbanned 192.168.1.66"
        assert FakeRedisManager.instances[0].closed

    def test_the_ban_manager_uses_the_shared_state(self, shared_state: FakeBanManager) -> None:
        cli.main(["unban", "192.168.1.66"])

        assert shared_state.calls[0] == ("initialize_redis", FakeRedisManager.instances[0])


class TestMain:
    def test_check_policy(self, capsys: pytest.CaptureFixture[str]) -> None:
        assert cli.main(["check-policy", "core"]) == 0
        assert "  core:" in capsys.readouterr().out

    def test_routes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        received: list[tuple[str, str, bool]] = []
        monkeypatch.setattr(cli, "list_routes", lambda *arguments: received.append(arguments) or 0)

        assert cli.main(["routes", "backend.main:app", "--profile", "section", "--json"]) == 0
        assert received == [("backend.main:app", "section", True)]

    def test_routes_default_to_this_processs_profile(self, monkeypatch: pytest.MonkeyPatch) -> None:
        received: list[tuple[str, str, bool]] = []
        monkeypatch.setattr(cli, "list_routes", lambda *arguments: received.append(arguments) or 0)

        cli.main(["routes", "backend.main:app"])

        assert received == [("backend.main:app", cli.settings.guard_profile, False)]

    def test_a_command_is_required(self) -> None:
        with pytest.raises(SystemExit):
            cli.main([])


class TestModuleEntryPoint:
    def test_python_dash_m_runs_main_and_exits_with_its_code(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sys, "argv", ["cli", "check-policy", "core"])

        with pytest.raises(SystemExit) as exited:
            runpy.run_module("backend.platform.security.cli", run_name="__main__")

        assert exited.value.code == 0
