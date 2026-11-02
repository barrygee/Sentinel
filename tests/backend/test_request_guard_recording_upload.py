"""The shipped guard policy lets an SDR recording's WAV through on stop.

Stopping a recording uploads the whole WAV. It used to share `radio_control`'s
64 KB cap, so any recording longer than about 0.7 s got a 413 and the browser
then deleted it. These run the real policy file against stand-in endpoints.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_recording_upload.py
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI, Request
from starlette.testclient import TestClient

from backend.platform.security.access import AccessRules
from backend.platform.security.install import install_request_guard
from backend.platform.security.policy import DEFAULT_POLICY_PATH, read_policy
from tests.backend.request_guard_helpers import (
    LAN_BROWSER_ADDRESS,
    SAME_ORIGIN_FETCH,
    pin_guard_settings,
)

# Mono 16-bit audio at 48 kHz is 96,000 bytes a second: this is about 10 s.
TEN_SECOND_WAV = b"RIFF" + b"\x00" * 960_000
WAV_FORMAT_MAX_BYTES = 2**32


@pytest.fixture(autouse=True)
def _shipped_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    pin_guard_settings(monkeypatch, guard_profile="section")


@pytest.fixture
def browser() -> Iterator[TestClient]:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.post("/api/sdr/recordings/start")
    async def start(request: Request) -> dict[str, int]:
        return {"received": len(await request.body())}

    @app.post("/api/sdr/recordings/stop")
    async def stop(request: Request) -> dict[str, int]:
        return {"received": len(await request.body())}

    install_request_guard(app, service_name="sdr")
    with TestClient(app, client=(LAN_BROWSER_ADDRESS, 50000), raise_server_exceptions=False) as client:
        yield client


class TestShippedRules:
    @pytest.mark.parametrize("profile", ["section", "core"])
    def test_stop_has_its_own_upload_group_and_start_keeps_the_small_cap(self, profile: str) -> None:
        rules = AccessRules(read_policy(DEFAULT_POLICY_PATH), profile)

        assert rules.rule_for("POST", "/api/sdr/recordings/stop").rule.group == "recording_upload"
        assert rules.rule_for("POST", "/api/sdr/recordings/start").rule.group == "radio_control"

    def test_the_upload_group_fits_the_largest_wav_but_no_more_than_the_form_around_it(
        self,
    ) -> None:
        group = read_policy(DEFAULT_POLICY_PATH).route_groups["recording_upload"]

        assert group.max_request_bytes is not None
        assert WAV_FORMAT_MAX_BYTES < group.max_request_bytes <= WAV_FORMAT_MAX_BYTES + 65_536
        assert group.allowed_content_types == ["multipart/form-data"]

    def test_the_audio_is_never_scanned_for_attacks(self) -> None:
        # Binary audio can contain any byte pattern; a false match would ban the operator.
        group = read_policy(DEFAULT_POLICY_PATH).route_groups["recording_upload"]

        assert group.detection is not None
        assert group.detection.scan_body is False


class TestThroughTheGuard:
    def test_a_ten_second_recording_is_saved(self, browser: TestClient) -> None:
        response = browser.post(
            "/api/sdr/recordings/stop",
            headers=SAME_ORIGIN_FETCH,
            data={"recording_id": "1"},
            files={"file": ("clip.wav", TEN_SECOND_WAV, "audio/wav")},
        )

        assert response.status_code == 200
        assert response.json()["received"] > len(TEN_SECOND_WAV)

    def test_stop_without_a_form_is_refused(self, browser: TestClient) -> None:
        response = browser.post(
            "/api/sdr/recordings/stop",
            headers={**SAME_ORIGIN_FETCH, "content-type": "application/json"},
            content=b"{}",
        )

        assert response.status_code == 415

    def test_a_request_claiming_more_than_a_wav_can_hold_is_refused(self, browser: TestClient) -> None:
        response = browser.post(
            "/api/sdr/recordings/stop",
            headers={
                **SAME_ORIGIN_FETCH,
                "content-type": "multipart/form-data; boundary=x",
                "content-length": str(WAV_FORMAT_MAX_BYTES + 65_537),
            },
            content=b"",
        )

        assert response.status_code == 413

    def test_start_still_has_the_small_cap(self, browser: TestClient) -> None:
        response = browser.post(
            "/api/sdr/recordings/start",
            headers={**SAME_ORIGIN_FETCH, "content-type": "application/json"},
            content=b"{" + b" " * 70_000 + b"}",
        )

        assert response.status_code == 413
