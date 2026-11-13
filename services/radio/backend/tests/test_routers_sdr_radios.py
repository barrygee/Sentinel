"""Characterization tests for the radio hub's radio CRUD endpoints (`/api/sdr/radios`).

Split out of the SDR section's router tests when that section moved into
services/sections/sdr/backend: the radios are the hub's.
"""

from __future__ import annotations

import pytest

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
        created = client.post("/api/sdr/radios", json={"name": "A", "host": "h1"}).json()
        resp = client.put(
            f"/api/sdr/radios/{created['id']}",
            json={"name": "renamed", "host": "h1"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "renamed"

    def test_a_position_is_stored_so_maps_can_show_the_radio(self, client):
        created = client.post(
            "/api/sdr/radios", json={"name": "Shed", "host": "10.0.0.9", "latitude": 54.95, "longitude": -1.53}
        ).json()

        assert (created["latitude"], created["longitude"]) == (54.95, -1.53)
        [listed] = client.get("/api/sdr/radios").json()
        assert (listed["latitude"], listed["longitude"]) == (54.95, -1.53)

    def test_a_radio_without_a_position_has_none(self, client):
        created = client.post("/api/sdr/radios", json={"name": "Shed", "host": "10.0.0.9"}).json()

        assert created["latitude"] is None
        assert created["longitude"] is None

    @pytest.mark.parametrize(
        "position",
        [
            pytest.param({"latitude": 54.95}, id="latitude-only"),
            pytest.param({"longitude": -1.53}, id="longitude-only"),
            pytest.param({"latitude": 90.5, "longitude": 0}, id="latitude-out-of-range"),
            pytest.param({"latitude": 0, "longitude": -180.5}, id="longitude-out-of-range"),
        ],
    )
    def test_half_a_position_or_one_off_the_globe_is_refused(self, client, position):
        response = client.post("/api/sdr/radios", json={"name": "Shed", "host": "10.0.0.9", **position})

        assert response.status_code == 422
        assert client.get("/api/sdr/radios").json() == []

    def test_an_edit_that_leaves_the_position_out_keeps_it(self, client):
        """Saving gain or a mirror sync sends no position, and must not wipe the operator's."""
        created = client.post(
            "/api/sdr/radios", json={"name": "Shed", "host": "10.0.0.9", "latitude": 54.95, "longitude": -1.53}
        ).json()

        updated = client.put(
            f"/api/sdr/radios/{created['id']}", json={"name": "Shed", "host": "10.0.0.9", "rf_gain": 20.0}
        ).json()

        assert (updated["latitude"], updated["longitude"]) == (54.95, -1.53)
        assert updated["rf_gain"] == 20.0

    def test_an_edit_that_sends_no_position_clears_it(self, client):
        created = client.post(
            "/api/sdr/radios", json={"name": "Shed", "host": "10.0.0.9", "latitude": 54.95, "longitude": -1.53}
        ).json()

        updated = client.put(
            f"/api/sdr/radios/{created['id']}",
            json={"name": "Shed", "host": "10.0.0.9", "latitude": None, "longitude": None},
        ).json()

        assert updated["latitude"] is None
        assert updated["longitude"] is None

    def test_an_edit_can_move_it(self, client):
        created = client.post(
            "/api/sdr/radios", json={"name": "Shed", "host": "10.0.0.9", "latitude": 54.95, "longitude": -1.53}
        ).json()

        updated = client.put(
            f"/api/sdr/radios/{created['id']}",
            json={"name": "Shed", "host": "10.0.0.9", "latitude": 51.5, "longitude": -0.12},
        ).json()

        assert (updated["latitude"], updated["longitude"]) == (51.5, -0.12)

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
