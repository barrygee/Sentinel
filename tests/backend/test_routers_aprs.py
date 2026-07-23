"""
tests/backend/test_routers_aprs.py

Tests for the APRS decode HTTP surface:

    POST /api/sdr/aprs/start | stop      — background APRS decode lifecycle
    GET  /api/sdr/aprs/status/{id}       — is APRS decode running / reachable
    POST /api/sdr/aprs/ingest            — Direwolf sidecar → backend packets
    GET  /api/sdr/aprs/config            — active gate for the sidecar
    GET  /api/land/aprs/stations         — station snapshot the Land map polls
    resume_persisted_aprs()              — startup resume of the saved radio

The APRS store's own DB access uses AsyncSessionLocal directly, so it is
redirected at the per-test in-memory engine (shared with the request DB) to keep
ingest→store→land end-to-end in-memory.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as backend_database
from backend.config import settings
from backend.routers import sdr as sdr_router
from backend.services import aprs_store, sdr_decode
from backend.services import sdr as sdr_svc
from backend.services.sdr_decode import AprsDecodeBridge


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
    original_secret = settings.decoder_ingest_secret
    yield
    sdr_decode._bridges.clear()
    sdr_decode._aprs_bridges.clear()
    settings.decoder_ingest_secret = original_secret
    sdr_decode._ingest_secret = None


@pytest.fixture(autouse=True)
def _patch_store_db(test_engine, monkeypatch):
    """Point the store's (and resume's) AsyncSessionLocal at the test engine so
    ingest writes and land reads hit the same in-memory DB the requests use."""
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(aprs_store, "AsyncSessionLocal", factory)
    monkeypatch.setattr(backend_database, "AsyncSessionLocal", factory)


def _add_radio(client, host="h1", port=1234) -> int:
    created = client.post(
        "/api/sdr/radios", json={"name": "Test", "host": host, "port": port}
    ).json()
    return created["id"]


def _register_aprs_bridge(host="h1", port=1234) -> AprsDecodeBridge:
    bridge = AprsDecodeBridge(_FakeBroadcaster(), pcm_port=0)
    sdr_decode._aprs_bridges[f"{host}:{port}"] = bridge
    return bridge


def _position_event() -> dict:
    return {
        "type": "aprs",
        "from": "M0ABC-9",
        "latitude": 51.5,
        "longitude": -0.1,
        "symbol": "/>",
        "comment": "rolling",
        "raw": "M0ABC-9>APRS:!5130.00N/00006.00W>",
    }


# ── POST /api/sdr/aprs/start ──────────────────────────────────────────────────


class TestAprsStart:
    def test_unknown_radio_returns_404(self, client):
        resp = client.post("/api/sdr/aprs/start", json={"radio_id": 999})
        assert resp.status_code == 404

    def test_connect_failure_returns_502(self, client, monkeypatch):
        radio_id = _add_radio(client)
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(side_effect=ConnectionError("no dongle")),
        )
        resp = client.post("/api/sdr/aprs/start", json={"radio_id": radio_id})
        assert resp.status_code == 502

    def test_success_starts_bridge_and_persists(self, client, monkeypatch):
        radio_id = _add_radio(client)
        bridge = MagicMock()
        bridge.start = AsyncMock()
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(return_value=_FakeBroadcaster()),
        )
        monkeypatch.setattr(
            sdr_decode, "get_or_create_aprs_bridge", AsyncMock(return_value=bridge)
        )

        resp = client.post(
            "/api/sdr/aprs/start",
            json={"radio_id": radio_id, "offset_hz": 100, "bw_hz": 15000},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok", "radio_id": radio_id, "active": True}
        bridge.start.assert_awaited_once_with(offset_hz=100, bw_hz=15000)
        # The enabled radio is persisted so it resumes on restart.
        settings_dump = client.get("/api/settings/sdr").json()
        assert settings_dump["aprs_radio_id"] == radio_id

    def test_zero_bandwidth_passes_none(self, client, monkeypatch):
        radio_id = _add_radio(client)
        bridge = MagicMock()
        bridge.start = AsyncMock()
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(return_value=_FakeBroadcaster()),
        )
        monkeypatch.setattr(
            sdr_decode, "get_or_create_aprs_bridge", AsyncMock(return_value=bridge)
        )
        client.post("/api/sdr/aprs/start", json={"radio_id": radio_id})
        bridge.start.assert_awaited_once_with(offset_hz=0, bw_hz=None)


# ── POST /api/sdr/aprs/stop ───────────────────────────────────────────────────


class TestAprsStop:
    def test_unknown_radio_returns_404(self, client):
        resp = client.post("/api/sdr/aprs/stop", json={"radio_id": 999})
        assert resp.status_code == 404

    def test_success_stops_and_clears_persisted(self, client, monkeypatch):
        radio_id = _add_radio(client)
        stop_mock = AsyncMock()
        monkeypatch.setattr(sdr_decode, "stop_aprs_bridge", stop_mock)
        resp = client.post("/api/sdr/aprs/stop", json={"radio_id": radio_id})
        assert resp.status_code == 200
        assert resp.json()["active"] is False
        stop_mock.assert_awaited_once_with("h1", 1234)
        # Persisted radio cleared to None.
        settings_dump = client.get("/api/settings/sdr").json()
        assert settings_dump["aprs_radio_id"] is None


# ── GET /api/sdr/aprs/status/{id} ─────────────────────────────────────────────


class TestAprsStatus:
    def test_unknown_radio_returns_404(self, client):
        assert client.get("/api/sdr/aprs/status/999").status_code == 404

    def test_no_bridge_reports_inactive(self, client):
        radio_id = _add_radio(client)
        body = client.get(f"/api/sdr/aprs/status/{radio_id}").json()
        assert body == {
            "radio_id": radio_id,
            "active": False,
            "decoder_reachable": False,
        }

    def test_running_bridge_reports_active(self, client):
        radio_id = _add_radio(client)
        bridge = _register_aprs_bridge("h1", 1234)
        bridge._running = True
        bridge._decoder_connected = True
        body = client.get(f"/api/sdr/aprs/status/{radio_id}").json()
        assert body["active"] is True
        assert body["decoder_reachable"] is True


# ── POST /api/sdr/aprs/ingest ─────────────────────────────────────────────────


class TestAprsIngest:
    def test_disabled_when_secret_unresolvable(self, client, monkeypatch):
        monkeypatch.setattr(sdr_decode, "resolve_ingest_secret", lambda: "")
        resp = client.post(
            "/api/sdr/aprs/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "x"},
        )
        assert resp.status_code == 503

    def test_bad_secret_rejected(self, client):
        settings.decoder_ingest_secret = "right"
        resp = client.post(
            "/api/sdr/aprs/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "wrong"},
        )
        assert resp.status_code == 401

    def test_no_active_bridge_returns_409(self, client):
        settings.decoder_ingest_secret = "s"
        resp = client.post(
            "/api/sdr/aprs/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "s"},
        )
        assert resp.status_code == 409

    def test_position_event_relayed_and_stored(self, client):
        settings.decoder_ingest_secret = "s"
        bridge = _register_aprs_bridge()
        queue = bridge.subscribe_events()
        queue.get_nowait()  # drop seeded status frame

        resp = client.post(
            "/api/sdr/aprs/ingest",
            json={"event": _position_event()},
            headers={"X-Decode-Secret": "s"},
        )
        assert resp.status_code == 200
        # Relayed to the panel WS subscribers, defaulted to type "aprs".
        event = queue.get_nowait()
        assert event["type"] == "aprs"
        assert event["from"] == "M0ABC-9"
        # Persisted for the Land map.
        stations = client.get("/api/land/aprs/stations").json()["stations"]
        assert [s["callsign"] for s in stations] == ["M0ABC-9"]

    def test_log_event_relayed_but_not_stored(self, client):
        settings.decoder_ingest_secret = "s"
        bridge = _register_aprs_bridge()
        queue = bridge.subscribe_events()
        queue.get_nowait()

        resp = client.post(
            "/api/sdr/aprs/ingest",
            json={"event": {"type": "log", "line": "M0ABC-9>APRS:..."}},
            headers={"X-Decode-Secret": "s"},
        )
        assert resp.status_code == 200
        event = queue.get_nowait()
        assert event["type"] == "log"  # the sidecar's own type is preserved
        # A log line carries no position, so no station is stored.
        assert client.get("/api/land/aprs/stations").json()["stations"] == []


# ── GET /api/sdr/aprs/config ──────────────────────────────────────────────────


class TestAprsConfig:
    def test_disabled_when_secret_unresolvable(self, client, monkeypatch):
        monkeypatch.setattr(sdr_decode, "resolve_ingest_secret", lambda: "")
        assert (
            client.get(
                "/api/sdr/aprs/config", headers={"X-Decode-Secret": "x"}
            ).status_code
            == 503
        )

    def test_bad_secret_rejected(self, client):
        settings.decoder_ingest_secret = "right"
        assert (
            client.get(
                "/api/sdr/aprs/config", headers={"X-Decode-Secret": "no"}
            ).status_code
            == 401
        )

    def test_reports_inactive_without_bridge(self, client):
        settings.decoder_ingest_secret = "s"
        body = client.get(
            "/api/sdr/aprs/config", headers={"X-Decode-Secret": "s"}
        ).json()
        assert body == {"active": False}

    def test_reports_active_with_running_bridge(self, client):
        settings.decoder_ingest_secret = "s"
        bridge = _register_aprs_bridge()
        bridge._running = True
        body = client.get(
            "/api/sdr/aprs/config", headers={"X-Decode-Secret": "s"}
        ).json()
        assert body == {"active": True}


# ── GET /api/land/aprs/stations ───────────────────────────────────────────────


class TestLandStations:
    def test_empty_when_nothing_heard(self, client):
        assert client.get("/api/land/aprs/stations").json() == {"stations": []}


# ── resume_persisted_aprs ─────────────────────────────────────────────────────


class TestResumePersistedAprs:
    async def test_noop_when_nothing_persisted(self, client):
        # No aprs_radio_id setting → nothing to resume.
        await sdr_router.resume_persisted_aprs()
        assert sdr_decode.get_active_aprs_bridge() is None

    async def test_skips_missing_radio(self, client):
        client.put("/api/settings/sdr/aprs_radio_id", json={"value": 4242})
        await sdr_router.resume_persisted_aprs()
        assert sdr_decode.get_active_aprs_bridge() is None

    async def test_resumes_saved_radio(self, client, monkeypatch):
        radio_id = _add_radio(client)
        client.put("/api/settings/sdr/aprs_radio_id", json={"value": radio_id})
        bridge = MagicMock()
        bridge.start = AsyncMock()
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(return_value=_FakeBroadcaster()),
        )
        monkeypatch.setattr(
            sdr_decode, "get_or_create_aprs_bridge", AsyncMock(return_value=bridge)
        )
        await sdr_router.resume_persisted_aprs()
        bridge.start.assert_awaited_once()

    async def test_connect_failure_is_swallowed(self, client, monkeypatch):
        radio_id = _add_radio(client)
        client.put("/api/settings/sdr/aprs_radio_id", json={"value": radio_id})
        monkeypatch.setattr(
            sdr_svc,
            "get_or_create_broadcaster",
            AsyncMock(side_effect=ConnectionError("no dongle")),
        )
        # Must not raise — a failed resume never blocks startup.
        await sdr_router.resume_persisted_aprs()
        assert sdr_decode.get_active_aprs_bridge() is None
