"""The SDR Manager API — the HTTP contract between `sdr-manager-local` and its managers (ADR 0007).

Sentry's `/api`, moved over and renamed (`X-Sdr-Manager-*` headers, the
`sdr_manager_session` cookie), version 1 (`api_version.py`). One app,
mounted twice by `service.py`:

  - at `/api/sdr-manager/local`, the prefix the gateway routes to this service
    (it never strips a prefix), for this Sentinel's browser and, from PR 5,
    its `sdr-manager-remote`;
  - at `/api`, for `sdr-manager-remote` on other Sentinels, which manage
    this machine at `<host>:8000/api/...` exactly as they managed a Sentry.

Both mounts serve identical responses, and both enforce the console password.
Its startup and shutdown belong to the outer app (`container.py`'s
lifecycle): a mounted app's own lifespan never runs, so the container is
built onto this app's `state` from outside.
"""

from __future__ import annotations

from typing import Any, cast

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.responses import Response

from sentinel_sdr_manager_local.api_version import ManagementApiVersionMiddleware
from sentinel_sdr_manager_local.config import get_settings
from sentinel_sdr_manager_local.example_fixtures import SDR_MANAGER_LOCAL_VERSION
from sentinel_sdr_manager_local.routers.api import api_router


class ReferrerPolicyMiddleware:
    """Sets `Referrer-Policy: no-referrer` on every response, as raw ASGI.

    Belt-and-braces alongside the access-log redaction in `logging_config.py`:
    a URL carrying a query string should never be handed to a third party via
    the `Referer` header a browser would otherwise send.

    Deliberately **not** `@app.middleware("http")` (Starlette's
    `BaseHTTPMiddleware`) — that wrapper buffers/re-drives the response through
    its own `call_next` machinery and is well known to break long-lived
    `StreamingResponse`s (wrapping `GET /api/events` in it made the SSE
    connection never flush its first bytes at all). A raw ASGI middleware that
    only touches the `http.response.start` message's headers passes every
    `http.response.body` message straight through untouched.
    """

    def __init__(self, app: Any) -> None:
        self._app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        async def _send_with_header(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append((b"referrer-policy", b"no-referrer"))
            await send(message)

        await self._app(scope, receive, _send_with_header)


async def _redacted_validation_handler(_request: Request, exception: Exception) -> Response:
    """Render a 422 without echoing the value that failed.

    FastAPI's default handler includes an `input` key carrying the offending
    value verbatim. For `HotspotConfigRequest.passphrase` and
    `HotspotConfigEntry.passphrase` it would hand the rejected Wi-Fi password
    straight back in the response body — and into every access log, proxy and
    browser devtools panel along the way. `SecretStr` does not help: Pydantic
    records the *raw input* on the error before it applies.

    Applied to every validation error rather than only the secret ones: a list
    of fields to redact is a list somebody has to remember to update the day a
    second secret is added, and `loc` plus `msg` already tell a client which
    field was wrong and why.
    """
    errors = []
    for error in cast(RequestValidationError, exception).errors():
        redacted = {key: value for key, value in error.items() if key not in {"input", "ctx"}}
        errors.append(redacted)
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": errors})


def create_contract_app() -> FastAPI:
    """Build the SDR Manager API app; `service.py` mounts it and `container.py` runs it."""
    settings = get_settings()
    application = FastAPI(
        title="SDR Manager API",
        description="This machine's RTL-SDRs, for Sentinel's SDR Manager (ADR 0007).",
        version=SDR_MANAGER_LOCAL_VERSION,
        # The schema stays published (under each mount, e.g. /api/openapi.json)
        # for whoever builds a manager against it; no interactive docs pages.
        docs_url=None,
        redoc_url=None,
    )
    application.add_exception_handler(RequestValidationError, _redacted_validation_handler)
    application.add_middleware(ReferrerPolicyMiddleware)
    # Advertises the SDR Manager API version to managers, which are deployed and
    # upgraded independently of this machine (Sentry ADR-0009).
    application.add_middleware(ManagementApiVersionMiddleware)

    # CORS is closed by default (Sentry architecture §7.9): the browser reaches
    # this API same-origin through the gateway, and only an explicit
    # SDR_MANAGER_LOCAL_CORS_ORIGINS list opens it for a separately-hosted dev
    # frontend. Never "*".
    cors_origins = settings.cors_origin_list()
    if cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    application.include_router(api_router)
    return application
