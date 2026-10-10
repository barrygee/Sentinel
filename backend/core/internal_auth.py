"""The guard on core's `/internal/**` routes: the deployment's join token as a bearer token.

The gateway never routes `/internal/` from outside, so only services on the
deployment's network reach these routes; the token is what proves a caller is
one of the deployment's own services (plan §3.2, §4.5).
"""

from __future__ import annotations

import hmac

from backend.platform.join_token import core_join_token
from fastapi import HTTPException

_BEARER_PREFIX = "Bearer "


def require_join_token(authorization: str | None) -> None:
    """Raise 503 when service joins are disabled here, 401 unless `authorization` carries the join token."""
    expected = core_join_token()
    if not expected:
        raise HTTPException(status_code=503, detail="Service registration is disabled on this deployment")
    presented = (
        authorization[len(_BEARER_PREFIX) :] if authorization and authorization.startswith(_BEARER_PREFIX) else ""
    )
    # Constant-time, so the token can't be recovered a character at a time.
    if not hmac.compare_digest(presented.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid join token")
