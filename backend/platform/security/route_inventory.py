"""Every route an app answers, with mounts flattened: what the access rules must cover.

`sdr-manager-local` mounts its API app twice and every section mounts its UI
remote as static files, so `app.routes` alone misses most of what a process
serves. This walks into mounted apps (prefixing their paths) and reports a
static mount as one `/<prefix>/**` entry, since its files aren't routes.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from typing import Any

from starlette.routing import BaseRoute, Mount, Route, WebSocketRoute

WEBSOCKET_METHOD = "WEBSOCKET"


@dataclass(frozen=True)
class RouteEntry:
    """One method + path an app answers, and the function behind it (None for a static mount)."""

    method: str
    path: str
    endpoint: Callable[..., Any] | None

    @property
    def endpoint_name(self) -> str:
        """`module.qualname` of the endpoint, or the mount's description."""
        if self.endpoint is None:
            return "static files"
        return f"{self.endpoint.__module__}.{self.endpoint.__qualname__}"


def iter_routes(routes: Sequence[BaseRoute], prefix: str = "") -> Iterator[RouteEntry]:
    """Every (method, full path, endpoint) under `routes`, in serving order."""
    for route in routes:
        if isinstance(route, Mount):
            child_routes = getattr(route.app, "routes", None)
            if child_routes is None:
                # Static files (or another opaque ASGI app): everything under it.
                yield RouteEntry("GET", f"{prefix}{route.path}/**", None)
            else:
                yield from iter_routes(child_routes, prefix + route.path)
        elif isinstance(route, WebSocketRoute) or type(route).__name__ == "APIWebSocketRoute":
            yield RouteEntry(WEBSOCKET_METHOD, prefix + getattr(route, "path", ""), getattr(route, "endpoint", None))
        elif isinstance(route, Route) or hasattr(route, "methods"):
            # HEAD rides along with GET; listing it would only duplicate rows.
            methods = sorted(set(getattr(route, "methods", None) or ["GET"]) - {"HEAD"}) or ["GET"]
            for method in methods:
                yield RouteEntry(method, prefix + getattr(route, "path", ""), getattr(route, "endpoint", None))
