"""Operator commands for the request guard.

Run inside a service's container, where its GUARD_* settings and the Redis
credentials are:

    docker compose exec app python -m backend.platform.security.cli check-policy
    docker compose exec app python -m backend.platform.security.cli routes backend.main:app
    docker compose exec app python -m backend.platform.security.cli bans
    docker compose exec app python -m backend.platform.security.cli unban 192.168.1.50
    docker compose exec app python -m backend.platform.security.cli ban 192.168.1.50 --seconds 86400

Bans live in Redis, shared by every service on the deployment, so lifting one
from `app` lifts it everywhere. A process without Redis (a radio host's hub)
keeps its bans in its own memory: restart it to clear them.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import sys
from typing import Any

from backend.config import settings
from backend.platform.security.access import AccessRules
from backend.platform.security.config_builder import build_security_config
from backend.platform.security.policy import load_policy, policy_path
from backend.platform.security.route_inventory import iter_routes
from guard import RedisManager, ip_ban_manager


def check_policy(profiles: list[str]) -> int:
    """Validate the policy file and build each profile's guard config; 0 when all are valid."""
    policy = load_policy()
    print(f"policy: {policy_path()}")
    for profile_name in profiles or sorted(policy.profiles):
        profile = policy.profile_settings(profile_name)
        config = build_security_config(profile, service_name=profile_name)
        rules = AccessRules(policy, profile_name)
        print(
            f"  {profile_name}: {len(rules.rules)} route rules, "
            f"{profile.rate_limit.requests}/{profile.rate_limit.window_seconds}s per address, "
            f"{'Redis' if config.enable_redis else 'in-memory'} state, "
            f"{profile.middleware} middleware"
        )
    print("ok")
    return 0


def list_routes(app_reference: str, profile_name: str, as_json: bool) -> int:
    """Print each route of `module:attribute` with its rule; 1 if any is unclassified."""
    module_name, _, attribute = app_reference.partition(":")
    app = getattr(importlib.import_module(module_name), attribute or "app")
    rules = AccessRules(load_policy(), profile_name)
    rows: list[dict[str, Any]] = []
    for entry in iter_routes(app.routes):
        rule = rules.explicit_rule_for(entry.method, entry.path)
        rows.append(
            {
                "method": entry.method,
                "path": entry.path,
                "endpoint": entry.endpoint_name,
                "access": list(rule.rule.access) if rule else None,
                "group": rule.rule.group if rule else None,
            }
        )
    if as_json:
        print(json.dumps(rows, indent=2))
    else:
        for row in rows:
            access = ", ".join(row["access"]) if row["access"] else "UNCLASSIFIED"
            print(f"{row['method']:9} {row['path']:62} {access:28} {row['group'] or ''}")
    unclassified = [row for row in rows if row["access"] is None]
    if unclassified:
        print(f"{len(unclassified)} route(s) have no rule", file=sys.stderr)
        return 1
    return 0


async def _redis() -> RedisManager:
    config = build_security_config(load_policy().profile_settings(settings.guard_profile), service_name="cli")
    if not config.enable_redis:
        raise SystemExit(
            "GUARD_REDIS_URL is not set: this process keeps no shared bans. "
            "Run this inside a container of the deployment (docker compose exec app …)."
        )
    redis = RedisManager(config)
    await redis.initialize()
    await ip_ban_manager.initialize_redis(redis)
    return redis


async def list_bans() -> int:
    """Print every banned address and network with its remaining time."""
    redis = await _redis()
    try:
        for namespace in ("banned_ips", "banned_networks"):
            for key in sorted(await redis.keys(f"{namespace}:*") or []):
                target = key.split(f"{namespace}:", 1)[1]
                async with redis.get_connection() as connection:
                    remaining = await connection.ttl(key)
                print(f"{target:42} {remaining:>8} s left")
    finally:
        await redis.close()
    return 0


async def ban(address: str, seconds: int) -> int:
    """Ban `address` (or a CIDR) on every service for `seconds`."""
    redis = await _redis()
    try:
        banned = await ip_ban_manager.ban_ip(address, seconds, reason="operator")
    finally:
        await redis.close()
    print(f"banned {address} for {seconds} s" if banned else f"refused to ban {address} (see the log for why)")
    return 0 if banned else 1


async def unban(address: str) -> int:
    """Lift a ban on `address` on every service."""
    redis = await _redis()
    try:
        await ip_ban_manager.unban_ip(address)
    finally:
        await redis.close()
    print(f"unbanned {address}")
    return 0


def main(arguments: list[str] | None = None) -> int:
    """Parse `arguments` (default: the command line) and run one command."""
    parser = argparse.ArgumentParser(prog="python -m backend.platform.security.cli", description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check-policy", help="validate the policy file and every (or the named) profile")
    check.add_argument("profiles", nargs="*")
    routes = commands.add_parser("routes", help="list an app's routes with their rule (exit 1 if any is unclassified)")
    routes.add_argument("app", help="module:attribute, e.g. backend.main:app")
    routes.add_argument("--profile", default=settings.guard_profile)
    routes.add_argument("--json", action="store_true")
    commands.add_parser("bans", help="list banned addresses (shared Redis state)")
    ban_command = commands.add_parser("ban", help="ban an address or CIDR on every service")
    ban_command.add_argument("address")
    ban_command.add_argument("--seconds", type=int, default=3600)
    unban_command = commands.add_parser("unban", help="lift a ban on every service")
    unban_command.add_argument("address")
    parsed = parser.parse_args(arguments)

    if parsed.command == "check-policy":
        return check_policy(parsed.profiles)
    if parsed.command == "routes":
        return list_routes(parsed.app, parsed.profile, parsed.json)
    if parsed.command == "bans":
        return asyncio.run(list_bans())
    if parsed.command == "ban":
        return asyncio.run(ban(parsed.address, parsed.seconds))
    return asyncio.run(unban(parsed.address))


if __name__ == "__main__":
    sys.exit(main())
