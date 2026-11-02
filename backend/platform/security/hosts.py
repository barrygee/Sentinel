"""Which `Host` a browser may reach Sentinel under: the DNS-rebinding defence.

A rebinding attack points a name the attacker owns (`evil.example`) at
Sentinel's LAN address. The victim's browser then treats Sentinel as part of
the attacker's site: the page's requests carry `Host: evil.example` and an
Origin naming the same host, so they look same-origin to every other check.
The `Host` header is the one thing that still names the attacker, so the
browser-facing caller classes (`page`, `browser`) only admit hosts listed here:

- any IP address: a rebinding attack needs a name, and a browser sends an IP
  as Host only when the user typed that IP;
- `localhost` and its subdomains, which browsers resolve to loopback themselves;
- the names in `SENTINEL_ALLOWED_HOSTS` (e.g. `sentinel.lan,pi.local`).

Everything else is refused like any other caller outside its class (404).
"""

from __future__ import annotations

import ipaddress
from urllib.parse import urlsplit

from backend.config import settings
from backend.platform.security.networks import split_setting


def configured_allowed_hosts() -> frozenset[str]:
    """The names in `SENTINEL_ALLOWED_HOSTS`, normalised (see `normalise_host`).

    Read at call time, so tests and the CLI see the current settings. Raises
    `ValueError` for an entry with a port, scheme or path — the setting lists
    names only, and a typo there would otherwise lock the user out silently.
    """
    hosts: set[str] = set()
    for entry in split_setting(settings.sentinel_allowed_hosts):
        name = normalise_host(entry)
        if name is None or name != entry.strip().lower().rstrip("."):
            raise ValueError(f"SENTINEL_ALLOWED_HOSTS: {entry!r} is not a bare host name (no port, scheme or path)")
        hosts.add(name)
    return frozenset(hosts)


def normalise_host(host_header: str) -> str | None:
    """The host name in a `Host` header, lower-cased, without port or trailing dot.

    An IPv6 address loses its brackets. None for an empty or unparsable header.
    """
    try:
        name = urlsplit(f"//{host_header.strip()}").hostname
    except ValueError:
        return None
    if not name:
        return None
    return name.rstrip(".") or None


def host_is_allowed(host_header: str, allowed_hosts: frozenset[str]) -> bool:
    """Whether a browser request sent with `host_header` is for this Sentinel, not a rebound name."""
    name = normalise_host(host_header)
    if name is None:
        return False
    if name == "localhost" or name.endswith(".localhost"):
        return True
    try:
        ipaddress.ip_address(name)
    except ValueError:
        return name in allowed_hosts
    return True
