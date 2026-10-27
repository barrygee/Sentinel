"""Process entrypoint: runs uvicorn bound and logged per `Settings` (Sentry architecture §3.4).

`SDR_MANAGER_LOCAL_HTTP_HOST`/`_HTTP_PORT` drive uvicorn's bind address here
rather than a hardcoded `--host`/`--port`, so the documented variables work
and `settings.http_port` (which `PortAllocatorService` also reserves) matches
what is actually bound. Every way this process starts gets the redacting
access-log formatter (`logging_config.py`).

The port is checked first: with host networking, a port already taken on this
machine (often by another app on 8000) would otherwise surface as a uvicorn
traceback deep in startup, after the dongles were already being brought up.
"""

from __future__ import annotations

import errno
import socket
import sys

import uvicorn

from sentinel_sdr_manager_local.config import get_settings
from sentinel_sdr_manager_local.logging_config import SDR_MANAGER_LOCAL_LOGGING_CONFIG


def port_is_free(host: str, port: int) -> bool:
    """Whether `host:port` can be bound right now."""
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    with socket.socket(family, socket.SOCK_STREAM) as probe:
        # As uvicorn binds: a port in TIME_WAIT from our own last run is free.
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((host, port))
        except OSError as error:
            if error.errno == errno.EADDRINUSE:
                return False
            raise
    return True


def main() -> None:
    """Start uvicorn serving `sentinel_sdr_manager_local.service:app`, or exit if the port is taken."""
    settings = get_settings()
    if not port_is_free(settings.http_host, settings.http_port):
        sys.exit(
            f"sdr-manager-local: port {settings.http_port} on {settings.http_host} is already in use, "
            "so SDR Manager cannot start. Stop whatever is using it, or set SDR_MANAGER_LOCAL_HTTP_PORT "
            "in .env to a free port (other Sentinels then manage this machine on that port)."
        )
    uvicorn.run(
        "sentinel_sdr_manager_local.service:app",
        host=settings.http_host,
        port=settings.http_port,
        log_config=SDR_MANAGER_LOCAL_LOGGING_CONFIG,
        log_level=settings.log_level.lower(),
        # The request guard decides which X-Forwarded-For to believe (only the
        # gateway's, GUARD_TRUSTED_PROXIES): uvicorn must not rewrite the client
        # first, or a caller could claim any address.
        proxy_headers=False,
    )


if __name__ == "__main__":
    main()
