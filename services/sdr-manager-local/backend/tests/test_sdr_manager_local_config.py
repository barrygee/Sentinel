"""Tests for `config.py`: the `SDR_MANAGER_LOCAL_*` settings, including the two new ones.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_config.py
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from sentinel_sdr_manager_local import config as config_module
from sentinel_sdr_manager_local.config import Settings, get_settings


class TestEnvironment:
    def test_reads_the_sdr_manager_local_prefix(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_PORT", "8123")
        monkeypatch.setenv("SDR_MANAGER_LOCAL_HARDWARE", "fake")
        get_settings.cache_clear()

        settings = get_settings()

        assert (settings.http_port, settings.hardware) == (8123, "fake")

    def test_ignores_sentrys_old_prefix(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SENTRY_HTTP_PORT", "8123")

        assert Settings().http_port == 8000

    def test_is_cached_until_cleared(self) -> None:
        assert get_settings() is get_settings()

    def test_has_no_database_url_of_its_own(self) -> None:
        # The database is Sentinel's DB_PATH, shared with every service's layout.
        assert "database_url" not in Settings.model_fields


class TestDefaults:
    def test_real_hardware_and_a_minute_between_location_reads(self) -> None:
        settings = Settings()

        assert settings.hardware == "real"
        assert settings.location_refresh_s == 60.0
        assert settings.hotspot_connection_name == "sdr-manager-hotspot"

    def test_the_relay_ships_inside_the_package(self) -> None:
        relay = Path(Settings().relay_path)

        assert relay.name == "rtl_tcp_relay.py"
        assert relay.parent == Path(config_module.__file__).resolve().parent / "relay"
        assert relay.is_file()


class TestValidation:
    def test_hardware_is_real_or_fake(self) -> None:
        with pytest.raises(ValidationError):
            Settings(hardware="mock")  # type: ignore[arg-type]

    @pytest.mark.parametrize("seconds", [4.9, 3601])
    def test_location_refresh_is_bounded(self, seconds: float) -> None:
        with pytest.raises(ValidationError):
            Settings(location_refresh_s=seconds)

    @pytest.mark.parametrize("seconds", [5, 3600])
    def test_location_refresh_accepts_its_bounds(self, seconds: float) -> None:
        assert Settings(location_refresh_s=seconds).location_refresh_s == seconds


class TestReservedPorts:
    def test_parses_a_comma_separated_list(self) -> None:
        assert Settings(reserved_ports=" 9000, ,9001 ").reserved_port_numbers() == frozenset({9000, 9001})

    def test_names_the_bad_entry_and_the_renamed_variable(self) -> None:
        with pytest.raises(ValueError, match=r"SDR_MANAGER_LOCAL_RESERVED_PORTS entry 'nine' is not a valid port"):
            Settings(reserved_ports="9000,nine").reserved_port_numbers()


class TestMacSettings:
    def test_librtlsdr_is_searched_for_and_native_is_off_by_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SDR_MANAGER_LOCAL_LIBRTLSDR_PATH", raising=False)
        monkeypatch.delenv("SDR_MANAGER_LOCAL_NATIVE", raising=False)

        settings = Settings()

        assert (settings.librtlsdr_path, settings.native) == (None, False)

    def test_both_are_read_from_the_environment(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SDR_MANAGER_LOCAL_LIBRTLSDR_PATH", "/opt/homebrew/lib/librtlsdr.dylib")
        monkeypatch.setenv("SDR_MANAGER_LOCAL_NATIVE", "1")

        settings = Settings()

        assert (settings.librtlsdr_path, settings.native) == ("/opt/homebrew/lib/librtlsdr.dylib", True)
