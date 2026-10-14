"""
services/sections/sdr/backend/tests/test_routers_sdr_recordings_iq.py

Tests for how the SDR section's recording endpoints (sentinel_sdr.router) ask
the radio hub for raw-IQ capture over the bus (section-containers plan, B12).
The hub side — the file itself — is covered in test_radio_iq_capture.py.

The section's `bus` is swapped for a recorder, so each test can force the hub's
reply (ok, declined, unreachable) and see exactly which requests were sent:
  * start asks only when `sdr.recordRawIq` is on and a radio is named, and
    marks `has_iq_file` only on an `ok` reply;
  * no hub answer (raised or declined) never fails the recording itself;
  * stop asks the hub to stop only for a recording that has an IQ file, and
    reports the size of the file the hub wrote;
  * with the hub in another process (P7.3), stop hands the copy to the
    background and returns at once with the IQ pending; a pending IQ can't be
    downloaded yet, and deleting its recording has the hub discard it.
"""

from __future__ import annotations

from typing import Any

import pytest
from backend.config import settings

from sentinel_sdr import router as sdr_section_router

START = "hub.iq-capture.start"
STOP = "hub.iq-capture.stop"


class _RecordingBus:
    """Stands in for the event bus: records requests, answers from `replies`."""

    def __init__(self) -> None:
        self.requests: list[tuple[str, dict[str, Any]]] = []
        self.replies: dict[str, Any] = {START: {"ok": True}, STOP: {"ok": True}}

    async def request(self, subject: str, payload: dict[str, Any], timeout: float | None = 5.0) -> Any:
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
    assert client.put("/api/settings/sdr/recordRawIq", json={"value": enabled}).status_code == 200


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
    def test_stops_the_capture_and_reports_the_file_the_hub_wrote(self, client, fake_bus, tmp_path):
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


@pytest.fixture()
def hub_elsewhere(monkeypatch) -> dict[str, list[int]]:
    """The radio hub in its own container; records what the router hands the transfer service."""
    monkeypatch.setattr(settings, "sentinel_external_services", "radio")
    handed: dict[str, list[int]] = {"collect": [], "discard": []}
    monkeypatch.setattr(sdr_section_router, "schedule_collect", handed["collect"].append)

    async def discard(recording_id: int) -> None:
        handed["discard"].append(recording_id)

    monkeypatch.setattr(sdr_section_router, "discard_hub_capture", discard)
    return handed


def _write_iq(tmp_path, recording_id: int, size: int = 4) -> None:
    recordings_dir = tmp_path / "recordings"
    recordings_dir.mkdir(exist_ok=True)
    (recordings_dir / f"{recording_id}.u8").write_bytes(b"\x00" * size)


class TestIqCopiedFromAHubElsewhere:
    def test_stop_returns_at_once_with_the_iq_pending_and_copies_in_the_background(
        self, client, fake_bus, hub_elsewhere
    ):
        _enable_raw_iq(client)
        recording_id = _start(client)

        body = _stop(client, recording_id).json()

        assert body["iq_file_pending"] is True
        assert body["iq_file_size_bytes"] == 0
        assert body["status"] == "complete"
        assert hub_elsewhere["collect"] == [recording_id]

    def test_a_pending_iq_shows_in_the_list_and_cannot_be_downloaded_yet(self, client, fake_bus, hub_elsewhere):
        _enable_raw_iq(client)
        recording_id = _start(client)
        _stop(client, recording_id)

        listed = client.get("/api/sdr/recordings").json()
        assert [row["iq_file_pending"] for row in listed] == [True]
        download = client.get(f"/api/sdr/recordings/{recording_id}/iq")
        assert download.status_code == 409

    def test_once_copied_the_iq_downloads(self, client, fake_bus, hub_elsewhere, tmp_path):
        _enable_raw_iq(client)
        recording_id = _start(client)
        _stop(client, recording_id)
        _write_iq(tmp_path, recording_id)

        assert client.get("/api/sdr/recordings").json()[0]["iq_file_pending"] is False
        download = client.get(f"/api/sdr/recordings/{recording_id}/iq")
        assert download.status_code == 200
        assert download.content == b"\x00" * 4

    def test_nothing_is_copied_for_a_recording_without_iq(self, client, fake_bus, hub_elsewhere):
        _enable_raw_iq(client, enabled=False)
        recording_id = _start(client)

        assert _stop(client, recording_id).json()["iq_file_pending"] is False
        assert hub_elsewhere["collect"] == []

    def test_nothing_is_copied_when_the_iq_is_already_here(self, client, fake_bus, hub_elsewhere, tmp_path):
        _enable_raw_iq(client)
        recording_id = _start(client)
        _write_iq(tmp_path, recording_id, size=6)

        body = _stop(client, recording_id).json()

        assert body["iq_file_pending"] is False
        assert body["iq_file_size_bytes"] == 6
        assert hub_elsewhere["collect"] == []

    def test_deleting_a_recording_with_pending_iq_has_the_hub_discard_it(self, client, fake_bus, hub_elsewhere):
        _enable_raw_iq(client)
        recording_id = _start(client)
        _stop(client, recording_id)

        assert client.delete(f"/api/sdr/recordings/{recording_id}").status_code == 204
        assert hub_elsewhere["discard"] == [recording_id]

    def test_deleting_a_recording_whose_iq_is_here_leaves_the_hub_alone(
        self, client, fake_bus, hub_elsewhere, tmp_path
    ):
        _enable_raw_iq(client)
        recording_id = _start(client)
        _stop(client, recording_id)
        _write_iq(tmp_path, recording_id)

        assert client.delete(f"/api/sdr/recordings/{recording_id}").status_code == 204
        assert hub_elsewhere["discard"] == []
        assert not (tmp_path / "recordings" / f"{recording_id}.u8").exists()


class TestIqWrittenInPlaceByAHubInThisProcess:
    def test_never_pending_nor_copied(self, client, fake_bus, monkeypatch):
        collected: list[int] = []
        monkeypatch.setattr(sdr_section_router, "schedule_collect", collected.append)
        _enable_raw_iq(client)
        recording_id = _start(client)

        body = _stop(client, recording_id).json()

        assert body["iq_file_pending"] is False
        assert collected == []
        # A file that never arrived is simply missing, as before P7.3.
        assert client.get(f"/api/sdr/recordings/{recording_id}/iq").status_code == 404
