"""A service finding another by manifest kind through core's registry (ADR 0007).

`GET /internal/registry/services?kind=<kind>` with this process's own HTTP
credential; `service_access.py` decides which kinds a caller may list.
`sdr-manager-remote` finds `sdr-manager-local` this way, whether it runs as a
container or as a Mac process.

Only a service in its own container has a registry to ask: core itself, and
the test suite's in-process app, have no `SENTINEL_CORE_URL`, so the answer
there is "unknown" rather than "nothing registered".
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx
from backend.config import settings
from backend.platform.internal_tls import internal_verify
from backend.platform.service_credentials import own_token

LIST_SERVICES_PATH = "/internal/registry/services"
LIST_SERVICES_TIMEOUT_S = 5.0


class RegistryUnavailable(Exception):
    """Core's registry could not be asked, or refused to answer."""


@dataclass(frozen=True)
class DiscoveredService:
    """One registered service, as core lists it."""

    id: str
    kind: str
    internal_url: str
    available: bool


async def list_registered_services(kind: str) -> list[DiscoveredService] | None:
    """Every service core has registered under manifest `kind`.

    None when this process has no core to ask (see the module docstring).
    Raises `RegistryUnavailable` when core can't be reached, refuses the
    credential, or answers with something that isn't the listing, so a caller
    can tell "none registered" from "couldn't find out".
    """
    if not settings.sentinel_core_url:
        return None
    token = own_token()
    if not token:
        raise RegistryUnavailable("no HTTP credential (SERVICE_HTTP_CREDENTIALS_FILE), so core can't be asked")
    try:
        async with httpx.AsyncClient(timeout=LIST_SERVICES_TIMEOUT_S, verify=internal_verify()) as client:
            response = await client.get(
                settings.sentinel_core_url.rstrip("/") + LIST_SERVICES_PATH,
                params={"kind": kind},
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as error:
        raise RegistryUnavailable(f"core unreachable: {error}") from error
    if not response.is_success:
        raise RegistryUnavailable(f"core answered {response.status_code} listing {kind} services")
    try:
        listed = response.json()["services"]
        return [
            DiscoveredService(
                id=str(entry["id"]),
                kind=str(entry["kind"]),
                internal_url=str(entry["internalUrl"]),
                available=bool(entry["available"]),
            )
            for entry in listed
        ]
    except (ValueError, KeyError, TypeError) as error:
        raise RegistryUnavailable(f"core's {kind} listing is malformed ({error})") from error
