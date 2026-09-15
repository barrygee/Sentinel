"""The Land live-feeds HTTP surface (`/api/land/feeds/**`):

    GET    /api/land/feeds                     — configured feeds + runtime status
    GET    /api/land/feeds/{id}/features        — normalised GeoJSON snapshot
    GET    /api/land/feeds/{id}/image/{ref}     — proxied still image
    GET    /api/land/feeds/{id}/clip/{ref}      — proxied clip
    GET/PUT/DELETE /api/land/feeds/{id}/credentials
    POST   /api/land/feeds/{id}/test

Drives `backend.services.land_feeds.poller.poller` (the singleton the router
imports directly) with a fake adapter registered in place of the real ones, so
no network call is ever made and every status-mapping branch (404/502/503) is
reachable deterministically.
"""

from __future__ import annotations

import pytest

from backend.services.land_feeds import poller as poller_module
from backend.services.land_feeds.base import (
    FeedOffline,
    FeedRefNotFound,
    FeedUpstreamError,
)
from backend.services.land_feeds.poller import poller
from backend.services.land_feeds.schema import FeedSnapshot


class FakeAdapter:
    min_interval_seconds = 0.0
    supports_clips = True

    def __init__(self) -> None:
        self.probe_result = None
        self.image_result: tuple[bytes, str] | Exception = (b"jpeg-bytes", "image/jpeg")
        self.clip_result: tuple[bytes, str] | Exception = (b"mp4-bytes", "video/mp4")

    async def fetch(self, config, credential):
        return FeedSnapshot.empty()

    async def probe(self, config, credential):
        from backend.services.land_feeds.schema import ProbeResult

        if self.probe_result is not None:
            return self.probe_result
        return ProbeResult(ok=True, message="ok", feature_count=0)

    async def image(self, config, credential, ref):
        if isinstance(self.image_result, BaseException):
            raise self.image_result
        return self.image_result

    async def clip(self, config, credential, ref):
        if isinstance(self.clip_result, BaseException):
            raise self.clip_result
        return self.clip_result


FEED_ID = "durham-cc"


def _feed_dict(**overrides) -> dict:
    base = {
        "id": FEED_ID,
        "name": "Durham County Council",
        "category": "traffic-cameras",
        "provider": "durham",
        "url": "https://example.org/layer",
        "enabled": True,
        "refreshSeconds": 60,
        "auth": {"type": "none"},
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
async def _isolated_poller(test_engine, db_setup, monkeypatch):
    """Every test gets the process-wide `poller` singleton wired to the
    in-memory test DB and reset to an empty config — router tests hit
    `poller` directly (it's what the router imports), so it must be isolated
    per test rather than accumulating state across the module."""
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    TestSession = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(poller_module, "AsyncSessionLocal", TestSession)
    await poller.resync([])
    poller._image_cache.clear()
    yield
    await poller.stop()


@pytest.fixture()
def fake_adapter(monkeypatch) -> FakeAdapter:
    adapter = FakeAdapter()
    monkeypatch.setattr(poller_module, "get_adapter", lambda provider: adapter)
    return adapter


async def _configure_feed(client, fake_adapter, **overrides) -> None:
    await poller.resync([_feed_dict(**overrides)])


class TestListFeeds:
    async def test_empty_when_no_feeds_configured(self, client):
        assert client.get("/api/land/feeds").json() == {"feeds": []}

    async def test_lists_configured_feed_with_status_and_credential_flag(
        self, client, fake_adapter
    ):
        await _configure_feed(client, fake_adapter)
        body = client.get("/api/land/feeds").json()
        assert len(body["feeds"]) == 1
        feed = body["feeds"][0]
        assert feed["id"] == FEED_ID
        assert feed["status"]["credentialConfigured"] is False
        assert feed["status"]["featureCount"] == 0
        assert "apiKey" not in feed  # never leaks credential shape as a value

    async def test_credential_configured_flag_reflects_saved_credential(
        self, client, fake_adapter
    ):
        await _configure_feed(client, fake_adapter, auth={"type": "apiKey"})
        client.put(
            f"/api/land/feeds/{FEED_ID}/credentials", json={"apiKey": "secret-value"}
        )
        body = client.get("/api/land/feeds").json()
        assert body["feeds"][0]["status"]["credentialConfigured"] is True
        # The credential value itself must never appear anywhere in the payload.
        import json as _json

        assert "secret-value" not in _json.dumps(body)


class TestGetFeedFeatures:
    async def test_unknown_feed_is_404(self, client):
        assert client.get("/api/land/feeds/no-such-feed/features").status_code == 404

    async def test_never_fetched_returns_empty_collection_with_miss_header(
        self, client, fake_adapter
    ):
        await _configure_feed(client, fake_adapter)
        response = client.get(f"/api/land/feeds/{FEED_ID}/features")
        assert response.status_code == 200
        assert response.json() == {"type": "FeatureCollection", "features": []}
        assert response.headers["x-cache"] == "MISS"
        assert response.headers["cache-control"] == "no-store"

    async def test_never_triggers_a_live_fetch(self, client, fake_adapter):
        """The endpoint only ever reads the poller's in-memory store — an
        upstream failure here must never surface as anything but the
        already-known cache state."""
        calls = {"count": 0}

        async def counting_fetch(config, credential):
            calls["count"] += 1
            return FeedSnapshot.empty()

        fake_adapter.fetch = counting_fetch
        await _configure_feed(client, fake_adapter)
        client.get(f"/api/land/feeds/{FEED_ID}/features")
        client.get(f"/api/land/feeds/{FEED_ID}/features")
        assert calls["count"] == 0


class TestGetFeedImage:
    async def test_unknown_feed_is_404(self, client):
        assert client.get("/api/land/feeds/no-such-feed/image/ref").status_code == 404

    async def test_oversized_ref_is_422(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter)
        assert (
            client.get(f"/api/land/feeds/{FEED_ID}/image/{'x' * 81}").status_code == 422
        )

    async def test_ref_with_disallowed_characters_is_422(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter)
        assert (
            client.get(f"/api/land/feeds/{FEED_ID}/image/has%20space").status_code
            == 422
        )

    async def test_success_passes_through_bytes_and_content_type_with_no_store(
        self, client, fake_adapter
    ):
        await _configure_feed(client, fake_adapter)
        response = client.get(f"/api/land/feeds/{FEED_ID}/image/ref-1")
        assert response.status_code == 200
        assert response.content == b"jpeg-bytes"
        assert response.headers["content-type"] == "image/jpeg"
        assert response.headers["cache-control"] == "no-store"

    async def test_ref_not_found_is_404(self, client, fake_adapter):
        fake_adapter.image_result = FeedRefNotFound("unknown ref")
        await _configure_feed(client, fake_adapter)
        response = client.get(f"/api/land/feeds/{FEED_ID}/image/ref-1")
        assert response.status_code == 404
        assert response.json()["detail"] == "image unavailable"

    async def test_offline_is_503(self, client, fake_adapter):
        fake_adapter.image_result = FeedOffline("night blackout")
        await _configure_feed(client, fake_adapter)
        response = client.get(f"/api/land/feeds/{FEED_ID}/image/ref-1")
        assert response.status_code == 503
        assert response.json()["detail"] == "image unavailable"

    async def test_upstream_error_is_502(self, client, fake_adapter):
        fake_adapter.image_result = FeedUpstreamError("connection refused")
        await _configure_feed(client, fake_adapter)
        response = client.get(f"/api/land/feeds/{FEED_ID}/image/ref-1")
        assert response.status_code == 502
        # The sanitised HTTPException detail never echoes the upstream message.
        assert "connection refused" not in response.text

    async def test_error_response_never_leaks_upstream_detail(
        self, client, fake_adapter
    ):
        fake_adapter.image_result = FeedUpstreamError("internal-hostname-10.0.0.5")
        await _configure_feed(client, fake_adapter)
        response = client.get(f"/api/land/feeds/{FEED_ID}/image/ref-1")
        assert "10.0.0.5" not in response.text


class TestGetFeedClip:
    async def test_unknown_feed_is_404(self, client):
        assert client.get("/api/land/feeds/no-such-feed/clip/ref").status_code == 404

    async def test_success_passes_through_bytes_and_content_type(
        self, client, fake_adapter
    ):
        await _configure_feed(client, fake_adapter)
        response = client.get(f"/api/land/feeds/{FEED_ID}/clip/ref-1")
        assert response.status_code == 200
        assert response.content == b"mp4-bytes"
        assert response.headers["content-type"] == "video/mp4"
        assert response.headers["cache-control"] == "no-store"

    async def test_provider_without_clip_support_is_404(self, client, fake_adapter):
        fake_adapter.supports_clips = False
        fake_adapter.clip_result = FeedRefNotFound("this feed does not offer clips")
        await _configure_feed(client, fake_adapter)
        response = client.get(f"/api/land/feeds/{FEED_ID}/clip/ref-1")
        assert response.status_code == 404

    async def test_offline_is_503(self, client, fake_adapter):
        fake_adapter.clip_result = FeedOffline("unavailable")
        await _configure_feed(client, fake_adapter)
        assert client.get(f"/api/land/feeds/{FEED_ID}/clip/ref-1").status_code == 503

    async def test_upstream_error_is_502(self, client, fake_adapter):
        fake_adapter.clip_result = FeedUpstreamError("boom")
        await _configure_feed(client, fake_adapter)
        assert client.get(f"/api/land/feeds/{FEED_ID}/clip/ref-1").status_code == 502


class TestCredentials:
    async def test_get_status_unknown_feed_is_404(self, client):
        assert client.get("/api/land/feeds/no-such-feed/credentials").status_code == 404

    async def test_get_status_unconfigured(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter)
        assert client.get(f"/api/land/feeds/{FEED_ID}/credentials").json() == {
            "configured": False
        }

    async def test_put_on_a_none_auth_feed_is_400(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter, auth={"type": "none"})
        response = client.put(
            f"/api/land/feeds/{FEED_ID}/credentials", json={"apiKey": "x" * 20}
        )
        assert response.status_code == 400

    async def test_put_api_key_round_trips_configured_status(
        self, client, fake_adapter
    ):
        await _configure_feed(client, fake_adapter, auth={"type": "apiKey"})
        saved = client.put(
            f"/api/land/feeds/{FEED_ID}/credentials", json={"apiKey": "x" * 20}
        )
        assert saved.status_code == 200
        assert saved.json() == {"configured": True}
        assert client.get(f"/api/land/feeds/{FEED_ID}/credentials").json() == {
            "configured": True
        }

    async def test_put_api_key_shape_mismatch_is_400(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter, auth={"type": "apiKey"})
        # username/password supplied instead of apiKey.
        response = client.put(
            f"/api/land/feeds/{FEED_ID}/credentials",
            json={"username": "bob", "password": "hunter22"},
        )
        assert response.status_code == 400

    async def test_put_api_key_with_extra_username_is_400(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter, auth={"type": "apiKey"})
        response = client.put(
            f"/api/land/feeds/{FEED_ID}/credentials",
            json={"apiKey": "x" * 20, "username": "bob"},
        )
        assert response.status_code == 400

    async def test_put_basic_requires_both_username_and_password(
        self, client, fake_adapter
    ):
        await _configure_feed(client, fake_adapter, auth={"type": "basic"})
        assert (
            client.put(
                f"/api/land/feeds/{FEED_ID}/credentials", json={"username": "bob"}
            ).status_code
            == 400
        )
        saved = client.put(
            f"/api/land/feeds/{FEED_ID}/credentials",
            json={"username": "bob", "password": "hunter22"},
        )
        assert saved.status_code == 200

    async def test_put_basic_with_extra_api_key_is_400(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter, auth={"type": "basic"})
        response = client.put(
            f"/api/land/feeds/{FEED_ID}/credentials",
            json={"username": "bob", "password": "hunter22", "apiKey": "x" * 20},
        )
        assert response.status_code == 400

    async def test_delete_forgets_the_credential(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter, auth={"type": "apiKey"})
        client.put(f"/api/land/feeds/{FEED_ID}/credentials", json={"apiKey": "x" * 20})
        deleted = client.delete(f"/api/land/feeds/{FEED_ID}/credentials")
        assert deleted.status_code == 200
        assert deleted.json() == {"configured": False}
        assert client.get(f"/api/land/feeds/{FEED_ID}/credentials").json() == {
            "configured": False
        }

    async def test_delete_is_idempotent(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter, auth={"type": "apiKey"})
        assert (
            client.delete(f"/api/land/feeds/{FEED_ID}/credentials").status_code == 200
        )
        assert (
            client.delete(f"/api/land/feeds/{FEED_ID}/credentials").status_code == 200
        )

    async def test_credential_value_never_echoed_by_get(self, client, fake_adapter):
        await _configure_feed(client, fake_adapter, auth={"type": "apiKey"})
        client.put(
            f"/api/land/feeds/{FEED_ID}/credentials",
            json={"apiKey": "unique-secret-token"},
        )
        response = client.get(f"/api/land/feeds/{FEED_ID}/credentials")
        assert "unique-secret-token" not in response.text


class TestTestFeed:
    async def test_unknown_feed_is_404(self, client):
        assert client.post("/api/land/feeds/no-such-feed/test").status_code == 404

    async def test_probe_success_shape(self, client, fake_adapter):
        from backend.services.land_feeds.schema import ProbeResult

        fake_adapter.probe_result = ProbeResult(
            ok=True, message="3 cameras", feature_count=3
        )
        await _configure_feed(client, fake_adapter)
        response = client.post(f"/api/land/feeds/{FEED_ID}/test")
        assert response.status_code == 200
        assert response.json() == {
            "ok": True,
            "message": "3 cameras",
            "featureCount": 3,
        }

    async def test_probe_failure_is_a_normal_200_not_5xx(self, client, fake_adapter):
        from backend.services.land_feeds.schema import ProbeResult

        fake_adapter.probe_result = ProbeResult(
            ok=False, message="could not reach upstream", feature_count=0
        )
        await _configure_feed(client, fake_adapter)
        response = client.post(f"/api/land/feeds/{FEED_ID}/test")
        assert response.status_code == 200
        assert response.json()["ok"] is False

    async def test_probe_never_echoes_upstream_response_body(
        self, client, fake_adapter
    ):
        from backend.services.land_feeds.schema import ProbeResult

        # A probe message must be adapter-authored and sanitised — this test
        # documents that the router passes the message through untouched
        # (the adapter layer owns not leaking raw upstream bodies; see the
        # adapter-level probe tests for that guarantee).
        fake_adapter.probe_result = ProbeResult(
            ok=False, message="could not reach the feed", feature_count=0
        )
        await _configure_feed(client, fake_adapter)
        response = client.post(f"/api/land/feeds/{FEED_ID}/test")
        assert "<html" not in response.text.lower()


class TestFeedIdPathValidation:
    @pytest.mark.parametrize("bad_id", ["UPPER-CASE", "has%20space", "a"])
    async def test_malformed_feed_id_in_path_is_422(self, client, bad_id):
        # Single path-segment violations of FEED_ID_PATTERN (no embedded
        # slash, which would instead just fail to match the route at all).
        response = client.get(f"/api/land/feeds/{bad_id}/features")
        assert response.status_code == 422
