"""Characterization tests for the SDR router REST endpoints.

WebSocket endpoints (`/ws/sdr/...`) are not covered here — those require an
active rtl_tcp connection and live IQ data. They'll be tested separately
during Phase 2C when the router is split.
"""
from __future__ import annotations


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
        assert body["port"] == 1234        # default
        assert body["enabled"] is True     # default

    def test_create_then_list(self, client):
        client.post("/api/sdr/radios", json={"name": "A", "host": "h1"})
        client.post("/api/sdr/radios", json={"name": "B", "host": "h2"})
        radios = client.get("/api/sdr/radios").json()
        assert len(radios) == 2
        ids = [r["id"] for r in radios]
        assert len(set(ids)) == 2  # unique ids

    def test_update_radio(self, client):
        created = client.post("/api/sdr/radios", json={"name": "A", "host": "h1"}).json()
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
        created = client.post("/api/sdr/radios", json={"name": "A", "host": "h1"}).json()
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
