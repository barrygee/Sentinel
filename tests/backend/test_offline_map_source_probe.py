"""Tests for backend.services.offline_map.source_probe: the cheap
Range-request header check of a remote basemap source, and the local
go-pmtiles binary availability check. No real network — every HTTP call goes
through an ``httpx.MockTransport``."""

from __future__ import annotations


import httpx
import pytest

from backend.services.offline_map import source_probe
from pmtiles.tile import Compression, TileType, serialize_header


def _valid_header_bytes(
    *, tile_type: TileType = TileType.MVT, clustered: bool = True
) -> bytes:
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
        "clustered": clustered,
        "internal_compression": Compression.GZIP,
        "tile_compression": Compression.GZIP,
        "tile_type": tile_type,
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


@pytest.fixture(autouse=True)
def clear_probe_cache():
    """The probe result cache is process-global and keyed by URL string —
    clear it before and after every test so one test's cached result can
    never leak into (and silently pass) another."""
    source_probe._probe_cache.clear()
    yield
    source_probe._probe_cache.clear()


_RealAsyncClient = httpx.AsyncClient


def _client_factory(handler):
    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _RealAsyncClient(*args, **kwargs)

    return factory


class TestProbeBasemapSource:
    async def test_empty_url_is_rejected_without_a_network_call(self):
        assert await source_probe.probe_basemap_source("") is False

    async def test_valid_mvt_clustered_header_is_accepted(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.headers["range"] == "bytes=0-126"
            return httpx.Response(206, content=_valid_header_bytes())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source(
                "https://good.example/build.pmtiles"
            )
            is True
        )

    async def test_wrong_tile_type_is_rejected(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200, content=_valid_header_bytes(tile_type=TileType.PNG)
            )

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source("https://png.example/build.pmtiles")
            is False
        )

    async def test_unclustered_archive_is_rejected(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=_valid_header_bytes(clustered=False))

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source(
                "https://unclustered.example/build.pmtiles"
            )
            is False
        )

    async def test_non_2xx_status_is_rejected(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, content=b"not found")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source(
                "https://missing.example/build.pmtiles"
            )
            is False
        )

    async def test_network_error_is_swallowed_and_reported_as_false(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom", request=request)

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source(
                "https://unreachable.example/build.pmtiles"
            )
            is False
        )

    async def test_https_redirect_is_followed(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "old.example":
                return httpx.Response(
                    302, headers={"location": "https://new.example/build.pmtiles"}
                )
            return httpx.Response(200, content=_valid_header_bytes())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source("https://old.example/build.pmtiles")
            is True
        )

    async def test_http_downgrade_redirect_is_refused(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                302, headers={"location": "http://insecure.example/build.pmtiles"}
            )

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source("https://old.example/build.pmtiles")
            is False
        )

    async def test_redirect_with_no_location_header_is_refused(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(302, headers={})

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source("https://old.example/build.pmtiles")
            is False
        )

    async def test_too_many_redirects_gives_up_and_returns_false(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            # Always redirect to a new https host — never resolves.
            next_host = request.url.host + "x"
            return httpx.Response(
                302, headers={"location": f"https://{next_host}/build.pmtiles"}
            )

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source("https://a.example/build.pmtiles")
            is False
        )

    async def test_never_reads_past_the_header_even_when_the_server_ignores_range(
        self, monkeypatch
    ):
        # A server that returns 200 (ignoring the Range request) and streams a
        # huge body, one small chunk at a time, must still only ever be
        # consumed up to _HEADER_BYTES worth of chunks — proving the probe's
        # early-exit `break` actually stops pulling from the stream instead
        # of buffering the whole (here, deliberately enormous) response.
        chunk_size = 16
        total_chunks = 1_000_000  # would be tens of megabytes if fully drained
        chunks_consumed = 0

        class HugeSlowStream(httpx.AsyncByteStream):
            def __aiter__(self):
                return self

            async def __anext__(self) -> bytes:
                nonlocal chunks_consumed
                if chunks_consumed >= total_chunks:
                    raise StopAsyncIteration
                chunks_consumed += 1
                if chunks_consumed == 1:
                    return _valid_header_bytes()[:chunk_size]
                if chunks_consumed <= (len(_valid_header_bytes()) // chunk_size) + 1:
                    start = (chunks_consumed - 1) * chunk_size
                    return _valid_header_bytes()[start : start + chunk_size]
                return b"\x00" * chunk_size

            async def aclose(self) -> None:
                return None

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=HugeSlowStream())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        result = await source_probe.probe_basemap_source(
            "https://ignores-range.example/build.pmtiles"
        )
        assert result is True
        assert chunks_consumed < total_chunks

    async def test_short_response_below_header_size_is_rejected(self, monkeypatch):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b"too short")

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        assert (
            await source_probe.probe_basemap_source(
                "https://short.example/build.pmtiles"
            )
            is False
        )

    async def test_result_is_cached_so_a_second_call_makes_no_further_request(
        self, monkeypatch
    ):
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, content=_valid_header_bytes())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        url = "https://cached.example/build.pmtiles"
        assert await source_probe.probe_basemap_source(url) is True
        assert await source_probe.probe_basemap_source(url) is True
        assert call_count == 1

    async def test_cache_expires_after_the_ttl(self, monkeypatch):
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, content=_valid_header_bytes())

        monkeypatch.setattr(httpx, "AsyncClient", _client_factory(handler))
        url = "https://expiring.example/build.pmtiles"
        assert await source_probe.probe_basemap_source(url) is True
        # Force the cached entry to look stale without sleeping in the test.
        cached_at, cached_result = source_probe._probe_cache[url]
        source_probe._probe_cache[url] = (
            cached_at - source_probe._PROBE_CACHE_TTL_S - 1,
            cached_result,
        )
        assert await source_probe.probe_basemap_source(url) is True
        assert call_count == 2


class TestPmtilesBinaryAvailable:
    def test_absolute_path_that_exists_is_available(self, tmp_path):
        binary_path = tmp_path / "pmtiles"
        binary_path.write_text("#!/bin/sh\n")
        assert source_probe.pmtiles_binary_available(str(binary_path)) is True

    def test_absolute_path_that_does_not_exist_is_unavailable(self, tmp_path):
        assert (
            source_probe.pmtiles_binary_available(str(tmp_path / "does-not-exist"))
            is False
        )

    def test_relative_path_with_a_slash_is_checked_as_a_path(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "bin").mkdir()
        (tmp_path / "bin" / "pmtiles").write_text("#!/bin/sh\n")
        assert source_probe.pmtiles_binary_available("bin/pmtiles") is True

    def test_bare_name_resolved_on_path_is_available(self, monkeypatch):
        monkeypatch.setattr(
            source_probe.shutil, "which", lambda name: "/usr/bin/" + name
        )
        assert source_probe.pmtiles_binary_available("pmtiles") is True

    def test_bare_name_missing_from_path_is_unavailable(self, monkeypatch):
        monkeypatch.setattr(source_probe.shutil, "which", lambda name: None)
        assert source_probe.pmtiles_binary_available("pmtiles") is False
