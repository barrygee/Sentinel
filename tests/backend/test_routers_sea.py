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
