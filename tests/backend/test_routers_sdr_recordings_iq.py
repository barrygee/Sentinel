"""
tests/backend/test_routers_sdr_recordings_iq.py

Tests for how the SDR section's recording endpoints (backend/routers/sdr.py) ask
the radio hub for raw-IQ capture over the bus (section-containers plan, B12).
The hub side — the file itself — is covered in test_radio_hub_iq_capture.py.

The section's `bus` is swapped for a recorder, so each test can force the hub's
reply (ok, declined, unreachable) and see exactly which requests were sent:
  * start asks only when `sdr.recordRawIq` is on and a radio is named, and
    marks `has_iq_file` only on an `ok` reply;
  * no hub answer (raised or declined) never fails the recording itself;
  * stop asks the hub to stop only for a recording that has an IQ file, and
    reports the size of the file the hub wrote.
"""

from __future__ import annotations

from typing import Any

import pytest

from backend.config import settings
from backend.routers import sdr as sdr_section_router

START = "hub.iq-capture.start"
STOP = "hub.iq-capture.stop"


class _RecordingBus:
    """Stands in for the event bus: records requests, answers from `replies`."""

    def __init__(self) -> None:
        self.requests: list[tuple[str, dict[str, Any]]] = []
        self.replies: dict[str, Any] = {START: {"ok": True}, STOP: {"ok": True}}

    async def request(
        self, subject: str, payload: dict[str, Any], timeout: float | None = 5.0
    ) -> Any:
        self.requests.append((subject, payload))
        reply = self.replies[subject]
        if isinstance(reply, Exception):
            raise reply
        return reply

    def subjects(self) -> list[str]:
        return [subject for subject, _ in self.requests]


@pytest.fixture()
def fake_bus(monkeypatch, tmp_path) -> _RecordingBus:
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "sentinel.db"))
    recording_bus = _RecordingBus()
    monkeypatch.setattr(sdr_section_router, "bus", recording_bus)
    return recording_bus


def _enable_raw_iq(client, enabled: bool = True) -> None:
    assert (
        client.put("/api/settings/sdr/recordRawIq", json={"value": enabled}).status_code
        == 200
    )


def _start(client, **overrides) -> int:
    body = {
        "radio_id": 3,
        "radio_name": "Dongle",
        "frequency_hz": 145_800_000,
        **overrides,
    }
    resp = client.post("/api/sdr/recordings/start", json=body)
    assert resp.status_code == 201
    return resp.json()["id"]


def _stop(client, recording_id: int):
    return client.post(
        "/api/sdr/recordings/stop",
        data={"recording_id": str(recording_id), "name": "Pass"},
        files={"file": ("rec.wav", b"RIFF-wav", "audio/wav")},
    )


class TestStartAsksTheHub:
    def test_asks_for_a_capture_named_after_the_recording(self, client, fake_bus):
        _enable_raw_iq(client)
        recording_id = _start(client)
        assert fake_bus.subjects() == [START]
        payload = fake_bus.requests[0][1]
        assert payload["capture_id"] == recording_id
        assert payload["radio_id"] == 3
        assert payload["db"] is not None

    def test_ok_reply_marks_the_recording_as_having_an_iq_file(self, client, fake_bus):
        _enable_raw_iq(client)
        recording_id = _start(client)
        assert _stop(client, recording_id).json()["has_iq_file"] is True

    def test_declined_reply_leaves_no_iq_file(self, client, fake_bus):
        _enable_raw_iq(client)
        fake_bus.replies[START] = {"ok": False, "reason": "not_streaming"}
        recording_id = _start(client)
        assert _stop(client, recording_id).json()["has_iq_file"] is False

    def test_an_unreachable_hub_does_not_fail_the_recording(self, client, fake_bus):
        _enable_raw_iq(client)
        fake_bus.replies[START] = LookupError("no responder registered")
        recording_id = _start(client)
        stopped = _stop(client, recording_id)
        assert stopped.status_code == 200
        assert stopped.json()["has_iq_file"] is False

    def test_does_not_ask_when_raw_iq_recording_is_off(self, client, fake_bus):
        _enable_raw_iq(client, enabled=False)
        _start(client)
        assert fake_bus.requests == []

    def test_does_not_ask_without_a_radio(self, client, fake_bus):
        _enable_raw_iq(client)
        _start(client, radio_id=None)
        assert fake_bus.requests == []


class TestStopAsksTheHub:
    def test_stops_the_capture_and_reports_the_file_the_hub_wrote(
        self, client, fake_bus, tmp_path
    ):
        _enable_raw_iq(client)
        recording_id = _start(client)
        recordings_dir = tmp_path / "recordings"
        recordings_dir.mkdir()
        (recordings_dir / f"{recording_id}.u8").write_bytes(b"\x00" * 6)

        body = _stop(client, recording_id).json()

        assert fake_bus.requests[-1] == (STOP, {"capture_id": recording_id})
        assert body["iq_file_size_bytes"] == 6
        assert body["status"] == "complete"

    def test_does_not_ask_for_a_recording_without_an_iq_file(self, client, fake_bus):
        _enable_raw_iq(client, enabled=False)
        recording_id = _start(client)
        _stop(client, recording_id)
        assert STOP not in fake_bus.subjects()

    def test_an_unreachable_hub_still_completes_the_recording(self, client, fake_bus):
        _enable_raw_iq(client)
        recording_id = _start(client)
        fake_bus.replies[STOP] = TimeoutError()
        stopped = _stop(client, recording_id)
        assert stopped.status_code == 200
        assert stopped.json()["status"] == "complete"
        assert stopped.json()["iq_file_size_bytes"] == 0
