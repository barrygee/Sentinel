"""Byte-range support on the camera-clip proxy — backend/routers/land_feeds.py.

`GET /api/land/feeds/{id}/clip/{ref}` gained `Accept-Ranges` plus single-range
handling because a `<video loop>` seeks back to the start of a clip by
re-requesting a range, and treats a source that ignores ranges as unseekable —
the loop then stalls at frame 0.

Two levels here: `_parse_byte_range` directly (every header shape, including the
ones that must be ignored and the one that must 416), and the endpoint (206 with
the right slice and Content-Range, 200 for no range, 416 for a range past the
end). The general clip-proxy behaviour — unknown feed, offline, upstream error —
is covered in `test_routers_land_feeds.py` and is not repeated.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.routers import land_feeds as land_feeds_router
from backend.services.land_feeds import poller as poller_module
from backend.services.land_feeds.poller import poller
from backend.services.land_feeds.schema import FeedSnapshot

FEED_ID = "durham-cc"
CLIP_BYTES = b"0123456789"


class _ClipOnlyAdapter:
    """Minimal feed adapter serving a fixed clip body and nothing else."""

    min_interval_seconds = 0.0
    supports_clips = True

    async def fetch(self, config, credential):
        return FeedSnapshot.empty()

    async def probe(self, config, credential):
        from backend.services.land_feeds.schema import ProbeResult

        return ProbeResult(ok=True, message="ok", feature_count=0)

    async def image(self, config, credential, ref):
        return (b"jpeg-bytes", "image/jpeg")

    async def clip(self, config, credential, ref):
        return (CLIP_BYTES, "video/mp4")


@pytest.fixture(autouse=True)
async def configured_clip_feed(test_engine, db_setup, monkeypatch):
    """Wire the process-wide poller to the test DB with one clip-serving feed."""
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    session_factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(poller_module, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(
        poller_module, "get_adapter", lambda provider: _ClipOnlyAdapter()
    )
    await poller.resync([])
    poller._image_cache.clear()
    await poller.resync(
        [
            {
                "id": FEED_ID,
                "name": "Durham County Council",
                "category": "traffic-cameras",
                "provider": "durham",
                "url": "https://example.org/layer",
                "enabled": True,
                "refreshSeconds": 60,
                "auth": {"type": "none"},
            }
        ]
    )
    yield
    await poller.stop()


def _clip_url(ref: str = "ref-1") -> str:
    return f"/api/land/feeds/{FEED_ID}/clip/{ref}"


class TestParseByteRange:
    @pytest.mark.parametrize(
        "ignored_header",
        [
            pytest.param(None, id="no header"),
            pytest.param("", id="empty header"),
            pytest.param("items=0-1", id="unsupported unit"),
            pytest.param("bytes=0-1,4-5", id="multi range"),
            pytest.param("bytes=5", id="no hyphen"),
            pytest.param("bytes=abc-def", id="non-numeric bounds"),
            pytest.param("bytes=-0", id="zero-length suffix"),
            pytest.param("bytes=-abc", id="non-numeric suffix"),
        ],
    )
    def test_header_that_cannot_be_honoured_serves_the_whole_body(self, ignored_header):
        assert land_feeds_router._parse_byte_range(ignored_header, 10) is None

    @pytest.mark.parametrize(
        "range_header,expected",
        [
            pytest.param("bytes=0-4", (0, 4), id="explicit range"),
            pytest.param("bytes=0-0", (0, 0), id="single byte"),
            pytest.param("bytes=3-", (3, 9), id="open-ended range"),
            pytest.param("bytes=0-", (0, 9), id="whole body as a range"),
            pytest.param("bytes=0-99", (0, 9), id="end clamped to the body"),
            pytest.param("bytes=9-9", (9, 9), id="last byte"),
            pytest.param("bytes=-3", (7, 9), id="suffix range"),
            pytest.param("bytes=-99", (0, 9), id="suffix longer than the body"),
            pytest.param("bytes= 0-4 ", (0, 4), id="padded spec"),
        ],
    )
    def test_supported_range_is_returned_clamped(self, range_header, expected):
        assert land_feeds_router._parse_byte_range(range_header, 10) == expected

    def test_range_starting_past_the_end_is_416_with_the_total_size(self):
        with pytest.raises(HTTPException) as excinfo:
            land_feeds_router._parse_byte_range("bytes=10-12", 10)
        assert excinfo.value.status_code == 416
        assert excinfo.value.headers == {"Content-Range": "bytes */10"}
        assert excinfo.value.detail == "range not satisfiable"

    def test_any_range_on_an_empty_body_is_416(self):
        with pytest.raises(HTTPException) as excinfo:
            land_feeds_router._parse_byte_range("bytes=0-1", 0)
        assert excinfo.value.status_code == 416


class TestGetFeedClipWithRange:
    async def test_no_range_header_serves_the_whole_clip_and_advertises_ranges(
        self, client
    ):
        response = client.get(_clip_url())
        assert response.status_code == 200
        assert response.content == CLIP_BYTES
        assert response.headers["accept-ranges"] == "bytes"
        assert response.headers["cache-control"] == "no-store"
        assert "content-range" not in response.headers

    async def test_range_request_is_206_with_only_those_bytes(self, client):
        response = client.get(_clip_url(), headers={"Range": "bytes=2-5"})
        assert response.status_code == 206
        assert response.content == b"2345"
        assert response.headers["content-range"] == f"bytes 2-5/{len(CLIP_BYTES)}"
        assert response.headers["accept-ranges"] == "bytes"
        assert response.headers["content-type"] == "video/mp4"

    async def test_loop_restart_range_serves_the_head_of_the_clip(self, client):
        # This is the request a <video loop> makes when it wraps around.
        response = client.get(_clip_url(), headers={"Range": "bytes=0-"})
        assert response.status_code == 206
        assert response.content == CLIP_BYTES
        assert response.headers["content-range"] == "bytes 0-9/10"

    async def test_suffix_range_serves_the_tail_of_the_clip(self, client):
        response = client.get(_clip_url(), headers={"Range": "bytes=-4"})
        assert response.status_code == 206
        assert response.content == b"6789"
        assert response.headers["content-range"] == "bytes 6-9/10"

    async def test_range_beyond_the_clip_is_clamped(self, client):
        response = client.get(_clip_url(), headers={"Range": "bytes=8-99"})
        assert response.status_code == 206
        assert response.content == b"89"
        assert response.headers["content-range"] == "bytes 8-9/10"

    async def test_unsatisfiable_range_is_416_with_the_clip_size(self, client):
        response = client.get(_clip_url(), headers={"Range": "bytes=50-60"})
        assert response.status_code == 416
        assert response.headers["content-range"] == f"bytes */{len(CLIP_BYTES)}"

    async def test_unsupported_range_header_falls_back_to_the_whole_clip(self, client):
        response = client.get(_clip_url(), headers={"Range": "bytes=0-1,4-5"})
        assert response.status_code == 200
        assert response.content == CLIP_BYTES
