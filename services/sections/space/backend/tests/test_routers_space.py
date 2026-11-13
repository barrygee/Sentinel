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
        assert set(body.keys()) == {
            "total",
            "uncategorised",
            "by_source",
            "by_category",
        }
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
            params={
                "lat": 51.5,
                "lon": 0.0,
                "hours": 24,
                "min_el": 30,
                "categories": "weather",
            },
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


# ── Domain URL resolution → fetch_tle (offgrid fallback pass-through) ────────


class TestDomainUrlsReachFetchTle:
    """The space domain's offgrid fallback URL must reach fetch_tle.

    All three TLE-backed endpoints resolve (primary, fallback) for the domain;
    dropping the fallback silently disables the configured offgrid mirror
    whenever the primary feed is unreachable.
    """

    PRIMARY_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
    FALLBACK_URL = "http://192.168.1.50/tle/active.txt"
    NOAA_20_TLE = (
        "NOAA 20\n"
        "1 43013U 17073A   24001.50000000  .00000073  00000-0  52843-4 0  9993\n"
        "2 43013  98.7234 100.0000 0001000  90.0000 270.0000 14.19554400320000\n"
    )

    def _capture_fetch_tle_urls(self, monkeypatch) -> list[tuple]:
        """Stub resolve_domain_urls + fetch_tle; return the list capturing URL args."""
        from sentinel_space import router as space_router

        captured: list[tuple] = []

        async def fake_resolve(domain, db, online_default=None):
            return self.PRIMARY_URL, self.FALLBACK_URL

        async def fake_fetch_tle(norad_id, db, online_url=None, offline_url=None):
            captured.append((online_url, offline_url))
            return self.NOAA_20_TLE

        monkeypatch.setattr(space_router, "resolve_domain_urls", fake_resolve)
        monkeypatch.setattr(space_router.tle_service, "fetch_tle", fake_fetch_tle)
        return captured

    def test_satellite_position_passes_both_urls(self, client, monkeypatch):
        from sentinel_space import router as space_router

        captured = self._capture_fetch_tle_urls(monkeypatch)
        # Bypass the empty-database guard so the request reaches fetch_tle.
        monkeypatch.setattr(space_router, "_tle_database_is_empty", lambda db: _false())

        resp = client.get("/api/space/satellite/43013")

        assert resp.status_code == 200
        assert captured == [(self.PRIMARY_URL, self.FALLBACK_URL)]

    def test_satellite_passes_endpoint_passes_both_urls(self, client, monkeypatch):
        captured = self._capture_fetch_tle_urls(monkeypatch)

        resp = client.get("/api/space/satellite/43013/passes", params={"lat": 51.5, "lon": 0.0})

        assert resp.status_code == 200
        assert captured == [(self.PRIMARY_URL, self.FALLBACK_URL)]

    def test_multi_satellite_passes_endpoint_passes_both_urls(self, client, monkeypatch):
        from backend.database import get_db

        from sentinel_space.models import SatelliteCatalogue

        captured = self._capture_fetch_tle_urls(monkeypatch)

        # One catalogue row so the endpoint gets past its "no satellites" short-circuit.
        async def _seed():
            async for session in client.app.dependency_overrides[get_db]():
                session.add(
                    SatelliteCatalogue(
                        norad_id="43013",
                        name="NOAA 20",
                        category="weather",
                        updated_at=0,
                    )
                )
                await session.commit()
                break

        _run(_seed())

        resp = client.get(
            "/api/space/passes",
            params={"lat": 51.5, "lon": 0.0, "categories": "weather"},
        )

        assert resp.status_code == 200
        assert captured == [(self.PRIMARY_URL, self.FALLBACK_URL)]


async def _false() -> bool:
    """Awaitable False — stands in for the async _tle_database_is_empty guard."""
    return False


def _run(coro):
    """Run a coroutine from a sync test body."""
    import asyncio

    return asyncio.run(coro)


# ── POST /api/space/tle/fetch ────────────────────────────────────────────────


class TestTleFetchFromUrl:
    """Input checks, and that no failure echoes the exception or the upstream body."""

    FEED_URL = "http://192.168.1.50/tle/active.txt"
    # Stands in for whatever an internal address might answer; must never reach the caller.
    UPSTREAM_SECRET = "redis-password-hunter2"

    def _stub_fetch(self, monkeypatch, outcome):
        """Make the service's fetch return `outcome`'s counts, or raise it if it is an exception."""
        from sentinel_space import router as space_router

        calls: list[tuple] = []

        async def fake_fetch_tle_from_url(url, category, category_source, db):
            calls.append((url, category, category_source))
            if isinstance(outcome, BaseException):
                raise outcome
            return outcome

        monkeypatch.setattr(space_router.tle_service, "fetch_tle_from_url", fake_fetch_tle_from_url)
        return calls

    def test_success_returns_counts_and_passes_the_trimmed_url(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 3, "updated": 1})
        resp = client.post("/api/space/tle/fetch", json={"url": f"  {self.FEED_URL} ", "category": "weather"})
        assert resp.status_code == 200
        assert resp.json() == {"inserted": 3, "updated": 1}
        assert calls == [(self.FEED_URL, "weather", "celestrak_group")]

    def test_active_or_missing_category_uses_active_priority(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        client.post("/api/space/tle/fetch", json={"url": self.FEED_URL, "category": "active"})
        client.post("/api/space/tle/fetch", json={"url": self.FEED_URL})
        assert calls == [(self.FEED_URL, "active", "active"), (self.FEED_URL, None, "active")]

    # Input checks happen before any fetch.

    def test_missing_url_is_400(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        resp = client.post("/api/space/tle/fetch", json={})
        assert resp.status_code == 400
        assert resp.json() == {"error": "url is required"}
        assert calls == []

    def test_blank_url_is_400(self, client, monkeypatch):
        self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        resp = client.post("/api/space/tle/fetch", json={"url": "   "})
        assert resp.status_code == 400
        assert resp.json() == {"error": "url is required"}

    def test_non_string_url_is_400_not_500(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        resp = client.post("/api/space/tle/fetch", json={"url": 12345})
        assert resp.status_code == 400
        assert resp.json() == {"error": "url must be a string"}
        assert calls == []

    def test_url_at_the_length_limit_is_accepted(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        prefix = "http://192.168.1.50/"
        url = prefix + "a" * (2048 - len(prefix))
        resp = client.post("/api/space/tle/fetch", json={"url": url})
        assert resp.status_code == 200
        assert calls == [(url, None, "active")]

    def test_url_over_the_length_limit_is_400(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        prefix = "http://192.168.1.50/"
        resp = client.post("/api/space/tle/fetch", json={"url": prefix + "a" * (2049 - len(prefix))})
        assert resp.status_code == 400
        assert resp.json() == {"error": "url is too long"}
        assert calls == []

    def test_url_without_scheme_or_host_is_400(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        resp = client.post("/api/space/tle/fetch", json={"url": "celestrak.org/tle.txt"})
        assert resp.status_code == 400
        assert resp.json() == {"error": "Invalid URL"}
        assert calls == []

    def test_unknown_category_is_400(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        resp = client.post("/api/space/tle/fetch", json={"url": self.FEED_URL, "category": "spy"})
        assert resp.status_code == 400
        assert resp.json()["error"].startswith("Invalid category.")
        assert calls == []

    def test_non_string_category_is_400_not_500(self, client, monkeypatch):
        calls = self._stub_fetch(monkeypatch, {"inserted": 0, "updated": 0})
        resp = client.post("/api/space/tle/fetch", json={"url": self.FEED_URL, "category": ["weather"]})
        assert resp.status_code == 400
        assert resp.json()["error"].startswith("Invalid category.")
        assert calls == []

    # Each failure maps to a fixed message.

    def test_refused_destination_is_400_with_the_reason(self, client, monkeypatch):
        from backend.platform.outbound_http import OutboundUrlRefused

        self._stub_fetch(monkeypatch, OutboundUrlRefused("that address is not allowed as a data source"))
        resp = client.post("/api/space/tle/fetch", json={"url": "http://127.0.0.1:8000/internal/registry"})
        assert resp.status_code == 400
        assert resp.json() == {
            "error": "This URL can't be used as a TLE source: that address is not allowed as a data source."
        }

    def test_invalid_tle_is_422_without_quoting_the_body(self, client, monkeypatch):
        self._stub_fetch(monkeypatch, ValueError(f"bad line: {self.UPSTREAM_SECRET}"))
        resp = client.post("/api/space/tle/fetch", json={"url": self.FEED_URL})
        assert resp.status_code == 422
        assert resp.json() == {"error": "The URL did not return valid TLE data."}
        assert self.UPSTREAM_SECRET not in resp.text

    def test_oversize_response_is_502_naming_the_limit(self, client, monkeypatch):
        from backend.platform.outbound_http import UpstreamResponseTooLarge

        self._stub_fetch(monkeypatch, UpstreamResponseTooLarge("response is 99999999999 bytes"))
        resp = client.post("/api/space/tle/fetch", json={"url": self.FEED_URL})
        assert resp.status_code == 502
        assert resp.json() == {"error": "The TLE source sent more than 16 MiB."}

    def test_http_error_is_502_with_only_the_status_code(self, client, monkeypatch):
        import httpx

        request = httpx.Request("GET", self.FEED_URL)
        response = httpx.Response(403, text=self.UPSTREAM_SECRET, request=request)
        self._stub_fetch(monkeypatch, httpx.HTTPStatusError(self.UPSTREAM_SECRET, request=request, response=response))
        resp = client.post("/api/space/tle/fetch", json={"url": self.FEED_URL})
        assert resp.status_code == 502
        assert resp.json() == {"error": "The TLE source answered HTTP 403."}
        assert self.UPSTREAM_SECRET not in resp.text

    def test_transport_error_is_502_generic_and_logged(self, client, monkeypatch, caplog):
        import httpx

        self._stub_fetch(monkeypatch, httpx.ConnectError(f"refused by {self.UPSTREAM_SECRET}"))
        with caplog.at_level("WARNING", logger="sentinel_space.router"):
            resp = client.post("/api/space/tle/fetch", json={"url": self.FEED_URL})
        assert resp.status_code == 502
        assert resp.json() == {"error": "Could not reach the TLE source."}
        assert self.UPSTREAM_SECRET not in resp.text
        # The detail goes to the operator's log instead.
        assert any(
            self.FEED_URL in record.getMessage() and "ConnectError" in record.getMessage() for record in caplog.records
        )

    def test_unresolvable_host_is_502_generic(self, client, monkeypatch):
        from backend.platform.outbound_http import UpstreamUnreachable

        self._stub_fetch(monkeypatch, UpstreamUnreachable("mirror.lan does not resolve"))
        resp = client.post("/api/space/tle/fetch", json={"url": "http://mirror.lan/tle.txt"})
        assert resp.status_code == 502
        assert resp.json() == {"error": "Could not reach the TLE source."}

    def test_unexpected_error_is_502_generic_and_logged(self, client, monkeypatch, caplog):
        self._stub_fetch(monkeypatch, RuntimeError(self.UPSTREAM_SECRET))
        with caplog.at_level("ERROR", logger="sentinel_space.router"):
            resp = client.post("/api/space/tle/fetch", json={"url": self.FEED_URL})
        assert resp.status_code == 502
        assert resp.json() == {"error": "Fetching the TLE source failed."}
        assert self.UPSTREAM_SECRET not in resp.text
        assert any(record.exc_info for record in caplog.records)


class TestUnexpectedErrorsStayInTheLog:
    """An unexpected exception's text can name paths, hosts or SQL: the client gets a fixed message."""

    LEAK = "sqlite3.OperationalError: /data/space.db is locked"

    def _explode(self, *args, **kwargs):
        raise OSError(self.LEAK)

    def test_satellite_lookup(self, client, monkeypatch, caplog):
        from sentinel_space import router as space_router

        monkeypatch.setattr(space_router, "_tle_database_is_empty", self._async_explode)

        with caplog.at_level("ERROR"):
            response = client.get("/api/space/satellite/25544")

        assert response.status_code == 500
        assert response.json() == {"error": "Unexpected error"}
        assert self.LEAK not in response.text
        assert self.LEAK in caplog.text

    def test_terminator(self, client, monkeypatch, caplog):
        from sentinel_space import router as space_router

        monkeypatch.setattr(space_router.dn_service, "compute_terminator", self._explode)

        with caplog.at_level("ERROR"):
            response = client.get("/api/space/daynight")

        assert response.status_code == 500
        assert response.json() == {"error": "Terminator computation failed"}
        assert self.LEAK in caplog.text

    def test_storing_pasted_tles(self, client, monkeypatch, caplog):
        from sentinel_space import router as space_router

        monkeypatch.setattr(space_router.tle_service, "validate_tle_text", lambda text: [object()])
        monkeypatch.setattr(space_router.tle_service, "store_tle_bulk", self._async_explode)

        with caplog.at_level("ERROR"):
            response = client.post("/api/space/tle/manual", json={"text": "ISS\n1 x\n2 y"})

        assert response.status_code == 500
        assert response.json() == {"error": "Store failed"}
        assert self.LEAK not in response.text
        assert self.LEAK in caplog.text

    async def _async_explode(self, *args, **kwargs):
        raise OSError(self.LEAK)
