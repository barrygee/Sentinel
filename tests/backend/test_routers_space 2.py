"""Characterization tests for the space router.

Focused on the DB-only endpoints (TLE management, daynight, /tle/list, etc.).
The /iss, /satellite/{n}, and /passes endpoints require real TLE data and
SGP4 propagation; their error paths are still exercised here.
"""
from __future__ import annotations


# ── /api/space/daynight ──────────────────────────────────────────────────────

class TestDaynight:
    def test_returns_geojson_feature(self, client):
        resp = client.get("/api/space/daynight")
        assert resp.status_code == 200
        body = resp.json()
        # Pin the GeoJSON shape — Feature with a geometry block
        assert body.get("type") == "Feature"
        assert "geometry" in body


# ── /api/space/tle/status ────────────────────────────────────────────────────

class TestTleStatus:
    def test_empty_database_shape(self, client):
        resp = client.get("/api/space/tle/status")
        assert resp.status_code == 200
        body = resp.json()
        assert set(body.keys()) == {"total", "uncategorised", "by_source", "by_category"}
        assert body["total"] == 0
        assert body["uncategorised"] == 0
        assert body["by_source"] == {}
        assert body["by_category"] == {}


# ── /api/space/tle/list ──────────────────────────────────────────────────────

class TestTleList:
    def test_empty_returns_empty_satellites(self, client):
        resp = client.get("/api/space/tle/list")
        assert resp.status_code == 200
        assert resp.json() == {"satellites": []}


# ── /api/space/tle/uncategorised ─────────────────────────────────────────────

class TestTleUncategorised:
    def test_empty_returns_empty_satellites(self, client):
        resp = client.get("/api/space/tle/uncategorised")
        assert resp.status_code == 200
        assert resp.json() == {"satellites": []}


# ── /api/space/iss (without TLE data) ────────────────────────────────────────

class TestIssNoTle:
    def test_returns_error_when_no_tle(self, client):
        # No TLE seeded → propagation can't run. Current contract:
        # error response with status code 503 (RuntimeError) or 500 (Exception).
        resp = client.get("/api/space/iss")
        assert resp.status_code in (500, 503)


# ── /api/space/satellite/{n} (without TLE data) ──────────────────────────────

class TestSatelliteByIdNoTle:
    def test_unknown_norad_id_returns_error(self, client):
        resp = client.get("/api/space/satellite/99999")
        assert resp.status_code in (500, 503)


# ── /api/space/passes (without location or TLE) ──────────────────────────────

class TestPasses:
    def test_missing_required_query_returns_422(self, client):
        # lat/lon are required query params; their absence is a Pydantic
        # validation error → FastAPI returns 422.
        resp = client.get("/api/space/passes")
        assert resp.status_code == 422

    def test_no_tle_seeded_returns_error_not_500_explosion(self, client):
        resp = client.get(
            "/api/space/passes",
            params={"lat": 51.5, "lon": 0.0, "hours": 24, "min_el": 30, "categories": "weather"},
        )
        # Pin: the no-TLE path must return a JSON response (not raise) at 200/500/503.
        assert resp.status_code in (200, 500, 503)
        assert resp.headers["content-type"].startswith("application/json")


# ── /api/space/tle (DELETE — wipe all) ───────────────────────────────────────

class TestTleDelete:
    def test_without_confirm_returns_400(self, client):
        # Safety: deleting all TLE data requires ?confirm=true.
        resp = client.delete("/api/space/tle")
        assert resp.status_code == 400
        assert "error" in resp.json()

    def test_with_confirm_returns_cleared(self, client):
        resp = client.delete("/api/space/tle", params={"confirm": "true"})
        assert resp.status_code == 200
        assert resp.json() == {"cleared": True}
