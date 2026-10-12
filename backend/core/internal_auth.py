"""The guards on internal routes: who is calling, and may they (plan §3.2, §4.5, P7.4b).

The gateway never routes `/internal/` from outside, so only processes on the
deployment's network reach those routes; each presents its own credential as a
bearer token. Decoders reach their hub endpoints through the gateway and
present theirs in `X-Decode-Secret` (the header name predates per-caller
credentials and the public API pins it). What each caller may do is decided by
`backend/platform/service_access.py`.
"""

from __future__ import annotations

from backend.platform.service_access import may_decode
from backend.platform.service_credentials import accepts_callers, identify_caller
from fastapi import HTTPException

_BEARER_PREFIX = "Bearer "


def require_caller(authorization: str | None) -> str:
    """The caller behind a bearer `authorization` header.

    Raises 503 when this process checks no credentials (no accepted-callers
    list), 401 for a missing or unknown credential.
    """
    if not accepts_callers():
        raise HTTPException(status_code=503, detail="Internal service access is disabled on this deployment")
    presented = (
        authorization[len(_BEARER_PREFIX) :] if authorization and authorization.startswith(_BEARER_PREFIX) else ""
    )
    caller = identify_caller(presented)
    if caller is None:
        raise HTTPException(status_code=401, detail="Invalid service credential")
    return caller


def require_permission(allowed: bool) -> None:
    """Raise 403 unless the identified caller is `allowed` this action."""
    if not allowed:
        raise HTTPException(status_code=403, detail="This service may not do that")


def require_decoder(presented: str, kind: str) -> str:
    """The decoder behind an `X-Decode-Secret` credential, which must be a `kind` decoder.

    Fails closed exactly as the shared decoder secret did: 503 with nothing to
    check against, 401 for an unknown credential, plus 403 for another kind's.
    """
    if not accepts_callers():
        raise HTTPException(503, "decode ingestion disabled")
    caller = identify_caller(presented)
    if caller is None:
        raise HTTPException(401, "invalid decode secret")
    if not may_decode(caller, kind):
        raise HTTPException(403, f"not a {kind} decoder")
    return caller
