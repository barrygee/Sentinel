"""Tests for `POST /api/config`'s per-entry report: what landed, what was skipped, what failed.

An import is partial by nature — a dongle in the file may not be plugged in
here yet, or its port may already be taken — so each entry's fate is reported
rather than the batch failing. Runs against the simulated dongles.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_config_import.py
"""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from sentinel_sdr_manager_local.config import Settings, get_settings
from sentinel_sdr_manager_local.routers.config import _import_console_password, _import_hotspot
from sentinel_sdr_manager_local.schemas.config import HotspotConfigEntry, SdrManagerConfig
from sentinel_sdr_manager_local.services.console_auth import PasswordTooShortError
from sentinel_sdr_manager_local.services.hotspot import HotspotError

FREE_PORT = 21234


@pytest.fixture
def client(
    sdr_manager_local_app_factory: Callable[[], FastAPI], monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    monkeypatch.setenv("SDR_MANAGER_LOCAL_HARDWARE", "fake")
    monkeypatch.setenv("SDR_MANAGER_LOCAL_RECONCILE_INTERVAL_S", "0.01")
    get_settings.cache_clear()
    with TestClient(sdr_manager_local_app_factory(), raise_server_exceptions=False) as test_client:
        deadline = time.monotonic() + 5
        while len(test_client.get("/api/devices").json()["devices"]) < 2:
            assert time.monotonic() < deadline, "the simulated dongles never arrived"
            time.sleep(0.01)
        yield test_client


def _entry(identity_kind: str, identity_key: str, output_port: int, name: str = "Imported") -> dict[str, Any]:
    return {"identity_kind": identity_kind, "identity_key": identity_key, "name": name, "output_port": output_port}


class TestDevices:
    def test_reports_each_entry_applied_skipped_or_failed(self, client: TestClient) -> None:
        file = {
            "version": 1,
            "devices": [
                _entry("serial", "SIM-ADSB-01", FREE_PORT, name="ADSB SDR"),
                _entry("serial", "NOT-PLUGGED-IN", FREE_PORT + 10),
                # The same port as the first entry: refused by the allocator.
                _entry("usb", "1-1.2", FREE_PORT),
            ],
        }

        result = client.post("/api/config", json={"config": file}).json()

        outcomes = {entry["identity_key"]: entry for entry in result["devices"]}
        assert outcomes["SIM-ADSB-01"]["outcome"] == "applied"
        assert outcomes["NOT-PLUGGED-IN"]["outcome"] == "skipped"
        assert "Not detected on this SDR Manager" in outcomes["NOT-PLUGGED-IN"]["detail"]
        assert outcomes["1-1.2"]["outcome"] == "failed"
        assert outcomes["1-1.2"]["detail"]
        assert (result["devices_applied"], result["devices_skipped"], result["devices_failed"]) == (1, 1, 1)
        # The applied entry really landed, through the same path PATCH uses.
        (adsb,) = [
            device for device in client.get("/api/devices").json()["devices"] if device["identity_key"] == "SIM-ADSB-01"
        ]
        assert (adsb["name"], adsb["output_port"]) == ("ADSB SDR", FREE_PORT)

    def test_apply_devices_false_leaves_them_alone(self, client: TestClient) -> None:
        file = {"version": 1, "devices": [_entry("serial", "SIM-ADSB-01", FREE_PORT)]}

        result = client.post("/api/config", json={"config": file, "apply_devices": False}).json()

        assert result["devices"] == []
        assert all(device["record_id"] is None for device in client.get("/api/devices").json()["devices"])

    def test_a_file_from_a_newer_version_is_refused_whole(self, client: TestClient) -> None:
        response = client.post("/api/config", json={"config": {"version": 2}})

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert (detail["code"], detail["supported"], detail["received"]) == ("unsupported_config_version", 1, 2)


class TestHotspot:
    def test_a_file_without_a_hotspot_section_says_so(self, client: TestClient) -> None:
        result = client.post("/api/config", json={"config": {"version": 1}, "apply_hotspot": True}).json()

        assert result["hotspot_applied"] is False
        assert result["hotspot_detail"] == "The file has no hotspot configuration."

    def test_a_hotspot_section_is_not_applied_while_control_is_switched_off(self, client: TestClient) -> None:
        file = {"version": 1, "hotspot": {"ssid": "Field", "passphrase": "long enough passphrase"}}

        result = client.post("/api/config", json={"config": file, "apply_hotspot": True}).json()

        assert result["hotspot_applied"] is False
        assert result["hotspot_detail"] == "Hotspot control is switched off on this SDR Manager."

    def test_an_explicit_null_passphrase_means_none(self) -> None:
        assert HotspotConfigEntry.model_validate({"ssid": "Field", "passphrase": None}).passphrase is None

    async def test_a_refusal_from_the_hotspot_is_reported_not_raised(self) -> None:
        class RefusingHotspot:
            async def apply_configuration(self, **_settings: Any) -> None:
                raise HotspotError("interface_busy", "wlan0 is carrying this machine's own link.")

        applied, detail = await _import_hotspot(
            HotspotConfigEntry.model_validate({"ssid": "Field", "passphrase": "long enough passphrase"}),
            RefusingHotspot(),  # type: ignore[arg-type]
            Settings(hotspot_control_enabled=True),
            password_set=True,
        )

        assert (applied, detail) == (False, "wlan0 is carrying this machine's own link.")


class TestConsolePassword:
    async def test_a_password_the_service_refuses_is_reported(self) -> None:
        async def too_short(_password: str, current_password: str | None) -> None:
            raise PasswordTooShortError("The password must be at least 8 characters.")

        async def not_set() -> bool:
            return False

        console_auth = SimpleNamespace(is_password_set=not_set, set_password=too_short)

        applied, detail = await _import_console_password("x", console_auth)  # type: ignore[arg-type]

        assert (applied, detail) == (False, "The password must be at least 8 characters.")

    async def test_an_existing_password_is_never_replaced_and_the_reset_is_named(self) -> None:
        async def already_set() -> bool:
            return True

        applied, detail = await _import_console_password(
            "a good long password",
            SimpleNamespace(is_password_set=already_set),  # type: ignore[arg-type]
        )

        assert applied is False
        assert "python -m sentinel_sdr_manager_local.reset_password" in detail

    def test_a_short_password_in_the_file_is_refused_at_parse_time(self) -> None:
        with pytest.raises(ValidationError, match="console_password must be at least"):
            SdrManagerConfig.model_validate({"version": 1, "console_password": "short"})

    @pytest.mark.parametrize("file", [{"version": 1}, {"version": 1, "console_password": None}])
    def test_a_file_without_a_password_parses_to_none(self, file: dict[str, Any]) -> None:
        assert SdrManagerConfig.model_validate(file).console_password is None
