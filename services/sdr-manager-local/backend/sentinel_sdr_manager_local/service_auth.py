"""The service bearer: how this Sentinel's own sdr-manager-remote manages these SDRs (ADR 0007).

sdr-manager-remote holds no console password for this machine. It presents its
own HTTP credential (`backend/platform/service_credentials.py`) as
`Authorization: Bearer <token>`, which is checked by its SHA-256 hash against
`ACCEPTED_CALLERS_FILE` and must belong to a caller that `service_access.py`
lets manage local SDRs: sdr-manager-remote and nothing else, core included.

Another machine's managers have no credential here and sign in with the
console password, as before. The token is never logged.
"""

from __future__ import annotations

from backend.platform.service_access import may_manage_local_sdrs
from backend.platform.service_credentials import accepts_callers, identify_caller

_BEARER_PREFIX = "Bearer "


def presents_service_bearer(authorization: str | None) -> bool:
    """True when `authorization` carries a credential allowed to manage this machine's SDRs.

    False for no header, another scheme, an unknown token, a caller without
    the grant, or a process with no accepted-callers list (outside Docker),
    so the caller falls back to the console session check.
    """
    if not authorization or not authorization.startswith(_BEARER_PREFIX):
        return False
    token = authorization[len(_BEARER_PREFIX) :]
    if not token or not accepts_callers():
        return False
    caller = identify_caller(token)
    return caller is not None and may_manage_local_sdrs(caller)
