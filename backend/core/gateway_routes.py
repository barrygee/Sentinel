"""The gateway's routing table, built from the service registry (section-containers plan §4.4).

Caddy is the one browser origin. Its static config (`gateway/caddy.json`) only
knows three things: `/internal/` is never routed, everything unmatched goes to
core, and proxy failures become a JSON 503. Every section, radio-hub and remote
route is pushed into it at runtime from the registry (`gateway_sync.py`), so
moving a section into its own container (P6) is just that service registering
with a different `internalUrl` — no gateway edit.

This module is the pure half: registrations in, Caddy route JSON out. Routes
are ordered longest prefix first, which is how `/api/air/messages` (core) beats
`/api/air/` (Air), and `/api/sdr/radios` (radio hub) beats `/api/sdr/` (SDR).
"""

from __future__ import annotations

import json
from typing import Any, NamedTuple
from urllib.parse import urlsplit

from backend.core.service_registry import RegisteredService
from backend.platform.service_manifest import RESERVED_ROUTE_PREFIXES

# The id the static config gives the subroute these routes are pushed into.
# `gateway/caddy.json` must use the same id.
REGISTRY_ROUTES_ID = "registry_routes"

# The core service's name in the table — what an unmatched path reaches anyway,
# but core's reserved prefixes are listed explicitly so they outrank a section
# that owns the shorter prefix around them (`/api/air/messages` in `/api/air/`).
CORE_SERVICE_ID = "core"

_DEFAULT_PORTS = {"http": 80, "https": 443}


class GatewayRoute(NamedTuple):
    """One path prefix and the service it goes to."""

    prefix: str
    service_id: str
    internal_url: str
    available: bool


def _remote_prefix(service_id: str) -> str:
    return f"/remotes/{service_id}/"


def routing_table(services: list[RegisteredService], core_internal_url: str) -> list[GatewayRoute]:
    """Every prefix the gateway routes, longest first.

    Core's reserved prefixes come first in the input so that, for an equal
    length, core keeps its own path (the registry never lets a service claim
    one, so this is belt and braces).
    """
    table = [GatewayRoute(prefix, CORE_SERVICE_ID, core_internal_url, True) for prefix in RESERVED_ROUTE_PREFIXES]
    for registration in services:
        manifest = registration.manifest
        prefixes = list(manifest.routes)
        if manifest.ui is not None:
            prefixes.append(_remote_prefix(manifest.id))
        table.extend(
            GatewayRoute(prefix, manifest.id, manifest.internal_url, registration.available) for prefix in prefixes
        )
    # `sorted` is stable, so ties keep the order above.
    return sorted(table, key=lambda route: len(route.prefix), reverse=True)


def _path_matchers(prefix: str) -> list[str]:
    # The manifest's prefix rule: a trailing slash is a directory prefix, and a
    # bare one also matches the exact path (`/api/sdr/radios` and below it).
    if prefix.endswith("/"):
        return [f"{prefix}*"]
    return [prefix, f"{prefix}/*"]


def _unavailable_handler(service_id: str) -> dict[str, Any]:
    # The registry already knows this service is down, so answer straight away
    # rather than wait for a dial to time out. Same JSON shape as a FastAPI error.
    return {
        "handler": "static_response",
        "status_code": 503,
        "headers": {"Content-Type": ["application/json"], "Cache-Control": ["no-store"]},
        "body": json.dumps({"detail": f"{service_id} is unavailable"}),
    }


def _proxy_handlers(internal_url: str) -> list[dict[str, Any]]:
    parts = urlsplit(internal_url)
    port = parts.port or _DEFAULT_PORTS[parts.scheme]
    proxy: dict[str, Any] = {"handler": "reverse_proxy", "upstreams": [{"dial": f"{parts.hostname}:{port}"}]}
    if parts.scheme == "https":
        proxy["transport"] = {"protocol": "http", "tls": {}}
    handlers: list[dict[str, Any]] = []
    if parts.path:
        # A service mounted under a path on its host gets that path put back in
        # front of the browser's, since a dial address can't carry one.
        handlers.append({"handler": "rewrite", "uri": parts.path + "{http.request.uri}"})
    handlers.append(proxy)
    return handlers


def caddy_routes(table: list[GatewayRoute]) -> list[dict[str, Any]]:
    """The routing table as Caddy JSON routes, for the registry subroute.

    Each route is terminal, so the first (longest) match wins and nothing after
    it in the subroute runs.
    """
    return [
        {
            "match": [{"path": _path_matchers(route.prefix)}],
            "handle": _proxy_handlers(route.internal_url)
            if route.available
            else [_unavailable_handler(route.service_id)],
            "terminal": True,
        }
        for route in table
    ]
