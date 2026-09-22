"""
tests/backend/test_routers_ais.py

Tests for the off-grid AIS decode HTTP surface:

    POST /api/sdr/ais/start | stop       — background AIS decode lifecycle
    GET  /api/sdr/ais/status/{id}        — running / reachable / on channel
    POST /api/sdr/ais/ingest             — Direwolf sidecar → vessel store
    GET  /api/sdr/ais/config             — active gate for the sidecar
    resume_persisted_ais()               — startup resume of the saved radio
    reconcile_ais_decode()               — config-upload reconciliation

The Sea twin of test_routers_aprs.py. The ingest tests care about one thing
above all: a decoded vessel must land in the SAME store AISStream feeds, since
that is what makes the Sea map behave identically whichever source is live.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as backend_database
from backend.config import settings
from backend.routers import sdr as sdr_router
from backend.services import ais_store, sdr_decode
from backend.services import sdr as sdr_svc
from backend.services.sdr_decode import AisDecodeBridge


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


@pytest.fixture(autouse=True)
def _patch_resume_db(test_engine, monkeypatch):
    """Point the startup resume's AsyncSessionLocal at the test engine."""
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(backend_database, "AsyncSessionLocal", factory)


def _add_radio(client, host="h1", port=1234) -> int:
    created = client.post(
        "/api/sdr/radios", json={"name": "Test", "host": host, "port": port}
    ).json()
    return created["id"]


def _register_ais_bridge(host="h1", port=1234) -> AisDecodeBridge:
    bridge = AisDecodeBridge(_FakeBroadcaster(), pcm_port=0)
    sdr_decode._ais_bridges[f"{host}:{port}"] = bridge
    return bridge


def _position_event() -> dict:
    return {
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


# ── POST /api/sdr/ais/start ───────────────────────────────────────────────────


class TestAisStart:
    def test_unknown_radio_returns_404(self, client):
        assert (
            client.post("/api/sdr/ais/start", json={"radio_id": 999}).status_code == 404
        )

    def test_connect_failure_returns_502(self, client, monkeypatch):
        radio_id = _add_radio(client)
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(side_effect=ConnectionError("no dongle")),
        )
        resp = client.post("/api/sdr/ais/start", json={"radio_id": radio_id})
        assert resp.status_code == 502

    def test_unavailable_device_returns_503_with_a_reason(self, client, monkeypatch):
        # A bare connection refusal tells the operator nothing about what to do.
        radio_id = _add_radio(client)
        monkeypatch.setattr(
            sdr_router,
            "_device_availability",
            lambda radio: (False, "Dongle unplugged."),
        )
        resp = client.post("/api/sdr/ais/start", json={"radio_id": radio_id})
        assert resp.status_code == 503
        assert "Dongle unplugged." in resp.json()["detail"]

    def test_success_starts_bridge_and_persists_the_radio(self, client, monkeypatch):
        radio_id = _add_radio(client)
        bridge = MagicMock()
        bridge.start = AsyncMock()
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(return_value=_FakeBroadcaster()),
        )
        monkeypatch.setattr(
            sdr_decode, "get_or_create_ais_bridge", AsyncMock(return_value=bridge)
        )
        resp = client.post(
            "/api/sdr/ais/start", json={"radio_id": radio_id, "bw_hz": 16000}
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "radio_id": radio_id, "active": True}
        bridge.start.assert_awaited_once_with(bw_hz=16000)
        # Persisted so decode resumes on restart.
        assert client.get("/api/settings/sdr").json()["ais_radio_id"] == radio_id

    def test_zero_bandwidth_means_the_bridge_default(self, client, monkeypatch):
        radio_id = _add_radio(client)
        bridge = MagicMock()
        bridge.start = AsyncMock()
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(return_value=_FakeBroadcaster()),
        )
        monkeypatch.setattr(
            sdr_decode, "get_or_create_ais_bridge", AsyncMock(return_value=bridge)
        )
        client.post("/api/sdr/ais/start", json={"radio_id": radio_id})
        bridge.start.assert_awaited_once_with(bw_hz=None)


# ── POST /api/sdr/ais/stop ────────────────────────────────────────────────────


class TestAisStop:
    def test_unknown_radio_returns_404(self, client):
        assert (
            client.post("/api/sdr/ais/stop", json={"radio_id": 999}).status_code == 404
        )

    def test_stop_clears_the_persisted_radio(self, client):
        radio_id = _add_radio(client)
        bridge = _register_ais_bridge()
        resp = client.post("/api/sdr/ais/stop", json={"radio_id": radio_id})
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "radio_id": radio_id, "active": False}
        assert sdr_decode.get_ais_bridge("h1", 1234) is None
        assert bridge.running is False
        assert client.get("/api/settings/sdr").json().get("ais_radio_id") is None

    def test_stop_without_a_running_bridge_is_accepted(self, client):
        # The operator asked for decode to stop; nothing running is success.
        radio_id = _add_radio(client)
        assert (
            client.post("/api/sdr/ais/stop", json={"radio_id": radio_id}).status_code
            == 200
        )


# ── GET /api/sdr/ais/status/{id} ──────────────────────────────────────────────


class TestAisStatus:
    def test_unknown_radio_returns_404(self, client):
        assert client.get("/api/sdr/ais/status/999").status_code == 404

    def test_reports_inactive_when_nothing_is_decoding(self, client):
        radio_id = _add_radio(client)
        body = client.get(f"/api/sdr/ais/status/{radio_id}").json()
        assert body["active"] is False
        assert body["decoder_reachable"] is False
        assert body["on_channel"] is False
        assert body["channel_a_hz"] is None
        assert body["channel_b_hz"] is None

    def test_reports_both_channels_when_decoding(self, client):
        radio_id = _add_radio(client)
        bridge = _register_ais_bridge()
        bridge._running = True
        bridge._on_channel = True
        bridge._decoder_connected = True
        body = client.get(f"/api/sdr/ais/status/{radio_id}").json()
        assert body["active"] is True
        assert body["decoder_reachable"] is True
        assert body["on_channel"] is True
        assert body["channel_a_hz"] == settings.ais_channel_a_hz
        assert body["channel_b_hz"] == settings.ais_channel_b_hz

    def test_off_channel_is_visible_while_running(self, client):
        # The bridge is decoding silence and will retune — the operator needs to
        # be able to see that rather than wonder why no vessels arrive.
        radio_id = _add_radio(client)
        bridge = _register_ais_bridge()
        bridge._running = True
        bridge._on_channel = False
        body = client.get(f"/api/sdr/ais/status/{radio_id}").json()
        assert body["active"] is True
        assert body["on_channel"] is False


# ── POST /api/sdr/ais/ingest ──────────────────────────────────────────────────


class TestAisIngest:
    def test_disabled_when_secret_unresolvable(self, client, monkeypatch):
        monkeypatch.setattr(sdr_decode, "resolve_ingest_secret", lambda: "")
        resp = client.post(
            "/api/sdr/ais/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "anything"},
        )
        assert resp.status_code == 503

    def test_bad_secret_rejected(self, client):
        settings.decoder_ingest_secret = "right-secret"
        _register_ais_bridge()
        resp = client.post(
            "/api/sdr/ais/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "wrong-secret"},
        )
        assert resp.status_code == 401

    def test_missing_secret_header_rejected(self, client):
        settings.decoder_ingest_secret = "right-secret"
        _register_ais_bridge()
        resp = client.post("/api/sdr/ais/ingest", json={"event": _position_event()})
        assert resp.status_code == 401

    def test_rejected_secret_never_reaches_the_store(self, client):
        # The gate must hold before any vessel is recorded.
        settings.decoder_ingest_secret = "right-secret"
        _register_ais_bridge()
        client.post(
            "/api/sdr/ais/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "wrong"},
        )
        assert len(ais_store.store) == 0

    def test_no_active_bridge_returns_409(self, client):
        # The sidecar's expected idle response between sessions.
        settings.decoder_ingest_secret = "s"
        resp = client.post(
            "/api/sdr/ais/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "s"},
        )
        assert resp.status_code == 409

    def test_position_lands_in_the_shared_vessel_store(self, client):
        settings.decoder_ingest_secret = "s"
        _register_ais_bridge()
        resp = client.post(
            "/api/sdr/ais/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "s"},
        )
        assert resp.status_code == 200
        vessel = ais_store.store.get("227006760")
        assert vessel is not None
        assert vessel["lat"] == pytest.approx(49.475577)

    def test_event_is_relayed_to_websocket_subscribers(self, client):
        settings.decoder_ingest_secret = "s"
        bridge = _register_ais_bridge()
        queue = bridge.subscribe_events()
        queue.get_nowait()  # drop the seeded status frame
        client.post(
            "/api/sdr/ais/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "s"},
        )
        event = queue.get_nowait()
        assert event["type"] == "ais"
        assert event["mmsi"] == "227006760"

    def test_a_raw_log_line_is_relayed_but_stores_no_vessel(self, client):
        settings.decoder_ingest_secret = "s"
        bridge = _register_ais_bridge()
        queue = bridge.subscribe_events()
        queue.get_nowait()
        resp = client.post(
            "/api/sdr/ais/ingest",
            json={"event": {"type": "log", "line": "[A] !AIVDM,1,1,,A,xxxx,0*00"}},
            headers={"X-Decode-Secret": "s"},
        )
        assert resp.status_code == 200
        assert queue.get_nowait()["type"] == "log"
        assert len(ais_store.store) == 0


# ── GET /api/sdr/ais/config ───────────────────────────────────────────────────


class TestAisDecodeConfig:
    def test_disabled_when_secret_unresolvable(self, client, monkeypatch):
        monkeypatch.setattr(sdr_decode, "resolve_ingest_secret", lambda: "")
        resp = client.get("/api/sdr/ais/config", headers={"X-Decode-Secret": "x"})
        assert resp.status_code == 503

    def test_bad_secret_rejected(self, client):
        settings.decoder_ingest_secret = "right"
        resp = client.get("/api/sdr/ais/config", headers={"X-Decode-Secret": "wrong"})
        assert resp.status_code == 401

    def test_inactive_when_no_bridge_is_serving_pcm(self, client):
        settings.decoder_ingest_secret = "s"
        resp = client.get("/api/sdr/ais/config", headers={"X-Decode-Secret": "s"})
        assert resp.json() == {"active": False}

    def test_active_only_once_the_bridge_is_running(self, client):
        # The sidecar gates on this: launching Direwolf with no PCM listener
        # just fails to connect and floods ingest with rejected startup output.
        settings.decoder_ingest_secret = "s"
        bridge = _register_ais_bridge()
        assert (
            client.get("/api/sdr/ais/config", headers={"X-Decode-Secret": "s"}).json()[
                "active"
            ]
            is False
        )
        bridge._running = True
        assert (
            client.get("/api/sdr/ais/config", headers={"X-Decode-Secret": "s"}).json()[
                "active"
            ]
            is True
        )


# ── resume_persisted_ais / reconcile_ais_decode ───────────────────────────────


class TestResumePersistedAis:
    async def test_no_op_when_no_radio_was_persisted(self, client):
        await sdr_router.resume_persisted_ais()
        assert sdr_decode._ais_bridges == {}

    async def test_missing_radio_is_skipped_without_raising(self, client, monkeypatch):
        # The radio was deleted since it was chosen; a failed resume must never
        # block application startup.
        client.put("/api/settings/sdr/ais_radio_id", json={"value": 999})
        await sdr_router.resume_persisted_ais()
        assert sdr_decode._ais_bridges == {}

    async def test_starts_the_persisted_radio(self, client, monkeypatch):
        radio_id = _add_radio(client)
        client.put("/api/settings/sdr/ais_radio_id", json={"value": radio_id})
        bridge = MagicMock()
        bridge.start = AsyncMock()
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(return_value=_FakeBroadcaster()),
        )
        monkeypatch.setattr(
            sdr_decode, "get_or_create_ais_bridge", AsyncMock(return_value=bridge)
        )
        await sdr_router.resume_persisted_ais()
        bridge.start.assert_awaited_once()

    async def test_unreachable_dongle_is_logged_and_skipped(self, client, monkeypatch):
        radio_id = _add_radio(client)
        client.put("/api/settings/sdr/ais_radio_id", json={"value": radio_id})
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(side_effect=ConnectionError("no dongle")),
        )
        await sdr_router.resume_persisted_ais()  # must not raise
        assert sdr_decode._ais_bridges == {}


class TestReconcileAisDecode:
    async def _session(self) -> AsyncSession:
        """A session on the same in-memory engine the requests use."""
        return backend_database.AsyncSessionLocal()

    async def test_moves_decode_to_the_new_radio(self, client, monkeypatch):
        previous_id = _add_radio(client, host="h1", port=1234)
        next_id = _add_radio(client, host="h2", port=5678)
        stopped = AsyncMock()
        bridge = MagicMock()
        bridge.start = AsyncMock()
        monkeypatch.setattr(sdr_decode, "stop_ais_bridge", stopped)
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(return_value=_FakeBroadcaster()),
        )
        monkeypatch.setattr(
            sdr_decode, "get_or_create_ais_bridge", AsyncMock(return_value=bridge)
        )
        async with await self._session() as db:
            await sdr_router.reconcile_ais_decode(db, previous_id, next_id)
        stopped.assert_awaited_once_with("h1", 1234)
        bridge.start.assert_awaited_once()

    async def test_a_non_int_radio_id_means_no_radio(self, client, monkeypatch):
        stopped = AsyncMock()
        monkeypatch.setattr(sdr_decode, "stop_ais_bridge", stopped)
        async with await self._session() as db:
            await sdr_router.reconcile_ais_decode(db, None, None)
        stopped.assert_not_awaited()
        assert sdr_decode._ais_bridges == {}
