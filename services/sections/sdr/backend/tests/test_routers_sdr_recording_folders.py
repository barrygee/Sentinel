"""Recordings are saved in, and found in, the folder each one remembers (sentinel_sdr.router).

Through the real endpoints, with the recordings root in tmp_path:
  * start fixes the recording's folder as the root, and stop writes its WAV there;
  * the old `sdr.recordingsFolder` setting has no effect;
  * moving the root never loses an earlier recording: download and delete still
    find its file, including one saved in a subfolder while that setting existed;
  * a recording with no folder is still found beside the database.
"""

from __future__ import annotations

import pytest
from backend.config import settings
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from sentinel_sdr import router as sdr_section_router
from sentinel_sdr.models import SdrRecording

WAV = b"RIFF" + b"\x00" * 40


@pytest.fixture()
def recordings_root(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "data" / "sdr.db"))
    root = tmp_path / "recordings-root"
    monkeypatch.setattr(settings, "recordings_directory", str(root))
    return root


def record(client) -> int:
    recording_id = client.post("/api/sdr/recordings/start", json={"frequency_hz": 137_100_000}).json()["id"]
    stopped = client.post(
        "/api/sdr/recordings/stop",
        data={"recording_id": str(recording_id), "duration_s": "1"},
        files={"file": ("clip.wav", WAV, "audio/wav")},
    )
    assert stopped.status_code == 200
    return recording_id


async def stored_directory(test_engine, recording_id: int) -> str:
    async with sessionmaker(bind=test_engine, class_=AsyncSession)() as db:
        return (await db.get(SdrRecording, recording_id)).directory


class TestSavedInTheRecordingsRoot:
    async def test_start_fixes_the_folder_and_stop_writes_the_wav_there(self, client, recordings_root, test_engine):
        recording_id = record(client)

        assert (recordings_root / f"{recording_id}.wav").read_bytes() == WAV
        assert await stored_directory(test_engine, recording_id) == str(recordings_root)

    def test_a_leftover_folder_setting_is_ignored(self, client, recordings_root):
        client.put("/api/settings/sdr/recordingsFolder", json={"value": "satellites/noaa"})

        recording_id = record(client)

        assert (recordings_root / f"{recording_id}.wav").read_bytes() == WAV
        assert not (recordings_root / "satellites").exists()

    def test_stop_reports_the_iq_the_hub_staged_into_the_root(self, client, recordings_root, monkeypatch):
        async def hub_accepts(subject, payload, timeout=5.0):
            return {"ok": True}

        # The hub accepts the capture; the copy into the folder is the transfer's job.
        monkeypatch.setattr(sdr_section_router, "bus", type("HubBus", (), {"request": staticmethod(hub_accepts)}))
        monkeypatch.setattr(sdr_section_router, "schedule_collect", lambda recording_id: None)
        assert client.put("/api/settings/sdr/recordRawIq", json={"value": True}).status_code == 200
        recording_id = client.post(
            "/api/sdr/recordings/start", json={"frequency_hz": 137_100_000, "radio_id": 1}
        ).json()["id"]
        (recordings_root / f"{recording_id}.u8").write_bytes(b"\x00" * 7)

        stopped = client.post(
            "/api/sdr/recordings/stop",
            data={"recording_id": str(recording_id)},
            files={"file": ("clip.wav", WAV, "audio/wav")},
        ).json()

        assert stopped["iq_file_size_bytes"] == 7
        assert stopped["iq_file_pending"] is False
        assert client.get(f"/api/sdr/recordings/{recording_id}/iq").content == b"\x00" * 7
        assert client.delete(f"/api/sdr/recordings/{recording_id}").status_code == 204
        assert not (recordings_root / f"{recording_id}.u8").exists()


class TestEarlierRecordingsStayWhereTheyWere:
    async def test_one_saved_in_a_subfolder_still_downloads_and_deletes(
        self, client, recordings_root, test_engine, tmp_path
    ):
        recording_id = record(client)
        # As a recording saved while the folder setting existed.
        subfolder = tmp_path / "old-root" / "noaa"
        subfolder.mkdir(parents=True)
        (subfolder / f"{recording_id}.wav").write_bytes(b"older audio")
        async with sessionmaker(bind=test_engine, class_=AsyncSession)() as db:
            (await db.get(SdrRecording, recording_id)).directory = str(subfolder)
            await db.commit()

        assert client.get(f"/api/sdr/recordings/{recording_id}/file").content == b"older audio"
        assert client.delete(f"/api/sdr/recordings/{recording_id}").status_code == 204
        assert not (subfolder / f"{recording_id}.wav").exists()

    async def test_a_recording_with_no_folder_is_found_beside_the_database(
        self, client, recordings_root, test_engine, tmp_path
    ):
        recording_id = record(client)
        # As the ALTER leaves every older row: no folder of its own.
        async with sessionmaker(bind=test_engine, class_=AsyncSession)() as db:
            (await db.get(SdrRecording, recording_id)).directory = ""
            await db.commit()
        legacy = tmp_path / "data" / "recordings"
        legacy.mkdir(parents=True)
        (legacy / f"{recording_id}.wav").write_bytes(b"legacy audio")

        assert client.get(f"/api/sdr/recordings/{recording_id}/file").content == b"legacy audio"
        assert client.delete(f"/api/sdr/recordings/{recording_id}").status_code == 204
        assert not (legacy / f"{recording_id}.wav").exists()
