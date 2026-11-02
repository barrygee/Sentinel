"""Stopping an SDR recording: only one in progress, and its WAV saved whole or not at all.

Run with:  uv run --project backend pytest services/sections/sdr/backend/tests/test_routers_sdr_recording_stop.py
"""

from __future__ import annotations

import io
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from backend.config import settings
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from sentinel_sdr import router as sdr_section_router
from sentinel_sdr.models import SdrRecording

# Larger than the 64 KB cap the stop route used to share with `radio_control`.
LONG_WAV = b"RIFF" + bytes(range(256)) * 1024
REPLACEMENT_WAV = b"RIFF-replacement"


@pytest.fixture()
def recordings_root(monkeypatch, tmp_path) -> Path:
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "data" / "sdr.db"))
    root = tmp_path / "recordings-root"
    monkeypatch.setattr(settings, "recordings_directory", str(root))
    return root


def start(client) -> int:
    return client.post("/api/sdr/recordings/start", json={"frequency_hz": 145_800_000}).json()["id"]


def stop(client, recording_id: int, audio: bytes):
    return client.post(
        "/api/sdr/recordings/stop",
        data={"recording_id": str(recording_id), "duration_s": "3"},
        files={"file": ("clip.wav", audio, "audio/wav")},
    )


async def set_status(test_engine, recording_id: int, status: str) -> None:
    async with sessionmaker(bind=test_engine, class_=AsyncSession)() as db:
        (await db.get(SdrRecording, recording_id)).status = status
        await db.commit()


async def stored(test_engine, recording_id: int) -> SdrRecording:
    async with sessionmaker(bind=test_engine, class_=AsyncSession)() as db:
        return await db.get(SdrRecording, recording_id)


def files_under(root: Path) -> list[str]:
    return sorted(path.name for path in root.rglob("*") if path.is_file())


class TestOnlyARecordingInProgressStops:
    def test_a_long_recording_is_saved_byte_for_byte(self, client, recordings_root):
        recording_id = start(client)

        response = stop(client, recording_id, LONG_WAV)

        assert response.status_code == 200
        assert response.json()["status"] == "complete"
        assert response.json()["file_size_bytes"] == len(LONG_WAV)
        assert client.get(f"/api/sdr/recordings/{recording_id}/file").content == LONG_WAV

    async def test_stopping_a_finished_recording_again_keeps_its_audio(self, client, recordings_root, test_engine):
        recording_id = start(client)
        assert stop(client, recording_id, LONG_WAV).status_code == 200

        response = stop(client, recording_id, REPLACEMENT_WAV)

        assert response.status_code == 409
        assert response.json() == {"detail": "Recording is not in progress"}
        assert client.get(f"/api/sdr/recordings/{recording_id}/file").content == LONG_WAV
        assert (await stored(test_engine, recording_id)).file_size_bytes == len(LONG_WAV)

    async def test_a_recording_ended_as_abandoned_cant_be_stopped(self, client, recordings_root, test_engine):
        recording_id = start(client)
        await set_status(test_engine, recording_id, "error")

        assert stop(client, recording_id, LONG_WAV).status_code == 409
        assert files_under(recordings_root) == []

    async def test_a_refused_stop_leaves_the_iq_capture_alone(self, client, recordings_root, test_engine, monkeypatch):
        bus_request = AsyncMock(return_value={"ok": True})
        monkeypatch.setattr(sdr_section_router.bus, "request", bus_request)
        recording_id = start(client)
        await set_status(test_engine, recording_id, "complete")

        assert stop(client, recording_id, LONG_WAV).status_code == 409
        assert bus_request.await_count == 0

    def test_an_unknown_recording_is_still_a_404(self, client, recordings_root):
        assert stop(client, 999_999, LONG_WAV).status_code == 404


class TestOversizedUpload:
    async def test_more_than_a_wav_can_hold_is_refused_and_nothing_is_kept(
        self, client, recordings_root, monkeypatch, test_engine
    ):
        monkeypatch.setattr(sdr_section_router, "WAV_FORMAT_MAX_BYTES", len(LONG_WAV) - 1)
        recording_id = start(client)

        response = stop(client, recording_id, LONG_WAV)

        assert response.status_code == 413
        assert response.json() == {"detail": "Recording is larger than a WAV file can be"}
        assert files_under(recordings_root) == []
        assert (await stored(test_engine, recording_id)).status == "recording"

    def test_exactly_the_limit_is_saved(self, client, recordings_root, monkeypatch):
        monkeypatch.setattr(sdr_section_router, "WAV_FORMAT_MAX_BYTES", len(LONG_WAV))
        recording_id = start(client)

        assert stop(client, recording_id, LONG_WAV).status_code == 200


class TestSaveRecordingAudio:
    def test_writes_the_whole_upload_and_returns_its_size(self, tmp_path):
        destination = tmp_path / "1.wav"

        size = sdr_section_router._save_recording_audio(io.BytesIO(LONG_WAV), destination)

        assert size == len(LONG_WAV)
        assert destination.read_bytes() == LONG_WAV
        assert files_under(tmp_path) == ["1.wav"]

    def test_an_empty_upload_is_an_empty_file(self, tmp_path):
        destination = tmp_path / "1.wav"

        assert sdr_section_router._save_recording_audio(io.BytesIO(b""), destination) == 0
        assert destination.read_bytes() == b""

    def test_a_failed_copy_leaves_no_partial_file_and_the_old_one_untouched(self, tmp_path):
        destination = tmp_path / "1.wav"
        destination.write_bytes(LONG_WAV)

        class BrokenUpload(io.BytesIO):
            def read(self, *arguments):
                raise OSError("disk went away")

        with pytest.raises(OSError, match="disk went away"):
            sdr_section_router._save_recording_audio(BrokenUpload(), destination)

        assert destination.read_bytes() == LONG_WAV
        assert files_under(tmp_path) == ["1.wav"]

    def test_too_large_raises_and_leaves_nothing(self, tmp_path, monkeypatch):
        monkeypatch.setattr(sdr_section_router, "WAV_FORMAT_MAX_BYTES", 3)
        destination = tmp_path / "1.wav"

        with pytest.raises(ValueError, match="more than a WAV file can hold"):
            sdr_section_router._save_recording_audio(io.BytesIO(b"four"), destination)

        assert files_under(tmp_path) == []
