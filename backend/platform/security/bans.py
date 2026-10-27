"""Sentinel's rules for fastapi-guard's bans: never its own processes, and Redis decides.

fastapi-guard bans by address through one manager per process
(`ip_ban_manager`). Two things about it don't fit Sentinel:

- **It would ban Sentinel's own processes.** Their addresses aren't
  identities: Docker hands out a container's address again when it restarts,
  so a ban on one decoder can land on the radio hub. They are held by their
  credentials and the access rules instead, so the bans that matter — for
  clients — are unaffected. `ban_ip` refuses an address in `$loopback`,
  `$internal_networks` or `$service_hosts`.
- **A process trusts its own memory of a ban over Redis.** A ban lifted in
  Redis (the `unban` command, from any service) would keep refusing in every
  other process until it expired there. With shared state, a remembered ban
  is checked against Redis before it refuses anyone.

`install_ban_rules()` applies both to the manager once per process.
"""

from __future__ import annotations

import ipaddress
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from backend.platform.security.networks import parse_networks
from guard_core.utils import _canonicalize_ip

logger = logging.getLogger("sentinel.guard")

# Sentinel's own processes: this machine, the compose network, other machines' services.
PROTECTED_NETWORK_TOKENS = ("$loopback", "$internal_networks", "$service_hosts")

_INSTALLED_MARKER = "_sentinel_ban_rules"


def is_protected(target: str) -> bool:
    """Whether `target` (an address or CIDR) touches one of Sentinel's own networks.

    Read at call time, so a settings change applies at once. Anything that
    isn't an address or network is not protected (fastapi-guard refuses it).
    """
    # Canonical form turns an IPv4-mapped address (::ffff:a.b.c.d) into a.b.c.d.
    try:
        network = ipaddress.ip_network(_canonicalize_ip(target), strict=False)
    except ValueError:
        return False
    return any(
        network.version == protected.version and network.overlaps(protected)
        for protected in parse_networks(PROTECTED_NETWORK_TOKENS)
    )


async def _forget_if_lifted(manager: Any, address: str) -> None:
    """Drop a remembered ban on `address` when Redis no longer holds it.

    Redis is where every process's bans meet, so it decides. If Redis can't
    be asked, the remembered ban stands.
    """
    if address not in manager.banned_ips:
        return
    try:
        expiry = await manager.redis_handler.get_key("banned_ips", address)
    except Exception:  # noqa: BLE001 — any failure to ask Redis keeps the ban
        return
    if not expiry:
        manager._purge_banned_ip(address)


def install_ban_rules(manager: Any) -> None:
    """Make `manager` (fastapi-guard's `ip_ban_manager`) follow Sentinel's ban rules.

    Idempotent: the manager is one per process, and an app built twice in a
    process (the tests) must not wrap it twice.
    """
    if getattr(manager, _INSTALLED_MARKER, False):
        return
    original_ban: Callable[..., Awaitable[bool]] = manager.ban_ip
    original_is_banned: Callable[[str], Awaitable[bool]] = manager.is_ip_banned

    async def ban_ip(ip: str, duration: int, reason: str = "threshold_exceeded") -> bool:
        if is_protected(ip):
            logger.warning(
                "guard: not banning %s (%s): it is one of Sentinel's own processes, whose address a restart can "
                "give to another; its credential and the access rules still hold it",
                ip,
                reason,
            )
            return False
        return await original_ban(ip, duration, reason)

    async def is_ip_banned(ip: str) -> bool:
        if manager.redis_handler is not None:
            await _forget_if_lifted(manager, _canonicalize_ip(ip))
        return await original_is_banned(ip)

    manager.ban_ip = ban_ip
    manager.is_ip_banned = is_ip_banned
    setattr(manager, _INSTALLED_MARKER, True)
