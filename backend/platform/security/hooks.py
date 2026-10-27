"""fastapi-guard callbacks: how its refusals look and how they're logged.

fastapi-guard answers a refusal in plain text; every Sentinel error is JSON
`{"detail": "..."}`, which is what the SPA's API client reads. Its block hook
gets a payload fastapi-guard has already redacted (query strings and sensitive
fields), so it is logged as is — never with headers or bodies.
"""

from __future__ import annotations

import logging
from typing import Any

from guard.adapters import StarletteGuardResponse
from guard_core.protocols.request_protocol import GuardRequest
from guard_core.protocols.response_protocol import GuardResponse
from starlette.responses import JSONResponse

logger = logging.getLogger("sentinel.guard")

# How long a refused client should wait before retrying, when fastapi-guard
# hasn't said (it does on its Redis-down 503).
DEFAULT_RETRY_AFTER_SECONDS = "60"


async def json_error_responses(response: GuardResponse) -> GuardResponse:
    """`custom_response_modifier`: fastapi-guard's plain-text errors as Sentinel's JSON shape.

    Only touches guard-generated errors (status ≥ 400 with a text/plain body);
    the app's own responses pass through untouched.
    """
    content_type = response.headers.get("content-type", "")
    if response.status_code < 400 or not content_type.startswith("text/plain"):
        return response
    body = response.body or b""
    detail = body.decode("utf-8", errors="replace").strip() or "Request refused"
    headers = {
        name: value
        for name, value in response.headers.items()
        if name.lower() not in ("content-type", "content-length")
    }
    # A refusal is about this client at this moment: never cache it.
    headers["Cache-Control"] = "no-store"
    if response.status_code == 429 and "retry-after" not in {name.lower() for name in headers}:
        headers["Retry-After"] = DEFAULT_RETRY_AFTER_SECONDS
    return StarletteGuardResponse(JSONResponse({"detail": detail}, status_code=response.status_code, headers=headers))


def log_block(request: GuardRequest, payload: dict[str, Any]) -> None:
    """`on_block`: one structured line per refusal (or would-be refusal in passive mode)."""
    logger.warning(
        "guard %s: %s %s from %s (%s: %s)",
        "would block" if payload.get("passive_mode") else "blocked",
        payload.get("method"),
        payload.get("path"),
        payload.get("client_ip"),
        payload.get("check_name"),
        payload.get("reason"),
    )


def log_guard_error(stage: str, error: BaseException, context: dict[str, Any]) -> None:
    """`on_error`: a failure inside the guard itself (geo lookup, agent transport…)."""
    # The exception's type and message only: its context can carry request data.
    logger.error("guard failure in %s: %s: %s", stage, type(error).__name__, error)
