"""Tests for backend.services.offline_map.basemap_source: finding the newest
usable Protomaps Basemap v4 build, with a configured override taking
precedence and no real network (httpx.MockTransport everywhere)."""

from __future__ import annotations

import datetime

import httpx
import pytest

from backend.config import settings
from backend.services.offline_map import basemap_source, source_probe

_RealAsyncClient = httpx.AsyncClient


def _client_factory(handler):
    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _RealAsyncClient(*args, **kwargs)

    return factory


@pytest.fixture(autouse=True)
def reset_module_state(monkeypatch):
    """basemap_source and source_probe both keep process-global caches that
    must never leak between tests, and the override setting must always
    start cleared so a test opts into it explicitly."""
    monkeypatch.setattr(basemap_source, "_last_resolved", None)
    monkeypatch.setattr(settings, "offline_basemap_source_url", "")
    source_probe._probe_cache.clear()
    yield
    source_probe._probe_cache.clear()


def _index_response(entries) -> httpx.Response:
    import json

    return httpx.Response(200, content=json.dumps(entries).encode("utf-8"))


class TestResolveBasemapSourceUrl:
    async def test_manual_override_is_returned_as_is_without_any_network_call(
        self, monkeypatch
    ):
        monkeypatch.setattr(
            settings, "offline_basemap_source_url", "https://mine.example/build.pmtiles"
        )

        def handler(request: httpx.Request) -> httpx.Response:
            raise AssertionError(
                "no network call should happen when an override is configured"
            )

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await basemap_source.resolve_basemap_source_url()
            == "https://mine.example/build.pmtiles"
        )
        assert basemap_source.is_automatic() is False

    async def test_is_automatic_true_when_no_override_is_configured(self):
        assert basemap_source.is_automatic() is True

    async def test_picks_the_newest_v4_key_from_the_index_and_ignores_non_v4_versions(
        self, monkeypatch
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            if "builds.json" in str(request.url):
                return _index_response(
                    [
                        {
                            "key": "20260101.pmtiles",
                            "version": "5.0.0",
                        },  # wrong major version
                        {"key": "20260201.pmtiles", "version": "4.14.3"},
                        {"key": "20260301.pmtiles", "version": "4.15.0"},  # newest v4
                    ]
                )
            assert str(request.url) == "https://build.protomaps.com/20260301.pmtiles"
            return httpx.Response(206, content=_valid_header())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        url = await basemap_source.resolve_basemap_source_url()
        assert url == "https://build.protomaps.com/20260301.pmtiles"

    async def test_malformed_index_entries_are_skipped_without_raising(
        self, monkeypatch
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            if "builds.json" in str(request.url):
                return _index_response(
                    [
                        "not-a-dict",
                        {"key": 12345, "version": "4.0.0"},  # key not a string
                        {
                            "key": "not-a-date.pmtiles",
                            "version": "4.0.0",
                        },  # fails the date pattern
                        {
                            "key": "20260401.pmtiles",
                            "version": None,
                        },  # unparseable version
                        {
                            "key": "20260501.pmtiles",
                            "version": "4.2.0",
                        },  # only valid entry
                    ]
                )
            assert str(request.url) == "https://build.protomaps.com/20260501.pmtiles"
            return httpx.Response(200, content=_valid_header())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        url = await basemap_source.resolve_basemap_source_url()
        assert url == "https://build.protomaps.com/20260501.pmtiles"

    async def test_index_response_that_is_not_a_json_list_is_treated_as_unusable(
        self, monkeypatch
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            if "builds.json" in str(request.url):
                import json

                return httpx.Response(
                    200, content=json.dumps({"not": "a list"}).encode("utf-8")
                )
            return httpx.Response(404, content=b"not found")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        # Falls through to date-probing, which also fails (no matching handler
        # branch returns a valid header for a dated URL), so the whole thing
        # resolves to None.
        url = await basemap_source.resolve_basemap_source_url()
        assert url is None

    async def test_index_http_error_falls_back_to_date_probing(self, monkeypatch):
        today = datetime.datetime.now(datetime.UTC).date()
        expected_url = f"https://build.protomaps.com/{today.strftime('%Y%m%d')}.pmtiles"

        def handler(request: httpx.Request) -> httpx.Response:
            if "builds.json" in str(request.url):
                return httpx.Response(500, content=b"server error")
            if str(request.url) == expected_url:
                return httpx.Response(200, content=_valid_header())
            return httpx.Response(404, content=b"not found")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert await basemap_source.resolve_basemap_source_url() == expected_url

    async def test_index_oversized_body_is_rejected_and_falls_back_to_date_probing(
        self, monkeypatch
    ):
        today = datetime.datetime.now(datetime.UTC).date()
        expected_url = f"https://build.protomaps.com/{today.strftime('%Y%m%d')}.pmtiles"

        def handler(request: httpx.Request) -> httpx.Response:
            if "builds.json" in str(request.url):
                return httpx.Response(
                    200, content=b"x" * (basemap_source._INDEX_MAX_BYTES + 1)
                )
            if str(request.url) == expected_url:
                return httpx.Response(200, content=_valid_header())
            return httpx.Response(404, content=b"not found")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert await basemap_source.resolve_basemap_source_url() == expected_url

    async def test_index_with_invalid_json_body_falls_back_to_date_probing(
        self, monkeypatch
    ):
        today = datetime.datetime.now(datetime.UTC).date()
        expected_url = f"https://build.protomaps.com/{today.strftime('%Y%m%d')}.pmtiles"

        def handler(request: httpx.Request) -> httpx.Response:
            if "builds.json" in str(request.url):
                return httpx.Response(200, content=b"{not json")
            if str(request.url) == expected_url:
                return httpx.Response(200, content=_valid_header())
            return httpx.Response(404, content=b"not found")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert await basemap_source.resolve_basemap_source_url() == expected_url

    async def test_probes_up_to_three_index_candidates_before_giving_up_on_the_index(
        self, monkeypatch
    ):
        index_candidate_urls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            url_text = str(request.url)
            if "builds.json" in url_text:
                return _index_response(
                    [
                        {
                            "key": "20260101.pmtiles",
                            "version": "4.0.0",
                        },  # oldest of 4, never probed
                        {"key": "20260102.pmtiles", "version": "4.0.0"},
                        {"key": "20260103.pmtiles", "version": "4.0.0"},
                        {"key": "20260104.pmtiles", "version": "4.0.0"},  # newest
                    ]
                )
            if url_text.startswith("https://build.protomaps.com/2026010"):
                index_candidate_urls.append(url_text)
            # Every candidate (index-derived or date-probe fallback) misses,
            # so resolution overall returns None — the assertion below only
            # cares how many of the *index* candidates were tried.
            return httpx.Response(404, content=b"gone")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        url = await basemap_source.resolve_basemap_source_url()
        assert url is None
        assert len(index_candidate_urls) == basemap_source._INDEX_CANDIDATES_TO_PROBE
        # The newest three (04, 03, 02) are tried; the oldest (01) never is.
        assert "20260101.pmtiles" not in "".join(index_candidate_urls)

    async def test_falls_back_to_date_probing_across_the_retention_window(
        self, monkeypatch
    ):
        today = datetime.datetime.now(datetime.UTC).date()
        # Only the oldest probed date (7 days back) actually resolves.
        working_date = today - datetime.timedelta(
            days=basemap_source._FALLBACK_DAYS_TO_PROBE - 1
        )
        expected_url = (
            f"https://build.protomaps.com/{working_date.strftime('%Y%m%d')}.pmtiles"
        )

        def handler(request: httpx.Request) -> httpx.Response:
            if "builds.json" in str(request.url):
                return httpx.Response(500, content=b"down")
            if str(request.url) == expected_url:
                return httpx.Response(200, content=_valid_header())
            return httpx.Response(404, content=b"not found")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert await basemap_source.resolve_basemap_source_url() == expected_url

    async def test_returns_none_when_nothing_can_be_found_and_nothing_was_ever_cached(
        self, monkeypatch
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, content=b"not found")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert await basemap_source.resolve_basemap_source_url() is None

    async def test_result_is_cached_and_reused_without_a_further_index_lookup(
        self, monkeypatch
    ):
        index_calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal index_calls
            if "builds.json" in str(request.url):
                index_calls += 1
                return _index_response(
                    [{"key": "20260601.pmtiles", "version": "4.0.0"}]
                )
            return httpx.Response(200, content=_valid_header())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        first = await basemap_source.resolve_basemap_source_url()
        second = await basemap_source.resolve_basemap_source_url()
        assert first == second == "https://build.protomaps.com/20260601.pmtiles"
        assert index_calls == 1

    async def test_stale_cache_still_used_as_a_last_resort_when_a_refresh_fails(
        self, monkeypatch
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            if "builds.json" in str(request.url):
                return _index_response(
                    [{"key": "20260601.pmtiles", "version": "4.0.0"}]
                )
            return httpx.Response(200, content=_valid_header())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        first = await basemap_source.resolve_basemap_source_url()
        assert first == "https://build.protomaps.com/20260601.pmtiles"

        # Expire the cache, then make every subsequent network call fail.
        cached_at, cached_url = basemap_source._last_resolved
        monkeypatch.setattr(
            basemap_source,
            "_last_resolved",
            (cached_at - basemap_source._RESOLVED_CACHE_TTL_S - 1, cached_url),
        )

        def failing_handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, content=b"down")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(failing_handler))
        second = await basemap_source.resolve_basemap_source_url()
        assert second == first  # last good address returned, not None


def _valid_header() -> bytes:
    from pmtiles.tile import Compression, TileType, serialize_header

    header = {
        "version": 3,
        "root_offset": 127,
        "root_length": 0,
        "metadata_offset": 127,
        "metadata_length": 0,
        "leaf_directory_offset": 127,
        "leaf_directory_length": 0,
        "tile_data_offset": 127,
        "tile_data_length": 0,
        "addressed_tiles_count": 0,
        "tile_entries_count": 0,
        "tile_contents_count": 0,
        "clustered": True,
        "internal_compression": Compression.GZIP,
        "tile_compression": Compression.GZIP,
        "tile_type": TileType.MVT,
        "min_zoom": 0,
        "max_zoom": 14,
        "min_lon_e7": -10000000,
        "min_lat_e7": -10000000,
        "max_lon_e7": 10000000,
        "max_lat_e7": 10000000,
        "center_zoom": 0,
        "center_lon_e7": 0,
        "center_lat_e7": 0,
    }
    return serialize_header(header)
