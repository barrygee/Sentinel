"""The ASGI layer that enforces the access rules, for HTTP and WebSocket alike.

It sits just inside fastapi-guard's middleware (`install.py` orders them):
fastapi-guard has already resolved the real client address, applied bans,
rate limits and attack detection, and will see this layer's 404s on the way
out, so a client that keeps probing for routes gets banned by the policy's
`status:404` rule like any other scanner. It runs before routing, so a
refused caller never reaches a route's own dependencies — and never learns
from a 401 that the route exists.

fastapi-guard's HTTP middleware never sees WebSocket handshakes, so for those
this layer also runs fastapi-guard's WebSocket checks (bans, allow/deny lists,
its connection rate limit, detection on the handshake) before the endpoint
accepts.

A request for a route the policy knows but this process doesn't serve is
answered 503, not the 404 the app would give. It reaches the wrong service
only while the gateway's routes catch up — after core restarts, each service
re-registers in its own time — and a burst of 404s there would get every
client still polling (decoders, open browsers) banned as a scanner.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from backend.platform.security.access import AccessRules, compile_path_pattern
from backend.platform.security.networks import address_in, parse_networks
from backend.platform.security.route_inventory import WEBSOCKET_METHOD, RouteEntry
from guard import SecurityConfig, make_guard_websocket
from guard.adapters import StarletteGuardRequest
from guard_core.utils import extract_client_ip
from starlette.exceptions import WebSocketException
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import get_route_path
from starlette.status import WS_1008_POLICY_VIOLATION
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.websockets import WebSocket

logger = logging.getLogger("sentinel.guard")

# How long a client should wait before asking again while routes catch up.
NOT_SERVED_RETRY_AFTER_SECONDS = "5"


@dataclass
class ServedRoutes:
    """The method + path patterns this process serves, known once its routes are classified at startup.

    Until then (`known` is False) every route counts as served, so nothing
    is turned away on a guess.
    """

    known: bool = False
    _patterns: list[tuple[frozenset[str], re.Pattern[str]]] = field(default_factory=list)

    def learn(self, entries: Iterable[RouteEntry]) -> None:
        """Record every route `entries` lists (the process's own, from `iter_routes`)."""
        by_path: dict[str, set[str]] = {}
        for entry in entries:
            by_path.setdefault(entry.path, set()).add(entry.method)
        self._patterns = [(frozenset(methods), compile_path_pattern(path)) for path, methods in by_path.items()]
        self.known = True

    def serves(self, method: str, path: str) -> bool:
        """Whether one of this process's routes answers `method` on `path` (HEAD counts as GET)."""
        if not self.known:
            return True
        wanted = {method, "GET"} if method == "HEAD" else {method}
        return any(methods & wanted and pattern.fullmatch(path) for methods, pattern in self._patterns)


class AccessControlMiddleware:
    """Refuse every request whose route rule doesn't admit its caller, as a 404."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        access_rules: AccessRules,
        security_config: SecurityConfig,
        enforce: bool,
        served_routes: ServedRoutes | None = None,
        blocked_user_agents: Iterable[str] = (),
    ) -> None:
        """`enforce=False` logs refusals and lets them through (GUARD_ACCESS_ENFORCEMENT=log).

        `served_routes` is filled at startup with this process's routes; a
        known route not among them is answered 503. A request whose
        User-Agent contains one of `blocked_user_agents` (any case) is
        refused with 403, except from the exempt addresses.
        """
        self.app = app
        self.access_rules = access_rules
        self.security_config = security_config
        self.enforce = enforce
        self.served_routes = served_routes or ServedRoutes()
        self.blocked_user_agents = tuple(word.lower() for word in blocked_user_agents)
        self._exempt_networks = parse_networks(security_config.exempt_ips or ())
        self._guard_websocket = make_guard_websocket(security_config)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        is_websocket = scope["type"] == "websocket"
        method = WEBSOCKET_METHOD if is_websocket else scope["method"]
        path = get_route_path(scope)
        request = Request(scope) if not is_websocket else WebSocket(scope, receive, send)
        client_ip = await extract_client_ip(StarletteGuardRequest(request), self.security_config)  # type: ignore[arg-type]
        if self._blocked_scanner(request.headers.get("user-agent", ""), client_ip):
            logger.warning(
                "guard %s: %s %s from %s (user_agent: a scanning tool)",
                "would block" if self.security_config.passive_mode else "blocked",
                method,
                path,
                client_ip,
            )
            if not self.security_config.passive_mode:
                await self._refuse_scanner(scope, receive, send, is_websocket)
                return
        rule = self.access_rules.rule_for(method, path)
        allowed = rule is not None and self.access_rules.allows(rule, client_ip, request.headers)
        if not allowed:
            logger.warning(
                "guard access %s: %s %s from %s (%s)",
                "refused" if self.enforce else "would refuse",
                method,
                path,
                client_ip,
                f"route is for {', '.join(rule.rule.access)}" if rule else "no rule covers this route",
            )
            if self.enforce:
                await self._refuse(scope, receive, send, is_websocket)
                return
        if rule is not None and not is_websocket and not self.served_routes.serves(method, path):
            await self._not_served_here(scope, receive, send, method, path)
            return
        if is_websocket and not await self._websocket_checks_pass(scope, receive, send):
            return
        await self.app(scope, receive, send)

    def _blocked_scanner(self, user_agent: str, client_ip: str) -> bool:
        if not self.blocked_user_agents or address_in(client_ip, self._exempt_networks):
            return False
        lowered = user_agent.lower()
        return any(word in lowered for word in self.blocked_user_agents)

    async def _refuse_scanner(self, scope: Scope, receive: Receive, send: Send, is_websocket: bool) -> None:
        if is_websocket:
            await send({"type": "websocket.close", "code": WS_1008_POLICY_VIOLATION, "reason": ""})
            return
        response = JSONResponse({"detail": "Forbidden"}, status_code=403, headers={"Cache-Control": "no-store"})
        await response(scope, receive, send)

    async def _not_served_here(self, scope: Scope, receive: Receive, send: Send, method: str, path: str) -> None:
        logger.info("guard: %s %s is another service's route; answering 503 until the gateway catches up", method, path)
        response = JSONResponse(
            {"detail": "This route's service is unavailable; try again shortly"},
            status_code=503,
            headers={"Cache-Control": "no-store", "Retry-After": NOT_SERVED_RETRY_AFTER_SECONDS},
        )
        await response(scope, receive, send)

    async def _refuse(self, scope: Scope, receive: Receive, send: Send, is_websocket: bool) -> None:
        if is_websocket:
            # Closing before accept: the server answers the handshake with 403.
            await send({"type": "websocket.close", "code": WS_1008_POLICY_VIOLATION, "reason": ""})
            return
        response = JSONResponse({"detail": "Not Found"}, status_code=404, headers={"Cache-Control": "no-store"})
        await response(scope, receive, send)

    async def _websocket_checks_pass(self, scope: Scope, receive: Receive, send: Send) -> bool:
        """fastapi-guard's WebSocket checks; closes the handshake and returns False on a refusal."""
        try:
            await self._guard_websocket(WebSocket(scope, receive, send))
        except WebSocketException as refusal:
            if self.security_config.passive_mode:
                logger.warning("guard would close websocket %s: %s", get_route_path(scope), refusal.reason)
                return True
            await send({"type": "websocket.close", "code": refusal.code, "reason": refusal.reason or ""})
            return False
        return True
