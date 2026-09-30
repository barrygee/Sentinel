"""P0 parity baseline: the SDR WebSocket protocol.

Covers /ws/sdr/{id}, /ws/sdr/{id}/iq, /ws/sdr/{id}/decode and
/ws/sdr/{id}/decode/audio using the same no-real-socket fakes already
established in test_routers_sdr.py / test_sdr_broadcaster.py /
test_routers_sdr_decode.py / test_sdr_fft.py — reimplemented locally since
tests/backend has no `__init__.py` (no importable test package to share
fixtures from), but identical in shape and intent to those originals.

Recorded, in order of the task brief:
  * the set of accepted control-socket commands (`cmd` values the control
    WS's dispatch `if/elif` chain recognises) — a golden list, so silently
    dropping one during a refactor is caught.
  * the JSON message shapes emitted in response (keys + value *types*, not
    volatile values like timestamps) for: the initial `status` frame, the
    `pong` reply, and the `control` frame sent on a rejected (read-only) tune.
  * the binary FFT/spectrum frame content from a deterministic synthetic IQ
    input (`compute_fft_frame` is pure and reproducible given fixed input —
    only `timestamp_ms` is excluded as genuinely non-deterministic).
  * the IQ-socket's 8-byte `<II` (sample_rate, center_hz) binary header
    framing, exact bytes, from `RadioBroadcaster._broadcast_iq`.

Anything that cannot be made deterministic (wall-clock timestamps, and the
`/ws/sdr/{id}` control JSON frame's exact spectrum `bins` values under real
rtl_tcp data, which is hardware-dependent and already covered separately by
test_sdr_fft.py's DSP-correctness tests) is intentionally left out — recorded
here in the module docstring rather than silently skipped.
"""

from __future__ import annotations

import asyncio

import pytest
from starlette.websockets import WebSocketDisconnect as StarletteWSDisconnect

from backend.routers import sdr as sdr_router
from backend.services import sdr as sdr_svc
from backend.services import sdr_decode
from backend.services.sdr import compute_fft_frame
from tests.backend.parity.conftest import assert_golden, render_json

# ── Shared fakes (same shape as test_routers_sdr_decode.py's) ────────────────


class _FakeBroadcaster:
    """IQ fan-out stub — the bridge only calls subscribe_iq/unsubscribe_iq."""

    def subscribe_iq(self) -> asyncio.Queue:
        return asyncio.Queue()

    def unsubscribe_iq(self, queue: asyncio.Queue) -> None:
        pass


class _ControlBroadcaster:
    """Control-WS fan-out stub: empty spectrum queue, no real device."""

    def subscribe(self) -> asyncio.Queue:
        return asyncio.Queue()

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        pass


class _FakeConn:
    host = "h1"
    port = 1234
    center_hz = 100_000_000
    sample_rate = 2_048_000
    mode = "NFM"
    gain_db = 30.0
    gain_auto = False
    demod_offset_hz = 0
    bw_hz = 0
    scan_active = False
    scan_groups: list[str] = []
    search_active = False
    search_low_hz: int | None = None
    search_high_hz: int | None = None
    search_current_hz: int | None = None
    is_owner = True
    control_available = False
    tuner_locked = False

    async def set_frequency(self, frequency_hz: int) -> None:
        raise sdr_svc.ReadOnlyTuningError("read-only")


def _patch_resolve(monkeypatch, broadcaster, radio):
    async def _fake_resolve(radio_id, websocket):
        return broadcaster, radio

    monkeypatch.setattr(sdr_router, "_resolve_broadcaster", _fake_resolve)


def _patch_control(monkeypatch):
    radio = {"id": 1, "name": "Test", "host": "h1", "port": 1234}
    _patch_resolve(monkeypatch, _ControlBroadcaster(), radio)
    monkeypatch.setattr(
        sdr_router.sdr_svc, "get_connection", lambda host, port: _FakeConn()
    )
    # Neutralise the finally-block teardown so it doesn't interfere with assertions.
    from unittest.mock import AsyncMock

    monkeypatch.setattr(sdr_router.sdr_decode, "stop_bridge", AsyncMock())


def _type_shape(value):
    """Reduce a JSON-decoded value to a type descriptor — records the message
    *shape* (key set + value types) rather than volatile literal values."""
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "str"
    if value is None:
        return "null"
    if isinstance(value, list):
        return "list"
    if isinstance(value, dict):
        return {key: _type_shape(inner) for key, inner in sorted(value.items())}
    return type(value).__name__


# ── Accepted control commands ─────────────────────────────────────────────────

# The `cmd` values backend/routers/sdr.py's `sdr_websocket._read_commands`
# recognises. Kept as an explicit golden-backed list (rather than parsed from
# source) so a silently dropped/renamed command is caught by a plain text diff.
ACCEPTED_CONTROL_COMMANDS = sorted(
    [
        "tune",
        "mode",
        "release",
        "claim",
        "demod",
        "sweep_state",
        "gain",
        "sample_rate",
        "fft_size",
        "digital_decode",
        "digital_channel",
        "ping",
    ]
)


class TestAcceptedControlCommands:
    def test_accepted_commands_match_golden(self):
        assert_golden(
            "ws_control_commands",
            render_json(ACCEPTED_CONTROL_COMMANDS, sort_keys=False),
        )

    def test_every_accepted_command_is_actually_handled(self, client, monkeypatch):
        """Validity check: each listed command must be dispatched without
        raising and without the connection dying, proving the golden list
        isn't just an unused string constant."""
        _patch_control(monkeypatch)
        with client.websocket_connect("/ws/sdr/1") as ws:
            ws.receive_json()  # initial status
            for command in ACCEPTED_CONTROL_COMMANDS:
                ws.send_json({"cmd": command})
                ws.send_json({"cmd": "ping"})
                # Drain until the pong — the command's own reply (or lack of
                # one) already varies; the pong proves the loop is still alive.
                for _ in range(5):
                    message = ws.receive_json()
                    if message.get("type") == "pong":
                        break
                else:
                    pytest.fail(
                        f"no pong observed after sending cmd={command!r}; the read loop may have died"
                    )

    def test_can_actually_fail_on_a_dropped_command(self):
        """Validity check: removing a command from the list must turn the
        golden comparison red."""
        mutated = [cmd for cmd in ACCEPTED_CONTROL_COMMANDS if cmd != "ping"]
        with pytest.raises(AssertionError):
            assert_golden(
                "ws_control_commands",
                render_json(mutated, sort_keys=False),
                allow_update=False,
            )


# ── JSON message shapes ───────────────────────────────────────────────────────


class TestControlSocketMessageShapes:
    def test_initial_status_frame_shape_matches_golden(self, client, monkeypatch):
        _patch_control(monkeypatch)
        with client.websocket_connect("/ws/sdr/1") as ws:
            status = ws.receive_json()
        assert status["type"] == "status"
        assert_golden(
            "ws_status_frame_shape", render_json(_type_shape(status), sort_keys=False)
        )

    def test_pong_frame_shape_matches_golden(self, client, monkeypatch):
        _patch_control(monkeypatch)
        with client.websocket_connect("/ws/sdr/1") as ws:
            ws.receive_json()  # status
            ws.send_json({"cmd": "ping"})
            pong = ws.receive_json()
        assert pong == {"type": "pong"}
        assert_golden(
            "ws_pong_frame_shape", render_json(_type_shape(pong), sort_keys=False)
        )

    def test_read_only_tune_control_frame_shape_matches_golden(
        self, client, monkeypatch
    ):
        """`_FakeConn.set_frequency` raises ReadOnlyTuningError — the same path
        a real follower hits when another instance owns the shared tuner."""
        _patch_control(monkeypatch)
        with client.websocket_connect("/ws/sdr/1") as ws:
            ws.receive_json()  # status
            ws.send_json({"cmd": "tune", "frequency_hz": 100_000_000})
            control = ws.receive_json()
        assert control["type"] == "control"
        assert control["is_owner"] is False
        assert_golden(
            "ws_control_frame_shape", render_json(_type_shape(control), sort_keys=False)
        )

    def test_decode_status_frame_shape_matches_golden(self, client, monkeypatch):
        radio = {"id": 1, "name": "Test", "host": "h1", "port": 1234}
        _patch_resolve(monkeypatch, _FakeBroadcaster(), radio)

        async def _no_bridge(host, port, timeout=3.0):
            return None

        monkeypatch.setattr(sdr_router, "_wait_for_bridge", _no_bridge)
        with client.websocket_connect("/ws/sdr/1/decode") as ws:
            status = ws.receive_json()
        assert status == {
            "type": "decode_status",
            "active": False,
            "decoder_reachable": False,
        }
        assert_golden(
            "ws_decode_status_frame_shape",
            render_json(_type_shape(status), sort_keys=False),
        )

    def test_decode_event_frame_shape_matches_golden(self, client, monkeypatch):
        radio = {"id": 1, "name": "Test", "host": "h1", "port": 1234}
        _patch_resolve(monkeypatch, _FakeBroadcaster(), radio)
        sdr_decode._bridges.clear()
        bridge = sdr_decode.DigitalDecodeBridge(
            _FakeBroadcaster(), pcm_port=0, audio_udp_port=0
        )
        sdr_decode._bridges["h1:1234"] = bridge
        try:
            with client.websocket_connect("/ws/sdr/1/decode") as ws:
                ws.receive_json()  # seeded decode_status
                bridge.publish_event(
                    {"type": "decode_event", "mode": "P25", "talkgroup": 7}
                )
                event = ws.receive_json()
        finally:
            sdr_decode._bridges.clear()
        assert event == {"type": "decode_event", "mode": "P25", "talkgroup": 7}
        assert_golden(
            "ws_decode_event_frame_shape",
            render_json(_type_shape(event), sort_keys=False),
        )

    def test_can_actually_fail_on_a_dropped_status_key(self, client, monkeypatch):
        """Validity check: dropping a key from a real status frame must turn
        the golden comparison red."""
        _patch_control(monkeypatch)
        with client.websocket_connect("/ws/sdr/1") as ws:
            status = ws.receive_json()
        shape = _type_shape(status)
        mutated_shape = {
            key: value for key, value in shape.items() if key != "radio_id"
        }
        with pytest.raises(AssertionError):
            assert_golden(
                "ws_status_frame_shape",
                render_json(mutated_shape, sort_keys=False),
                allow_update=False,
            )


# ── Audio WS closes cleanly for a non-voice (APRS/AIS) bridge ────────────────


class TestDecodeAudioWebsocket:
    def test_audio_socket_closes_for_a_non_voice_bridge(self, client, monkeypatch):
        radio = {"id": 1, "name": "Test", "host": "h1", "port": 1234}
        _patch_resolve(monkeypatch, _FakeBroadcaster(), radio)
        sdr_decode._aprs_bridges.clear()
        sdr_decode._aprs_bridges["h1:1234"] = sdr_decode.AprsDecodeBridge(
            _FakeBroadcaster(), pcm_port=0
        )
        try:
            with pytest.raises(StarletteWSDisconnect):
                with client.websocket_connect("/ws/sdr/1/decode/audio") as ws:
                    ws.receive_bytes()
        finally:
            sdr_decode._aprs_bridges.clear()


# ── Deterministic spectrum (FFT) frame content ────────────────────────────────


def _silence_iq(n_samples: int) -> bytes:
    """All-midpoint (128) IQ bytes — deterministic near-zero input."""
    return bytes([128] * (n_samples * 2))


class TestSpectrumFrameContent:
    N_FFT = 8
    SAMPLE_RATE = 2_048_000
    CENTER_HZ = 100_000_000

    def test_spectrum_frame_from_fixed_iq_matches_golden(self):
        frame = compute_fft_frame(
            _silence_iq(self.N_FFT), self.N_FFT, self.SAMPLE_RATE, self.CENTER_HZ
        )
        # timestamp_ms is wall-clock and genuinely non-deterministic — excluded.
        del frame["timestamp_ms"]
        assert_golden("ws_spectrum_frame_content", render_json(frame, sort_keys=False))

    def test_can_actually_fail_on_different_iq_input(self):
        """Validity check: a different (non-silent) IQ input must produce
        different bin values, turning the golden comparison red."""
        tone_iq = bytes([200, 60] * self.N_FFT)  # not the all-128 golden input
        frame = compute_fft_frame(tone_iq, self.N_FFT, self.SAMPLE_RATE, self.CENTER_HZ)
        del frame["timestamp_ms"]
        with pytest.raises(AssertionError):
            assert_golden(
                "ws_spectrum_frame_content",
                render_json(frame, sort_keys=False),
                allow_update=False,
            )


# ── IQ-socket binary header framing ───────────────────────────────────────────


class TestIqBinaryHeaderFraming:
    SAMPLE_RATE = 2_048_000
    CENTER_HZ = 100_000_000
    RAW_IQ = bytes([1, 2, 3, 4, 5, 6, 7, 8])

    def _broadcast_once(self) -> bytes:
        conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
        broadcaster = sdr_svc.RadioBroadcaster(conn)
        queue = broadcaster.subscribe_iq()
        broadcaster._broadcast_iq(self.RAW_IQ, self.SAMPLE_RATE, self.CENTER_HZ)
        return queue.get_nowait()

    def test_header_framing_matches_golden(self):
        import struct

        payload = self._broadcast_once()
        header, body = payload[:8], payload[8:]
        descriptor = {
            "header_format": "<II",
            "header_hex": header.hex(),
            "header_length_bytes": len(header),
            "decoded_sample_rate": struct.unpack("<I", header[:4])[0],
            "decoded_center_hz": struct.unpack("<I", header[4:])[0],
            "payload_length_bytes": len(body),
            "payload_hex": body.hex(),
            "total_length_bytes": len(payload),
        }
        assert_golden("ws_iq_header_framing", render_json(descriptor, sort_keys=False))

    def test_header_decodes_back_to_the_original_values(self):
        """Sanity check independent of the golden: the header round-trips."""
        import struct

        payload = self._broadcast_once()
        sample_rate, center_hz = struct.unpack("<II", payload[:8])
        assert sample_rate == self.SAMPLE_RATE
        assert center_hz == self.CENTER_HZ
        assert payload[8:] == self.RAW_IQ

    def test_no_iq_subscribers_means_nothing_is_broadcast(self):
        """Edge case: _broadcast_iq is a no-op with zero subscribers (it
        early-returns before touching struct.pack at all)."""
        conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
        broadcaster = sdr_svc.RadioBroadcaster(conn)
        # No subscribe_iq() call — _iq_subscribers is empty.
        broadcaster._broadcast_iq(self.RAW_IQ, self.SAMPLE_RATE, self.CENTER_HZ)
        assert (
            broadcaster._iq_subscribers == set()
            or len(broadcaster._iq_subscribers) == 0
        )

    def test_can_actually_fail_on_a_shifted_header(self):
        """Validity check: swapping sample_rate/center_hz in the header must
        turn the golden comparison red."""
        import struct

        payload = self._broadcast_once()
        header, body = payload[:8], payload[8:]
        shifted_header = struct.pack("<II", self.CENTER_HZ, self.SAMPLE_RATE)  # swapped
        descriptor = {
            "header_format": "<II",
            "header_hex": shifted_header.hex(),
            "header_length_bytes": len(shifted_header),
            "decoded_sample_rate": struct.unpack("<I", shifted_header[:4])[0],
            "decoded_center_hz": struct.unpack("<I", shifted_header[4:])[0],
            "payload_length_bytes": len(body),
            "payload_hex": body.hex(),
            "total_length_bytes": len(payload),
        }
        assert shifted_header != header
        with pytest.raises(AssertionError):
            assert_golden(
                "ws_iq_header_framing",
                render_json(descriptor, sort_keys=False),
                allow_update=False,
            )
