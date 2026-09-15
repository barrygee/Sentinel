"""The generic settings router's handling of Land live feeds:

  * `land.feeds` writes are validated against `FeedConfig` (`_validated_feeds`)
    and duplicate ids are rejected — on `PUT /api/settings/land/feeds` and on
    config upload.
  * `feedCredential:*` rows are a secret family — redacted on every read
    (`GET /api/settings`, `GET /api/settings/land`), refused on direct write,
    and skipped (not wiped) on config preview/upload.
  * A `land.feeds` write resyncs the live poller.

`resync()` on the process-wide poller *singleton* is wrapped (not replaced) so
these tests can assert the router calls it with the right payload while the
real bookkeeping still runs — the `land_feeds` router (used by the credential
round-trip tests below) imports that same singleton at module load time, so
swapping in an unrelated stand-in object would leave that router talking to a
poller these tests never touched. Every feed used here is `enabled: False`,
so the real resync never starts a background fetch task.
"""

from __future__ import annotations

import io
import json

import pytest

from backend.routers import settings as settings_router
from backend.services.land_feeds.poller import poller as land_feeds_poller


class ResyncRecorder:
    """Wraps the singleton's real `resync`, recording every call's argument
    while still performing the real config-bookkeeping side effects."""

    def __init__(self, original_resync) -> None:
        self._original_resync = original_resync
        self.resync_calls: list[list] = []

    async def __call__(self, raw_feeds: list) -> None:
        self.resync_calls.append(raw_feeds)
        await self._original_resync(raw_feeds)


@pytest.fixture(autouse=True)
async def _recording_poller(monkeypatch, test_engine, db_setup) -> ResyncRecorder:
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    from backend.services.land_feeds import poller as poller_module

    TestSession = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(poller_module, "AsyncSessionLocal", TestSession)
    await land_feeds_poller.resync([])  # start every test from a clean slate
    recorder = ResyncRecorder(land_feeds_poller.resync)
    monkeypatch.setattr(land_feeds_poller, "resync", recorder)
    yield recorder
    await land_feeds_poller.stop()


def _valid_feed(**overrides) -> dict:
    base = {
        "id": "durham-cc",
        "name": "Durham County Council",
        "category": "traffic-cameras",
        "provider": "durham",
        "url": "https://example.org/layer",
        "enabled": False,
        "refreshSeconds": 60,
        "auth": {"type": "none"},
    }
    base.update(overrides)
    return base


class TestValidatedFeedsHelper:
    """Direct tests of `_validated_feeds`, independent of any HTTP layer."""

    def test_non_list_value_is_rejected(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as excinfo:
            settings_router._validated_feeds({"not": "a list"})
        assert excinfo.value.status_code == 400

    def test_non_dict_entry_is_rejected(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as excinfo:
            settings_router._validated_feeds(["not-a-dict"])
        assert excinfo.value.status_code == 400
        assert "feeds[0]" in excinfo.value.detail

    def test_schema_violation_is_rejected_with_field_detail(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as excinfo:
            settings_router._validated_feeds(
                [_valid_feed(url="http://not-https.example")]
            )
        assert excinfo.value.status_code == 400
        assert "feeds[0].url" in excinfo.value.detail

    def test_duplicate_ids_are_rejected(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as excinfo:
            settings_router._validated_feeds([_valid_feed(), _valid_feed()])
        assert excinfo.value.status_code == 400
        assert "duplicate feed id" in excinfo.value.detail

    def test_valid_list_round_trips_normalised(self):
        result = settings_router._validated_feeds([_valid_feed()])
        assert result[0]["id"] == "durham-cc"
        assert result[0]["refreshSeconds"] == 60

    def test_empty_list_is_accepted(self):
        assert settings_router._validated_feeds([]) == []


class TestPutFeedsThroughGenericSettings:
    def test_valid_feeds_list_is_saved_and_resyncs_the_poller(
        self, client, _recording_poller
    ):
        response = client.put(
            "/api/settings/land/feeds", json={"value": [_valid_feed()]}
        )
        assert response.status_code == 200
        assert client.get("/api/settings/land").json()["feeds"][0]["id"] == "durham-cc"
        # The write is validated/normalised (defaults filled in) before the
        # poller is resynced, so this is the full FeedConfig dump, not the
        # bare request body.
        assert _recording_poller.resync_calls[-1][0]["id"] == "durham-cc"
        assert _recording_poller.resync_calls[-1][0]["provider"] == "durham"

    def test_invalid_feeds_list_is_400_with_a_clear_detail(self, client):
        response = client.put(
            "/api/settings/land/feeds", json={"value": [_valid_feed(refreshSeconds=1)]}
        )
        assert response.status_code == 400
        assert (
            "refreshSeconds" in response.json()["detail"]
            or "refresh_seconds" in response.json()["detail"]
        )

    def test_duplicate_ids_in_the_put_body_are_400(self, client):
        response = client.put(
            "/api/settings/land/feeds", json={"value": [_valid_feed(), _valid_feed()]}
        )
        assert response.status_code == 400

    def test_invalid_write_does_not_resync_the_poller(self, client, _recording_poller):
        client.put(
            "/api/settings/land/feeds", json={"value": [_valid_feed(refreshSeconds=1)]}
        )
        assert _recording_poller.resync_calls == []

    def test_invalid_write_does_not_persist_a_partial_value(self, client):
        client.put("/api/settings/land/feeds", json={"value": [_valid_feed()]})
        client.put(
            "/api/settings/land/feeds", json={"value": [_valid_feed(refreshSeconds=1)]}
        )
        # The last-known-good list must still be in place, not silently blanked.
        assert client.get("/api/settings/land").json()["feeds"][0]["id"] == "durham-cc"

    def test_deleting_land_feeds_resyncs_the_poller_with_an_empty_list(
        self, client, _recording_poller
    ):
        client.put("/api/settings/land/feeds", json={"value": [_valid_feed()]})
        response = client.delete("/api/settings/land/feeds")
        assert response.status_code == 200
        assert _recording_poller.resync_calls[-1] == []

    def test_deleting_an_unrelated_key_does_not_resync(self, client, _recording_poller):
        client.put("/api/settings/land/enabled", json={"value": True})
        client.delete("/api/settings/land/enabled")
        assert _recording_poller.resync_calls == []

    def test_writing_an_unrelated_land_key_does_not_resync(
        self, client, _recording_poller
    ):
        client.put("/api/settings/land/enabled", json={"value": True})
        assert _recording_poller.resync_calls == []


class TestFeedCredentialIsRedactedRefusedAndSkipped:
    def test_get_all_settings_never_shows_a_feed_credential(self, client):
        # Save it the real way — through the land_feeds router's dedicated
        # endpoint — then assert the generic settings surface never echoes it.
        client.put(
            "/api/settings/land/feeds",
            json={"value": [_valid_feed(auth={"type": "apiKey"})]},
        )
        put_response = client.put(
            "/api/land/feeds/durham-cc/credentials", json={"apiKey": "top-secret-value"}
        )
        assert put_response.status_code == 200

        all_settings = client.get("/api/settings").json()
        land_settings = client.get("/api/settings/land").json()
        assert "feedCredential:durham-cc" not in land_settings
        assert "top-secret-value" not in json.dumps(all_settings)
        assert "top-secret-value" not in json.dumps(land_settings)

    def test_direct_write_to_a_feed_credential_key_is_refused(self, client):
        response = client.put(
            "/api/settings/land/feedCredential:durham-cc",
            json={"value": {"apiKey": "x"}},
        )
        assert response.status_code == 400
        assert "secret" in response.json()["detail"]

    def test_config_preview_never_includes_a_saved_feed_credential(self, client):
        client.put(
            "/api/settings/land/feeds",
            json={"value": [_valid_feed(auth={"type": "apiKey"})]},
        )
        client.put(
            "/api/land/feeds/durham-cc/credentials", json={"apiKey": "preview-secret"}
        )
        preview = client.get("/api/settings/config/preview")
        assert "preview-secret" not in preview.text
        assert "feedCredential" not in preview.text

    def test_config_upload_cannot_set_a_feed_credential(self, client):
        config = {
            "land": {
                "feedCredential:durham-cc": {"apiKey": "smuggled-in"},
                "enabled": True,
            }
        }
        upload = client.post(
            "/api/settings/config/upload",
            files={
                "file": (
                    "config.json",
                    io.BytesIO(json.dumps(config).encode()),
                    "application/json",
                )
            },
        )
        assert upload.status_code == 200
        assert (
            client.get("/api/land/feeds/durham-cc/credentials").status_code == 404
        )  # feed not even configured
        assert "smuggled-in" not in client.get("/api/settings/land").text

    def test_config_upload_cannot_wipe_an_existing_feed_credential(self, client):
        client.put(
            "/api/settings/land/feeds",
            json={"value": [_valid_feed(auth={"type": "apiKey"})]},
        )
        client.put(
            "/api/land/feeds/durham-cc/credentials", json={"apiKey": "must-survive"}
        )
        config = {
            "land": {
                "feedCredential:durham-cc": "",
                "feeds": [_valid_feed(auth={"type": "apiKey"})],
            }
        }
        upload = client.post(
            "/api/settings/config/upload",
            files={
                "file": (
                    "config.json",
                    io.BytesIO(json.dumps(config).encode()),
                    "application/json",
                )
            },
        )
        assert upload.status_code == 200
        assert client.get("/api/land/feeds/durham-cc/credentials").json() == {
            "configured": True
        }


class TestConfigUploadValidatesAndResyncsFeeds:
    def test_valid_feeds_in_an_uploaded_config_resync_the_poller(
        self, client, _recording_poller
    ):
        config = {"land": {"feeds": [_valid_feed()], "enabled": True}}
        upload = client.post(
            "/api/settings/config/upload",
            files={
                "file": (
                    "config.json",
                    io.BytesIO(json.dumps(config).encode()),
                    "application/json",
                )
            },
        )
        assert upload.status_code == 200
        assert _recording_poller.resync_calls[-1][0]["id"] == "durham-cc"

    def test_invalid_feeds_in_an_uploaded_config_reject_the_whole_upload(self, client):
        config = {"land": {"feeds": [_valid_feed(id="Not-Valid-ID")], "enabled": True}}
        upload = client.post(
            "/api/settings/config/upload",
            files={
                "file": (
                    "config.json",
                    io.BytesIO(json.dumps(config).encode()),
                    "application/json",
                )
            },
        )
        assert upload.status_code == 400

    def test_upload_without_a_land_feeds_key_does_not_resync(
        self, client, _recording_poller
    ):
        config = {"app": {"notificationSound": True}}
        client.post(
            "/api/settings/config/upload",
            files={
                "file": (
                    "config.json",
                    io.BytesIO(json.dumps(config).encode()),
                    "application/json",
                )
            },
        )
        assert _recording_poller.resync_calls == []
