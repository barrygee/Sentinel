"""
tests/backend/test_radio_hub_iq_captures_router.py

Tests for backend/radio_hub/routers/iq_captures.py — where the SDR section
downloads a finished IQ capture from the radio hub and then deletes it
(section-containers plan P7.3). Pinned here:
  * the deployment's join token is required (401 without or with a wrong one,
    503 when this deployment has none);
  * a capture still being written is refused (409), a missing one is 404, an
    id below 1 is rejected before anything is read;
  * GET streams the raw bytes; DELETE removes the staged file;
  * DELETE refuses while the hub writes into the SDR section's own recordings
    (they share a process), so it can never delete a recording's IQ.
"""

from __future__ import annotations

import pytest

from backend.config import settings
from backend.platform import join_token as join_token_module
from backend.radio_hub.services import iq_capture

JOIN_TOKEN = "deployment-join-token"
AUTHORIZED = {"Authorization": f"Bearer {JOIN_TOKEN}"}
URL = "/internal/radio-hub/iq-captures"


@pytest.fixture(autouse=True)
def deployment(monkeypatch, tmp_path):
    """A join token, and the app hosting the hub with the SDR section elsewhere (staged captures)."""
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "sentinel.db"))
    monkeypatch.setattr(settings, "sentinel_join_token", JOIN_TOKEN)
    monkeypatch.setattr(settings, "sentinel_join_token_file", "")
    monkeypatch.setattr(settings, "sentinel_core_url", "")
    monkeypatch.setattr(settings, "sentinel_external_services", "sdr")
    monkeypatch.setattr(join_token_module, "_generated_token", None)


@pytest.fixture()
def staged(tmp_path):
    """Capture 5 staged on the hub."""
    staging = tmp_path / "iq-captures"
    staging.mkdir()
    capture = staging / "5.u8"
    capture.write_bytes(b"\x01\x02\x03\x04")
    return capture


class TestJoinToken:
    @pytest.mark.parametrize("method", ["get", "delete"])
    def test_refuses_a_caller_without_the_token(self, client, staged, method):
        assert getattr(client, method)(f"{URL}/5").status_code == 401
        assert staged.exists()

    @pytest.mark.parametrize("method", ["get", "delete"])
    def test_refuses_a_wrong_token(self, client, staged, method):
        response = getattr(client, method)(f"{URL}/5", headers={"Authorization": "Bearer guess"})
        assert response.status_code == 401
        assert staged.exists()

    def test_refuses_a_token_without_the_bearer_scheme(self, client, staged):
        assert client.get(f"{URL}/5", headers={"Authorization": JOIN_TOKEN}).status_code == 401

    def test_is_unavailable_on_a_deployment_without_a_join_token(self, client, staged, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_join_token", "")
        assert client.get(f"{URL}/5", headers=AUTHORIZED).status_code == 503


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
        from backend.modules.radio_hub import manifest

        assert not any(route.startswith("/internal") for route in manifest.routes)
