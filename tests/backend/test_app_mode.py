"""GET /api/app/mode (backend/core/app_mode.py) and the `SENTINEL_MODE` setting.

The SPA mounts the full shell or the SDR Manager-only one from this answer, so
these pin each mode's wire shape and landing path, and that a mode the shell
doesn't know can't be configured.
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.config import Settings, settings
from backend.core.app_mode import LANDING_PATHS, AppMode, current_app_mode
from tests.in_process_app import app


class TestSetting:
    def test_defaults_to_the_full_app(self, monkeypatch):
        monkeypatch.delenv("SENTINEL_MODE", raising=False)

        assert Settings(_env_file=None).sentinel_mode == "full"

    def test_reads_sentinel_mode_from_the_environment(self, monkeypatch):
        monkeypatch.setenv("SENTINEL_MODE", "sdr-manager-local-only")

        assert Settings(_env_file=None).sentinel_mode == "sdr-manager-local-only"

    @pytest.mark.parametrize("mode", ["", "FULL", "sdr-manager-only", "local-only"])
    def test_an_unknown_mode_fails_at_startup(self, monkeypatch, mode):
        monkeypatch.setenv("SENTINEL_MODE", mode)

        with pytest.raises(ValidationError):
            Settings(_env_file=None)


class TestCurrentAppMode:
    def test_full_mode_lands_on_the_map(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_mode", "full")

        assert current_app_mode() == AppMode(mode="full", landingPath="/")

    def test_sdr_manager_local_only_lands_on_its_settings_section(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_mode", "sdr-manager-local-only")

        assert current_app_mode() == AppMode(mode="sdr-manager-local-only", landingPath="/settings/sdr-manager")

    def test_every_mode_has_a_landing_path(self):
        assert set(LANDING_PATHS) == {"full", "sdr-manager-local-only"}


class TestEndpoint:
    @pytest.mark.parametrize(
        ("mode", "landing_path"),
        [("full", "/"), ("sdr-manager-local-only", "/settings/sdr-manager")],
    )
    def test_answers_the_configured_mode_in_camel_case(self, monkeypatch, mode, landing_path):
        monkeypatch.setattr(settings, "sentinel_mode", mode)

        response = TestClient(app).get("/api/app/mode")

        assert response.status_code == 200
        assert response.json() == {"mode": mode, "landingPath": landing_path}

    def test_is_read_on_every_request(self, monkeypatch):
        client = TestClient(app)
        monkeypatch.setattr(settings, "sentinel_mode", "full")
        assert client.get("/api/app/mode").json()["mode"] == "full"

        monkeypatch.setattr(settings, "sentinel_mode", "sdr-manager-local-only")

        assert client.get("/api/app/mode").json()["mode"] == "sdr-manager-local-only"

    def test_only_get_is_allowed(self):
        assert TestClient(app).post("/api/app/mode").status_code == 405
