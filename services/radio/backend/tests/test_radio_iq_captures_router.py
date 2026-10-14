"""
services/radio/backend/tests/test_radio_iq_captures_router.py

Tests for sentinel_radio/routers/iq_captures.py — where the SDR section
downloads a finished IQ capture from the radio hub and then deletes it
(section-containers plan P7.3). Pinned here:
  * only the SDR section's own credential (or core's) is accepted: 401 without
    or with an unknown one, 403 for any other caller, 503 when this process
    accepts no callers (P7.4b);
  * a capture still being written is refused (409), a missing one is 404, an
    id below 1 is rejected before anything is read;
  * GET streams the raw bytes; DELETE removes the staged file;
  * DELETE refuses while the hub writes into the SDR section's own recordings
    (they share a process), so it can never delete a recording's IQ.
"""

from __future__ import annotations

import pytest
from backend.config import settings
from tests.backend.service_credentials_test_helpers import (
    TOKENS,
    accept_callers,
    bearer,
)

from sentinel_radio.services import iq_capture

AUTHORIZED = bearer("sdr")
URL = "/internal/radio-hub/iq-captures"


@pytest.fixture(autouse=True)
def deployment(monkeypatch, tmp_path):
    """Credentials, and the app hosting the hub with the SDR section elsewhere (staged captures)."""
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "sentinel.db"))
    accept_callers(monkeypatch, tmp_path)
    monkeypatch.setattr(settings, "sentinel_core_url", "")
    monkeypatch.setattr(settings, "sentinel_external_services", "sdr")


@pytest.fixture()
def staged(tmp_path):
    """Capture 5 staged on the hub."""
    staging = tmp_path / "iq-captures"
    staging.mkdir()
    capture = staging / "5.u8"
    capture.write_bytes(b"\x01\x02\x03\x04")
    return capture


class TestCredential:
    @pytest.mark.parametrize("method", ["get", "delete"])
    def test_refuses_a_caller_without_a_credential(self, client, staged, method):
        assert getattr(client, method)(f"{URL}/5").status_code == 401
        assert staged.exists()

    @pytest.mark.parametrize("method", ["get", "delete"])
    def test_refuses_an_unknown_credential(self, client, staged, method):
        response = getattr(client, method)(f"{URL}/5", headers={"Authorization": "Bearer guess"})
        assert response.status_code == 401
        assert staged.exists()

    def test_refuses_a_credential_without_the_bearer_scheme(self, client, staged):
        assert client.get(f"{URL}/5", headers={"Authorization": TOKENS["sdr"]}).status_code == 401

    def test_is_unavailable_when_this_process_accepts_no_callers(self, client, staged, monkeypatch):
        monkeypatch.setattr(settings, "accepted_callers_file", "")
        assert client.get(f"{URL}/5", headers=AUTHORIZED).status_code == 503

    @pytest.mark.parametrize("method", ["get", "delete"])
    @pytest.mark.parametrize("caller", ["sea", "space", "land", "air", "radio", "stub-decoder"])
    def test_refuses_every_other_caller(self, client, staged, method, caller):
        # Raw IQ is for the service that keeps the recordings only.
        assert getattr(client, method)(f"{URL}/5", headers=bearer(caller)).status_code == 403
        assert staged.exists()

    def test_core_may_fetch_it(self, client, staged):
        assert client.get(f"{URL}/5", headers=bearer("core")).status_code == 200


class TestDownload:
    def test_streams_the_capture(self, client, staged):
        response = client.get(f"{URL}/5", headers=AUTHORIZED)

        assert response.status_code == 200
        assert response.content == b"\x01\x02\x03\x04"
        assert response.headers["content-type"] == "application/octet-stream"
        assert staged.exists()

    def test_a_missing_capture_is_404(self, client):
        assert client.get(f"{URL}/5", headers=AUTHORIZED).status_code == 404

    def test_a_capture_still_being_written_is_409(self, client, staged, monkeypatch):
        monkeypatch.setitem(iq_capture._active_captures, 5, (object(), object()))
        assert client.get(f"{URL}/5", headers=AUTHORIZED).status_code == 409

    @pytest.mark.parametrize("capture_id", ["0", "-1", "abc"])
    def test_rejects_an_id_that_is_not_a_recording_id(self, client, capture_id):
        assert client.get(f"{URL}/{capture_id}", headers=AUTHORIZED).status_code == 422


class TestDelete:
    def test_removes_the_staged_capture(self, client, staged):
        response = client.delete(f"{URL}/5", headers=AUTHORIZED)

        assert response.status_code == 204
        assert not staged.exists()

    def test_a_missing_capture_is_404(self, client):
        assert client.delete(f"{URL}/5", headers=AUTHORIZED).status_code == 404

    def test_a_capture_still_being_written_is_kept(self, client, staged, monkeypatch):
        monkeypatch.setitem(iq_capture._active_captures, 5, (object(), object()))

        assert client.delete(f"{URL}/5", headers=AUTHORIZED).status_code == 409
        assert staged.exists()

    def test_refuses_while_the_sdr_section_shares_this_process(self, client, monkeypatch, tmp_path):
        # Then the "capture" is the recording's own IQ in the SDR recordings folder.
        monkeypatch.setattr(settings, "sentinel_external_services", "")
        recordings = tmp_path / "recordings"
        recordings.mkdir()
        (recordings / "5.u8").write_bytes(b"recording")

        assert client.delete(f"{URL}/5", headers=AUTHORIZED).status_code == 409
        assert (recordings / "5.u8").read_bytes() == b"recording"


class TestNotPublic:
    def test_is_left_out_of_the_openapi_schema(self):
        from backend.main import app

        assert not any(path.startswith(URL) for path in app.openapi()["paths"])

    def test_is_not_a_prefix_the_hub_asks_the_gateway_to_route(self):
        from sentinel_radio.module import manifest

        assert not any(route.startswith("/internal") for route in manifest.routes)
