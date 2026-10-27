"""Sentinel's ban rules: never its own processes, and Redis decides whether a ban still stands.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_bans.py
"""

from __future__ import annotations

import logging
from typing import Any

import pytest

from backend.platform.security.bans import install_ban_rules, is_protected
from tests.backend.request_guard_helpers import INTERNAL_ADDRESS, LAN_BROWSER_ADDRESS, pin_guard_settings


@pytest.fixture(autouse=True)
def _known_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    pin_guard_settings(monkeypatch, guard_internal_networks="172.28.0.0/24", guard_service_hosts="192.168.1.20")


class TestIsProtected:
    @pytest.mark.parametrize(
        "target",
        [
            INTERNAL_ADDRESS,  # a container on Sentinel's network
            "172.28.0.2",  # the gateway
            "127.0.0.1",
            "::1",
            "192.168.1.20",  # a radio host (GUARD_SERVICE_HOSTS)
            "::ffff:172.28.0.140",  # as a dual-stack socket reports it
            "172.28.0.0/25",  # a range inside Sentinel's network
            "172.16.0.0/12",  # a range that contains it
        ],
    )
    def test_sentinels_own_processes(self, target: str) -> None:
        assert is_protected(target)

    @pytest.mark.parametrize("target", [LAN_BROWSER_ADDRESS, "203.0.113.9", "192.168.1.0/30", "fd00::1", "not-an-ip"])
    def test_everyone_else(self, target: str) -> None:
        assert not is_protected(target)

    def test_follows_the_settings_when_asked(self, monkeypatch: pytest.MonkeyPatch) -> None:
        assert not is_protected("10.5.0.7")
        pin_guard_settings(monkeypatch, guard_internal_networks="10.5.0.0/24")

        assert is_protected("10.5.0.7")


class FakeRedisHandler:
    def __init__(self, stored: dict[str, str] | None = None, broken: bool = False) -> None:
        self.stored = stored or {}
        self.broken = broken

    async def get_key(self, namespace: str, key: str) -> str | None:
        if self.broken:
            raise ConnectionError("Redis is down")
        return self.stored.get(f"{namespace}:{key}")


class FakeBanManager:
    """fastapi-guard's IPBanManager, reduced to what the ban rules touch."""

    def __init__(self, redis_handler: Any = None) -> None:
        self.banned_ips: dict[str, float] = {}
        self.redis_handler = redis_handler
        self.bans: list[tuple[str, int, str]] = []

    def _purge_banned_ip(self, ip: str) -> None:
        self.banned_ips.pop(ip, None)

    async def ban_ip(self, ip: str, duration: int, reason: str = "threshold_exceeded") -> bool:
        self.bans.append((ip, duration, reason))
        self.banned_ips[ip] = 9e18
        return True

    async def is_ip_banned(self, ip: str) -> bool:
        return ip in self.banned_ips


def managed(redis_handler: Any = None) -> FakeBanManager:
    manager = FakeBanManager(redis_handler)
    install_ban_rules(manager)
    return manager


class TestBanning:
    async def test_a_client_is_banned_as_before(self) -> None:
        manager = managed()

        assert await manager.ban_ip(LAN_BROWSER_ADDRESS, 3600, "behavioral_violation") is True
        assert manager.bans == [(LAN_BROWSER_ADDRESS, 3600, "behavioral_violation")]

    async def test_sentinels_own_process_is_never_banned(self, caplog: pytest.LogCaptureFixture) -> None:
        manager = managed()

        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            assert await manager.ban_ip(INTERNAL_ADDRESS, 3600, "behavioral_violation") is False

        assert manager.bans == []
        assert not await manager.is_ip_banned(INTERNAL_ADDRESS)
        assert f"not banning {INTERNAL_ADDRESS} (behavioral_violation)" in caplog.text

    async def test_the_reason_defaults_like_fastapi_guards(self) -> None:
        manager = managed()

        await manager.ban_ip(LAN_BROWSER_ADDRESS, 60)

        assert manager.bans == [(LAN_BROWSER_ADDRESS, 60, "threshold_exceeded")]

    def test_installing_twice_wraps_once(self) -> None:
        manager = FakeBanManager()
        install_ban_rules(manager)
        wrapped = manager.ban_ip

        install_ban_rules(manager)

        assert manager.ban_ip is wrapped


class TestSharedBans:
    async def test_a_ban_redis_still_holds_stands(self) -> None:
        manager = managed(FakeRedisHandler({f"banned_ips:{LAN_BROWSER_ADDRESS}": "9e18"}))
        manager.banned_ips[LAN_BROWSER_ADDRESS] = 9e18

        assert await manager.is_ip_banned(LAN_BROWSER_ADDRESS)

    async def test_a_ban_lifted_in_redis_is_lifted_here_too(self) -> None:
        # `unban` run in another service deleted the key; this process still remembered it.
        manager = managed(FakeRedisHandler({}))
        manager.banned_ips[LAN_BROWSER_ADDRESS] = 9e18

        assert not await manager.is_ip_banned(LAN_BROWSER_ADDRESS)
        assert LAN_BROWSER_ADDRESS not in manager.banned_ips

    async def test_while_redis_cant_be_asked_the_remembered_ban_stands(self) -> None:
        manager = managed(FakeRedisHandler(broken=True))
        manager.banned_ips[LAN_BROWSER_ADDRESS] = 9e18

        assert await manager.is_ip_banned(LAN_BROWSER_ADDRESS)

    async def test_without_shared_state_memory_decides(self) -> None:
        manager = managed(redis_handler=None)
        manager.banned_ips[LAN_BROWSER_ADDRESS] = 9e18

        assert await manager.is_ip_banned(LAN_BROWSER_ADDRESS)

    async def test_an_address_not_remembered_isnt_looked_up_twice(self) -> None:
        redis = FakeRedisHandler(broken=True)  # would raise if asked
        manager = managed(redis)

        assert not await manager.is_ip_banned(LAN_BROWSER_ADDRESS)

    async def test_the_address_is_compared_in_canonical_form(self) -> None:
        manager = managed(FakeRedisHandler({}))
        manager.banned_ips["192.168.1.50"] = 9e18

        assert not await manager.is_ip_banned("::ffff:192.168.1.50")
        assert "192.168.1.50" not in manager.banned_ips
