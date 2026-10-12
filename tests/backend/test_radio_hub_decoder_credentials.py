"""Each decoder endpoint accepts only its own kind's credential (P7.4b).

Before P7.4b every decoder shared one secret, so any of them could post
events as another kind. Now the hub knows each decoder by its own credential
(backend/platform/service_access.py) and refuses the rest with 403.
"""

import pytest

from backend.radio_hub.services import sdr_decode
from backend.platform.service_access import CALLER_ACCESS
from tests.backend.service_credentials_test_helpers import (
    accept_callers,
    decoder_header,
)

# (method, path, the decoder that owns it)
ENDPOINTS = [
    ("POST", "/api/sdr/decode/ingest", "voice-decoder"),
    ("GET", "/api/sdr/decode/config", "voice-decoder"),
    ("POST", "/api/sdr/aprs/ingest", "aprs-decoder"),
    ("GET", "/api/sdr/aprs/config", "aprs-decoder"),
    ("POST", "/api/sdr/ais/ingest", "ais-decoder"),
    ("GET", "/api/sdr/ais/config", "ais-decoder"),
]


@pytest.fixture(autouse=True)
def accepting(monkeypatch, tmp_path):
    accept_callers(monkeypatch, tmp_path)
    sdr_decode._bridges.clear()
    sdr_decode._aprs_bridges.clear()
    sdr_decode._ais_bridges.clear()


def _call(client, method, path, caller):
    return client.request(
        method,
        path,
        headers=decoder_header(caller),
        json={"event": {}} if method == "POST" else None,
    )


@pytest.mark.parametrize(("method", "path", "owner"), ENDPOINTS)
def test_the_owning_decoder_gets_past_the_gate(client, method, path, owner):
    # No session is running: ingest answers 409 and config reports inactive,
    # both only reachable once the credential was accepted.
    assert _call(client, method, path, owner).status_code == (
        409 if method == "POST" else 200
    )


@pytest.mark.parametrize(("method", "path", "owner"), ENDPOINTS)
def test_every_other_caller_is_refused(client, method, path, owner):
    for caller in CALLER_ACCESS:
        if caller == owner:
            continue
        assert _call(client, method, path, caller).status_code == 403, caller


@pytest.mark.parametrize(("method", "path", "owner"), ENDPOINTS)
def test_an_unknown_credential_is_401(client, method, path, owner):
    response = client.request(
        method, path, headers={"X-Decode-Secret": "made-up"}, json={"event": {}}
    )
    assert response.status_code == 401
