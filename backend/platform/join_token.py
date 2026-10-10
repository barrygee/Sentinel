"""The deployment's join token — the secret services register with (plan §3.2, §4.5).

An explicit `SENTINEL_JOIN_TOKEN` always wins. Otherwise, when
`SENTINEL_JOIN_TOKEN_FILE` names a file on a volume core and the services share,
core generates a random token into it on first use and services read it back,
so a split compose deployment needs no configuration (the same pattern as the
decoder ingest secret, `backend/radio_hub/services/sdr_decode.py`).
"""

from __future__ import annotations

import secrets
from pathlib import Path

from backend.config import settings

_generated_token: str | None = None


def core_join_token() -> str:
    """The token core accepts, generating the shared file if needed. Empty = registration disabled."""
    global _generated_token
    if settings.sentinel_join_token:
        return settings.sentinel_join_token
    if not settings.sentinel_join_token_file:
        return ""
    if _generated_token is not None:
        return _generated_token
    path = Path(settings.sentinel_join_token_file)
    try:
        existing = path.read_text().strip() if path.exists() else ""
        if existing:
            _generated_token = existing
        else:
            generated = secrets.token_urlsafe(32)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(generated)
            # Readable by the service containers that mount the same volume; it
            # guards an internal-network endpoint the gateway never routes.
            path.chmod(0o644)
            _generated_token = generated
    except OSError:
        # No writable volume: registration over HTTP stays disabled rather than
        # running with a token no service can know.
        return ""
    return _generated_token


def service_join_token() -> str:
    """The token a service presents. Empty while core hasn't written the shared file yet."""
    if settings.sentinel_join_token:
        return settings.sentinel_join_token
    if not settings.sentinel_join_token_file:
        return ""
    try:
        return Path(settings.sentinel_join_token_file).read_text().strip()
    except OSError:
        return ""
