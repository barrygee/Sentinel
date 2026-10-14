"""
tests/backend/test_radio_hub_iq_capture.py

Tests for sentinel_radio/services/iq_capture.py — the radio hub's raw-IQ
capture API (section-containers plan, B12). The SDR section no longer touches a
broadcaster to record IQ; it sends `hub.iq-capture.{start,stop}` on the bus.

Driven through the real process-wide bus, in one event loop, so the drain task
that writes the file actually runs (the HTTP TestClient runs each request on its
own loop, which would never let it flush). Pinned here:
  * the reply contract — `{"ok": True, ...}` or `{"ok": False, "reason": ...}`,
    never a raised exception (a NATS reply can't carry one);
  * the file lands in the SDR section's `<db dir>/recordings/` when the SDR
    section shares this process, else in the hub's staging `<db dir>/iq-captures/`
    (P7.3), and holds the raw IQ bytes with each broadcast's 8-byte header stripped;
  * stop releases the broadcaster subscription and flushes before replying;
  * locate / list / discard, which the SDR section collects staged captures
    with — and which never touch a folder shared with the SDR section.
"""

from __future__ import annotations

import asyncio
import struct
from collections.abc import Iterator
from pathlib import Path

import pytest
from backend.config import settings
from backend.platform.bus import bus

from sentinel_radio import radios as radio_registry
from sentinel_radio.services import iq_capture
from sentinel_radio.services import sdr as sdr_svc

RADIO = {"id": 7, "name": "Dongle", "host": "dongle.local", "port": 1234}


def _broadcast(iq: bytes) -> bytes:
    """One broadcaster IQ payload: <sample_rate><center_hz> header + raw IQ."""
    return struct.pack("<II", 2_048_000, 145_800_000) + iq


@pytest.fixture(autouse=True)
def in_the_monolith(monkeypatch, tmp_path):
    """Every service in this process (the default deployment); the DB lives in tmp_path."""
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "sentinel.db"))
    monkeypatch.setattr(settings, "sentinel_core_url", "")
    monkeypatch.setattr(settings, "sentinel_external_services", "")
    monkeypatch.setattr(settings, "service_internal_url", "")
    monkeypatch.setattr(settings, "core_internal_url", "http://app:8000")


@pytest.fixture()
def sdr_elsewhere(monkeypatch):
    """The app hosts the hub but the SDR section runs in its own container."""
    monkeypatch.setattr(settings, "sentinel_external_services", "sdr")


@pytest.fixture()
def broadcaster(monkeypatch, tmp_path) -> Iterator[sdr_svc.RadioBroadcaster]:
    """A real (unstarted) broadcaster for RADIO."""
    radio_broadcaster = sdr_svc.RadioBroadcaster(sdr_svc.RtlTcpConnection(host=RADIO["host"], port=RADIO["port"]))

    async def _radios(_db):
        return [RADIO]

    monkeypatch.setattr(radio_registry, "get_radios", _radios)
    monkeypatch.setattr(
        sdr_svc,
        "get_broadcaster",
        lambda host, port: radio_broadcaster if (host, port) == (RADIO["host"], RADIO["port"]) else None,
    )
    monkeypatch.setattr(iq_capture, "_FLUSH_GRACE_S", 0.01)
    # A limit no test reaches unless it sets its own; never a real settings read.
    _limit_captures_to(monkeypatch, 3600.0)
    yield radio_broadcaster
    iq_capture._active_captures.clear()
    for time_limit in iq_capture._capture_time_limits.values():
        time_limit.cancel()
    iq_capture._capture_time_limits.clear()


def _start(capture_id: int, radio_id: int = RADIO["id"]):
    return bus.request(
        iq_capture.START_SUBJECT,
        {"capture_id": capture_id, "radio_id": radio_id, "db": None},
    )


def _stop(capture_id: int):
    return bus.request(iq_capture.STOP_SUBJECT, {"capture_id": capture_id})


def _locate(capture_id: int):
    return bus.request(iq_capture.LOCATE_SUBJECT, {"capture_id": capture_id})


def _list():
    return bus.request(iq_capture.LIST_SUBJECT, {})


def _discard(capture_id: int):
    return bus.request(iq_capture.DISCARD_SUBJECT, {"capture_id": capture_id})


class TestCaptureDir:
    def test_is_the_sdr_sections_recordings_when_it_shares_this_process(self, tmp_path):
        assert iq_capture.iq_capture_dir() == tmp_path / "recordings"
        assert iq_capture.holds_staged_captures() is False

    def test_is_the_hubs_staging_folder_while_the_sdr_section_runs_elsewhere(self, sdr_elsewhere, tmp_path):
        assert iq_capture.iq_capture_dir() == tmp_path / "iq-captures"
        assert iq_capture.holds_staged_captures() is True

    def test_is_the_staging_folder_in_the_hubs_own_container(self, monkeypatch, tmp_path):
        # A standalone hub hosts only itself, though no external list says so.
        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "db_path", str(tmp_path / "hub" / "radio-hub.db"))

        assert iq_capture.iq_capture_dir() == tmp_path / "hub" / "iq-captures"

    def test_capture_path_names_the_file_after_the_capture(self, tmp_path):
        assert iq_capture.capture_path(12) == tmp_path / "recordings" / "12.u8"


class TestDownloadUrl:
    def test_is_the_internal_route_at_the_address_the_hub_registers(self):
        assert iq_capture.download_url(7) == "http://app:8000/internal/radio-hub/iq-captures/7"

    def test_uses_the_hubs_own_service_url_without_doubling_a_slash(self, monkeypatch):
        monkeypatch.setattr(settings, "service_internal_url", "http://radio-hub:8000/")
        assert iq_capture.download_url(7) == "http://radio-hub:8000/internal/radio-hub/iq-captures/7"


class TestStart:
    async def test_unknown_radio_is_declined(self, broadcaster):
        assert await _start(1, radio_id=99) == {"ok": False, "reason": "unknown_radio"}
        assert iq_capture._active_captures == {}
        assert broadcaster._iq_subscribers == []

    async def test_radio_without_a_running_broadcaster_is_declined(self, broadcaster, monkeypatch):
        monkeypatch.setattr(sdr_svc, "get_broadcaster", lambda host, port: None)
        assert await _start(1) == {"ok": False, "reason": "not_streaming"}
        assert iq_capture._active_captures == {}
        assert not iq_capture.iq_capture_dir().exists()

    async def test_a_failure_opening_the_capture_is_a_reply_not_an_exception(self, broadcaster, monkeypatch):
        async def _refuse(_path):
            raise OSError("disk full")

        monkeypatch.setattr(broadcaster, "start_iq_recording", _refuse)
        assert await _start(1) == {"ok": False, "reason": "error"}
        assert iq_capture._active_captures == {}

    async def test_subscribes_to_the_radios_iq_and_creates_the_folder(self, broadcaster):
        assert await _start(5) == {"ok": True}
        assert iq_capture.iq_capture_dir().is_dir()
        broadcaster_used, queue = iq_capture._active_captures[5]
        assert broadcaster_used is broadcaster
        assert broadcaster._iq_subscribers == [queue]
        await _stop(5)


class TestStop:
    async def test_writes_raw_iq_without_headers_then_releases_the_radio(self, broadcaster):
        await _start(42)
        _, queue = iq_capture._active_captures[42]
        await queue.put(_broadcast(b"\x01\x02"))
        await queue.put(_broadcast(b"\x03\x04\x05"))

        assert await _stop(42) == {"ok": True}

        assert (iq_capture.iq_capture_dir() / "42.u8").read_bytes() == b"\x01\x02\x03\x04\x05"
        assert broadcaster._iq_subscribers == []
        assert 42 not in iq_capture._active_captures

    async def test_concurrent_captures_write_separate_files(self, broadcaster):
        await _start(1)
        await _start(2)
        for capture_id, iq in ((1, b"\xaa"), (2, b"\xbb\xcc")):
            _, queue = iq_capture._active_captures[capture_id]
            await queue.put(_broadcast(iq))
        await _stop(1)
        await _stop(2)
        capture_dir: Path = iq_capture.iq_capture_dir()
        assert (capture_dir / "1.u8").read_bytes() == b"\xaa"
        assert (capture_dir / "2.u8").read_bytes() == b"\xbb\xcc"

    async def test_writes_into_the_staging_folder_while_the_sdr_section_runs_elsewhere(
        self, broadcaster, sdr_elsewhere, tmp_path
    ):
        await _start(9)
        _, queue = iq_capture._active_captures[9]
        await queue.put(_broadcast(b"\x09"))

        assert await _stop(9) == {"ok": True}

        assert (tmp_path / "iq-captures" / "9.u8").read_bytes() == b"\x09"
        assert not (tmp_path / "recordings" / "9.u8").exists()

    async def test_unknown_capture_is_not_active(self, broadcaster):
        assert await _stop(404) == {"ok": False, "reason": "not_active"}

    async def test_a_second_stop_is_not_active(self, broadcaster):
        await _start(3)
        assert await _stop(3) == {"ok": True}
        assert await _stop(3) == {"ok": False, "reason": "not_active"}


def _limit_captures_to(monkeypatch, seconds: float) -> None:
    async def configured_limit(db) -> float:
        return seconds

    monkeypatch.setattr(iq_capture, "recording_max_duration_seconds", configured_limit)


class TestTimeLimit:
    """Regression: a capture whose stop never came wrote ~4 MB/s until the hub restarted (83 GB each)."""

    async def test_stops_a_capture_that_reaches_the_recording_limit_and_keeps_its_file(
        self, broadcaster, monkeypatch, caplog
    ):
        _limit_captures_to(monkeypatch, 0.05)
        await _start(6)
        _, queue = iq_capture._active_captures[6]
        await queue.put(_broadcast(b"\x06\x07"))

        with caplog.at_level("WARNING", logger=iq_capture.__name__):
            await asyncio.sleep(0.2)

        assert 6 not in iq_capture._active_captures
        assert 6 not in iq_capture._capture_time_limits
        assert broadcaster._iq_subscribers == []
        # Kept, so the SDR section still collects or discards it like any other.
        assert (iq_capture.iq_capture_dir() / "6.u8").read_bytes() == b"\x06\x07"
        assert "IQ capture 6 reached the 0 s recording limit without a stop" in caplog.text
        # The late stop the SDR section may still send is answered as usual.
        assert await _stop(6) == {"ok": False, "reason": "not_active"}

    async def test_a_capture_younger_than_the_limit_keeps_running(self, broadcaster):
        await _start(6)

        await asyncio.sleep(0.05)

        assert 6 in iq_capture._active_captures
        await _stop(6)

    async def test_the_limit_is_the_configured_recording_length(self, broadcaster, monkeypatch):
        asked_with: list[object] = []

        async def configured_limit(db) -> float:
            asked_with.append(db)
            return 1234.0

        monkeypatch.setattr(iq_capture, "recording_max_duration_seconds", configured_limit)
        loop = asyncio.get_running_loop()

        await _start(6)

        # Read with the start request's own session, as the hub reads its other settings.
        assert asked_with == [None]

        assert iq_capture._capture_time_limits[6].when() - loop.time() == pytest.approx(1234.0, abs=1.0)
        await _stop(6)

    async def test_stop_cancels_the_limit(self, broadcaster):
        await _start(6)
        time_limit = iq_capture._capture_time_limits[6]

        await _stop(6)

        assert time_limit.cancelled()
        assert 6 not in iq_capture._capture_time_limits

    async def test_discard_cancels_the_limit(self, broadcaster, sdr_elsewhere):
        await _start(6)
        time_limit = iq_capture._capture_time_limits[6]

        await _discard(6)

        assert time_limit.cancelled()
        assert 6 not in iq_capture._capture_time_limits

    async def test_a_limit_firing_after_the_capture_ended_does_nothing(self, broadcaster, caplog):
        with caplog.at_level("WARNING", logger=iq_capture.__name__):
            iq_capture._stop_at_time_limit(404, 60.0)

        assert caplog.text == ""


class TestLocate:
    async def test_names_where_to_download_a_finished_capture_and_its_size(self, broadcaster, sdr_elsewhere):
        await _start(4)
        _, queue = iq_capture._active_captures[4]
        await queue.put(_broadcast(b"\x01\x02\x03"))
        await _stop(4)

        assert await _locate(4) == {
            "ok": True,
            "download_url": "http://app:8000/internal/radio-hub/iq-captures/4",
            "size_bytes": 3,
        }

    async def test_a_capture_still_being_written_is_not_ready(self, broadcaster, sdr_elsewhere):
        await _start(4)

        assert await _locate(4) == {"ok": False, "reason": "capturing"}
        await _stop(4)

    async def test_a_capture_the_hub_does_not_hold_is_not_found(self, sdr_elsewhere):
        assert await _locate(4) == {"ok": False, "reason": "not_found"}


class TestList:
    async def test_lists_staged_files_and_running_captures_in_order(self, broadcaster, sdr_elsewhere, tmp_path):
        staging = tmp_path / "iq-captures"
        staging.mkdir()
        (staging / "12.u8").write_bytes(b"x")
        (staging / "3.u8").write_bytes(b"x")
        # Not captures: a half-copied leftover and a stray file.
        (staging / "5.u8.part").write_bytes(b"x")
        (staging / "notes.u8").write_bytes(b"x")
        await _start(7)

        assert await _list() == {"ok": True, "capture_ids": [3, 7, 12]}
        await _stop(7)

    async def test_holds_nothing_before_any_capture(self, sdr_elsewhere):
        assert await _list() == {"ok": True, "capture_ids": []}

    async def test_never_reports_the_sdr_sections_own_recordings(self, tmp_path):
        recordings = tmp_path / "recordings"
        recordings.mkdir()
        (recordings / "3.u8").write_bytes(b"x")

        assert await _list() == {"ok": True, "capture_ids": []}


class TestDiscard:
    async def test_deletes_a_staged_capture(self, sdr_elsewhere, tmp_path):
        staging = tmp_path / "iq-captures"
        staging.mkdir()
        (staging / "3.u8").write_bytes(b"x")

        assert await _discard(3) == {"ok": True}
        assert not (staging / "3.u8").exists()

    async def test_stops_a_running_capture_before_deleting_it(self, broadcaster, sdr_elsewhere, tmp_path):
        await _start(8)

        assert await _discard(8) == {"ok": True}

        assert 8 not in iq_capture._active_captures
        assert broadcaster._iq_subscribers == []
        assert not (tmp_path / "iq-captures" / "8.u8").exists()

    async def test_a_capture_already_gone_is_fine(self, sdr_elsewhere):
        assert await _discard(3) == {"ok": True}

    async def test_refuses_to_delete_the_sdr_sections_own_recording(self, tmp_path):
        recordings = tmp_path / "recordings"
        recordings.mkdir()
        (recordings / "3.u8").write_bytes(b"recording")

        assert await _discard(3) == {"ok": False, "reason": "shared_folder"}
        assert (recordings / "3.u8").read_bytes() == b"recording"
