"""Core's secret-settings route for the owning service (backend/core/settings_secrets.py, P6.4).

  GET/PUT/DELETE /internal/settings/secrets/{namespace}/{key}

Sea in its own container reads and writes the AISStream key through it, since
the public settings API redacts the key. Every refusal is pinned here: no join
token configured, a missing or wrong token, and a key that isn't a secret.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.db_helpers import upsert_setting
from backend.platform import join_token as join_token_module

JOIN_TOKEN = "test-join-token"
SECRET_URL = "/internal/settings/secrets/sea/aisstreamApiKey"
AUTHORIZED = {"Authorization": f"Bearer {JOIN_TOKEN}"}
KEY = "abcdef0123456789"


@pytest.fixture(autouse=True)
def join_token(monkeypatch):
    monkeypatch.setattr(settings, "sentinel_join_token", JOIN_TOKEN)
    monkeypatch.setattr(settings, "sentinel_join_token_file", "")
    monkeypatch.setattr(join_token_module, "_generated_token", None)


class TestReadingAndWriting:
    def test_reads_empty_when_no_secret_is_saved(self, client):
        response = client.get(SECRET_URL, headers=AUTHORIZED)

        assert response.status_code == 200
        assert response.json() == {"value": ""}

    def test_a_written_secret_reads_back(self, client):
        written = client.put(SECRET_URL, headers=AUTHORIZED, json={"value": KEY})

        assert written.status_code == 204
        assert client.get(SECRET_URL, headers=AUTHORIZED).json() == {"value": KEY}

    def test_a_second_write_replaces_the_first(self, client):
        client.put(SECRET_URL, headers=AUTHORIZED, json={"value": KEY})
        client.put(SECRET_URL, headers=AUTHORIZED, json={"value": "replacement-key-1"})

        assert client.get(SECRET_URL, headers=AUTHORIZED).json() == {"value": "replacement-key-1"}

    def test_is_the_same_value_seas_own_endpoint_reports(self, client):
        client.put(SECRET_URL, headers=AUTHORIZED, json={"value": KEY})

        assert client.get("/api/sea/ais-key").json()["source"] == "settings"

    def test_a_stored_secret_still_never_leaves_through_the_public_settings_api(self, client):
        client.put(SECRET_URL, headers=AUTHORIZED, json={"value": KEY})

        assert "aisstreamApiKey" not in client.get("/api/settings/sea").json()
        assert KEY not in client.get("/api/settings").text

    def test_delete_forgets_it(self, client):
        client.put(SECRET_URL, headers=AUTHORIZED, json={"value": KEY})

        deleted = client.delete(SECRET_URL, headers=AUTHORIZED)

        assert deleted.status_code == 204
        assert client.get(SECRET_URL, headers=AUTHORIZED).json() == {"value": ""}

    def test_deleting_when_nothing_is_saved_is_a_no_op(self, client):
        assert client.delete(SECRET_URL, headers=AUTHORIZED).status_code == 204

    async def test_a_non_string_stored_value_reads_as_empty(self, client, test_engine):
        # Written behind the API's back (a hand-edited database): never handed
        # to the AIS reader as a key.
        session_factory = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
        async with session_factory() as session:
            await upsert_setting(session, "sea", "aisstreamApiKey", {"not": "a key"})

        assert client.get(SECRET_URL, headers=AUTHORIZED).json() == {"value": ""}

    def test_an_oversized_value_is_refused(self, client):
        response = client.put(SECRET_URL, headers=AUTHORIZED, json={"value": "k" * 513})

        assert response.status_code == 422
        assert client.get(SECRET_URL, headers=AUTHORIZED).json() == {"value": ""}

    def test_a_body_without_a_value_is_refused(self, client):
        assert client.put(SECRET_URL, headers=AUTHORIZED, json={}).status_code == 422


@pytest.mark.parametrize("method", ["GET", "PUT", "DELETE"])
class TestRefusals:
    def request(self, client, method, url=SECRET_URL, headers=None):
        return client.request(method, url, headers=headers or {}, json={"value": KEY} if method == "PUT" else None)

    def test_without_a_token(self, client, method):
        assert self.request(client, method).status_code == 401

    def test_with_the_wrong_token(self, client, method):
        assert self.request(client, method, headers={"Authorization": "Bearer wrong"}).status_code == 401

    def test_with_the_token_but_not_as_a_bearer(self, client, method):
        assert self.request(client, method, headers={"Authorization": JOIN_TOKEN}).status_code == 401

    def test_when_the_deployment_has_no_join_token(self, client, method, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_join_token", "")

        assert self.request(client, method, headers=AUTHORIZED).status_code == 503

    @pytest.mark.parametrize("url", ["/internal/settings/secrets/sea/enabled", "/internal/settings/secrets/app/location"])
    def test_a_key_that_is_not_a_secret_does_not_exist_here(self, client, method, url):
        # Otherwise the route would be a way round the settings router's validation.
        assert self.request(client, method, url=url, headers=AUTHORIZED).status_code == 404

    def test_a_refused_write_stores_nothing(self, client, method):
        self.request(client, method, headers={"Authorization": "Bearer wrong"})

        assert client.get(SECRET_URL, headers=AUTHORIZED).json() == {"value": ""}


def test_is_left_out_of_the_public_api_schema(client):
    assert not any(path.startswith("/internal/") for path in client.get("/api/openapi.json").json()["paths"])
