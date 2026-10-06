"""
tests/backend/test_sdr_tuning_range.py

The tunable range (backend/radio_hub/services/sdr.py `MIN_TUNE_HZ`..`MAX_TUNE_HZ`)
and the loop it breaks.

Seen live: a relay was given 7.812 GHz (an accidental digit-wheel scroll). The
connection adopted that centre from the relay; labelling IQ frames with it
overflowed the uint32 header and crashed the broadcaster; the reconnect that
followed re-asserted the adopted centre — and so on, with the panel reverting to
7812.0000 MHz. Pinned here:
  * a tune outside the range is refused before anything reaches the relay or
    rtl_tcp;
  * an out-of-range centre reported by the relay is never adopted, so a
    reconnect asserts a valid one and un-wedges the dongle;
  * POST /api/sdr/connect rejects such a frequency with 422.
"""

from __future__ import annotations

import pytest

from backend.radio_hub.services import sdr as sdr_svc
from backend.radio_hub.services.sdr import (
    MAX_TUNE_HZ,
    MIN_TUNE_HZ,
    FrequencyOutOfRangeError,
    is_tunable,
)

WEDGED_HZ = 7_812_000_000


class _FakeControl:
    """The slice of RelayControlClient a connection drives."""

    def __init__(
        self,
        *,
        owner: bool = True,
        claim_result: bool = True,
        center_hz: int = 145_500_000,
    ) -> None:
        self.available = True
        self.is_owner = owner
        self._claim_result = claim_result
        self.claims = 0
        self.sets: list[dict] = []
        self.center_hz = center_hz
        self.sample_rate = 2_048_000
        self.gain_db = 49.6
        self.gain_auto = False
        self.offset_hz = self.bw_hz = 0
        self.mode = ""
        self.scan_active = self.search_active = False
        self.scan_groups: list[str] = []
        self.search_low_hz = self.search_high_hz = self.search_current_hz = None

    async def connect(self) -> bool:
        return True

    async def claim(self) -> bool:
        self.claims += 1
        self.is_owner = self._claim_result
        return self.is_owner

    async def release(self) -> None:
        self.is_owner = False

    async def set(self, **fields) -> None:
        self.sets.append(fields)


class _FakeWriter:
    def __init__(self) -> None:
        self.sent = bytearray()

    def get_extra_info(self, _name):
        return None

    def write(self, data: bytes) -> None:
        self.sent += data

    async def drain(self) -> None:
        pass


def _relay_connection(**control_kwargs) -> sdr_svc.RtlTcpConnection:
    connection = sdr_svc.RtlTcpConnection(host="pi", port=4444)
    connection.control = _FakeControl(**control_kwargs)
    connection.control_available = True
    connection.is_owner = connection.control.is_owner
    return connection


def _raw_connection() -> sdr_svc.RtlTcpConnection:
    connection = sdr_svc.RtlTcpConnection(host="pi", port=4444)
    connection.connected = True
    connection.writer = _FakeWriter()  # type: ignore[assignment]
    return connection


class TestIsTunable:
    @pytest.mark.parametrize(
        "frequency_hz", [MIN_TUNE_HZ, MAX_TUNE_HZ, 145_500_000, 1_090_000_000]
    )
    def test_inside_the_range(self, frequency_hz):
        assert is_tunable(frequency_hz) is True

    @pytest.mark.parametrize(
        "frequency_hz",
        [
            MIN_TUNE_HZ - 1,
            MAX_TUNE_HZ + 1,
            WEDGED_HZ,
            0,
            -145_500_000,
            True,
            145.5e6,
            "145500000",
            None,
        ],
    )
    def test_outside_the_range_or_not_a_whole_hz(self, frequency_hz):
        assert is_tunable(frequency_hz) is False

    def test_the_range_fits_the_uint32_the_wire_carries(self):
        assert MAX_TUNE_HZ <= 0xFFFFFFFF


class TestSetFrequency:
    @pytest.mark.parametrize(
        "frequency_hz", [WEDGED_HZ, MIN_TUNE_HZ - 1, MAX_TUNE_HZ + 1, 0]
    )
    async def test_relay_path_refuses_without_touching_the_relay(self, frequency_hz):
        connection = _relay_connection()
        with pytest.raises(FrequencyOutOfRangeError, match="outside the tunable range"):
            await connection.set_frequency(frequency_hz)
        assert connection.control.sets == [] and connection.control.claims == 0
        assert connection.center_hz == 100_000_000  # unchanged

    async def test_raw_rtl_tcp_path_refuses_without_sending(self):
        connection = _raw_connection()
        with pytest.raises(FrequencyOutOfRangeError):
            await connection.set_frequency(WEDGED_HZ)
        assert connection.writer.sent == bytearray()

    @pytest.mark.parametrize("frequency_hz", [MIN_TUNE_HZ, MAX_TUNE_HZ])
    async def test_the_edges_are_tunable(self, frequency_hz):
        connection = _relay_connection()
        await connection.set_frequency(frequency_hz)
        assert connection.control.sets == [{"center_hz": frequency_hz}]
        assert connection.center_hz == frequency_hz
        raw = _raw_connection()
        await raw.set_frequency(frequency_hz)
        assert raw.writer.sent == bytes([0x01]) + frequency_hz.to_bytes(4, "big")


class TestAdoptingTheRelaysCentre:
    def test_a_wedged_centre_is_not_adopted(self):
        connection = _relay_connection(center_hz=WEDGED_HZ)
        connection.center_hz = 145_500_000
        connection._adopt_control_state(connection.control)
        assert connection.center_hz == 145_500_000
        assert connection.sample_rate == 2_048_000  # the rest is still adopted

    def test_a_valid_centre_is_adopted(self):
        connection = _relay_connection(center_hz=433_920_000)
        connection._adopt_control_state(connection.control)
        assert connection.center_hz == 433_920_000

    def test_a_missing_centre_is_not_adopted(self):
        connection = _relay_connection(center_hz=0)
        connection._adopt_control_state(connection.control)
        assert connection.center_hz == 100_000_000


class TestTheLoopIsBroken:
    async def test_a_first_connect_as_owner_asserts_a_valid_centre(self, monkeypatch):
        # The relay is wedged at 7.812 GHz; connecting as owner tunes it back.
        control = _FakeControl(owner=False, claim_result=True, center_hz=WEDGED_HZ)
        monkeypatch.setattr(
            sdr_svc, "RelayControlClient", lambda host, port, on_state=None: control
        )
        connection = sdr_svc.RtlTcpConnection(host="pi", port=4444)
        await connection._ensure_control()
        assert control.sets == [
            {"sample_rate": connection.sample_rate, "center_hz": 100_000_000}
        ]

    async def test_a_follower_keeps_its_valid_centre(self, monkeypatch):
        control = _FakeControl(owner=False, claim_result=False, center_hz=WEDGED_HZ)
        monkeypatch.setattr(
            sdr_svc, "RelayControlClient", lambda host, port, on_state=None: control
        )
        connection = sdr_svc.RtlTcpConnection(host="pi", port=4444)
        await connection._ensure_control()
        assert connection.center_hz == 100_000_000

    def test_iq_frames_can_always_be_labelled(self):
        # The crash: packing a 7.812 GHz centre into the uint32 frame header.
        connection = _relay_connection(center_hz=WEDGED_HZ)
        connection._adopt_control_state(connection.control)
        broadcaster = sdr_svc.RadioBroadcaster(connection)
        queue = broadcaster.subscribe_iq()
        broadcaster._broadcast_iq(
            b"\x80\x80", connection.sample_rate, connection.center_hz
        )
        assert queue.get_nowait()[4:8] == (100_000_000).to_bytes(4, "little")


class TestConnectEndpoint:
    @pytest.mark.parametrize(
        "frequency_hz", [WEDGED_HZ, MIN_TUNE_HZ - 1, MAX_TUNE_HZ + 1]
    )
    def test_rejects_a_frequency_no_tuner_can_reach(self, client, frequency_hz):
        response = client.post(
            "/api/sdr/connect", json={"radio_id": 1, "frequency_hz": frequency_hz}
        )
        assert response.status_code == 422
        assert "frequency_hz must be between" in response.text

    def test_accepts_an_absent_or_tunable_frequency(self, client):
        # Validation passes, so the request reaches the radio lookup (404: no such radio).
        assert client.post("/api/sdr/connect", json={"radio_id": 1}).status_code == 404
        assert (
            client.post(
                "/api/sdr/connect", json={"radio_id": 1, "frequency_hz": 145_500_000}
            ).status_code
            == 404
        )
