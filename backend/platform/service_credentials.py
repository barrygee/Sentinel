"""This process's internal HTTP credential, and who presented one (plan §4.5, P7.4b).

The one-shot `service-credentials` compose service gives every service and
decoder its own random token (`services/<caller>/http-credentials.json`) and
writes core and the radio hub the list of tokens they accept — as SHA-256
hashes, so neither holds anyone else's credential (`accepted-callers.json`).
What an identified caller may then do is `service_access.py`'s business.

Outside Docker neither file is configured: this process presents no credential
and accepts none, so its internal routes and decoder endpoints answer 503.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from pathlib import Path

from backend.config import settings

logger = logging.getLogger(__name__)

_accepted_callers: dict[str, str] = {}
_accepted_callers_signature: tuple[str, int, int] | None = None


def credential_hash(token: str) -> str:
    """The SHA-256 hex digest a credential is known by in `accepted-callers.json`."""
    return hashlib.sha256(token.encode()).hexdigest()


def own_token() -> str:
    """The token this process presents, or `""` when it has none (or it can't be read)."""
    if not settings.service_http_credentials_file:
        return ""
    try:
        token = json.loads(Path(settings.service_http_credentials_file).read_text())["token"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        logger.error("HTTP credentials at %s can't be read (%s)", settings.service_http_credentials_file, error)
        return ""
    return token if isinstance(token, str) else ""


def _load_accepted_callers() -> dict[str, str]:
    """`accepted-callers.json`, re-read when it changes (a new `up` may add a decoder)."""
    global _accepted_callers, _accepted_callers_signature
    path = settings.accepted_callers_file
    if not path:
        return {}
    try:
        status = Path(path).stat()
        # Nanosecond mtime plus size, so a rewrite within the same second is still seen.
        signature = (path, status.st_mtime_ns, status.st_size)
        if signature != _accepted_callers_signature:
            loaded = json.loads(Path(path).read_text())
            _accepted_callers = {str(digest): str(caller) for digest, caller in dict(loaded).items()}
            _accepted_callers_signature = signature
    except (OSError, ValueError, TypeError) as error:
        logger.error("accepted callers at %s can't be read (%s)", path, error)
        return {}
    return _accepted_callers


def accepts_callers() -> bool:
    """True when this process has a list of callers to check credentials against."""
    return bool(_load_accepted_callers())


def identify_caller(token: str) -> str | None:
    """The caller `token` belongs to, or None for an unknown (or empty) token.

    An empty token needs no special case: its hash is in no generated list.
    """
    presented = credential_hash(token)
    for digest, caller in _load_accepted_callers().items():
        # Constant-time on the digests, so a hash can't be guessed a character at a time.
        if hmac.compare_digest(presented, digest):
            return caller
    return None
