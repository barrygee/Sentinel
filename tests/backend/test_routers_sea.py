"""
tests/backend/test_routers_sea.py

The Sea HTTP surface:

    GET    /api/sea/vessels               — snapshot + feed status, bbox/max_rows validation
    GET    /api/sea/vessels/{mmsi}/track  — 400 / 404 / 200
    GET    /api/sea/status                — feed health
    GET/PUT/DELETE /api/sea/ais-key       — key status / save / forget, validation

plus the generic settings router's handling of the AIS key as a secret
(redacted on read, refused on write, skipped on config upload) and the
startup seeder no longer purging the Sea source keys.
"""

import io
import json

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as backend_database
from backend.config import settings
from backend.services import ais_store, ais_stream

KEY = "abcdefgh12345678"


@pytest.fixture(autouse=True)
def _fresh_store(monkeypatch):
    """Every test gets an empty store and a reader whose ensure() is a no-op
    (the watchdog would otherwise read the DB and try to connect)."""
    store = ais_store.AisVesselStore()
    monkeypatch.setattr(ais_store, "store", store)
    reader = ais_stream.AisStreamReader(store, clock=lambda: 1_000_000)

    async def ensure():
        return reader.status

    reader.ensure = ensure
    monkeypatch.setattr(ais_stream, "reader", reader)
    from backend.routers import sea as sea_router

    monkeypatch.setattr(sea_router, "reader", reader)
    monkeypatch.setattr(settings, "aisstream_api_key", "")
    return store


def _ingest(store, mmsi="232012345", lat=51.07, lon=1.42, at=1_000_000):
    store.ingest_envelope(
        {
            "MessageType": "PositionReport",
            "MetaData": {
                "MMSI": mmsi,
                "ShipName": "PRIDE OF KENT",
                "latitude": lat,
                "longitude": lon,
                "time_utc": "2026-09-12 08:41:03 +0000 UTC",
            },
            "Message": {"PositionReport": {"Sog": 18.4, "Cog": 122.0}},
        },
        at,
    )


# ── /vessels ──────────────────────────────────────────────────────────────────


class TestVessels:
    def test_snapshot_carries_feed_status_and_cache_header(self, client, _fresh_store):
        _ingest(_fresh_store)
        response = client.get("/api/sea/vessels")
        assert response.status_code == 200
        assert response.headers["x-cache"] == "STALE"  # reader never went live
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert [row["mmsi"] for row in body["vessels"]] == ["232012345"]
        assert body["status"] == "disabled" and body["vesselCount"] == 1

    def test_live_reader_marks_the_snapshot_live(self, client, _fresh_store):
        ais_stream.reader.status = "live"
        assert client.get("/api/sea/vessels").headers["x-cache"] == "LIVE"

    def test_bbox_and_max_rows_limit_the_rows(self, client, _fresh_store):
        _ingest(_fresh_store, mmsi="232000001", lat=51, lon=1, at=1)
        _ingest(_fresh_store, mmsi="232000002", lat=52, lon=1, at=2)
        _ingest(_fresh_store, mmsi="232000003", lat=60, lon=1, at=3)
        body = client.get(
            "/api/sea/vessels", params={"bbox": "50,0,53,2", "max_rows": 1}
        ).json()
        assert [row["mmsi"] for row in body["vessels"]] == ["232000002"]
        assert (
            client.get("/api/sea/vessels", params={"bbox": " "}).json()["vessels"]
            is not None
        )

    @pytest.mark.parametrize(
        "bbox", ["1,2,3", "a,b,c,d", "95,0,96,1", "10,0,5,1", "0,-181,1,0"]
    )
    def test_malformed_bbox_is_400(self, client, bbox):
        assert client.get("/api/sea/vessels", params={"bbox": bbox}).status_code == 400

    @pytest.mark.parametrize("max_rows", [0, 50_001, "x"])
    def test_max_rows_out_of_range_is_422(self, client, max_rows):
        assert (
            client.get("/api/sea/vessels", params={"max_rows": max_rows}).status_code
            == 422
        )


# ── /vessels/{mmsi}/track ─────────────────────────────────────────────────────


class TestTrack:
    def test_track_of_known_vessel(self, client, _fresh_store):
        _ingest(_fresh_store)
        body = client.get("/api/sea/vessels/232012345/track").json()
        assert body["mmsi"] == "232012345" and body["vessel"]["name"] == "PRIDE OF KENT"
        assert body["samples"] == [{"lat": 51.07, "lon": 1.42, "t": 1789202463}]

    def test_unknown_vessel_is_404(self, client):
        assert client.get("/api/sea/vessels/232012345/track").status_code == 404

    @pytest.mark.parametrize("mmsi", ["abc", "1234", "12345678901", "232012345%27"])
    def test_invalid_mmsi_is_400(self, client, mmsi):
        assert client.get(f"/api/sea/vessels/{mmsi}/track").status_code == 400


# ── /status ───────────────────────────────────────────────────────────────────


def test_status_reports_the_reader_snapshot(client):
    body = client.get("/api/sea/status").json()
    assert body["source"] == "AISStream" and body["status"] == "disabled"
    assert body["staleAfterMs"] == settings.sea_ais_silence_report_ms


# ── /ais-key ──────────────────────────────────────────────────────────────────


class TestAisKey:
    def test_unconfigured(self, client):
        assert client.get("/api/sea/ais-key").json() == {
            "configured": False,
            "source": None,
            "fingerprint": None,
        }

    def test_env_key_is_reported_without_revealing_it(self, client, monkeypatch):
        monkeypatch.setattr(settings, "aisstream_api_key", KEY)
        body = client.get("/api/sea/ais-key").json()
        assert body["configured"] is True and body["source"] == "env"
        assert body["fingerprint"] == ais_stream.key_fingerprint(KEY)
        assert KEY not in json.dumps(body)

    def test_save_forget_round_trip(self, client, monkeypatch):
        monkeypatch.setattr(settings, "aisstream_api_key", KEY)
        saved = client.put("/api/sea/ais-key", json={"key": f"  {KEY}x  "})
        assert saved.status_code == 200 and saved.json()[
            "fingerprint"
        ] == ais_stream.key_fingerprint(f"{KEY}x")
        body = client.get("/api/sea/ais-key").json()
        assert body["source"] == "settings" and body[
            "fingerprint"
        ] == ais_stream.key_fingerprint(f"{KEY}x")
        # The generic settings API never shows it.
        assert "aisstreamApiKey" not in client.get("/api/settings/sea").json()
        assert "aisstreamApiKey" not in client.get("/api/settings").json().get(
            "sea", {}
        )
        assert client.delete("/api/sea/ais-key").status_code == 200
        assert client.get("/api/sea/ais-key").json()["source"] == "env"
        assert client.delete("/api/sea/ais-key").status_code == 200  # idempotent

    @pytest.mark.parametrize(
        "key", ["short", "x" * 129, "has spaces here", "bad$chars!!!"]
    )
    def test_invalid_keys_are_rejected(self, client, key):
        assert client.put("/api/sea/ais-key", json={"key": key}).status_code == 422
        assert client.get("/api/sea/ais-key").json()["configured"] is False

    def test_generic_settings_api_refuses_the_secret(self, client):
        response = client.put("/api/settings/sea/aisstreamApiKey", json={"value": KEY})
        assert response.status_code == 400
        assert client.get("/api/sea/ais-key").json()["configured"] is False

    def test_config_upload_cannot_wipe_or_set_the_secret(self, client):
        client.put("/api/sea/ais-key", json={"key": KEY})
        config = {"sea": {"aisstreamApiKey": "", "enabled": True}}
        upload = client.post(
            "/api/settings/config/upload",
            files={
                "file": (
                    "config.json",
                    io.BytesIO(json.dumps(config).encode()),
                    "application/json",
                )
            },
        )
        assert upload.status_code == 200
        assert client.get("/api/sea/ais-key").json()["source"] == "settings"
        assert client.get("/api/settings/sea").json()["enabled"] is True


# ── seeder ────────────────────────────────────────────────────────────────────


async def test_seeder_keeps_the_sea_source_keys(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(backend_database, "AsyncSessionLocal", factory)
    await backend_database.seed_default_settings()
    await backend_database.seed_default_settings()  # a restart must not purge them
    from backend.db_helpers import get_setting

    async with factory() as db:
        assert await get_setting(db, "sea", "onlineUrl") == settings.aisstream_ws_url
        assert await get_setting(db, "sea", "offgridSource") == {"url": ""}
        assert await get_setting(db, "sea", "aisBoundingBoxes") == [
            [[-90, -180], [90, 180]]
        ]


# ── Off-grid source (SDR AIS decode) ──────────────────────────────────────────


class TestOffgridFeedSelection:
    """Off grid, Sea reads the SDR decode bridge instead of AISStream.

    The single most important behaviour here is the NEGATIVE one: the online
    upstream must not be dialled at all. Off grid there is no internet to reach
    AISStream on, and an attempt burns the reconnect back-off ladder and logs
    hourly auth probes for a key that cannot be used.
    """

    @pytest.fixture(autouse=True)
    def _clear_ais_bridges(self):
        from backend.services import sdr_decode

        sdr_decode._ais_bridges.clear()
        yield
        sdr_decode._ais_bridges.clear()

    def _go_offgrid(self, client):
        client.put("/api/settings/app/connectivityMode", json={"value": "offgrid"})

    def _register_bridge(self, *, running=True, on_channel=True, reachable=True):
        import asyncio

        from backend.services import sdr_decode

        class _FakeBroadcaster:
            def subscribe_iq(self):
                return asyncio.Queue()

            def unsubscribe_iq(self, queue):
                pass

        bridge = sdr_decode.AisDecodeBridge(_FakeBroadcaster(), pcm_port=0)
        bridge._running = running
        bridge._on_channel = on_channel
        bridge._decoder_connected = reachable
        sdr_decode._ais_bridges["h1:1234"] = bridge
        return bridge

    def test_online_mode_still_reports_the_upstream(self, client):
        body = client.get("/api/sea/status").json()
        assert body["mode"] == "online"

    def test_offgrid_never_touches_the_aisstream_reader(self, client, monkeypatch):
        from backend.routers import sea as sea_router

        called = {"ensure": 0}

        async def _ensure():
            called["ensure"] += 1
            return "live"

        monkeypatch.setattr(sea_router.reader, "ensure", _ensure)
        self._go_offgrid(client)
        self._register_bridge()
        client.get("/api/sea/status")
        client.get("/api/sea/vessels")
        assert called["ensure"] == 0

    def test_online_mode_does_nudge_the_reader(self, client, monkeypatch):
        # The mirror of the test above: when online, the snapshot must still
        # wake the watchdog so a reconnect doesn't wait for the background tick.
        from backend.routers import sea as sea_router

        called = {"ensure": 0}

        async def _ensure():
            called["ensure"] += 1
            return "live"

        monkeypatch.setattr(sea_router.reader, "ensure", _ensure)
        client.get("/api/sea/vessels")
        assert called["ensure"] == 1

    def test_offgrid_reports_no_source_without_a_receiver(self, client):
        # Nothing can ever arrive until a radio is designated — the one state
        # the operator can act on.
        self._go_offgrid(client)
        body = client.get("/api/sea/status").json()
        assert body["mode"] == "offgrid"
        assert body["status"] == "no-source"
        assert body["error"]

    def test_offgrid_reports_live_when_decoding_on_channel(self, client):
        self._go_offgrid(client)
        self._register_bridge()
        body = client.get("/api/sea/status").json()
        assert body["status"] == "live"
        assert body["error"] is None
        assert body["onChannel"] is True
        assert body["decoderReachable"] is True
        assert body["channelAHz"] == settings.ais_channel_a_hz
        assert body["channelBHz"] == settings.ais_channel_b_hz

    def test_offgrid_reports_down_when_the_sidecar_is_absent(self, client):
        # The bridge is serving PCM but no decoder container has connected.
        self._go_offgrid(client)
        self._register_bridge(reachable=False)
        body = client.get("/api/sea/status").json()
        assert body["status"] == "down"

    def test_offgrid_reports_stale_when_tuned_off_channel(self, client):
        # Deliberately NOT "live": the radio has been moved off 162 MHz, so
        # only silence reaches Direwolf and the picture is going stale.
        self._go_offgrid(client)
        self._register_bridge(on_channel=False)
        body = client.get("/api/sea/status").json()
        assert body["status"] == "stale"

    def test_offgrid_snapshot_keeps_the_common_feed_shape(self, client):
        # Both sources must report one contract, or the store's SeaFeedInfo
        # silently loses fields depending on which one is live.
        self._go_offgrid(client)
        self._register_bridge()
        body = client.get("/api/sea/vessels").json()
        for field in (
            "status",
            "mode",
            "error",
            "source",
            "lastMessageAt",
            "silentForMs",
            "reconnectAttempt",
            "nextAttemptAt",
            "newestPositionAt",
            "vesselCount",
        ):
            assert field in body, field

    def test_offgrid_serves_vessels_from_the_shared_store(self, client, _fresh_store):
        # Decoded vessels are read back through the same endpoint as online ones.
        self._go_offgrid(client)
        self._register_bridge()
        _ingest(_fresh_store)
        body = client.get("/api/sea/vessels").json()
        assert [vessel["mmsi"] for vessel in body["vessels"]] == ["232012345"]
        assert body["vesselCount"] == 1

    def test_a_sea_source_override_beats_the_global_mode(self, client, monkeypatch):
        # Global online, but SEA pinned off grid: the domain override wins, so
        # the reader must still not be dialled.
        from backend.routers import sea as sea_router

        called = {"ensure": 0}

        async def _ensure():
            called["ensure"] += 1
            return "live"

        monkeypatch.setattr(sea_router.reader, "ensure", _ensure)
        client.put("/api/settings/app/connectivityMode", json={"value": "online"})
        client.put("/api/settings/sea/sourceOverride", json={"value": "offgrid"})
        body = client.get("/api/sea/status").json()
        assert body["mode"] == "offgrid"
        assert called["ensure"] == 0

    def test_an_online_override_beats_a_global_offgrid_mode(self, client):
        self._go_offgrid(client)
        client.put("/api/settings/sea/sourceOverride", json={"value": "online"})
        assert client.get("/api/sea/status").json()["mode"] == "online"

    def test_offgrid_cache_header_is_stale_until_decode_is_live(self, client):
        self._go_offgrid(client)
        assert client.get("/api/sea/vessels").headers["X-Cache"] == "STALE"
        self._register_bridge()
        assert client.get("/api/sea/vessels").headers["X-Cache"] == "LIVE"
