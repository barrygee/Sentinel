"""Recordings the browser never stopped (sentinel_sdr.services.abandoned_recordings).

Regression: a recording only ends when the browser sends stop, so one whose
browser went away stayed "recording" for ever — hidden from the recordings
list, and with raw IQ on its hub capture was kept as wanted and written until
the hub restarted (two of them reached 83 GB each). Pinned here:
  * only "recording" rows older than the `sdr.recordingMaxDurationMinutes` limit end, as
    `status="error"` with an end time and no IQ file;
  * their capture is discarded on the hub (which stops it if still running);
  * an unreachable hub never keeps a row "recording".
"""

from __future__ import annotations

import logging
from typing import Any

import pytest
from backend.config import settings
from backend.platform import recording_limits
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from sentinel_sdr.models import SdrRecording
from sentinel_sdr.services import abandoned_recordings
from sentinel_sdr.services import sdr_iq_capture_transfer as transfer

NOW_MS = 1_800_000_000_000
MAX_DURATION_S = 3600.0
OLDEST_ALLOWED_MS = NOW_MS - int(MAX_DURATION_S * 1000)
DISCARD = "hub.iq-capture.discard"


class RecordingBus:
    """Stands in for the event bus: records requests; `failure` makes every request raise."""

    def __init__(self) -> None:
        self.requests: list[tuple[str, dict[str, Any]]] = []
        self.failure: Exception | None = None

    async def request(self, subject: str, payload: dict[str, Any], timeout: float | None = 5.0) -> Any:
        self.requests.append((subject, payload))
        if self.failure is not None:
            raise self.failure
        return {"ok": True}


@pytest.fixture(autouse=True)
def recording_limit(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "sdr.db"))

    async def configured_limit(db) -> float:
        return MAX_DURATION_S

    monkeypatch.setattr(recording_limits, "recording_max_duration_seconds", configured_limit)
    monkeypatch.setattr(abandoned_recordings, "now_ms", lambda: NOW_MS)


@pytest.fixture()
def sessions(test_engine, db_setup, monkeypatch):
    """The module's own sessions, on the test database."""
    session_factory = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(abandoned_recordings, "AsyncSessionLocal", session_factory)
    return session_factory


@pytest.fixture()
def hub_bus(monkeypatch) -> RecordingBus:
    """The bus the transfer module sends discard on."""
    fake_bus = RecordingBus()
    monkeypatch.setattr(transfer, "bus", fake_bus)
    return fake_bus


async def add_recording(
    sessions, recording_id: int, *, created_at: int, status: str = "recording", has_iq_file: bool = False
) -> None:
    async with sessions() as db:
        db.add(
            SdrRecording(
                id=recording_id,
                name=f"Recording {recording_id}",
                notes="",
                radio_name="Dongle",
                frequency_hz=137_100_000,
                mode="NFM",
                started_at="2026-10-13T08:15:30Z",
                ended_at="",
                duration_s=0.0,
                file_size_bytes=0,
                has_iq_file=has_iq_file,
                iq_file_size_bytes=0,
                status=status,
                created_at=created_at,
            )
        )
        await db.commit()


async def load_recording(sessions, recording_id: int) -> SdrRecording:
    async with sessions() as db:
        return (await db.execute(select(SdrRecording).where(SdrRecording.id == recording_id))).scalar_one()


class TestWhichRecordingsEnd:
    async def test_ends_a_recording_older_than_the_limit_as_failed(self, sessions, hub_bus):
        await add_recording(sessions, 19, created_at=OLDEST_ALLOWED_MS - 1)

        ended = await abandoned_recordings.finalise_abandoned_recordings()

        recording = await load_recording(sessions, 19)
        assert ended == [19]
        assert recording.status == "error"
        assert recording.ended_at.endswith("Z") and recording.ended_at.startswith("20")

    async def test_leaves_a_recording_exactly_at_the_limit_running(self, sessions, hub_bus):
        await add_recording(sessions, 19, created_at=OLDEST_ALLOWED_MS)

        assert await abandoned_recordings.finalise_abandoned_recordings() == []
        assert (await load_recording(sessions, 19)).status == "recording"

    async def test_leaves_a_recording_younger_than_the_limit_running(self, sessions, hub_bus):
        await add_recording(sessions, 19, created_at=NOW_MS - 1000, has_iq_file=True)

        assert await abandoned_recordings.finalise_abandoned_recordings() == []
        recording = await load_recording(sessions, 19)
        assert (recording.status, recording.has_iq_file) == ("recording", True)
        assert hub_bus.requests == []

    @pytest.mark.parametrize("status", ["complete", "error"])
    async def test_never_touches_a_finished_recording_however_old(self, sessions, hub_bus, status):
        await add_recording(sessions, 18, created_at=0, status=status, has_iq_file=True)

        assert await abandoned_recordings.finalise_abandoned_recordings() == []
        recording = await load_recording(sessions, 18)
        assert (recording.status, recording.ended_at, recording.has_iq_file) == (status, "", True)
        assert hub_bus.requests == []

    async def test_ends_every_abandoned_recording_in_one_run(self, sessions, hub_bus):
        await add_recording(sessions, 1, created_at=0)
        await add_recording(sessions, 2, created_at=OLDEST_ALLOWED_MS - 1)
        await add_recording(sessions, 3, created_at=NOW_MS)

        assert sorted(await abandoned_recordings.finalise_abandoned_recordings()) == [1, 2]
        assert (await load_recording(sessions, 3)).status == "recording"

    async def test_nothing_to_end_is_a_no_op(self, sessions, hub_bus):
        assert await abandoned_recordings.finalise_abandoned_recordings() == []

    async def test_logs_each_recording_it_ends(self, sessions, hub_bus, caplog):
        await add_recording(sessions, 19, created_at=0)

        with caplog.at_level(logging.WARNING, logger=abandoned_recordings.__name__):
            await abandoned_recordings.finalise_abandoned_recordings()

        assert "Recording 19 was never stopped (started 2026-10-13T08:15:30Z)" in caplog.text


class TestDroppingTheCapture:
    async def test_discards_the_capture_on_the_hub_and_drops_the_iq_file(self, sessions, hub_bus):
        await add_recording(sessions, 19, created_at=0, has_iq_file=True)

        await abandoned_recordings.finalise_abandoned_recordings()

        recording = await load_recording(sessions, 19)
        assert (recording.has_iq_file, recording.iq_file_size_bytes) == (False, 0)
        # Discard stops a running capture itself: no separate stop.
        assert hub_bus.requests == [(DISCARD, {"capture_id": 19})]

    async def test_sends_nothing_for_a_recording_without_iq(self, sessions, hub_bus):
        await add_recording(sessions, 19, created_at=0, has_iq_file=False)

        await abandoned_recordings.finalise_abandoned_recordings()

        assert hub_bus.requests == []

    async def test_an_unreachable_hub_still_ends_the_recording(self, sessions, hub_bus):
        hub_bus.failure = TimeoutError()
        await add_recording(sessions, 19, created_at=0, has_iq_file=True)

        assert await abandoned_recordings.finalise_abandoned_recordings() == [19]

        # The row no longer wants the capture, so the reconcile loop discards it later.
        recording = await load_recording(sessions, 19)
        assert (recording.status, recording.has_iq_file) == ("error", False)
