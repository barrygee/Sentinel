"""
tests/backend/test_radio_hub_ais_bus.py

Tests for the radio hub's ``hub.decode.ais.{start,stop}`` bus responders
(backend/radio_hub/routers/decode.py) — how Sea's AIS receiver asks the hub to
decode without a browser. They share one implementation with
``POST /api/sdr/ais/{start,stop}`` (whose HTTP behaviour is pinned in
test_routers_ais.py), so here the point is the bus contract: plain-dict replies,
never exceptions, and the same persisted ``sdr.ais_radio_id``.

Driven over the real bus in one event loop, against the in-memory test DB.
"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.db_helpers import get_setting, upsert_setting
from backend.platform.bus import bus
from backend.radio_hub import radios as radio_registry
from backend.radio_hub.routers import decode as decode_router  # noqa: F401 — registers the responders
from backend.radio_hub.services import sdr as sdr_svc
from backend.radio_hub.services import sdr_decode

RADIOS = [{"id": 2, "name": "AIS dongle", "host": "pi", "port": 4444}]


class _FakeConnection:
    host = "pi"
    port = 4444
    center_hz = 162_000_000
    sample_rate = 1_024_000

    async def set_frequency(self, frequency_hz: int) -> None:
        self.center_hz = frequency_hz


class _FakeBroadcaster:
    def __init__(self) -> None:
        self.connection = _FakeConnection()

    def subscribe_iq(self) -> asyncio.Queue:
        return asyncio.Queue()

    def unsubscribe_iq(self, queue: asyncio.Queue) -> None:
        pass


@pytest.fixture()
async def db(test_engine, db_setup, monkeypatch):
    monkeypatch.setattr(
        sdr_decode.settings, "ais_decoder_pcm_port", 0
    )  # bind any free port

    async def _broadcaster(host, port):
        return _FakeBroadcaster()

    monkeypatch.setattr(sdr_svc, "get_or_create_broadcaster", _broadcaster)
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with factory() as session:
        await upsert_setting(session, "sdr", "radios", RADIOS)
        yield session
    await sdr_decode.shutdown_all_decoders()


class TestStartOverTheBus:
    async def test_starts_the_bridge_and_persists_the_decoding_radio(self, db):
        assert await bus.request("hub.decode.ais.start", {"radio_id": 2, "db": db}) == {
            "ok": True
        }
        bridge = sdr_decode.get_ais_bridge("pi", 4444)
        assert bridge.running and bridge.radio_id == 2
        assert await get_setting(db, "sdr", "ais_radio_id") == 2

    async def test_a_bandwidth_override_reaches_the_bridge(self, db):
        await bus.request(
            "hub.decode.ais.start", {"radio_id": 2, "db": db, "bw_hz": 20_000}
        )
        assert sdr_decode.get_ais_bridge("pi", 4444)._state.bw_hz == 20_000

    async def test_starting_the_running_radio_again_keeps_the_same_bridge(self, db):
        await bus.request("hub.decode.ais.start", {"radio_id": 2, "db": db})
        first = sdr_decode.get_ais_bridge("pi", 4444)
        assert await bus.request("hub.decode.ais.start", {"radio_id": 2, "db": db}) == {
            "ok": True
        }
        assert sdr_decode.get_ais_bridge("pi", 4444) is first and first.running

    async def test_an_unknown_radio_is_a_reply(self, db):
        assert await bus.request("hub.decode.ais.start", {"radio_id": 9, "db": db}) == {
            "ok": False,
            "reason": "unknown_radio",
            "message": "Radio not found",
        }
        assert await get_setting(db, "sdr", "ais_radio_id") is None

    async def test_an_unavailable_device_is_a_reply(self, db, monkeypatch):
        monkeypatch.setattr(
            radio_registry,
            "device_availability",
            lambda radio: (False, "The dongle is unplugged."),
        )
        reply = await bus.request("hub.decode.ais.start", {"radio_id": 2, "db": db})
        assert reply == {
            "ok": False,
            "reason": "unavailable",
            "message": "AIS dongle is unavailable. The dongle is unplugged.",
        }

    async def test_an_unreachable_dongle_is_a_reply_and_nothing_is_persisted(
        self, db, monkeypatch
    ):
        async def _refuse(host, port):
            raise ConnectionError("refused")

        monkeypatch.setattr(sdr_svc, "get_or_create_broadcaster", _refuse)
        reply = await bus.request("hub.decode.ais.start", {"radio_id": 2, "db": db})
        assert reply == {
            "ok": False,
            "reason": "connect_failed",
            "message": "radio connect failed: refused",
        }
        assert await get_setting(db, "sdr", "ais_radio_id") is None
        assert sdr_decode.get_active_ais_bridge() is None


class TestStopOverTheBus:
    async def test_stops_the_bridge_and_clears_the_decoding_radio(self, db):
        await bus.request("hub.decode.ais.start", {"radio_id": 2, "db": db})
        bridge = sdr_decode.get_ais_bridge("pi", 4444)
        assert await bus.request("hub.decode.ais.stop", {"radio_id": 2, "db": db}) == {
            "ok": True
        }
        assert not bridge.running
        assert sdr_decode.get_ais_bridge("pi", 4444) is None
        assert await get_setting(db, "sdr", "ais_radio_id") is None

    async def test_an_unknown_radio_is_a_reply(self, db):
        assert await bus.request("hub.decode.ais.stop", {"radio_id": 9, "db": db}) == {
            "ok": False,
            "reason": "unknown_radio",
            "message": "Radio not found",
        }
