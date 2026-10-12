"""Where a decoder dials the radio hub's sockets (section-containers plan P7.2).

A decoder talks HTTP to the hub through the gateway, which routes by the service
registry, so it never needs to know which container hosts the hub. Its PCM feed
(TCP) and, for voice, the decoded-audio return (UDP) are not HTTP and can't go
through the gateway, so every decoder ``config`` reply says where they are: the
host the hub advertises to the registry, plus the port. That replaces the
per-deployment ``SENTINEL_RADIO_HUB_HOST`` the decoders used to be given.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from backend.config import settings


def advertised_hub_host() -> str:
    """The host this radio hub is registered under.

    A hub in its own container advertises ``SERVICE_INTERNAL_URL``; a hub inside
    the app is registered in-process at ``core_internal_url``. Either way it is
    the address the gateway already reaches the hub on.
    """
    advertised_url = settings.service_internal_url or settings.core_internal_url
    return urlsplit(advertised_url).hostname or ""


def socket_endpoint(port: int) -> dict[str, str | int]:
    """``{"host", "port"}`` of one of the hub's decoder sockets, for a config reply."""
    return {"host": advertised_hub_host(), "port": port}
