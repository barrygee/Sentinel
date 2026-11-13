"""The container's health check: does this machine's SDR Manager answer `/health`?

Run by the image's `HEALTHCHECK` as `python -m sentinel_sdr_manager_local.healthcheck`.
It speaks HTTPS when SDR Manager does (`SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE`
set) and verifies the certificate against the deployment's certificate
authority, by the name `localhost` that service-credentials puts in it, rather
than skipping verification. Exits 0 when `/health` answers 200, 1 otherwise.
"""

from __future__ import annotations

import os
import ssl
import sys
import urllib.request
from collections.abc import Mapping

DEFAULT_PORT = "8000"
TIMEOUT_SECONDS = 4


def health_url(environment: Mapping[str, str]) -> str:
    """The `/health` URL on this machine, over HTTPS when SDR Manager serves it."""
    port = environment.get("SDR_MANAGER_LOCAL_HTTP_PORT") or DEFAULT_PORT
    scheme = "https" if environment.get("SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE") else "http"
    return f"{scheme}://localhost:{port}/health"


def tls_context(environment: Mapping[str, str]) -> ssl.SSLContext | None:
    """A context trusting the deployment CA for an HTTPS check, else None for plain HTTP.

    Raises:
        ValueError: SDR Manager serves HTTPS but `INTERNAL_CERTIFICATE_AUTHORITY_FILE`
            isn't set, so its certificate can't be checked.
    """
    if not environment.get("SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE"):
        return None
    authority_file = environment.get("INTERNAL_CERTIFICATE_AUTHORITY_FILE")
    if not authority_file:
        raise ValueError("INTERNAL_CERTIFICATE_AUTHORITY_FILE is not set")
    return ssl.create_default_context(cafile=authority_file)


def check(environment: Mapping[str, str]) -> int:
    """0 when `/health` answers 200, 1 (with the reason on stderr) otherwise."""
    try:
        url = health_url(environment)
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS, context=tls_context(environment)) as response:
            if response.status == 200:
                return 0
            print(f"sdr-manager-local health: {url} answered {response.status}", file=sys.stderr)
    except (OSError, ValueError) as error:
        print(f"sdr-manager-local health: {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":  # pragma: no cover - the image's HEALTHCHECK entry point
    sys.exit(check(os.environ))
