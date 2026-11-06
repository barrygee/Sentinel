"""Who may use a private dongle: this machine, and the addresses its operator lists.

The relay enforces this on its sockets, by peer address, because rtl_tcp has no
login. Loopback is always local. A Sentinel in Docker on the same machine connects
from its compose network instead, which `SDR_MANAGER_LOCAL_PRIVATE_EXTRA_NETWORKS`
adds; Docker Desktop's connections to a native process arrive from loopback.

The reservation route enforces it over HTTP: the service bearer, a loopback peer
for a native install, which has no bearer, or a listed address. Not the compose
network: the gateway proxies browsers from inside it, so that address says
nothing about who is asking.
"""

from __future__ import annotations

import ipaddress

from sentinel_sdr_manager_local.service_auth import presents_service_bearer
from sentinel_sdr_manager_local.services.host_control_settings import HostControlSettingsService

LOOPBACK_NETWORKS = "127.0.0.0/8,::1/128"
"""Always allowed, because the supervisor's own control follower connects this way."""

MAX_ALLOWED_ADDRESSES = 64
"""Far more Sentinels than one host's dongles can serve; it bounds what a request can store."""


def normalize_allowed_address(raw_address: str) -> str:
    """`raw_address` in canonical form, or `ValueError` if it can't name one Sentinel.

    One address, not a network: a range would let in machines nobody named.
    """
    if "%" in raw_address:
        raise ValueError("Enter an address without a zone.")
    address = ipaddress.ip_address(raw_address.strip())
    address = getattr(address, "ipv4_mapped", None) or address
    if address.is_unspecified or address.is_multicast:
        raise ValueError("That address can't identify a Sentinel.")
    return str(address)


def peer_is_local(peer_address: str | None, allowed_networks: str) -> bool:
    """Whether `peer_address` is in `allowed_networks`. An unreadable address is not local.

    Kept in step with `peer_is_allowed` in `relay/rtl_tcp_relay.py`.
    """
    if not peer_address:
        return False
    try:
        address = ipaddress.ip_address(peer_address.split("%", 1)[0])
    except ValueError:
        return False
    # A dual-stack socket reports an IPv4 client as ::ffff:a.b.c.d.
    address = getattr(address, "ipv4_mapped", None) or address
    return any(address in ipaddress.ip_network(entry.strip()) for entry in allowed_networks.split(",") if entry.strip())


class PrivateAccessList:
    """The operator's list of addresses, held in memory for the paths that can't await a read.

    Empty until `load()`, so a dongle started before then is open to this
    machine only, never to more than it should be.
    """

    def __init__(self, settings_store: HostControlSettingsService, extra_networks: str) -> None:
        self._settings_store = settings_store
        self._extra_networks = extra_networks.strip()
        self._addresses: tuple[str, ...] = ()

    @property
    def addresses(self) -> tuple[str, ...]:
        """The listed addresses, in the order they were added."""
        return self._addresses

    async def load(self) -> None:
        """Read the stored list. Runs before the first dongle starts."""
        self._addresses = await self._settings_store.private_allowed_addresses()

    async def replace(self, addresses: tuple[str, ...]) -> None:
        """Store `addresses`, already normalized, and use them from now on."""
        await self._settings_store.set_private_allowed_addresses(addresses)
        self._addresses = addresses

    def relay_networks(self) -> str:
        """The relay's `RELAY_ALLOWED_NETWORKS` for a private dongle."""
        return ",".join(entry for entry in (LOOPBACK_NETWORKS, self._extra_networks, *self._addresses) if entry)

    def caller_may_use_private(self, authorization: str | None, peer_address: str | None) -> bool:
        """Whether an HTTP caller may use a private dongle (see this module's docstring).

        A console session doesn't count: another machine's Sentinel signs in with
        the password, and with no password set the session check passes everyone.
        """
        if presents_service_bearer(authorization):
            return True
        return peer_is_local(peer_address, ",".join((LOOPBACK_NETWORKS, *self._addresses)))
