"""Every route an app answers, with mounts flattened: what the access rules must cover.

`sdr-manager-local` mounts its API app twice and every section mounts its UI
remote as static files, so `app.routes` alone misses most of what a process
serves. This walks into mounted apps (prefixing their paths) and reports a
static mount as one `/<prefix>/**` entry, since its files aren't routes.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterator, Sequence
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


def attach_static_endpoints(routes: Sequence[BaseRoute], prefix: str = "") -> None:
    """Give every static mount a stand-in endpoint, so its route group can apply.

    fastapi-guard finds a request's per-route protections through the matched
    route's `endpoint`, which a static mount doesn't have; its files then only
    got the global rate limit, and a page load fetches about a hundred of them.
    The stand-in is never called (Starlette serves a mount through its app);
    each mount gets its own, named after its path, so it can't share another
    route's protections. Idempotent.
    """
    for route in routes:
        if not isinstance(route, Mount):
            continue
        child_routes = getattr(route.app, "routes", None)
        if child_routes is not None:
            attach_static_endpoints(child_routes, prefix + route.path)
        elif getattr(route, "endpoint", None) is None:
            route.endpoint = _static_endpoint(prefix + route.path)  # type: ignore[attr-defined]


def _static_endpoint(path: str) -> Callable[[], Awaitable[None]]:
    async def static_files() -> None:
        return None

    static_files.__qualname__ = f"static_files[{path}]"
    return static_files


def iter_routes(routes: Sequence[BaseRoute], prefix: str = "") -> Iterator[RouteEntry]:
    """Every (method, full path, endpoint) under `routes`, in serving order."""
    for route in routes:
        if isinstance(route, Mount):
            child_routes = getattr(route.app, "routes", None)
            if child_routes is None:
                # Static files (or another opaque ASGI app): everything under it,
                # with the stand-in endpoint `attach_static_endpoints` gave it.
                yield RouteEntry("GET", f"{prefix}{route.path}/**", getattr(route, "endpoint", None))
            else:
                yield from iter_routes(child_routes, prefix + route.path)
        elif isinstance(route, WebSocketRoute) or type(route).__name__ == "APIWebSocketRoute":
            yield RouteEntry(WEBSOCKET_METHOD, prefix + getattr(route, "path", ""), getattr(route, "endpoint", None))
        elif isinstance(route, Route) or hasattr(route, "methods"):
            # HEAD rides along with GET; listing it would only duplicate rows.
            methods = sorted(set(getattr(route, "methods", None) or ["GET"]) - {"HEAD"}) or ["GET"]
            for method in methods:
                yield RouteEntry(method, prefix + getattr(route, "path", ""), getattr(route, "endpoint", None))
