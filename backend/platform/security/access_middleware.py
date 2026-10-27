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
"""

from __future__ import annotations

import logging

from backend.platform.security.access import AccessRules
from backend.platform.security.route_inventory import WEBSOCKET_METHOD
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


class AccessControlMiddleware:
    """Refuse every request whose route rule doesn't admit its caller, as a 404."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        access_rules: AccessRules,
        security_config: SecurityConfig,
        enforce: bool,
    ) -> None:
        """`enforce=False` logs refusals and lets them through (GUARD_ACCESS_ENFORCEMENT=log)."""
        self.app = app
        self.access_rules = access_rules
        self.security_config = security_config
        self.enforce = enforce
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
        if is_websocket and not await self._websocket_checks_pass(scope, receive, send):
            return
        await self.app(scope, receive, send)

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
