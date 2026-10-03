"""
tests/backend/test_sdr_decode_events_bus.py

Tests for the P1.2 decode-events-bus change: the SDR router's decoded
APRS/AIS ingest endpoints keep their secret check and 409 "decode not active"
gate, but now publish the decoded event on `decode.aprs.<radio_id>` /
`decode.ais.<radio_id>` instead of writing straight into the stores:

    backend/services/aprs_store.py `_on_decode_event`  — decode.aprs.* subscriber
    backend/services/ais_decode.py `_on_decode_event`   — decode.ais.* subscriber
    backend/routers/sdr.py ingest_aprs_event/ingest_ais_event — gate + publish
    backend/services/sdr_decode.py `_on_ais_status_request`  — hub.decode.ais.status
        responder Sea's off-grid status reads instead of importing sdr_decode

Sea's `/api/sea/ais/status` HTTP surface (no-source/live/down/stale shapes) is
already covered end-to-end in test_routers_sea.py — not duplicated here; this
file pins the bus responder itself plus the subscriber/publish plumbing.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.config import settings
from backend.database import Base
from backend.models import AprsStation  # noqa: F401 — register ORM model with Base
from backend.platform.bus import bus
from backend.services import ais_decode, ais_store, aprs_store, sdr_decode
from backend.services.sdr_decode import AisDecodeBridge, AprsDecodeBridge


class _FakeBroadcaster:
    """IQ fan-out stub (the bridge only calls subscribe_iq/unsubscribe_iq)."""

    def subscribe_iq(self) -> asyncio.Queue:
        return asyncio.Queue()

    def unsubscribe_iq(self, queue: asyncio.Queue) -> None:
        pass


@pytest.fixture(autouse=True)
def _reset_decode_state():
    sdr_decode._bridges.clear()
    sdr_decode._aprs_bridges.clear()
    sdr_decode._ais_bridges.clear()
    ais_store.store.clear()
    original_secret = settings.decoder_ingest_secret
    yield
    sdr_decode._bridges.clear()
    sdr_decode._aprs_bridges.clear()
    sdr_decode._ais_bridges.clear()
    ais_store.store.clear()
    settings.decoder_ingest_secret = original_secret
    sdr_decode._ingest_secret = None


@pytest.fixture()
async def aprs_session_factory(monkeypatch):
    """Per-test in-memory DB; redirect the store's own AsyncSessionLocal at it
    (mirrors test_aprs_store.py — upsert_station opens its own session when
    none is injected, exactly as the bus subscriber calls it)."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(aprs_store, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest.fixture()
def _patch_aprs_store_db(test_engine, monkeypatch):
    """Same as above but bound to the `client` fixture's in-memory engine, for
    tests that exercise the ingest HTTP endpoint end-to-end."""
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(aprs_store, "AsyncSessionLocal", factory)


def _add_radio(client, host="h1", port=1234) -> int:
    created = client.post(
        "/api/sdr/radios", json={"name": "Test", "host": host, "port": port}
    ).json()
    return created["id"]


def _register_aprs_bridge(host="h1", port=1234) -> AprsDecodeBridge:
    bridge = AprsDecodeBridge(_FakeBroadcaster(), pcm_port=0)
    sdr_decode._aprs_bridges[f"{host}:{port}"] = bridge
    return bridge


def _register_ais_bridge(host="h1", port=1234) -> AisDecodeBridge:
    bridge = AisDecodeBridge(_FakeBroadcaster(), pcm_port=0)
    sdr_decode._ais_bridges[f"{host}:{port}"] = bridge
    return bridge


def _aprs_position_event(**overrides) -> dict:
    base = {
        "type": "aprs",
        "from": "M0ABC-9",
        "latitude": 51.5,
        "longitude": -0.1,
        "symbol": "/>",
        "comment": "rolling",
        "raw": "M0ABC-9>APRS:!5130.00N/00006.00W>",
    }
    base.update(overrides)
    return base


def _ais_position_event(**overrides) -> dict:
    base = {
        "type": "ais",
        "mmsi": "227006760",
        "msgType": 1,
        "channel": "A",
        "lat": 49.475577,
        "lon": 0.13138,
        "sog": 7.4,
        "cog": 36.7,
        "raw": "!AIVDM,1,1,,A,13HOI:0P0000VOHLCnHQKwvL05Ip,0*23",
    }
    base.update(overrides)
    return base


# ── aprs_store._on_decode_event (decode.aprs.* subscriber) ───────────────────


class TestAprsDecodeEventSubscriber:
    async def test_a_decoded_position_upserts_the_station(self, aprs_session_factory):
        await bus.publish(
            "decode.aprs.1", {"event": _aprs_position_event(), "radio_id": 1}
        )
        stations = await aprs_store.get_stations(10_000)
        assert [station["callsign"] for station in stations] == ["M0ABC-9"]

    async def test_an_event_with_no_station_writes_nothing(
        self, aprs_session_factory, monkeypatch
    ):
        # A raw log line carries no position, so station_from_event() returns
        # None — the subscriber must skip the write rather than upsert None.
        upsert = AsyncMock()
        monkeypatch.setattr(aprs_store, "upsert_station", upsert)
        await bus.publish("decode.aprs.1", {"event": {"type": "log", "line": "noise"}})
        upsert.assert_not_awaited()

    async def test_reaches_the_subscriber_from_any_radio_id(self, aprs_session_factory):
        # Registered on "decode.aprs.*", not a single hardcoded radio id.
        await bus.publish(
            "decode.aprs.42", {"event": _aprs_position_event(**{"from": "G7AAA"})}
        )
        stations = await aprs_store.get_stations(10_000)
        assert [station["callsign"] for station in stations] == ["G7AAA"]


# ── ais_decode._on_decode_event (decode.ais.* subscriber) ────────────────────


class TestAisDecodeEventSubscriber:
    async def test_a_decoded_position_feeds_the_vessel_store(self):
        await bus.publish("decode.ais.7", {"event": _ais_position_event()})
        vessel = ais_store.store.get("227006760")
        assert vessel is not None
        assert vessel["lat"] == pytest.approx(49.475577)

    async def test_an_unusable_event_writes_no_vessel(self):
        await bus.publish("decode.ais.7", {"event": {"type": "log", "line": "noise"}})
        assert len(ais_store.store) == 0

    async def test_the_subscriber_is_registered_through_the_sea_router_import(self):
        # routers/sea.py imports ais_decode purely for this subscription side
        # effect (it never calls ais_decode directly) — guard against that
        # import silently becoming a copy of the module rather than the real
        # one the bus handler closed over.
        from backend.routers import sea as sea_router

        assert sea_router.ais_decode is ais_decode
        await bus.publish(
            "decode.ais.3", {"event": _ais_position_event(mmsi="351759000")}
        )
        assert ais_store.store.get("351759000") is not None


# ── ingest endpoints: gate + publish (routers/sdr.py) ─────────────────────────


class TestAprsIngestPublishesOnTheBus:
    def test_publishes_on_the_bridges_radio_id(self, client, _patch_aprs_store_db):
        settings.decoder_ingest_secret = "s"
        radio_id = _add_radio(client)
        bridge = _register_aprs_bridge()
        bridge.radio_id = radio_id
        captured: list[dict] = []
        unsubscribe = bus.subscribe(f"decode.aprs.{radio_id}", captured.append)
        try:
            resp = client.post(
                "/api/sdr/aprs/ingest",
                json={"event": _aprs_position_event()},
                headers={"X-Decode-Secret": "s"},
            )
        finally:
            unsubscribe()
        assert resp.status_code == 200
        assert len(captured) == 1
        assert captured[0]["radio_id"] == radio_id
        assert captured[0]["event"]["from"] == "M0ABC-9"

    def test_no_active_bridge_returns_409_and_publishes_nothing(self, client):
        settings.decoder_ingest_secret = "s"
        captured: list[dict] = []
        unsubscribe = bus.subscribe(">", captured.append)
        try:
            resp = client.post(
                "/api/sdr/aprs/ingest",
                json={"event": _aprs_position_event()},
                headers={"X-Decode-Secret": "s"},
            )
        finally:
            unsubscribe()
        assert resp.status_code == 409
        assert captured == []

    def test_a_subscriber_exception_still_fails_the_ingest_request(
        self, client, _patch_aprs_store_db, monkeypatch
    ):
        # Before the bus existed this was a direct call, so a store-write
        # failure surfaced as a 500 to the sidecar (which retries); publish()
        # must be called with raise_errors=True to keep that contract.
        settings.decoder_ingest_secret = "s"
        radio_id = _add_radio(client)
        bridge = _register_aprs_bridge()
        bridge.radio_id = radio_id
        monkeypatch.setattr(
            aprs_store, "upsert_station", AsyncMock(side_effect=RuntimeError("db gone"))
        )
        with pytest.raises(RuntimeError, match="db gone"):
            client.post(
                "/api/sdr/aprs/ingest",
                json={"event": _aprs_position_event()},
                headers={"X-Decode-Secret": "s"},
            )


class TestAisIngestPublishesOnTheBus:
    def test_publishes_on_the_bridges_radio_id(self, client):
        settings.decoder_ingest_secret = "s"
        radio_id = _add_radio(client)
        bridge = _register_ais_bridge()
        bridge.radio_id = radio_id
        captured: list[dict] = []
        unsubscribe = bus.subscribe(f"decode.ais.{radio_id}", captured.append)
        try:
            resp = client.post(
                "/api/sdr/ais/ingest",
                json={"event": _ais_position_event()},
                headers={"X-Decode-Secret": "s"},
            )
        finally:
            unsubscribe()
        assert resp.status_code == 200
        assert len(captured) == 1
        assert captured[0]["radio_id"] == radio_id
        assert captured[0]["event"]["mmsi"] == "227006760"

    def test_no_active_bridge_returns_409_and_publishes_nothing(self, client):
        settings.decoder_ingest_secret = "s"
        captured: list[dict] = []
        unsubscribe = bus.subscribe(">", captured.append)
        try:
            resp = client.post(
                "/api/sdr/ais/ingest",
                json={"event": _ais_position_event()},
                headers={"X-Decode-Secret": "s"},
            )
        finally:
            unsubscribe()
        assert resp.status_code == 409
        assert captured == []

    def test_a_subscriber_exception_still_fails_the_ingest_request(
        self, client, monkeypatch
    ):
        settings.decoder_ingest_secret = "s"
        radio_id = _add_radio(client)
        bridge = _register_ais_bridge()
        bridge.radio_id = radio_id
        monkeypatch.setattr(
            ais_decode, "ingest_event", MagicMock(side_effect=RuntimeError("db gone"))
        )
        with pytest.raises(RuntimeError, match="db gone"):
            client.post(
                "/api/sdr/ais/ingest",
                json={"event": _ais_position_event()},
                headers={"X-Decode-Secret": "s"},
            )


# ── sdr_decode._on_ais_status_request (hub.decode.ais.status responder) ──────


class TestAisStatusBusResponder:
    """Sea's off-grid snapshot asks the bus instead of importing sdr_decode;
    these pin the responder's reply shape directly."""

    async def test_no_bridge_reports_false_and_none_channels(self):
        result = await bus.request("hub.decode.ais.status", {})
        assert result == {
            "running": False,
            "on_channel": False,
            "decoder_reachable": False,
            "channel_a_hz": None,
            "channel_b_hz": None,
        }

    async def test_active_bridge_reports_its_own_values(self):
        # running/on_channel/decoder_reachable deliberately given three
        # different values so a field swap in the responder (e.g. reporting
        # decoder_reachable's value under "running") cannot pass by accident.
        bridge = _register_ais_bridge()
        bridge._running = True
        bridge._on_channel = False
        bridge._decoder_connected = False
        result = await bus.request("hub.decode.ais.status", {})
        assert result == {
            "running": True,
            "on_channel": False,
            "decoder_reachable": False,
            "channel_a_hz": bridge.channel_a_hz,
            "channel_b_hz": bridge.channel_b_hz,
        }
