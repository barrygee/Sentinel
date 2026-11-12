"""Process entrypoint: runs uvicorn bound and logged per `Settings` (Sentry architecture §3.4).

`SDR_MANAGER_LOCAL_HTTP_HOST`/`_HTTP_PORT` drive uvicorn's bind address here
rather than a hardcoded `--host`/`--port`, so the documented variables work
and `settings.http_port` (which `PortAllocatorService` also reserves) matches
what is actually bound. Every way this process starts gets the redacting
access-log formatter (`logging_config.py`).

The port is checked first: with host networking, a port already taken on this
machine (often by another app on 8000) would otherwise surface as a uvicorn
traceback deep in startup, after the dongles were already being brought up.

HTTPS when `SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE`/`_PRIVATE_KEY_FILE` are set
(compose and the native Mac process set them to the certificate
service-credentials issues): other Sentinels send this machine's console
password, so it must not cross the network readable. Set but missing is a
refusal to start, never a quiet fall back to plain HTTP. The certificate
authority's fingerprint is logged at start, for operators of other Sentinels
to compare before they trust this machine.
"""

from __future__ import annotations

import errno
import logging
import logging.config
import socket
import sys
from pathlib import Path
from typing import Any

import uvicorn

from sentinel_sdr_manager_local.config import Settings, get_settings
from sentinel_sdr_manager_local.logging_config import SDR_MANAGER_LOCAL_LOGGING_CONFIG
from sentinel_sdr_manager_local.routers.tls import read_certificate_authority

# uvicorn's logger: before the app starts, it is the only one with a handler
# (SDR_MANAGER_LOCAL_LOGGING_CONFIG), so the announcement lands in the log.
logger = logging.getLogger("uvicorn.error")


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


def tls_arguments(settings: Settings) -> dict[str, Any]:
    """uvicorn's TLS arguments: empty for plain HTTP, else the certificate and key.

    Exits when only one is set, or a set file is missing: other Sentinels
    expect HTTPS here, and silently serving plain HTTP would send them away
    with a protocol error at best and expose the console password at worst.
    """
    certificate, private_key = settings.tls_certificate_file, settings.tls_private_key_file
    if not certificate and not private_key:
        return {}
    missing = [
        f"{variable} ({path or 'not set'})"
        for variable, path in (
            ("SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE", certificate),
            ("SDR_MANAGER_LOCAL_TLS_PRIVATE_KEY_FILE", private_key),
        )
        if not path or not Path(path).is_file()
    ]
    if missing:
        sys.exit(
            f"sdr-manager-local: can't serve HTTPS, missing {', '.join(missing)}. Run `docker compose up -d` "
            "so service-credentials issues this machine's certificate, then start SDR Manager again."
        )
    return {"ssl_certfile": certificate, "ssl_keyfile": private_key}


def announce_transport(tls: dict[str, Any], port: int) -> None:
    """Say how this machine is served, and the fingerprint other Sentinels should see."""
    if not tls:
        logger.warning("sdr-manager-local: serving plain HTTP on port %d (no TLS certificate configured)", port)
        return
    authority = read_certificate_authority()
    fingerprint = authority.fingerprint if authority is not None else "unknown (no certificate authority file)"
    logger.info(
        "sdr-manager-local: serving HTTPS on port %d; certificate fingerprint (SHA-256) %s. Other Sentinels "
        "show this fingerprint when they add this machine: it should match.",
        port,
        fingerprint,
    )


def main() -> None:
    """Start uvicorn serving `sentinel_sdr_manager_local.service:app`, or exit if the port is taken."""
    settings = get_settings()
    if not port_is_free(settings.http_host, settings.http_port):
        sys.exit(
            f"sdr-manager-local: port {settings.http_port} on {settings.http_host} is already in use, "
            "so SDR Manager cannot start. Stop whatever is using it, or set SDR_MANAGER_LOCAL_HTTP_PORT "
            "in .env to a free port (other Sentinels then manage this machine on that port)."
        )
    tls = tls_arguments(settings)
    logging.config.dictConfig(SDR_MANAGER_LOCAL_LOGGING_CONFIG)
    announce_transport(tls, settings.http_port)
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
        **tls,
    )


if __name__ == "__main__":
    main()
