"""Characterization tests for the SDR router REST endpoints.

WebSocket endpoints (`/ws/sdr/...`) are not covered here — those require an
active rtl_tcp connection and live IQ data. They'll be tested separately
during Phase 2C when the router is split.
"""

from __future__ import annotations

from backend.config import settings
from backend.services import sdr_channel_maps


# ── Radios CRUD (stored as a settings.sdr.radios JSON blob) ──────────────────


class TestRadiosCRUD:
    def test_list_empty(self, client):
        resp = client.get("/api/sdr/radios")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_assigns_id_and_created_at(self, client):
        resp = client.post(
            "/api/sdr/radios",
            json={"name": "TestRadio", "host": "192.168.1.10"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert isinstance(body["id"], int)
        assert isinstance(body["created_at"], int)
        assert body["name"] == "TestRadio"
        assert body["host"] == "192.168.1.10"
        assert body["port"] == 1234  # default
        assert body["enabled"] is True  # default

    def test_create_then_list(self, client):
        client.post("/api/sdr/radios", json={"name": "A", "host": "h1"})
        client.post("/api/sdr/radios", json={"name": "B", "host": "h2"})
        radios = client.get("/api/sdr/radios").json()
        assert len(radios) == 2
        ids = [r["id"] for r in radios]
        assert len(set(ids)) == 2  # unique ids

    def test_update_radio(self, client):
        created = client.post(
            "/api/sdr/radios", json={"name": "A", "host": "h1"}
        ).json()
        resp = client.put(
            f"/api/sdr/radios/{created['id']}",
            json={"name": "renamed", "host": "h1"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "renamed"

    def test_update_unknown_returns_404(self, client):
        resp = client.put("/api/sdr/radios/999", json={"name": "x", "host": "y"})
        assert resp.status_code == 404

    def test_delete_radio_returns_204(self, client):
        created = client.post(
            "/api/sdr/radios", json={"name": "A", "host": "h1"}
        ).json()
        resp = client.delete(f"/api/sdr/radios/{created['id']}")
        assert resp.status_code == 204
        assert client.get("/api/sdr/radios").json() == []

    def test_delete_unknown_returns_404(self, client):
        resp = client.delete("/api/sdr/radios/999")
        assert resp.status_code == 404


# ── Groups CRUD ───────────────────────────────────────────────────────────────


class TestGroupsCRUD:
    def test_list_empty(self, client):
        assert client.get("/api/sdr/groups").json() == []

    def test_create_returns_201(self, client):
        resp = client.post("/api/sdr/groups", json={"name": "G1"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "G1"
        assert body["color"] == "#c8ff00"  # default
        assert body["sort_order"] == 0

    def test_update_unknown_returns_404(self, client):
        resp = client.put("/api/sdr/groups/999", json={"name": "x"})
        assert resp.status_code == 404

    def test_delete_unknown_returns_404(self, client):
        resp = client.delete("/api/sdr/groups/999")
        assert resp.status_code == 404

    def test_create_then_delete(self, client):
        created = client.post("/api/sdr/groups", json={"name": "G1"}).json()
        resp = client.delete(f"/api/sdr/groups/{created['id']}")
        assert resp.status_code == 204

    def test_slug_derived_from_name(self, client):
        body = client.post(
            "/api/sdr/groups", json={"name": "Air to Air Refueling"}
        ).json()
        assert body["slug"] == "air-to-air-refueling"

    def test_slug_uniquified_on_collision(self, client):
        a = client.post("/api/sdr/groups", json={"name": "Marine"}).json()
        b = client.post("/api/sdr/groups", json={"name": "Marine"}).json()
        assert a["slug"] == "marine"
        assert b["slug"] == "marine-2"

    def test_slug_stable_across_rename(self, client):
        g = client.post("/api/sdr/groups", json={"name": "Old Name"}).json()
        renamed = client.put(
            f"/api/sdr/groups/{g['id']}", json={"name": "New Name"}
        ).json()
        assert renamed["name"] == "New Name"
        assert renamed["slug"] == g["slug"] == "old-name"

    def test_slug_latin_accents_folded(self, client):
        body = client.post("/api/sdr/groups", json={"name": "Café Naïve"}).json()
        assert body["slug"] == "cafe-naive"

    def test_slug_preserves_non_latin_scripts(self, client):
        cyr = client.post("/api/sdr/groups", json={"name": "Москва радио"}).json()
        cjk = client.post("/api/sdr/groups", json={"name": "東京タワー"}).json()
        assert cyr["slug"] == "москва-радио"
        assert cjk["slug"] == "東京タワー"

    def test_name_rejected_empty(self, client):
        assert client.post("/api/sdr/groups", json={"name": "   "}).status_code == 422

    def test_name_rejected_too_long(self, client):
        resp = client.post("/api/sdr/groups", json={"name": "x" * 61})
        assert resp.status_code == 422

    def test_name_control_chars_stripped(self, client):
        # Null byte + zero-width space + bidi override are removed; the
        # surrounding text and slug stay clean.
        body = client.post(
            "/api/sdr/groups",
            json={"name": "Ma\x00ri​ne‮"},
        ).json()
        assert body["name"] == "Marine"
        assert body["slug"] == "marine"

    def test_name_internal_whitespace_collapsed(self, client):
        body = client.post(
            "/api/sdr/groups", json={"name": "  Air\t\tto   Air \n Refuel  "}
        ).json()
        assert body["name"] == "Air to Air Refuel"
        assert body["slug"] == "air-to-air-refuel"


# ── Frequencies CRUD ─────────────────────────────────────────────────────────


class TestFrequenciesCRUD:
    def test_list_empty(self, client):
        assert client.get("/api/sdr/frequencies").json() == []

    def test_create_returns_201(self, client):
        resp = client.post(
            "/api/sdr/frequencies",
            json={"label": "BBC R4", "frequency_hz": 93_500_000, "mode": "WFM"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["label"] == "BBC R4"
        assert body["frequency_hz"] == 93_500_000
        assert body["mode"] == "WFM"

    def test_create_persists_per_frequency_settings(self, client):
        resp = client.post(
            "/api/sdr/frequencies",
            json={
                "label": "Tower",
                "frequency_hz": 119_700_000,
                "mode": "AM",
                "squelch": -45.0,
                "gain": 28.0,
                "bandwidth": 8000,
                "sample_rate": 1_024_000,
                "volume": 55,
                "zoom": 2.5,
                "zmin": -80.0,
                "zmax": -10.0,
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["squelch"] == -45.0
        assert body["gain"] == 28.0
        assert body["bandwidth"] == 8000
        assert body["sample_rate"] == 1_024_000
        assert body["volume"] == 55
        assert body["zoom"] == 2.5
        assert body["zmin"] == -80.0
        assert body["zmax"] == -10.0

    def test_create_applies_setting_defaults(self, client):
        body = client.post(
            "/api/sdr/frequencies",
            json={"label": "X", "frequency_hz": 1_000_000, "mode": "AM"},
        ).json()
        # bandwidth/sample_rate are nullable (fall back at tune time); the rest
        # carry concrete defaults.
        assert body["bandwidth"] is None
        assert body["sample_rate"] is None
        assert body["volume"] == 80
        assert body["zoom"] == 1.0
        assert body["zmin"] == 0.0
        assert body["zmax"] == 0.0

    def test_update_per_frequency_settings(self, client):
        created = client.post(
            "/api/sdr/frequencies",
            json={"label": "X", "frequency_hz": 1_000_000, "mode": "AM"},
        ).json()
        resp = client.put(
            f"/api/sdr/frequencies/{created['id']}",
            json={
                "label": "X",
                "frequency_hz": 1_000_000,
                "mode": "AM",
                "bandwidth": 12_500,
                "sample_rate": 1_536_000,
                "volume": 40,
                "zoom": 3.0,
                "zmin": -90.0,
                "zmax": -5.0,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["bandwidth"] == 12_500
        assert body["sample_rate"] == 1_536_000
        assert body["volume"] == 40
        assert body["zoom"] == 3.0
        assert body["zmin"] == -90.0
        assert body["zmax"] == -5.0

    def test_settings_mirrored_into_config_namespace(self, client):
        # create_frequency write-throughs into UserSettings (sdr.frequencies); the
        # mirror must carry the new per-frequency settings, not just label/mode.
        client.post(
            "/api/sdr/frequencies",
            json={
                "label": "Tower",
                "frequency_hz": 119_700_000,
                "mode": "AM",
                "bandwidth": 8000,
                "sample_rate": 1_024_000,
                "volume": 55,
                "zoom": 2.0,
                "zmin": -70.0,
                "zmax": -10.0,
            },
        )
        freqs = client.get("/api/settings/sdr").json()["frequencies"]
        assert len(freqs) == 1
        entry = freqs[0]
        assert entry["bandwidth"] == 8000
        assert entry["sample_rate"] == 1_024_000
        assert entry["volume"] == 55
        assert entry["zoom"] == 2.0
        assert entry["zmin"] == -70.0
        assert entry["zmax"] == -10.0

    def test_update_unknown_returns_404(self, client):
        resp = client.put(
            "/api/sdr/frequencies/999",
            json={"label": "X", "frequency_hz": 1, "mode": "AM"},
        )
        assert resp.status_code == 404

    def test_delete_unknown_returns_404(self, client):
        resp = client.delete("/api/sdr/frequencies/999")
        assert resp.status_code == 404


# ── Recordings (DB-only — file-system paths not exercised) ───────────────────


class TestRecordingsList:
    def test_list_empty_returns_empty_list(self, client):
        resp = client.get("/api/sdr/recordings")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_unknown_file_returns_404(self, client):
        resp = client.get("/api/sdr/recordings/999/file")
        assert resp.status_code == 404


# ── Trunk channel maps (JSON in DB ↔ CSV files for dsd-fme) ───────────────────


class TestChannelMapsData:
    def test_get_empty_when_nothing_stored_or_on_disk(
        self, client, tmp_path, monkeypatch
    ):
        monkeypatch.setattr(settings, "channel_maps_dir", str(tmp_path / "absent"))
        resp = client.get("/api/sdr/data/channel-maps")
        assert resp.status_code == 200
        assert resp.json() == {"channel_maps": []}

    def test_get_seeds_from_existing_csv_when_db_unset(
        self, client, tmp_path, monkeypatch
    ):
        monkeypatch.setattr(settings, "channel_maps_dir", str(tmp_path))
        (tmp_path / "site.csv").write_text(
            sdr_channel_maps.CHANNEL_MAP_HEADER + "\n1,858606250\n"
        )
        resp = client.get("/api/sdr/data/channel-maps")
        assert resp.status_code == 200
        assert resp.json() == {
            "channel_maps": [
                {"name": "site", "channels": [{"lsn": 1, "frequency_hz": 858606250}]}
            ]
        }

    def test_post_stores_in_db_and_writes_csv(self, client, tmp_path, monkeypatch):
        maps_dir = tmp_path / "maps"
        monkeypatch.setattr(settings, "channel_maps_dir", str(maps_dir))
        payload = {
            "channel_maps": [
                {"name": "my-dmr", "channels": [{"lsn": 1, "frequency_hz": 858606250}]}
            ]
        }
        resp = client.post("/api/sdr/data/channel-maps", json=payload)
        assert resp.status_code == 200
        # CSV rendered for dsd-fme...
        assert (maps_dir / "my-dmr.csv").read_text() == (
            sdr_channel_maps.CHANNEL_MAP_HEADER + "\n1,858606250\n"
        )
        # ...and the DB is now the source of truth on the next GET.
        assert client.get("/api/sdr/data/channel-maps").json() == {
            "channel_maps": payload["channel_maps"]
        }

    def test_post_invalid_payload_returns_400(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "channel_maps_dir", str(tmp_path))
        resp = client.post(
            "/api/sdr/data/channel-maps",
            json={"channel_maps": [{"name": "../x", "channels": []}]},
        )
        assert resp.status_code == 400
        assert "invalid channel-map name" in resp.json()["detail"]
