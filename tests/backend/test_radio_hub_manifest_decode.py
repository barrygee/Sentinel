"""
tests/backend/test_radio_hub_manifest_decode.py

Tests for backend/radio_hub/services/manifest_decode.py — the generic decode
bridges the radio hub runs for decoder kinds declared by a manifest
(section-containers plan §3.4), and the kind registry behind them.

Pinned here, all in one event loop so the real PCM server and demod task run:
  * registration: idempotent, a kind belongs to one decoder, a decoding kind's
    spec can't change under it, PCM ports can't collide;
  * `ownership: relative` follows the offset it is given; `ownership: absolute`
    tunes the radio to its channels (their midpoint for two) and serves two
    channels as interleaved stereo, exactly as the AIS bridge does;
  * one bridge per kind: starting it on another radio stops it on the first;
  * every start/stop/status failure is a plain-dict reply, over the bus too.
The HTTP surface is in test_routers_decoders.py.
"""

from __future__ import annotations

import asyncio
import socket
import struct
from collections.abc import AsyncIterator

import numpy as np
import pytest

from backend.config import settings
from backend.platform.bus import bus
from backend.radio_hub import radios as radio_registry
from backend.radio_hub.routers import decode as decode_router
from backend.radio_hub.services import manifest_decode
from backend.radio_hub.services import sdr as sdr_svc
from backend.radio_hub.services.decoder_manifest import DecoderManifest
from backend.radio_hub.services.manifest_decode import (
    ManifestChannelOwningBridge,
    ManifestDecodeBridge,
    RegistrationRejected,
)
from backend.radio_hub.services.sdr_decode import (
    DemodState,
    demod_chunk,
    demod_chunk_stereo,
)

SAMPLE_RATE = 1_024_000
CHANNEL_A_HZ = 161_975_000
CHANNEL_B_HZ = 162_025_000
RADIOS = [
    {"id": 3, "name": "Roof", "host": "roof", "port": 1234},
    {"id": 4, "name": "Shed", "host": "shed", "port": 1234},
]


class _FakeConnection:
    """The slice of RtlTcpConnection a channel-owning bridge tunes through."""

    def __init__(self) -> None:
        self.host = "roof"
        self.port = 1234
        self.center_hz = 0
        self.sample_rate = SAMPLE_RATE
        self.tuned: list[int] = []

    async def set_frequency(self, frequency_hz: int) -> None:
        self.tuned.append(frequency_hz)
        self.center_hz = frequency_hz


class _FakeBroadcaster:
    """IQ fan-out stub: the bridges only subscribe/unsubscribe and tune."""

    def __init__(self) -> None:
        self.connection = _FakeConnection()
        self.iq_queues: list[asyncio.Queue] = []

    def subscribe_iq(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self.iq_queues.append(queue)
        return queue

    def unsubscribe_iq(self, queue: asyncio.Queue) -> None:
        self.iq_queues.remove(queue)


def _manifest(
    kind: str = "pocsag", decoder_id: str | None = None, *, port: int = 7360, **pcm
) -> DecoderManifest:
    return DecoderManifest.model_validate(
        {
            "id": decoder_id or f"decoder-{kind}",
            "kind": "decoder",
            "decoderKind": kind,
            "version": pcm.pop("version", "1.0.0"),
            "contracts": "^1",
            "pcm": {"port": port, **pcm},
        }
    )


def _on_any_port(manifest: DecoderManifest) -> DecoderManifest:
    """The same manifest on a port that is free right now, so its PCM server can bind."""
    with socket.socket() as probe:
        probe.bind(("0.0.0.0", 0))
        free_port = probe.getsockname()[1]
    return manifest.model_copy(
        update={"pcm": manifest.pcm.model_copy(update={"port": free_port})}
    )


def _absolute(kind: str = "twin", **pcm) -> DecoderManifest:
    return _manifest(
        kind,
        ownership="absolute",
        channels=2,
        channelsHz=[CHANNEL_A_HZ, CHANNEL_B_HZ],
        **pcm,
    )


def _iq_tone(tone_hz: int, center_hz: int, samples: int = 40_960) -> bytes:
    """uint8 IQ for a tone at ``tone_hz`` captured with the radio on ``center_hz``."""
    phase = np.exp(
        2j * np.pi * (tone_hz - center_hz) * np.arange(samples) / SAMPLE_RATE
    )
    raw = np.empty(2 * samples, dtype=np.uint8)
    raw[0::2] = np.clip(phase.real * 127.5 + 127.5, 0, 255)
    raw[1::2] = np.clip(phase.imag * 127.5 + 127.5, 0, 255)
    return raw.tobytes()


def _chunk(center_hz: int, iq: bytes) -> bytes:
    return struct.pack("<II", SAMPLE_RATE, center_hz) + iq


@pytest.fixture(autouse=True)
async def _fresh_registry() -> AsyncIterator[None]:
    yield
    await manifest_decode.shutdown_all()
    for unsubscribers in manifest_decode._bus_unsubscribers.values():
        for unsubscribe in unsubscribers:
            unsubscribe()
    manifest_decode._bus_unsubscribers.clear()
    manifest_decode._manifests.clear()


@pytest.fixture()
def broadcasters(monkeypatch) -> dict[str, _FakeBroadcaster]:
    """One fake broadcaster per radio host; radios come from RADIOS."""
    by_host = {radio["host"]: _FakeBroadcaster() for radio in RADIOS}

    async def _radios(_db):
        return [dict(radio) for radio in RADIOS]

    async def _broadcaster(host, port):
        return by_host[host]

    monkeypatch.setattr(radio_registry, "get_radios", _radios)
    monkeypatch.setattr(sdr_svc, "get_or_create_broadcaster", _broadcaster)
    return by_host


def _responders(subject: str) -> int:
    return sum(1 for subscription in bus._subscriptions if subscription.pattern == subject)


# ── registration ─────────────────────────────────────────────────────────────


class TestRegister:
    def test_first_registration_answers_the_kinds_bus_subjects(self):
        assert manifest_decode.register(_manifest()) == "registered"
        assert manifest_decode.get_manifest("pocsag") == _manifest()
        for action in ("start", "stop", "status"):
            assert _responders(f"hub.decode.pocsag.{action}") == 1

    def test_the_same_manifest_again_is_unchanged(self):
        manifest_decode.register(_manifest())
        assert manifest_decode.register(_manifest()) == "unchanged"

    def test_a_new_version_from_the_same_decoder_replaces_it_without_new_responders(
        self,
    ):
        manifest_decode.register(_manifest())
        newer = _manifest(version="1.1.0", bwHz=25_000)
        assert manifest_decode.register(newer) == "replaced"
        assert manifest_decode.get_manifest("pocsag") == newer
        assert _responders("hub.decode.pocsag.start") == 1

    def test_another_decoder_cannot_take_a_registered_kind(self):
        manifest_decode.register(_manifest())
        with pytest.raises(RegistrationRejected) as rejected:
            manifest_decode.register(_manifest(decoder_id="decoder-impostor"))
        assert rejected.value.reason == "kind_taken"
        assert manifest_decode.get_manifest("pocsag").id == "decoder-pocsag"

    async def test_a_decoding_kinds_spec_cannot_change_under_it(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        with pytest.raises(RegistrationRejected) as rejected:
            manifest_decode.register(_manifest(version="2.0.0"))
        assert rejected.value.reason == "busy"

    @pytest.mark.parametrize(
        "setting", ["decoder_pcm_port", "aprs_decoder_pcm_port", "ais_decoder_pcm_port"]
    )
    def test_the_dedicated_bridges_ports_are_taken(self, setting):
        with pytest.raises(RegistrationRejected) as rejected:
            manifest_decode.register(_manifest(port=getattr(settings, setting)))
        assert rejected.value.reason == "port_in_use"
        assert manifest_decode.get_manifest("pocsag") is None

    def test_two_kinds_cannot_share_a_port(self):
        manifest_decode.register(_manifest("pocsag", port=7360))
        with pytest.raises(RegistrationRejected) as rejected:
            manifest_decode.register(_manifest("flex", port=7360))
        assert rejected.value.reason == "port_in_use"

    def test_lists_every_registered_manifest(self):
        manifest_decode.register(_manifest("pocsag", port=7360))
        manifest_decode.register(_manifest("flex", port=7361))
        assert [
            manifest.decoder_kind for manifest in manifest_decode.registered_manifests()
        ] == ["pocsag", "flex"]


# ── the two generic bridges ──────────────────────────────────────────────────


class TestRelativeBridge:
    def test_takes_its_kind_port_and_bandwidth_from_the_manifest(self):
        bridge = ManifestDecodeBridge(_FakeBroadcaster(), _manifest(bwHz=25_000))
        assert (bridge.kind, bridge.pcm_port, bridge.radio_id) == ("pocsag", 7360, None)
        assert bridge._state.bw_hz == 25_000


class TestChannelOwningBridge:
    def test_one_channel_is_mono_tuned_onto_the_channel(self):
        bridge = ManifestChannelOwningBridge(
            _FakeBroadcaster(),
            _manifest(ownership="absolute", channelsHz=[CHANNEL_A_HZ]),
        )
        assert bridge.owned_channels_hz() == (CHANNEL_A_HZ,)
        assert bridge.tune_target_hz() == CHANNEL_A_HZ
        bridge._apply_offsets(CHANNEL_A_HZ - 100_000)
        assert bridge._state.offset_hz == 100_000
        assert bridge._second_channel_state is None

        iq = _iq_tone(CHANNEL_A_HZ, CHANNEL_A_HZ - 100_000)
        expected = demod_chunk(
            iq, SAMPLE_RATE, DemodState(offset_hz=100_000, bw_hz=bridge._state.bw_hz)
        )
        assert bridge._demodulate(iq, SAMPLE_RATE) == expected

    def test_two_channels_are_stereo_tuned_onto_their_midpoint(self):
        bridge = ManifestChannelOwningBridge(_FakeBroadcaster(), _absolute(bwHz=20_000))
        assert bridge.tune_target_hz() == (CHANNEL_A_HZ + CHANNEL_B_HZ) // 2
        bridge._state.bw_hz = 15_000  # a live bandwidth change must reach channel B too
        bridge._apply_offsets(162_000_000)
        assert bridge._state.offset_hz == CHANNEL_A_HZ - 162_000_000
        assert bridge._second_channel_state.offset_hz == CHANNEL_B_HZ - 162_000_000
        assert bridge._second_channel_state.bw_hz == 15_000

        iq = _iq_tone(CHANNEL_A_HZ, 162_000_000)
        left = DemodState(offset_hz=CHANNEL_A_HZ - 162_000_000, bw_hz=15_000)
        right = DemodState(offset_hz=CHANNEL_B_HZ - 162_000_000, bw_hz=15_000)
        pcm = bridge._demodulate(iq, SAMPLE_RATE)
        assert pcm == demod_chunk_stereo(iq, SAMPLE_RATE, left, right)
        assert len(pcm) % 4 == 0  # interleaved s16 frames

    async def test_serves_its_channels_over_tcp_and_reports_on_channel(
        self, broadcasters
    ):
        manifest_decode.register(_on_any_port(_absolute()))
        assert await manifest_decode.start_on_radio("twin", None, 3) == {
            "ok": True,
            "radio_id": 3,
            "active": True,
        }
        roof = broadcasters["roof"]
        assert roof.connection.tuned == [162_000_000]

        bridge = manifest_decode.get_active_bridge("twin")
        reader, writer = await asyncio.open_connection("127.0.0.1", bridge.pcm_port)
        try:
            for _ in range(10):
                if bridge.decoder_reachable:
                    break
                await asyncio.sleep(0.01)
            await roof.iq_queues[0].put(
                _chunk(162_000_000, _iq_tone(CHANNEL_A_HZ, 162_000_000))
            )
            pcm = await asyncio.wait_for(reader.read(65_536), timeout=2)
            assert pcm and len(pcm) % 4 == 0

            status = await manifest_decode.status_on_radio("twin", None, 3)
            assert status == {
                "ok": True,
                "radio_id": 3,
                "active": True,
                "decoder_reachable": True,
                "channels_hz": [CHANNEL_A_HZ, CHANNEL_B_HZ],
                "on_channel": True,
            }
        finally:
            # Stop while the decoder is still connected: a bridge stopped after its
            # decoder hung up waits out PcmDecodeBridge.stop's 2 s wait_closed timeout.
            await manifest_decode.shutdown_all()
            writer.close()


# ── start / stop / status ────────────────────────────────────────────────────


class TestStart:
    async def test_unknown_kind(self, broadcasters):
        assert await manifest_decode.start_on_radio("nope", None, 3) == {
            "ok": False,
            "reason": "unknown_kind",
        }

    async def test_unknown_radio(self, broadcasters):
        manifest_decode.register(_manifest())
        assert await manifest_decode.start_on_radio("pocsag", None, 99) == {
            "ok": False,
            "reason": "unknown_radio",
        }

    async def test_an_unavailable_device_says_why(self, broadcasters, monkeypatch):
        manifest_decode.register(_manifest())
        monkeypatch.setattr(
            radio_registry,
            "device_availability",
            lambda radio: (False, "The dongle is unplugged."),
        )
        assert await manifest_decode.start_on_radio("pocsag", None, 3) == {
            "ok": False,
            "reason": "unavailable",
            "message": "Roof is unavailable. The dongle is unplugged.",
        }
        assert manifest_decode.get_active_bridge("pocsag") is None

    async def test_a_radio_that_wont_connect(self, broadcasters, monkeypatch):
        manifest_decode.register(_manifest())

        async def _refuse(host, port):
            raise ConnectionError("refused")

        monkeypatch.setattr(sdr_svc, "get_or_create_broadcaster", _refuse)
        assert await manifest_decode.start_on_radio("pocsag", None, 3) == {
            "ok": False,
            "reason": "connect_failed",
            "message": "radio connect failed: refused",
        }

    @pytest.mark.parametrize(
        "manifest, bridge_class",
        [
            (_manifest(), ManifestDecodeBridge),
            (_absolute("pocsag"), ManifestChannelOwningBridge),
        ],
    )
    async def test_runs_the_bridge_the_ownership_asks_for(
        self, broadcasters, manifest, bridge_class
    ):
        manifest_decode.register(_on_any_port(manifest))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        bridge = manifest_decode.get_bridge("pocsag", "roof", 1234)
        assert type(bridge) is bridge_class
        assert bridge.running and bridge.radio_id == 3
        assert broadcasters["roof"].iq_queues  # subscribed to the radio's IQ

    async def test_a_relative_kind_demodulates_at_the_offset_and_bandwidth_asked_for(
        self, broadcasters
    ):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio(
            "pocsag", None, 3, offset_hz=-25_000, bw_hz=6_250
        )
        bridge = manifest_decode.get_active_bridge("pocsag")
        assert (bridge._state.offset_hz, bridge._state.bw_hz) == (-25_000, 6_250)
        assert broadcasters["roof"].connection.tuned == []  # it never tunes the radio

    async def test_starting_again_on_the_same_radio_retunes_the_same_bridge(
        self, broadcasters
    ):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio("pocsag", None, 3, offset_hz=10_000)
        first = manifest_decode.get_active_bridge("pocsag")
        await manifest_decode.start_on_radio("pocsag", None, 3, offset_hz=20_000)
        assert manifest_decode.get_active_bridge("pocsag") is first
        assert first._state.offset_hz == 20_000

    async def test_starting_on_another_radio_stops_it_on_the_first(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        on_roof = manifest_decode.get_active_bridge("pocsag")
        await manifest_decode.start_on_radio("pocsag", None, 4)
        assert not on_roof.running
        assert broadcasters["roof"].iq_queues == []
        assert manifest_decode.get_bridge("pocsag", "shed", 1234).radio_id == 4
        assert manifest_decode.get_bridge("pocsag", "roof", 1234) is None


class TestStop:
    async def test_unknown_kind_and_radio(self, broadcasters):
        assert await manifest_decode.stop_on_radio("nope", None, 3) == {
            "ok": False,
            "reason": "unknown_kind",
        }
        manifest_decode.register(_manifest())
        assert await manifest_decode.stop_on_radio("pocsag", None, 99) == {
            "ok": False,
            "reason": "unknown_radio",
        }

    async def test_stops_the_kind_on_its_radio(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        bridge = manifest_decode.get_active_bridge("pocsag")
        assert await manifest_decode.stop_on_radio("pocsag", None, 3) == {
            "ok": True,
            "radio_id": 3,
            "active": False,
        }
        assert not bridge.running
        assert manifest_decode.get_active_bridge("pocsag") is None

    async def test_stopping_on_another_radio_leaves_it_running(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        assert (await manifest_decode.stop_on_radio("pocsag", None, 4))["ok"] is True
        assert manifest_decode.get_active_bridge("pocsag").running


class TestStatus:
    async def test_unknown_kind_and_radio(self, broadcasters):
        assert await manifest_decode.status_on_radio("nope", None, 3) == {
            "ok": False,
            "reason": "unknown_kind",
        }
        manifest_decode.register(_manifest())
        assert await manifest_decode.status_on_radio("pocsag", None, 99) == {
            "ok": False,
            "reason": "unknown_radio",
        }

    async def test_an_idle_relative_kind_has_no_channel_state(self, broadcasters):
        manifest_decode.register(_manifest())
        assert await manifest_decode.status_on_radio("pocsag", None, 3) == {
            "ok": True,
            "radio_id": 3,
            "active": False,
            "decoder_reachable": False,
            "channels_hz": None,
            "on_channel": None,
        }

    async def test_an_idle_absolute_kind_is_off_channel(self, broadcasters):
        manifest_decode.register(_absolute())
        status = await manifest_decode.status_on_radio("twin", None, 3)
        assert (status["channels_hz"], status["on_channel"], status["active"]) == (
            [CHANNEL_A_HZ, CHANNEL_B_HZ],
            False,
            False,
        )

    async def test_a_kind_running_on_another_radio_is_idle_here(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio("pocsag", None, 4)
        assert (await manifest_decode.status_on_radio("pocsag", None, 3))[
            "active"
        ] is False


class TestOverTheBus:
    async def test_start_status_and_stop_requests(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest()))
        started = await bus.request(
            "hub.decode.pocsag.start",
            {"radio_id": 3, "db": None, "bw_hz": 6_250, "offset_hz": 5_000},
        )
        assert started == {"ok": True, "radio_id": 3, "active": True}
        bridge = manifest_decode.get_active_bridge("pocsag")
        assert (bridge._state.offset_hz, bridge._state.bw_hz) == (5_000, 6_250)

        status = await bus.request(
            "hub.decode.pocsag.status", {"radio_id": 3, "db": None}
        )
        assert status["active"] is True

        assert await bus.request(
            "hub.decode.pocsag.stop", {"radio_id": 3, "db": None}
        ) == {
            "ok": True,
            "radio_id": 3,
            "active": False,
        }

    async def test_start_defaults_to_the_manifests_bandwidth_and_no_offset(
        self, broadcasters
    ):
        manifest_decode.register(_on_any_port(_manifest(bwHz=25_000)))
        await bus.request("hub.decode.pocsag.start", {"radio_id": 3, "db": None})
        bridge = manifest_decode.get_active_bridge("pocsag")
        assert (bridge._state.offset_hz, bridge._state.bw_hz) == (0, 25_000)

    async def test_failures_are_replies_not_exceptions(self, broadcasters):
        manifest_decode.register(_manifest())
        assert await bus.request(
            "hub.decode.pocsag.start", {"radio_id": 99, "db": None}
        ) == {
            "ok": False,
            "reason": "unknown_radio",
        }


# ── lookups and lifecycle ────────────────────────────────────────────────────


class TestLookups:
    async def test_nothing_is_found_before_a_start(self, broadcasters):
        manifest_decode.register(_manifest())
        assert manifest_decode.get_active_bridge("pocsag") is None
        assert manifest_decode.get_bridge("pocsag", "roof", 1234) is None
        assert manifest_decode.find_bridge("roof", 1234) is None

    async def test_find_bridge_matches_the_radio_whatever_the_kind(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest("pocsag", port=7360)))
        manifest_decode.register(_on_any_port(_manifest("flex", port=7361)))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        await manifest_decode.start_on_radio("flex", None, 4)
        assert manifest_decode.find_bridge("roof", 1234).kind == "pocsag"
        assert manifest_decode.find_bridge("shed", "1234").kind == "flex"
        assert manifest_decode.find_bridge("roof", 9999) is None

    async def test_the_decode_websocket_finds_a_manifest_bridge(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        assert await decode_router._wait_for_bridge(
            "roof", 1234, timeout=0.5
        ) is manifest_decode.get_active_bridge("pocsag")


class TestLifecycle:
    async def test_wake_unblocks_every_event_subscriber(self, broadcasters):
        manifest_decode.register(_on_any_port(_manifest()))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        events = manifest_decode.get_active_bridge("pocsag").subscribe_events()
        events.get_nowait()  # the initial decode_status frame
        manifest_decode.wake_all()
        assert events.get_nowait() is None

    async def test_shutdown_stops_every_kind_even_when_one_fails(
        self, broadcasters, monkeypatch
    ):
        manifest_decode.register(_on_any_port(_manifest("pocsag", port=7360)))
        manifest_decode.register(_on_any_port(_manifest("flex", port=7361)))
        await manifest_decode.start_on_radio("pocsag", None, 3)
        await manifest_decode.start_on_radio("flex", None, 4)
        failing = manifest_decode.get_active_bridge("pocsag")
        survivor = manifest_decode.get_active_bridge("flex")

        async def _explode():
            raise RuntimeError("stuck socket")

        monkeypatch.setattr(failing, "stop", _explode)
        await manifest_decode.shutdown_all()
        assert manifest_decode._bridges == {}
        assert not survivor.running
        await type(failing).stop(
            failing
        )  # release the socket the sabotaged stop left open
