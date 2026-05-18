"""Shared error-response helpers for FastAPI routers.

The space router has ~10 identical try/except blocks that map RuntimeError →
503 and any other Exception → 500. This module collapses that pattern into a
single decorator so router code stays focused on the success path.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import wraps
from typing import TypeVar

from fastapi.responses import JSONResponse

F = TypeVar("F", bound=Callable[..., Awaitable])


def handle_service_errors(fn: F) -> F:
    """Decorator: catch RuntimeError → 503, any other Exception → 500.

    Use on async FastAPI handlers whose docstrings promise "503 on service
    error" semantics. The error JSON shape is preserved exactly as the
    hand-written blocks emit it:

        503: {"error": str(e)}
        500: {"error": f"Unexpected error: {e}"}
    """
    @wraps(fn)
    async def wrapper(*args, **kwargs):
        try:
            return await fn(*args, **kwargs)
        except RuntimeError as e:
            return JSONResponse({"error": str(e)}, status_code=503)
        except Exception as e:
            return JSONResponse({"error": f"Unexpected error: {e}"}, status_code=500)
    return wrapper  # type: ignore[return-value]


def handle_unexpected_errors(fn: F) -> F:
    """Decorator: catch any Exception → 500 with `{"error": str(e)}`.

    Used by endpoints that don't distinguish RuntimeError from other failures
    (e.g. simple DB-only queries that wrap everything in `except Exception`).
    """
    @wraps(fn)
    async def wrapper(*args, **kwargs):
        try:
            return await fn(*args, **kwargs)
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)
    return wrapper  # type: ignore[return-value]
