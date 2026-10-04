"""
tests/backend/test_radio_hub_iq_capture.py

Tests for backend/radio_hub/services/iq_capture.py — the radio hub's raw-IQ
capture API (section-containers plan, B12). The SDR section no longer touches a
broadcaster to record IQ; it sends `hub.iq-capture.{start,stop}` on the bus.

Driven through the real process-wide bus, in one event loop, so the drain task
that writes the file actually runs (the HTTP TestClient runs each request on its
own loop, which would never let it flush). Pinned here:
  * the reply contract — `{"ok": True}` or `{"ok": False, "reason": ...}`,
    never a raised exception (a NATS reply can't carry one);
  * the file lands at `<db dir>/recordings/<capture_id>.u8` and holds the raw
    IQ bytes with each broadcast's 8-byte header stripped;
  * stop releases the broadcaster subscription and flushes before replying.
"""

from __future__ import annotations

import struct
from collections.abc import Iterator
from pathlib import Path

import pytest

from backend.config import settings
from backend.platform.bus import bus
from backend.radio_hub import radios as radio_registry
from backend.radio_hub.services import iq_capture
from backend.radio_hub.services import sdr as sdr_svc

RADIO = {"id": 7, "name": "Dongle", "host": "dongle.local", "port": 1234}


def _broadcast(iq: bytes) -> bytes:
    """One broadcaster IQ payload: <sample_rate><center_hz> header + raw IQ."""
    return struct.pack("<II", 2_048_000, 145_800_000) + iq


@pytest.fixture()
def broadcaster(monkeypatch, tmp_path) -> Iterator[sdr_svc.RadioBroadcaster]:
    """A real (unstarted) broadcaster for RADIO; the DB lives in tmp_path."""
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "sentinel.db"))
    radio_broadcaster = sdr_svc.RadioBroadcaster(
        sdr_svc.RtlTcpConnection(host=RADIO["host"], port=RADIO["port"])
    )

    async def _radios(_db):
        return [RADIO]

    monkeypatch.setattr(radio_registry, "get_radios", _radios)
    monkeypatch.setattr(
        sdr_svc,
        "get_broadcaster",
        lambda host, port: (
            radio_broadcaster
            if (host, port) == (RADIO["host"], RADIO["port"])
            else None
        ),
    )
    monkeypatch.setattr(iq_capture, "_FLUSH_GRACE_S", 0.01)
    yield radio_broadcaster
    iq_capture._active_captures.clear()


def _start(capture_id: int, radio_id: int = RADIO["id"]):
    return bus.request(
        iq_capture.START_SUBJECT,
        {"capture_id": capture_id, "radio_id": radio_id, "db": None},
    )


def _stop(capture_id: int):
    return bus.request(iq_capture.STOP_SUBJECT, {"capture_id": capture_id})


class TestCaptureDir:
    def test_sits_beside_the_database(self, monkeypatch, tmp_path):
        monkeypatch.setattr(settings, "db_path", str(tmp_path / "data" / "sentinel.db"))
        assert iq_capture.iq_capture_dir() == tmp_path / "data" / "recordings"


class TestStart:
    async def test_unknown_radio_is_declined(self, broadcaster):
        assert await _start(1, radio_id=99) == {"ok": False, "reason": "unknown_radio"}
        assert iq_capture._active_captures == {}
        assert broadcaster._iq_subscribers == []

    async def test_radio_without_a_running_broadcaster_is_declined(
        self, broadcaster, monkeypatch
    ):
        monkeypatch.setattr(sdr_svc, "get_broadcaster", lambda host, port: None)
        assert await _start(1) == {"ok": False, "reason": "not_streaming"}
        assert iq_capture._active_captures == {}
        assert not iq_capture.iq_capture_dir().exists()

    async def test_a_failure_opening_the_capture_is_a_reply_not_an_exception(
        self, broadcaster, monkeypatch
    ):
        async def _refuse(_path):
            raise OSError("disk full")

        monkeypatch.setattr(broadcaster, "start_iq_recording", _refuse)
        assert await _start(1) == {"ok": False, "reason": "error"}
        assert iq_capture._active_captures == {}

    async def test_subscribes_to_the_radios_iq_and_creates_the_folder(
        self, broadcaster
    ):
        assert await _start(5) == {"ok": True}
        assert iq_capture.iq_capture_dir().is_dir()
        broadcaster_used, queue = iq_capture._active_captures[5]
        assert broadcaster_used is broadcaster
        assert broadcaster._iq_subscribers == [queue]
        await _stop(5)


class TestStop:
    async def test_writes_raw_iq_without_headers_then_releases_the_radio(
        self, broadcaster
    ):
        await _start(42)
        _, queue = iq_capture._active_captures[42]
        await queue.put(_broadcast(b"\x01\x02"))
        await queue.put(_broadcast(b"\x03\x04\x05"))

        assert await _stop(42) == {"ok": True}

        assert (
            iq_capture.iq_capture_dir() / "42.u8"
        ).read_bytes() == b"\x01\x02\x03\x04\x05"
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

    async def test_unknown_capture_is_not_active(self, broadcaster):
        assert await _stop(404) == {"ok": False, "reason": "not_active"}

    async def test_a_second_stop_is_not_active(self, broadcaster):
        await _start(3)
        assert await _stop(3) == {"ok": True}
        assert await _stop(3) == {"ok": False, "reason": "not_active"}
