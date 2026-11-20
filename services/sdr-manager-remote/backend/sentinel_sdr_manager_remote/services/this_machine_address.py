"""The address other Sentinels reach this machine's SDR Manager at.

The "This machine" row's own `address` is `host.docker.internal`: how this
Sentinel's containers reach the SDR Manager on the host. Another machine can't
use that name, and from inside Docker nothing can see the host's LAN address
(on a Mac, Docker Desktop hides the host's network entirely). So the operator's
own list of the addresses this machine is reached by, `SENTINEL_WEB_HOSTNAMES`
(the names the page's HTTPS certificate covers), is the one that is shown.
"""

from __future__ import annotations

import ipaddress
import os

WEB_HOSTNAMES_VARIABLE = "SENTINEL_WEB_HOSTNAMES"


def this_machine_connect_address() -> str | None:
    """The address another Sentinel would enter to add this machine, or None if unknown.

    The first IP address in `SENTINEL_WEB_HOSTNAMES` (comma-separated), skipping
    loopback, which no other machine can dial. With no IP address listed, the
    first name instead (e.g. `my-mac.local`), which another machine on the LAN
    can still resolve. None when the variable is unset or empty.
    """
    entries = [entry.strip() for entry in os.environ.get(WEB_HOSTNAMES_VARIABLE, "").split(",")]
    names = [entry for entry in entries if entry]
    for name in names:
        try:
            address = ipaddress.ip_address(name)
        except ValueError:
            continue
        if not address.is_loopback:
            return name
    hostnames = [name for name in names if not _is_ip_address(name)]
    return hostnames[0] if hostnames else None


def _is_ip_address(name: str) -> bool:
    """Whether `name` is an IP address literal rather than a hostname."""
    try:
        ipaddress.ip_address(name)
    except ValueError:
        return False
    return True
