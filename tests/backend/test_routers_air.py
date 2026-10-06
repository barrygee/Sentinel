"""Characterization tests for the air router (excluding the ADS-B upstream
proxy, which hits external HTTP)."""

from __future__ import annotations

import logging

import httpx

from backend.config import settings
from backend.routers import air as air_router
from backend.services import adsb as adsb_service
from backend.services.upstream_rate_limit import UpstreamThrottledError

# ── /api/air/messages ─────────────────────────────────────────────────────────


class TestAirMessages:
    def test_list_empty(self, client):
        resp = client.get("/api/air/messages")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_returns_201(self, client):
        body = {
            "msg_id": "m1",
            "type": "flight",
            "title": "X",
            "detail": "Y",
            "ts": 100,
        }
        resp = client.post("/api/air/messages", json=body)
        assert resp.status_code == 201
        assert resp.json() == {"status": "created"}

    def test_create_is_idempotent_by_msg_id(self, client):
        body = {"msg_id": "m1", "type": "flight", "title": "X", "ts": 1}
        client.post("/api/air/messages", json=body)
        # Second create with same msg_id returns 200 'exists'
        resp = client.post("/api/air/messages", json=body)
        assert resp.status_code == 200
        assert resp.json() == {"status": "exists"}

    def test_list_returns_newest_first(self, client):
        for i, ts in enumerate([100, 300, 200]):
            client.post(
                "/api/air/messages",
                json={"msg_id": f"m{i}", "type": "flight", "title": str(i), "ts": ts},
            )
        msgs = client.get("/api/air/messages").json()
        assert [m["ts"] for m in msgs] == [300, 200, 100]

    def test_list_omits_dismissed_flag(self, client):
        client.post(
            "/api/air/messages",
            json={"msg_id": "m1", "type": "flight", "title": "X", "ts": 1},
        )
        msg = client.get("/api/air/messages").json()[0]
        assert set(msg.keys()) == {"msg_id", "type", "title", "detail", "ts", "hex"}

    def test_create_stores_the_subject_aircraft(self, client):
        client.post(
            "/api/air/messages",
            json={"msg_id": "m1", "type": "emergency", "title": "X", "ts": 1, "hex": "4ca123"},
        )
        assert client.get("/api/air/messages").json()[0]["hex"] == "4ca123"

    def test_hex_defaults_to_null(self, client):
        client.post("/api/air/messages", json={"msg_id": "m1", "type": "flight", "title": "X", "ts": 1})
        assert client.get("/api/air/messages").json()[0]["hex"] is None

    def test_dismiss_unknown_is_idempotent(self, client):
        # The endpoint is intentionally idempotent: dismissing a missing
        # message returns 200 {"status": "absent"}, not 404 (see docstring).
        resp = client.delete("/api/air/messages/does_not_exist")
        assert resp.status_code == 200
        assert resp.json() == {"status": "absent"}

    def test_dismiss_hides_from_list(self, client):
        client.post(
            "/api/air/messages",
            json={"msg_id": "m1", "type": "flight", "title": "X", "ts": 1},
        )
        resp = client.delete("/api/air/messages/m1")
        assert resp.status_code == 200
        assert resp.json() == {"status": "dismissed"}
        assert client.get("/api/air/messages").json() == []

    def test_dismiss_all_clears_list(self, client):
        for i in range(3):
            client.post(
                "/api/air/messages",
                json={"msg_id": f"m{i}", "type": "flight", "title": "X", "ts": i},
            )
        resp = client.delete("/api/air/messages")
        assert resp.status_code == 200
        assert resp.json() == {"status": "cleared"}
        assert client.get("/api/air/messages").json() == []


# ── /api/air/tracking ─────────────────────────────────────────────────────────


class TestAirTracking:
    def test_list_empty(self, client):
        resp = client.get("/api/air/tracking")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_returns_201(self, client):
        resp = client.post(
            "/api/air/tracking",
            json={"hex": "abc123", "callsign": "TEST", "follow": False},
        )
        assert resp.status_code == 201
        assert resp.json() == {"status": "created"}

    def test_add_persists_fields(self, client):
        client.post(
            "/api/air/tracking",
            json={"hex": "abc123", "callsign": "TEST", "follow": True},
        )
        rows = client.get("/api/air/tracking").json()
        assert len(rows) == 1
        assert rows[0]["hex"] == "abc123"
        assert rows[0]["callsign"] == "TEST"
        assert rows[0]["follow"] is True
        assert isinstance(rows[0]["added_at"], int)

    def test_add_existing_returns_200_updated(self, client):
        client.post("/api/air/tracking", json={"hex": "abc123", "callsign": "A"})
        resp = client.post(
            "/api/air/tracking",
            json={"hex": "abc123", "callsign": "B", "follow": True},
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "updated"}
        row = client.get("/api/air/tracking").json()[0]
        assert row["callsign"] == "B"
        assert row["follow"] is True

    def test_remove_existing(self, client):
        client.post("/api/air/tracking", json={"hex": "abc123"})
        resp = client.delete("/api/air/tracking/abc123")
        assert resp.status_code == 200
        assert resp.json() == {"status": "removed"}
        assert client.get("/api/air/tracking").json() == []

    def test_remove_unknown_returns_200(self, client):
        # API contract: deleting an unknown hex is idempotent — still returns "removed".
        resp = client.delete("/api/air/tracking/never_existed")
        assert resp.status_code == 200
        assert resp.json() == {"status": "removed"}


# ── /api/air/adsb/point — upstream failure handling ───────────────────────────


class TestAdsbUpstreamFailover:
    """The source loop's failure branches, which decide what an outage looks like.

    These mock `fetch_aircraft` rather than hitting the network, so unlike the
    rest of the proxy they are safe to run offline.

    The regression that motivated them: airplanes.live closed its v2 API behind
    an auth key, and the resulting 403 was indistinguishable from "no aircraft
    overhead" — it fell through to the offgrid source and returned its empty
    list with no log line naming the real cause.
    """

    ONLINE = "https://online.example/v2"
    OFFGRID = "http://offgrid.example/data/aircraft.json"
    POINT = "/api/air/adsb/point/54.0/-1.5/100"

    def _configure_sources(self, client):
        """Give the router both an online and an offgrid source to fail over between."""
        client.put("/api/settings/air/onlineDataSourceURL", json={"value": self.ONLINE})
        client.put(
            "/api/settings/air/offgridDataSourceURL",
            json={"value": {"url": self.OFFGRID}},
        )

    @staticmethod
    def _status_error(status_code: int) -> httpx.HTTPStatusError:
        request = httpx.Request("GET", "https://online.example/v2/point/54.0/-1.5/100")
        response = httpx.Response(status_code, request=request)
        return httpx.HTTPStatusError("boom", request=request, response=response)

    @staticmethod
    def _air_warnings(caplog) -> str:
        """Only this router's warnings — caplog also collects httpx's INFO chatter."""
        return "\n".join(
            record.getMessage()
            for record in caplog.records
            if record.name == "backend.routers.air"
            and record.levelno >= logging.WARNING
        )

    def _patch_fetch(self, monkeypatch, behaviour):
        """Replace the upstream fetch with `behaviour(base_url)`, recording calls."""
        calls: list[str] = []

        async def fake_fetch(lat, lon, radius, base_url):
            calls.append(base_url)
            return behaviour(base_url)

        monkeypatch.setattr(adsb_service, "fetch_aircraft", fake_fetch)
        return calls

    def test_403_falls_through_to_offgrid_and_warns(self, client, monkeypatch, caplog):
        """An auth failure must not masquerade as an empty sky."""
        self._configure_sources(client)
        payload = {"ac": [{"hex": "abc123"}], "total": 1}

        def behaviour(base_url):
            if base_url == self.ONLINE:
                raise self._status_error(403)
            return payload

        calls = self._patch_fetch(monkeypatch, behaviour)

        with caplog.at_level(logging.WARNING, logger="backend.routers.air"):
            resp = client.get(self.POINT)

        # Failed over rather than surfacing the error to the client.
        assert resp.status_code == 200
        assert resp.json() == payload
        assert resp.headers["X-Cache"] == "MISS"
        # Both sources were tried, online first.
        assert calls == [self.ONLINE, self.OFFGRID]
        # ...and the 403 named itself, with host and status.
        warnings = self._air_warnings(caplog)
        assert "online.example" in warnings
        assert "403" in warnings

    def test_429_does_not_log_the_status_warning(self, client, monkeypatch, caplog):
        """429 is an expected, self-correcting condition — it has its own path."""
        self._configure_sources(client)

        def behaviour(base_url):
            raise self._status_error(429)

        self._patch_fetch(monkeypatch, behaviour)

        with caplog.at_level(logging.WARNING, logger="backend.routers.air"):
            resp = client.get(self.POINT)

        # No cached row exists, so an all-sources failure is a 503.
        assert resp.status_code == 503
        # The "returned HTTP" warning belongs to the non-429 branch only.
        assert "returned HTTP" not in self._air_warnings(caplog)

    def test_transport_error_warns_with_exception_name(
        self, client, monkeypatch, caplog
    ):
        """An unreachable host is the other way this silently produced a blank map."""
        self._configure_sources(client)

        def behaviour(base_url):
            raise httpx.ConnectError("no route to host")

        self._patch_fetch(monkeypatch, behaviour)

        with caplog.at_level(logging.WARNING, logger="backend.routers.air"):
            resp = client.get(self.POINT)

        assert resp.status_code == 503
        warnings = self._air_warnings(caplog)
        assert "unreachable" in warnings
        assert "ConnectError" in warnings
        # Both sources are named, so a two-source outage is fully diagnosable.
        assert "online.example" in warnings
        assert "offgrid.example" in warnings

    def test_successful_primary_short_circuits_and_stays_quiet(
        self, client, monkeypatch, caplog
    ):
        """The happy path must not touch the fallback or log anything."""
        self._configure_sources(client)
        payload = {"ac": [], "total": 0}
        calls = self._patch_fetch(monkeypatch, lambda base_url: payload)

        with caplog.at_level(logging.WARNING, logger="backend.routers.air"):
            resp = client.get(self.POINT)

        assert resp.status_code == 200
        assert calls == [self.ONLINE]
        assert self._air_warnings(caplog) == ""


# ── /api/air/adsb/point — borrowing the nearest cached row ────────────────────


class TestAdsbNearbyCacheFallback:
    """A fetch that cannot happen for a brand-new point borrows a nearby cached row.

    The query point follows the map centre, so every pan lands on a cache key
    with no row. Before this fallback, a locally throttled or rate-limited fetch
    for such a key answered 503 — a console error on every pan — even though
    aircraft for a point a few miles away were sitting in the cache.
    """

    ONLINE = "https://online.example/v2"
    OFFGRID = "http://offgrid.example/data/aircraft.json"
    # Radius 100 nm, so a row may stand in when its centre is within 50 nm.
    RADIUS = 100

    @classmethod
    def _point(cls, lat: float, lon: float, radius: int | None = None) -> str:
        return f"/api/air/adsb/point/{lat}/{lon}/{radius or cls.RADIUS}"

    def _configure_sources(self, client):
        client.put("/api/settings/air/onlineDataSourceURL", json={"value": self.ONLINE})
        client.put(
            "/api/settings/air/offgridDataSourceURL",
            json={"value": {"url": self.OFFGRID}},
        )

    def _prime(self, client, monkeypatch, lat, lon, payload, radius=None):
        """Cache `payload` for (lat, lon) through a successful upstream fetch."""

        async def succeeding_fetch(fetch_lat, fetch_lon, fetch_radius, base_url):
            return payload

        monkeypatch.setattr(adsb_service, "fetch_aircraft", succeeding_fetch)
        resp = client.get(self._point(lat, lon, radius))
        assert resp.headers["X-Cache"] == "MISS"

    @staticmethod
    def _fail_every_fetch(monkeypatch, error: Exception):
        async def failing_fetch(fetch_lat, fetch_lon, fetch_radius, base_url):
            raise error

        monkeypatch.setattr(adsb_service, "fetch_aircraft", failing_fetch)

    @staticmethod
    def _rate_limited() -> httpx.HTTPStatusError:
        request = httpx.Request("GET", "https://online.example/v2/point")
        response = httpx.Response(429, request=request)
        return httpx.HTTPStatusError("slow down", request=request, response=response)

    def test_throttled_fetch_serves_the_nearby_row(self, client, monkeypatch):
        self._configure_sources(client)
        payload = {"ac": [{"hex": "abc123"}], "total": 1}
        self._prime(client, monkeypatch, 54.0, -1.5, payload)
        self._fail_every_fetch(monkeypatch, UpstreamThrottledError())

        resp = client.get(self._point(54.3, -1.5))

        assert resp.status_code == 200
        assert resp.headers["X-Cache"] == "NEARBY"
        assert resp.json() == payload

    def test_rate_limited_fetch_serves_the_nearby_row(self, client, monkeypatch):
        self._configure_sources(client)
        payload = {"ac": [{"hex": "def456"}], "total": 1}
        self._prime(client, monkeypatch, 54.0, -1.5, payload)
        self._fail_every_fetch(monkeypatch, self._rate_limited())

        resp = client.get(self._point(54.3, -1.5))

        assert resp.status_code == 200
        assert resp.headers["X-Cache"] == "NEARBY"

    def test_unreachable_upstream_serves_the_nearby_row(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime(client, monkeypatch, 54.0, -1.5, {"ac": [], "total": 0})
        self._fail_every_fetch(monkeypatch, httpx.ConnectError("no route to host"))

        resp = client.get(self._point(54.3, -1.5))

        assert resp.headers["X-Cache"] == "NEARBY"

    def test_the_closest_of_several_rows_wins(self, client, monkeypatch):
        self._configure_sources(client)
        # The far row is inserted first, so returning it would mean the query
        # fell back to insertion order instead of ordering by distance.
        self._prime(client, monkeypatch, 54.6, -1.5, {"ac": [{"hex": "far"}]})
        self._prime(client, monkeypatch, 54.1, -1.5, {"ac": [{"hex": "near"}]})
        self._fail_every_fetch(monkeypatch, UpstreamThrottledError())

        resp = client.get(self._point(54.0, -1.5))

        assert resp.json() == {"ac": [{"hex": "near"}]}

    def test_a_row_just_inside_half_the_radius_is_used(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime(client, monkeypatch, 54.0, -1.5, {"ac": []})
        self._fail_every_fetch(monkeypatch, UpstreamThrottledError())

        # 0.8 degrees of latitude = 48 nm, under the 50 nm limit.
        resp = client.get(self._point(54.8, -1.5))

        assert resp.status_code == 200
        assert resp.headers["X-Cache"] == "NEARBY"

    def test_a_row_just_beyond_half_the_radius_is_not_used(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime(client, monkeypatch, 54.0, -1.5, {"ac": []})
        self._fail_every_fetch(monkeypatch, UpstreamThrottledError())

        # 0.9 degrees of latitude = 54 nm, over the 50 nm limit.
        resp = client.get(self._point(54.9, -1.5))

        assert resp.status_code == 503

    def test_longitude_is_scaled_by_latitude(self, client, monkeypatch):
        """At 54N a degree of longitude is ~35 nm, not 60 nm.

        1.3 degrees east is ~46 nm there, so the row qualifies; measuring
        longitude like latitude would put it at 78 nm and wrongly refuse it.
        """
        self._configure_sources(client)
        self._prime(client, monkeypatch, 54.0, -1.5, {"ac": []})
        self._fail_every_fetch(monkeypatch, UpstreamThrottledError())

        resp = client.get(self._point(54.0, -0.2))

        assert resp.headers["X-Cache"] == "NEARBY"

    def test_a_row_for_another_radius_is_not_borrowed(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime(client, monkeypatch, 54.0, -1.5, {"ac": []}, radius=250)
        self._fail_every_fetch(monkeypatch, UpstreamThrottledError())

        resp = client.get(self._point(54.0, -1.5))

        assert resp.status_code == 503

    def test_a_row_past_the_stale_window_is_not_borrowed(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime(client, monkeypatch, 54.0, -1.5, {"ac": []})
        self._fail_every_fetch(monkeypatch, UpstreamThrottledError())
        # Jump the router's clock past the stale window since the row was cached.
        real_now = air_router.now_ms()
        monkeypatch.setattr(
            air_router, "now_ms", lambda: real_now + settings.adsb_stale_ms + 1_000
        )

        resp = client.get(self._point(54.3, -1.5))

        assert resp.status_code == 503

    def test_an_empty_cache_still_answers_503(self, client, monkeypatch):
        self._configure_sources(client)
        self._fail_every_fetch(monkeypatch, UpstreamThrottledError())

        resp = client.get(self._point(54.0, -1.5))

        assert resp.status_code == 503


# ── /api/air/adsb/point — off-grid source with no Settings field ──────────────


class TestAdsbOffgridDecoderDefault:
    """Off grid, AIR reads the bundled decoder unless a stored URL says otherwise.

    The Settings › AIR › Off Grid Data Source field was removed, so this default
    is the only way a fresh install finds its off-grid aircraft.
    """

    POINT = "/api/air/adsb/point/54.0/-1.5/100"
    DECODER = "http://decoder.test:8080/data/aircraft.json"

    def _patch_fetch(self, monkeypatch):
        calls: list[str] = []

        async def fake_fetch(lat, lon, radius, base_url):
            calls.append(base_url)
            return {"ac": [], "total": 0}

        monkeypatch.setattr(adsb_service, "fetch_aircraft", fake_fetch)
        return calls

    def test_reads_the_configured_decoder_when_no_url_is_stored(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(settings, "adsb_offgrid_url", self.DECODER)
        client.put("/api/settings/app/connectivityMode", json={"value": "offgrid"})
        client.put(
            "/api/settings/air/offgridDataSourceURL", json={"value": {"url": ""}}
        )
        calls = self._patch_fetch(monkeypatch)

        resp = client.get(self.POINT)

        assert resp.status_code == 200
        assert calls == [self.DECODER]

    def test_a_stored_url_still_wins(self, client, monkeypatch):
        monkeypatch.setattr(settings, "adsb_offgrid_url", self.DECODER)
        client.put("/api/settings/app/connectivityMode", json={"value": "offgrid"})
        client.put(
            "/api/settings/air/offgridDataSourceURL",
            json={"value": {"url": "http://stored.test/data/aircraft.json"}},
        )
        calls = self._patch_fetch(monkeypatch)

        client.get(self.POINT)

        assert calls[0] == "http://stored.test/data/aircraft.json"


def test_offgrid_url_defaults_to_the_compose_decoder():
    from backend.config import Settings

    assert Settings().adsb_offgrid_url == "http://adsb-decoder:8080/data/aircraft.json"


def test_offgrid_url_is_overridable_from_the_environment(monkeypatch):
    from backend.config import Settings

    monkeypatch.setenv("ADSB_OFFGRID_URL", "http://elsewhere:8090/data/aircraft.json")
    assert Settings().adsb_offgrid_url == "http://elsewhere:8090/data/aircraft.json"


# ── /api/air/adsb/point — feeding the server-side squawk alerts ──────────────


class TestAdsbFeedsSquawkAlerts:
    """Every fresh snapshot the map fetches goes through the squawk tracker, so
    an emergency squawk raises a stored alert whichever path fetched it."""

    POINT = "/api/air/adsb/point/54.0/-1.5/100"

    def test_a_fresh_snapshot_with_an_emergency_squawk_raises_an_alert(self, client, monkeypatch):
        from backend.services.adsb_squawk import tracker

        monkeypatch.setattr(tracker, "_squawks", {})
        snapshot = {"ac": [{"hex": "4ca123", "flight": "EIN123", "squawk": "7700", "alt_baro": 9000, "gs": 300}]}

        async def fake_fetch(lat, lon, radius, base_url):
            return snapshot

        monkeypatch.setattr(adsb_service, "fetch_aircraft", fake_fetch)
        resp = client.get(self.POINT)
        assert resp.headers["X-Cache"] == "MISS"
        alerts = client.get("/api/air/messages").json()
        assert [(alert["type"], alert["title"], alert["hex"]) for alert in alerts] == [
            ("emergency", "EIN123", "4ca123")
        ]

    def test_a_cache_hit_is_not_fed_again(self, client, monkeypatch):
        from backend.services.adsb_squawk import tracker

        monkeypatch.setattr(tracker, "_squawks", {})
        observed: list[dict] = []

        async def fake_fetch(lat, lon, radius, base_url):
            return {"ac": []}

        async def record(snapshot, db):
            observed.append(snapshot)

        monkeypatch.setattr(adsb_service, "fetch_aircraft", fake_fetch)
        monkeypatch.setattr(tracker, "observe", record)
        client.get(self.POINT)
        resp = client.get(self.POINT)
        assert resp.headers["X-Cache"] == "HIT"
        assert len(observed) == 1


# ── /api/air/adsb/point — an empty fallback never hides cached aircraft ──────


class TestEmptyFallbackDoesNotHideCachedAircraft:
    """When the primary source fails, the fallback is the other mode's source —
    online, the operator's own decoder — which often has nothing for the area.

    The regression: adsb.lol answered 429, the decoder answered `{"ac": []}`,
    and that empty list was cached as a fresh MISS, so the map went blank for a
    whole TTL with good aircraft for the same area sitting in the cache.
    """

    ONLINE = "https://online.example/v2"
    OFFGRID = "http://offgrid.example/data/aircraft.json"
    POINT = "/api/air/adsb/point/54.0/-1.5/100"
    CACHED = {"ac": [{"hex": "abc123"}], "total": 1}
    EMPTY = {"ac": [], "total": 0, "msg": "readsb"}

    def _configure_sources(self, client):
        client.put("/api/settings/air/onlineDataSourceURL", json={"value": self.ONLINE})
        client.put("/api/settings/air/offgridDataSourceURL", json={"value": {"url": self.OFFGRID}})

    @staticmethod
    def _rate_limited() -> httpx.HTTPStatusError:
        request = httpx.Request("GET", "https://online.example/v2/point")
        return httpx.HTTPStatusError("slow down", request=request, response=httpx.Response(429, request=request))

    def _sources(self, monkeypatch, primary, fallback=None) -> list[str]:
        """Primary raises or returns `primary`; the fallback returns `fallback` (default: empty)."""
        calls: list[str] = []

        async def fake_fetch(lat, lon, radius, base_url):
            calls.append(base_url)
            outcome = primary if base_url == self.ONLINE else (fallback or self.EMPTY)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        monkeypatch.setattr(adsb_service, "fetch_aircraft", fake_fetch)
        return calls

    def _prime_expired(self, client, monkeypatch, point=None):
        """Cache CACHED for the point with a row that is already past its TTL."""
        monkeypatch.setattr(settings, "adsb_ttl_ms", 0)
        self._sources(monkeypatch, self.CACHED)
        assert client.get(point or self.POINT).headers["X-Cache"] == "MISS"
        monkeypatch.setattr(settings, "adsb_ttl_ms", 10_000)

    def test_rate_limited_primary_serves_the_cached_row_not_the_empty_fallback(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime_expired(client, monkeypatch)
        calls = self._sources(monkeypatch, self._rate_limited())

        resp = client.get(self.POINT)

        assert calls == [self.ONLINE, self.OFFGRID]
        assert resp.headers["X-Cache"] == "RATED"
        assert resp.json() == self.CACHED

    def test_unreachable_primary_serves_stale_data_not_the_empty_fallback(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime_expired(client, monkeypatch)
        self._sources(monkeypatch, httpx.ConnectError("down"))

        resp = client.get(self.POINT)

        assert resp.headers["X-Cache"] == "STALE"
        assert resp.json() == self.CACHED

    def test_throttled_primary_on_a_new_point_borrows_the_nearby_row(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime_expired(client, monkeypatch, "/api/air/adsb/point/54.0/-1.5/100")
        self._sources(monkeypatch, UpstreamThrottledError())

        resp = client.get("/api/air/adsb/point/54.1/-1.5/100")

        assert resp.headers["X-Cache"] == "NEARBY"
        assert resp.json() == self.CACHED

    def test_the_empty_fallback_does_not_overwrite_the_cached_row(self, client, monkeypatch):
        self._configure_sources(client)
        self._prime_expired(client, monkeypatch)
        self._sources(monkeypatch, self._rate_limited())
        client.get(self.POINT)

        # The primary recovers but is now throttled locally: the row it serves
        # must still be the good one, not an empty list written in between.
        self._sources(monkeypatch, UpstreamThrottledError())
        resp = client.get(self.POINT)

        assert resp.headers["X-Cache"] == "THROTTLED"
        assert resp.json() == self.CACHED

    def test_with_nothing_cached_the_empty_fallback_is_served_but_not_cached(self, client, monkeypatch):
        self._configure_sources(client)
        self._sources(monkeypatch, self._rate_limited())

        resp = client.get(self.POINT)

        assert resp.status_code == 200
        assert resp.headers["X-Cache"] == "FALLBACK"
        assert resp.json() == self.EMPTY
        # Not cached: the next poll asks the primary again instead of a HIT.
        calls = self._sources(monkeypatch, self.CACHED)
        again = client.get(self.POINT)
        assert calls == [self.ONLINE]
        assert again.headers["X-Cache"] == "MISS"
        assert again.json() == self.CACHED

    def test_a_fallback_with_aircraft_is_still_served_and_cached(self, client, monkeypatch):
        self._configure_sources(client)
        self._sources(monkeypatch, self._rate_limited(), fallback=self.CACHED)

        resp = client.get(self.POINT)

        assert resp.headers["X-Cache"] == "MISS"
        assert resp.json() == self.CACHED
        assert client.get(self.POINT).headers["X-Cache"] == "HIT"

    def test_an_empty_answer_from_the_primary_is_the_truth_and_is_cached(self, client, monkeypatch):
        self._configure_sources(client)
        calls = self._sources(monkeypatch, {"ac": [], "total": 0})

        assert client.get(self.POINT).headers["X-Cache"] == "MISS"
        assert client.get(self.POINT).headers["X-Cache"] == "HIT"
        assert calls == [self.ONLINE]


class TestEveryPollKeepsTheSquawkWatcherIdle:
    POINT = "/api/air/adsb/point/54.0/-1.5/100"

    def test_a_cache_hit_still_counts_as_a_browser_poll(self, client, monkeypatch):
        from backend.services.adsb_squawk import tracker

        async def fake_fetch(lat, lon, radius, base_url):
            return {"ac": []}

        monkeypatch.setattr(adsb_service, "fetch_aircraft", fake_fetch)
        client.get(self.POINT)
        monkeypatch.setattr(tracker, "last_browser_poll_ms", 0)

        resp = client.get(self.POINT)

        assert resp.headers["X-Cache"] == "HIT"
        assert tracker.last_browser_poll_ms > 0

    def test_a_poll_that_fails_outright_still_counts(self, client, monkeypatch):
        from backend.services.adsb_squawk import tracker

        async def failing_fetch(lat, lon, radius, base_url):
            raise httpx.ConnectError("down")

        monkeypatch.setattr(adsb_service, "fetch_aircraft", failing_fetch)
        monkeypatch.setattr(tracker, "last_browser_poll_ms", 0)

        assert client.get(self.POINT).status_code == 503
        assert tracker.last_browser_poll_ms > 0
