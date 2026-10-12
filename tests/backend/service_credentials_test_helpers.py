"""Per-caller HTTP credentials for tests (backend/platform/service_credentials.py, P7.4b).

Every caller in `service_access.CALLER_ACCESS` gets a fixed, distinct token here.
`accept_callers` writes the accepted-callers list (their SHA-256 hashes, as the
setup script does) and points this process at it; `present_credential` gives
this process one caller's own credential file.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.config import settings
from backend.platform import service_credentials
from backend.platform.service_access import CALLER_ACCESS

TOKENS: dict[str, str] = {
    caller: f"{caller}-test-credential" for caller in CALLER_ACCESS
}


def accept_callers(
    monkeypatch: pytest.MonkeyPatch, directory: Path, callers: list[str] | None = None
) -> Path:
    """Make this process accept `callers` (default: every caller); returns the list's path."""
    accepted = {
        service_credentials.credential_hash(TOKENS[caller]): caller
        for caller in (callers or list(CALLER_ACCESS))
    }
    path = directory / "accepted-callers.json"
    path.write_text(json.dumps(accepted))
    monkeypatch.setattr(settings, "accepted_callers_file", str(path))
    # Each test starts with nothing cached, whatever an earlier one loaded.
    monkeypatch.setattr(service_credentials, "_accepted_callers", {})
    monkeypatch.setattr(service_credentials, "_accepted_callers_signature", None)
    return path


def present_credential(
    monkeypatch: pytest.MonkeyPatch, directory: Path, caller: str
) -> Path:
    """Make this process present `caller`'s credential; returns the file's path."""
    path = directory / "http-credentials.json"
    path.write_text(json.dumps({"caller": caller, "token": TOKENS[caller]}))
    monkeypatch.setattr(settings, "service_http_credentials_file", str(path))
    return path


def bearer(caller: str) -> dict[str, str]:
    """The Authorization header `caller` sends to an internal route."""
    return {"Authorization": f"Bearer {TOKENS[caller]}"}


def decoder_header(caller: str) -> dict[str, str]:
    """The X-Decode-Secret header decoder `caller` sends to its hub endpoints."""
    return {"X-Decode-Secret": TOKENS[caller]}


def allow_decoder(monkeypatch: pytest.MonkeyPatch, caller: str, kind: str) -> None:
    """Add a decoder caller for `kind` to the access table, as a new decoder kind's table entry would.

    Call before `accept_callers`, which lists every caller in the table.
    """
    from backend.platform import service_access

    monkeypatch.setitem(
        service_access.CALLER_ACCESS,
        caller,
        service_access.CallerAccess(decoder_kind=kind),
    )
    monkeypatch.setitem(TOKENS, caller, f"{caller}-test-credential")
