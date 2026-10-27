"""Address lists for the request guard: the policy's `$name` tokens, resolved from settings.

The policy file names networks by role (`$client_networks`, `$internal_networks`)
rather than by address, because addresses are per deployment: the compose
subnet, the operator's machine, a radio host's IP. Each token maps to one
comma-separated GUARD_* setting, so an operator changes who counts as what
in `.env` without editing the policy.
"""

from __future__ import annotations

import ipaddress
from collections.abc import Callable, Iterable

from backend.config import settings

IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network

LOOPBACK_NETWORKS = ("127.0.0.0/8", "::1/128")


def split_setting(value: str) -> list[str]:
    """A comma-separated setting as a list, blanks and surrounding spaces dropped."""
    return [item.strip() for item in value.split(",") if item.strip()]


def _peer_networks() -> list[str]:
    # Other machines' SDR managers default to "anyone a browser may be".
    return split_setting(settings.guard_peer_networks) or split_setting(settings.guard_client_networks)


def _exempt_networks() -> list[str]:
    return split_setting(settings.guard_exempt_ips) or split_setting(settings.guard_internal_networks)


# Read at call time, not import time, so tests and the CLI see current settings.
NETWORK_TOKENS: dict[str, Callable[[], list[str]]] = {
    "$loopback": lambda: list(LOOPBACK_NETWORKS),
    "$client_networks": lambda: split_setting(settings.guard_client_networks),
    "$internal_networks": lambda: split_setting(settings.guard_internal_networks),
    "$service_hosts": lambda: split_setting(settings.guard_service_hosts),
    "$decoder_hosts": lambda: split_setting(settings.guard_decoder_hosts),
    "$peer_networks": _peer_networks,
    "$operator_ips": lambda: split_setting(settings.guard_operator_ips),
    "$exempt_ips": _exempt_networks,
}


def expand_network_tokens(entries: Iterable[str]) -> list[str]:
    """`entries` with every `$token` replaced by its addresses, duplicates dropped.

    Raises `ValueError` for an unknown token (a policy typo).
    """
    expanded: list[str] = []
    for entry in entries:
        if entry.startswith("$"):
            if entry not in NETWORK_TOKENS:
                raise ValueError(f"unknown network token {entry!r} (known: {sorted(NETWORK_TOKENS)})")
            candidates = NETWORK_TOKENS[entry]()
        else:
            candidates = [entry]
        expanded.extend(candidate for candidate in candidates if candidate not in expanded)
    return expanded


def parse_networks(entries: Iterable[str]) -> tuple[IpNetwork, ...]:
    """Parse addresses/CIDRs (tokens expanded) into networks; a bare address is a /32 or /128.

    Raises `ValueError` naming the entry that isn't an address or network.
    """
    networks: list[IpNetwork] = []
    for entry in expand_network_tokens(entries):
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError as error:
            raise ValueError(f"not an IP address or network: {entry!r}") from error
    return tuple(networks)


def address_in(address: str, networks: Iterable[IpNetwork]) -> bool:
    """Whether `address` falls in any of `networks`; False for anything that isn't an IP."""
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    # An IPv4-mapped IPv6 address (::ffff:192.0.2.1, from a dual-stack socket)
    # is matched as the IPv4 address it carries.
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped is not None:
        parsed = parsed.ipv4_mapped
    return any(parsed.version == network.version and parsed in network for network in networks)
