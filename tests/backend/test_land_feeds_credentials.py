"""Tests for `backend.services.land_feeds.credentials` — resolving a feed's
credential from a saved DB row (Settings UI) or the `LAND_FEED_CREDENTIALS_JSON`
`.env` fallback, and the precedence between them.
"""

from __future__ import annotations

import pytest

from backend.config import settings as app_settings
from backend.services.land_feeds import credentials


@pytest.fixture()
async def db_session(test_engine, db_setup):
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker

    TestSession = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with TestSession() as session:
        yield session


class TestCredentialKey:
    def test_key_is_prefixed_with_the_feed_id(self):
        assert credentials.credential_key("durham-cc") == "feedCredential:durham-cc"


class TestGetCredentialPrecedence:
    async def test_unset_returns_none(self, db_session, monkeypatch):
        monkeypatch.setattr(app_settings, "land_feed_credentials_json", "")
        assert await credentials.get_credential(db_session, "durham-cc") is None
        assert await credentials.is_configured(db_session, "durham-cc") is False

    async def test_env_fallback_is_used_when_no_db_row(self, db_session, monkeypatch):
        monkeypatch.setattr(
            app_settings,
            "land_feed_credentials_json",
            '{"tfl-jamcams": {"apiKey": "env-key"}}',
        )
        assert await credentials.get_credential(db_session, "tfl-jamcams") == {
            "apiKey": "env-key"
        }
        assert await credentials.is_configured(db_session, "tfl-jamcams") is True

    async def test_saved_db_row_wins_over_env_fallback(self, db_session, monkeypatch):
        monkeypatch.setattr(
            app_settings,
            "land_feed_credentials_json",
            '{"tfl-jamcams": {"apiKey": "env-key"}}',
        )
        await credentials.set_credential(
            db_session, "tfl-jamcams", {"apiKey": "db-key"}
        )
        assert await credentials.get_credential(db_session, "tfl-jamcams") == {
            "apiKey": "db-key"
        }

    async def test_env_entry_for_a_different_feed_id_is_not_used(
        self, db_session, monkeypatch
    ):
        monkeypatch.setattr(
            app_settings,
            "land_feed_credentials_json",
            '{"tfl-jamcams": {"apiKey": "env-key"}}',
        )
        assert await credentials.get_credential(db_session, "durham-cc") is None

    async def test_malformed_env_json_is_ignored(self, db_session, monkeypatch):
        monkeypatch.setattr(
            app_settings, "land_feed_credentials_json", "{not valid json"
        )
        assert await credentials.get_credential(db_session, "tfl-jamcams") is None

    async def test_env_json_that_is_not_an_object_is_ignored(
        self, db_session, monkeypatch
    ):
        monkeypatch.setattr(app_settings, "land_feed_credentials_json", "[1, 2, 3]")
        assert await credentials.get_credential(db_session, "tfl-jamcams") is None

    async def test_env_entry_that_is_not_a_dict_is_ignored(
        self, db_session, monkeypatch
    ):
        monkeypatch.setattr(
            app_settings, "land_feed_credentials_json", '{"tfl-jamcams": "not-a-dict"}'
        )
        assert await credentials.get_credential(db_session, "tfl-jamcams") is None

    async def test_empty_db_row_falls_back_to_env(self, db_session, monkeypatch):
        """An empty dict saved to the DB must not shadow a usable env
        fallback — `get_credential` treats a falsy saved value as unset."""
        monkeypatch.setattr(
            app_settings,
            "land_feed_credentials_json",
            '{"tfl-jamcams": {"apiKey": "env-key"}}',
        )
        await credentials.set_credential(db_session, "tfl-jamcams", {})
        assert await credentials.get_credential(db_session, "tfl-jamcams") == {
            "apiKey": "env-key"
        }


class TestSetAndClearCredential:
    async def test_set_then_get_round_trips(self, db_session):
        await credentials.set_credential(
            db_session, "durham-cc", {"username": "bob", "password": "hunter2"}
        )
        assert await credentials.get_credential(db_session, "durham-cc") == {
            "username": "bob",
            "password": "hunter2",
        }

    async def test_set_overwrites_a_previous_value(self, db_session):
        await credentials.set_credential(db_session, "durham-cc", {"apiKey": "first"})
        await credentials.set_credential(db_session, "durham-cc", {"apiKey": "second"})
        assert await credentials.get_credential(db_session, "durham-cc") == {
            "apiKey": "second"
        }

    async def test_clear_removes_the_saved_row(self, db_session, monkeypatch):
        monkeypatch.setattr(app_settings, "land_feed_credentials_json", "")
        await credentials.set_credential(db_session, "durham-cc", {"apiKey": "value"})
        await credentials.clear_credential(db_session, "durham-cc")
        assert await credentials.get_credential(db_session, "durham-cc") is None

    async def test_clear_on_an_unset_credential_is_a_no_op(self, db_session):
        await credentials.clear_credential(db_session, "durham-cc")  # does not raise
        assert await credentials.get_credential(db_session, "durham-cc") is None

    async def test_clear_falls_back_to_env_afterwards(self, db_session, monkeypatch):
        monkeypatch.setattr(
            app_settings,
            "land_feed_credentials_json",
            '{"durham-cc": {"username": "env-user", "password": "env-pass"}}',
        )
        await credentials.set_credential(
            db_session, "durham-cc", {"username": "db-user", "password": "db-pass"}
        )
        await credentials.clear_credential(db_session, "durham-cc")
        assert await credentials.get_credential(db_session, "durham-cc") == {
            "username": "env-user",
            "password": "env-pass",
        }
