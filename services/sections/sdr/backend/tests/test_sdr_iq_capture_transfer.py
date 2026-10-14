"""
services/sections/sdr/backend/tests/test_sdr_iq_capture_transfer.py

Tests for sentinel_sdr.services.sdr_iq_capture_transfer — how the SDR section
collects IQ captures the radio hub staged in another process (section-containers
plan P7.3). The hub is faked on both channels it is reached by: a recording bus
for `hub.iq-capture.*` and an httpx MockTransport for the download. Pinned here:
  * the copy streams to a `.part` file renamed only when complete, carries the
    join token, then deletes the hub's copy — and leaves nothing behind when it
    fails;
  * collect settles each answer the hub can give (ready, still capturing, lost)
    and never leaves a file behind for a recording deleted meanwhile;
  * the reconcile loop retries pending copies and has the hub discard only
    captures nobody will collect, never one still being recorded;
  * none of it runs when the hub shares this process.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
import pytest
from backend.config import settings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from tests.backend.service_credentials_test_helpers import bearer, present_credential

from sentinel_sdr.models import SdrRecording
from sentinel_sdr.services import sdr_iq_capture_transfer as transfer

DOWNLOAD_URL = "http://radio:8000/internal/radio-hub/iq-captures/{}"
LOCATE = "hub.iq-capture.locate"
STOP = "hub.iq-capture.stop"
LIST = "hub.iq-capture.list"
DISCARD = "hub.iq-capture.discard"


class FakeHubBus:
    """Stands in for the event bus: records requests, answers per subject (a callable gets the payload)."""

    def __init__(self) -> None:
        self.requests: list[tuple[str, dict[str, Any]]] = []
        self.replies: dict[str, Any] = {
            LIST: {"ok": True, "capture_ids": []},
            DISCARD: {"ok": True},
            STOP: {"ok": True},
            LOCATE: lambda payload: {
                "ok": True,
                "download_url": DOWNLOAD_URL.format(payload["capture_id"]),
                "size_bytes": 4,
            },
        }

    async def request(self, subject: str, payload: dict[str, Any], timeout: float | None = 5.0) -> Any:
        self.requests.append((subject, payload))
        reply = self.replies[subject]
        if isinstance(reply, Exception):
            raise reply
        return reply(payload) if callable(reply) else reply

    def subjects(self) -> list[str]:
        return [subject for subject, _ in self.requests]

    def sent(self, subject: str) -> list[int]:
        return [payload["capture_id"] for sent_subject, payload in self.requests if sent_subject == subject]


class FakeHubHttp:
    """The hub's HTTP side: serves `files` by capture id and records every request."""

    def __init__(self) -> None:
        self.files: dict[int, bytes] = {}
        self.requests: list[httpx.Request] = []
        self.get_status = 200
        self.get_status_by_capture: dict[int, int] = {}
        self.delete_status = 204
        self.refuse_connections = False
        self.fail_delete = False

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.refuse_connections or (request.method == "DELETE" and self.fail_delete):
            raise httpx.ConnectError("connection refused", request=request)
        capture_id = int(request.url.path.rsplit("/", 1)[1])
        if request.method == "GET":
            status = self.get_status_by_capture.get(capture_id, self.get_status)
            if status != 200:
                return httpx.Response(status)
            return httpx.Response(200, content=self.files[capture_id])
        return httpx.Response(self.delete_status)

    def methods(self) -> list[str]:
        return [request.method for request in self.requests]


@pytest.fixture(autouse=True)
def sdr_section_elsewhere(monkeypatch, tmp_path):
    """The SDR section in its own container, with its own credential."""
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "sdr.db"))
    monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
    present_credential(monkeypatch, tmp_path, "sdr")
    monkeypatch.setattr(transfer, "_hub_reachable", True)
    transfer._collecting.clear()
    yield
    transfer._collecting.clear()


@pytest.fixture()
def hub_bus(monkeypatch) -> FakeHubBus:
    fake_bus = FakeHubBus()
    monkeypatch.setattr(transfer, "bus", fake_bus)
    return fake_bus


@pytest.fixture()
def hub_http(monkeypatch) -> FakeHubHttp:
    fake_http = FakeHubHttp()
    real_client = httpx.AsyncClient

    def client_with_fake_hub(**options: Any) -> httpx.AsyncClient:
        return real_client(transport=httpx.MockTransport(fake_http.handle), **options)

    monkeypatch.setattr(transfer.httpx, "AsyncClient", client_with_fake_hub)
    return fake_http


@pytest.fixture()
def sessions(test_engine, db_setup, monkeypatch):
    """The module's own sessions, on the test database."""
    session_factory = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(transfer, "AsyncSessionLocal", session_factory)
    return session_factory


async def add_recording(sessions, recording_id: int, *, has_iq_file: bool = True, status: str = "complete") -> None:
    async with sessions() as db:
        db.add(
            SdrRecording(
                id=recording_id,
                name=f"Recording {recording_id}",
                notes="",
                radio_name="Dongle",
                frequency_hz=145_800_000,
                mode="NFM",
                started_at="2026-10-12T09:00:00Z",
                ended_at="",
                duration_s=3.0,
                file_size_bytes=0,
                has_iq_file=has_iq_file,
                iq_file_size_bytes=0,
                status=status,
                created_at=0,
            )
        )
        await db.commit()


async def load_recording(sessions, recording_id: int) -> SdrRecording | None:
    async with sessions() as db:
        return (await db.execute(select(SdrRecording).where(SdrRecording.id == recording_id))).scalar_one_or_none()


def recording_object(recording_id: int, *, has_iq_file: bool = True) -> SdrRecording:
    return SdrRecording(id=recording_id, has_iq_file=has_iq_file)


class TestWhereTheIqLives:
    def test_iq_path_is_in_the_recordings_folder(self, tmp_path):
        assert transfer.iq_path(3) == tmp_path / "recordings" / "3.u8"

    def test_pending_while_the_iq_is_not_here_yet(self):
        assert transfer.iq_file_pending(recording_object(3)) is True

    def test_not_pending_once_the_file_is_here(self, tmp_path):
        (tmp_path / "recordings").mkdir()
        (tmp_path / "recordings" / "3.u8").write_bytes(b"x")
        assert transfer.iq_file_pending(recording_object(3)) is False

    def test_not_pending_without_an_iq_capture(self):
        assert transfer.iq_file_pending(recording_object(3, has_iq_file=False)) is False


class TestFetchIqCapture:
    async def test_copies_the_capture_then_deletes_the_hubs_copy(self, hub_http, tmp_path):
        hub_http.files[3] = b"\x01\x02\x03\x04"
        destination = tmp_path / "recordings" / "3.u8"

        copied = await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), destination)

        assert copied == 4
        assert destination.read_bytes() == b"\x01\x02\x03\x04"
        assert not (tmp_path / "recordings" / "3.u8.part").exists()
        assert hub_http.methods() == ["GET", "DELETE"]
        assert all(str(request.url) == DOWNLOAD_URL.format(3) for request in hub_http.requests)

    async def test_presents_the_sdr_sections_own_credential(self, hub_http, tmp_path):
        hub_http.files[3] = b"x"
        await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8")

        assert {request.headers["Authorization"] for request in hub_http.requests} == {bearer("sdr")["Authorization"]}

    async def test_copies_a_capture_larger_than_one_chunk_intact(self, hub_http, tmp_path, monkeypatch):
        monkeypatch.setattr(transfer, "_CHUNK_BYTES", 3)
        hub_http.files[3] = bytes(range(10))

        assert await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8") == 10
        assert (tmp_path / "3.u8").read_bytes() == bytes(range(10))

    async def test_refuses_without_a_credential_and_asks_nothing(self, hub_http, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "service_http_credentials_file", "")

        with pytest.raises(transfer.IqCaptureTransferError, match="no HTTP credential"):
            await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8")
        assert hub_http.requests == []

    @pytest.mark.parametrize("status", [401, 404, 409, 500])
    async def test_an_error_answer_copies_nothing_and_keeps_the_hubs_copy(self, hub_http, tmp_path, status):
        hub_http.get_status = status

        with pytest.raises(transfer.IqCaptureTransferError, match=str(status)):
            await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8")
        assert list(tmp_path.glob("3.u8*")) == []
        assert hub_http.methods() == ["GET"]

    async def test_an_unreachable_hub_is_a_transfer_error(self, hub_http, tmp_path):
        hub_http.refuse_connections = True

        with pytest.raises(transfer.IqCaptureTransferError, match="unreachable"):
            await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8")
        assert list(tmp_path.glob("3.u8*")) == []

    async def test_a_copy_cut_off_midway_leaves_no_partial_file(self, hub_http, tmp_path, monkeypatch):
        hub_http.files[3] = b"0123456789"
        monkeypatch.setattr(transfer, "_CHUNK_BYTES", 2)
        real_open = type(tmp_path).open

        def open_failing_on_second_write(path, *args, **kwargs):
            handle = real_open(path, *args, **kwargs)
            writes = {"count": 0}
            real_write = handle.write

            def write(chunk):
                writes["count"] += 1
                if writes["count"] == 2:
                    raise httpx.ReadError("connection reset")
                return real_write(chunk)

            handle.write = write
            return handle

        monkeypatch.setattr(type(tmp_path), "open", open_failing_on_second_write)

        with pytest.raises(transfer.IqCaptureTransferError):
            await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8")
        monkeypatch.undo()
        assert list(tmp_path.glob("3.u8*")) == []

    async def test_a_hub_that_already_dropped_its_copy_is_not_a_warning(self, hub_http, tmp_path, caplog):
        hub_http.files[3] = b"x"
        hub_http.delete_status = 404

        with caplog.at_level(logging.WARNING, logger=transfer.__name__):
            assert await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8") == 1
        assert caplog.records == []

    async def test_a_refused_delete_keeps_the_copy_and_warns(self, hub_http, tmp_path, caplog):
        hub_http.files[3] = b"x"
        hub_http.delete_status = 500

        with caplog.at_level(logging.WARNING, logger=transfer.__name__):
            assert await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8") == 1
        assert (tmp_path / "3.u8").read_bytes() == b"x"
        assert "kept its copy" in caplog.text

    async def test_an_unreachable_delete_keeps_the_copy_and_warns(self, hub_http, tmp_path, caplog):
        hub_http.files[3] = b"x"
        hub_http.fail_delete = True

        with caplog.at_level(logging.WARNING, logger=transfer.__name__):
            assert await transfer.fetch_iq_capture(DOWNLOAD_URL.format(3), tmp_path / "3.u8") == 1
        assert (tmp_path / "3.u8").read_bytes() == b"x"
        assert "Could not delete" in caplog.text


class TestCollectCapture:
    async def test_copies_a_ready_capture_and_records_its_size(self, hub_bus, hub_http, sessions, tmp_path):
        await add_recording(sessions, 3)
        hub_http.files[3] = b"\x01\x02\x03\x04\x05"

        await transfer.collect_capture(3)

        assert (tmp_path / "recordings" / "3.u8").read_bytes() == b"\x01\x02\x03\x04\x05"
        recording = await load_recording(sessions, 3)
        assert recording.iq_file_size_bytes == 5 and recording.has_iq_file is True
        assert hub_bus.sent(LOCATE) == [3]
        assert 3 not in transfer._collecting

    async def test_stops_a_capture_whose_stop_never_arrived_and_waits_for_the_next_run(
        self, hub_bus, hub_http, sessions
    ):
        await add_recording(sessions, 3)
        hub_bus.replies[LOCATE] = {"ok": False, "reason": "capturing"}

        await transfer.collect_capture(3)

        assert hub_bus.subjects() == [LOCATE, STOP]
        assert hub_http.requests == []
        recording = await load_recording(sessions, 3)
        assert recording.has_iq_file is True and recording.iq_file_size_bytes == 0

    async def test_a_capture_the_hub_lost_stops_being_claimed(self, hub_bus, sessions, caplog):
        await add_recording(sessions, 3)
        hub_bus.replies[LOCATE] = {"ok": False, "reason": "not_found"}

        with caplog.at_level(logging.WARNING, logger=transfer.__name__):
            await transfer.collect_capture(3)

        recording = await load_recording(sessions, 3)
        assert recording.has_iq_file is False and recording.iq_file_size_bytes == 0
        assert "it is lost" in caplog.text

    async def test_a_file_that_landed_meanwhile_is_kept_even_if_the_hub_no_longer_has_it(
        self, hub_bus, sessions, tmp_path
    ):
        await add_recording(sessions, 3)
        (tmp_path / "recordings").mkdir()
        (tmp_path / "recordings" / "3.u8").write_bytes(b"iq")
        hub_bus.replies[LOCATE] = {"ok": False, "reason": "not_found"}

        await transfer.collect_capture(3)

        recording = await load_recording(sessions, 3)
        assert recording.has_iq_file is True and recording.iq_file_size_bytes == 2

    async def test_a_recording_deleted_while_it_copied_leaves_no_file(self, hub_bus, hub_http, sessions, tmp_path):
        hub_http.files[3] = b"x"

        await transfer.collect_capture(3)

        assert not (tmp_path / "recordings" / "3.u8").exists()

    async def test_a_recording_whose_iq_was_dropped_meanwhile_leaves_no_file(
        self, hub_bus, hub_http, sessions, tmp_path
    ):
        await add_recording(sessions, 3, has_iq_file=False)
        hub_http.files[3] = b"x"

        await transfer.collect_capture(3)

        assert not (tmp_path / "recordings" / "3.u8").exists()

    async def test_a_copy_already_running_is_not_started_twice(self, hub_bus, sessions):
        transfer._collecting.add(3)

        await transfer.collect_capture(3)

        assert hub_bus.requests == []
        assert 3 in transfer._collecting

    async def test_an_unreachable_hub_propagates_and_leaves_it_pending(self, hub_bus, sessions):
        await add_recording(sessions, 3)
        hub_bus.replies[LOCATE] = LookupError("no responder registered")

        with pytest.raises(LookupError):
            await transfer.collect_capture(3)

        assert 3 not in transfer._collecting
        assert (await load_recording(sessions, 3)).has_iq_file is True

    async def test_a_failed_copy_propagates_and_leaves_it_pending(self, hub_bus, hub_http, sessions):
        await add_recording(sessions, 3)
        hub_http.get_status = 500

        with pytest.raises(transfer.IqCaptureTransferError):
            await transfer.collect_capture(3)

        assert 3 not in transfer._collecting
        recording = await load_recording(sessions, 3)
        assert recording.has_iq_file is True and recording.iq_file_size_bytes == 0


class TestScheduleCollect:
    async def test_collects_in_the_background(self, monkeypatch):
        collected: list[int] = []

        async def collect(recording_id: int) -> None:
            collected.append(recording_id)

        monkeypatch.setattr(transfer, "collect_capture", collect)

        transfer.schedule_collect(3)
        assert collected == []  # not before the caller yields
        await asyncio.gather(*transfer._background_copies)

        assert collected == [3]
        assert transfer._background_copies == set()

    async def test_a_failure_is_logged_for_the_reconcile_loop_not_raised(self, monkeypatch, caplog):
        async def collect(recording_id: int) -> None:
            raise LookupError("no responder registered")

        monkeypatch.setattr(transfer, "collect_capture", collect)

        with caplog.at_level(logging.WARNING, logger=transfer.__name__):
            transfer.schedule_collect(3)
            await asyncio.gather(*transfer._background_copies)

        assert "Could not copy IQ recording 3 from the radio hub yet" in caplog.text
        assert transfer._background_copies == set()


class TestDiscardHubCapture:
    async def test_asks_the_hub_to_discard_it(self, hub_bus):
        await transfer.discard_hub_capture(3)
        assert hub_bus.requests == [(DISCARD, {"capture_id": 3})]

    async def test_an_unreachable_hub_is_left_to_the_reconcile_loop(self, hub_bus, caplog):
        hub_bus.replies[DISCARD] = TimeoutError()

        with caplog.at_level(logging.INFO, logger=transfer.__name__):
            await transfer.discard_hub_capture(3)

        assert "could not discard IQ capture 3 yet" in caplog.text


class TestReconcile:
    async def test_collects_a_finished_recording_still_waiting_for_its_iq(self, hub_bus, hub_http, sessions, tmp_path):
        await add_recording(sessions, 3)
        hub_bus.replies[LIST] = {"ok": True, "capture_ids": [3]}
        hub_http.files[3] = b"iq"

        await transfer.reconcile_iq_captures()

        assert (tmp_path / "recordings" / "3.u8").read_bytes() == b"iq"
        assert (await load_recording(sessions, 3)).iq_file_size_bytes == 2
        # Collected, so nothing left for the hub to discard.
        assert hub_bus.sent(DISCARD) == []

    async def test_leaves_a_recording_in_progress_and_its_capture_alone(self, hub_bus, sessions):
        await add_recording(sessions, 3, status="recording")
        await add_recording(sessions, 4, has_iq_file=False, status="recording")  # its start not yet committed
        hub_bus.replies[LIST] = {"ok": True, "capture_ids": [3, 4]}

        await transfer.reconcile_iq_captures()

        assert hub_bus.subjects() == [LIST]

    async def test_has_the_hub_discard_what_nobody_will_collect(self, hub_bus, sessions, tmp_path):
        await add_recording(sessions, 5, has_iq_file=False)  # its start never committed
        await add_recording(sessions, 6)  # copied, but the hub's delete failed
        (tmp_path / "recordings").mkdir()
        (tmp_path / "recordings" / "6.u8").write_bytes(b"iq")
        hub_bus.replies[LIST] = {"ok": True, "capture_ids": [4, 5, 6]}  # 4: recording deleted

        await transfer.reconcile_iq_captures()

        assert hub_bus.sent(DISCARD) == [4, 5, 6]
        assert hub_bus.sent(LOCATE) == []

    async def test_skips_a_capture_that_is_being_copied_right_now(self, hub_bus, sessions):
        transfer._collecting.add(4)
        hub_bus.replies[LIST] = {"ok": True, "capture_ids": [4]}

        await transfer.reconcile_iq_captures()

        assert hub_bus.sent(DISCARD) == []

    async def test_a_failed_copy_is_logged_and_the_rest_carry_on(self, hub_bus, hub_http, sessions, tmp_path, caplog):
        await add_recording(sessions, 3)
        await add_recording(sessions, 4)
        hub_http.get_status_by_capture[3] = 500
        hub_http.files[4] = b"iq"
        hub_bus.replies[LIST] = {"ok": True, "capture_ids": [3, 4]}

        with caplog.at_level(logging.WARNING, logger=transfer.__name__):
            await transfer.reconcile_iq_captures()

        assert "Could not copy IQ recording 3 from the radio hub" in caplog.text
        assert (tmp_path / "recordings" / "4.u8").read_bytes() == b"iq"
        assert not (tmp_path / "recordings" / "3.u8").exists()
        # 3 is still wanted: the hub keeps it for the next run.
        assert hub_bus.sent(DISCARD) == []

    async def test_a_copy_whose_hub_delete_failed_is_discarded_on_the_next_run(
        self, hub_bus, hub_http, sessions, tmp_path
    ):
        await add_recording(sessions, 3)
        hub_http.files[3] = b"iq"
        hub_http.delete_status = 500
        hub_bus.replies[LIST] = {"ok": True, "capture_ids": [3]}

        await transfer.reconcile_iq_captures()
        assert hub_bus.sent(DISCARD) == []
        await transfer.reconcile_iq_captures()

        assert hub_bus.sent(DISCARD) == [3]
        assert hub_bus.sent(LOCATE) == [3]

    async def test_an_outage_is_logged_once_and_its_end_once(self, hub_bus, sessions, caplog):
        await add_recording(sessions, 3)
        hub_bus.replies[LIST] = LookupError("no responder registered")

        with caplog.at_level(logging.INFO, logger=transfer.__name__):
            await transfer.reconcile_iq_captures()
            await transfer.reconcile_iq_captures()
            hub_bus.replies[LIST] = {"ok": True, "capture_ids": []}
            hub_bus.replies[LOCATE] = {"ok": False, "reason": "capturing"}
            await transfer.reconcile_iq_captures()
            await transfer.reconcile_iq_captures()

        messages = [record.getMessage() for record in caplog.records]
        assert sum("radio hub unreachable" in message for message in messages) == 1
        assert sum("reachable again" in message for message in messages) == 1
        # Nothing is collected while the hub can't even list what it holds.
        assert hub_bus.sent(LOCATE) == [3, 3]

    async def test_a_reply_without_a_list_holds_nothing(self, hub_bus, sessions):
        hub_bus.replies[LIST] = {"ok": False}

        await transfer.reconcile_iq_captures()

        assert hub_bus.subjects() == [LIST]
