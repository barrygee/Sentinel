"""Tests for backend/services/app_config.py — the application config document.

The settings router (Settings › Application Config) and the live config-file
sync both build and apply the document through this module, so these tests pin
the rules both rely on: what is kept out of the document, how an imported
document is applied, and how the retired connectivity 'auto' mode is resolved.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database
from backend.models import UserSettings
from backend.services import app_config
from backend.services.app_config import (
    InvalidConfigError,
    apply_config,
    build_config_snapshot,
    canonical_key_order,
    rows_to_namespace_dict,
    validated_location,
)


@pytest.fixture()
def session_factory(test_engine, db_setup):
    return sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


async def _add(
    factory, rows: list[tuple[str, str, object]], *, raw: bool = False
) -> None:
    async with factory() as session:
        for namespace, key, value in rows:
            session.add(
                UserSettings(
                    namespace=namespace,
                    key=key,
                    value=value if raw else json.dumps(value),
                    updated_at=1,
                )
            )
        await session.commit()


async def _value(factory, namespace: str, key: str) -> object:
    async with factory() as session:
        row = (
            await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace, UserSettings.key == key
                )
            )
        ).scalar_one_or_none()
        return None if row is None else json.loads(row.value)


async def _row(factory, namespace: str, key: str) -> UserSettings | None:
    async with factory() as session:
        return (
            await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace, UserSettings.key == key
                )
            )
        ).scalar_one_or_none()


class TestValidatedLocation:
    def test_rejects_a_non_object(self):
        with pytest.raises(InvalidConfigError, match="must be an object"):
            validated_location("51,0")

    def test_rejects_an_out_of_range_longitude(self):
        with pytest.raises(InvalidConfigError, match="longitude out of range"):
            validated_location({"latitude": 51, "longitude": 181})

    def test_accepts_a_valid_pair_as_floats(self):
        assert validated_location({"latitude": "51.5", "longitude": -0.1}) == {
            "latitude": 51.5,
            "longitude": -0.1,
        }


class TestCanonicalKeyOrder:
    def test_is_empty_when_the_template_cannot_be_read(
        self, monkeypatch, tmp_path: Path
    ):
        monkeypatch.setattr(database, "_CONFIG_PATH", tmp_path / "missing.json")
        canonical_key_order.cache_clear()
        try:
            assert canonical_key_order() == {}
        finally:
            canonical_key_order.cache_clear()

    def test_follows_default_config_json(self):
        canonical_key_order.cache_clear()
        order = canonical_key_order()
        assert list(order)[:3] == ["app", "air", "space"]
        assert order["app"][0] == "connectivityMode"


class TestRowsToNamespaceDict:
    def test_keeps_a_value_that_is_not_json_as_the_raw_string(self):
        row = UserSettings(namespace="zz", key="note", value="not json", updated_at=1)
        assert rows_to_namespace_dict([row], "zz") == {"note": "not json"}

    def test_drops_secrets(self):
        row = UserSettings(
            namespace="sea", key="aisstreamApiKey", value='"secret"', updated_at=1
        )
        assert rows_to_namespace_dict([row], "sea") == {}


class TestBuildConfigSnapshot:
    async def test_orders_namespaces_like_the_template_with_unknown_ones_last(
        self, session_factory
    ):
        await _add(
            session_factory,
            [
                ("zzz", "x", 1),
                ("sdr", "enabled", True),
                ("app", "notificationSound", False),
            ],
        )
        async with session_factory() as session:
            snapshot = await build_config_snapshot(session)
        assert list(snapshot) == ["app", "sdr", "zzz"]

    async def test_leaves_out_secret_data_and_internal_keys(self, session_factory):
        await _add(
            session_factory,
            [
                ("sea", "aisstreamApiKey", "secret"),
                ("sdr", "bandPlan", []),
                ("app", "instanceId", "abc"),
                ("app", "notificationSound", True),
            ],
        )
        async with session_factory() as session:
            snapshot = await build_config_snapshot(session)
        assert snapshot == {"sea": {}, "sdr": {}, "app": {"notificationSound": True}}


class TestApplyConfig:
    async def test_rejects_a_document_that_is_not_an_object(self, session_factory):
        async with session_factory() as session:
            with pytest.raises(InvalidConfigError, match="must be a JSON object"):
                await apply_config(session, ["app"])

    async def test_rejects_an_invalid_location_without_writing_anything(
        self, session_factory
    ):
        async with session_factory() as session:
            with pytest.raises(InvalidConfigError):
                await apply_config(
                    session,
                    {
                        "app": {
                            "notificationSound": True,
                            "location": {"latitude": 99, "longitude": 0},
                        }
                    },
                )
        assert await _value(session_factory, "app", "notificationSound") is None

    async def test_ignores_reserved_entries_like_the_comment(self, session_factory):
        async with session_factory() as session:
            await apply_config(
                session,
                {
                    "_comment": "hello",
                    "_meta": {"version": 1},
                    "app": {"notificationSound": True},
                },
            )
        assert await _value(session_factory, "_meta", "version") is None
        assert await _value(session_factory, "app", "notificationSound") is True

    async def test_does_not_resurrect_settings_of_removed_features(
        self, session_factory
    ):
        async with session_factory() as session:
            await apply_config(
                session,
                {
                    "app": {
                        "connectivityProbeUrl": "https://x",
                        "notificationSound": True,
                    },
                    "land": {"feedCredential:7": "pw"},
                },
            )
        assert await _row(session_factory, "app", "connectivityProbeUrl") is None
        assert await _row(session_factory, "land", "feedCredential:7") is None
        assert await _value(session_factory, "app", "notificationSound") is True

    async def test_leaves_an_unchanged_value_untouched(self, session_factory):
        await _add(session_factory, [("app", "notificationSound", True)])
        async with session_factory() as session:
            await apply_config(session, {"app": {"notificationSound": True}})
        row = await _row(session_factory, "app", "notificationSound")
        assert row is not None and row.updated_at == 1

    async def test_updates_a_changed_value(self, session_factory):
        await _add(session_factory, [("app", "notificationSound", True)])
        async with session_factory() as session:
            await apply_config(session, {"app": {"notificationSound": False}})
        row = await _row(session_factory, "app", "notificationSound")
        assert row is not None and json.loads(row.value) is False and row.updated_at > 1

    async def test_reconciles_ais_decode_when_the_ais_radio_changes(
        self, session_factory, monkeypatch
    ):
        calls: list[tuple[object, object]] = []

        async def fake_reconcile(_db, previous, following):
            calls.append((previous, following))

        monkeypatch.setattr("backend.routers.sdr.reconcile_ais_decode", fake_reconcile)
        async with session_factory() as session:
            await apply_config(session, {"sdr": {"ais_radio_id": 4}})
        assert calls == [(None, 4)]


class TestRetiredAutoMode:
    async def test_an_app_auto_becomes_online(self, session_factory):
        async with session_factory() as session:
            await apply_config(session, {"app": {"connectivityMode": "auto"}})
        assert await _value(session_factory, "app", "connectivityMode") == "online"

    async def test_a_section_auto_follows_the_documents_app_mode(self, session_factory):
        async with session_factory() as session:
            await apply_config(
                session,
                {
                    "app": {"connectivityMode": "offgrid"},
                    "sea": {"sourceOverride": "auto"},
                },
            )
        assert await _value(session_factory, "sea", "sourceOverride") == "offgrid"

    async def test_a_section_auto_follows_the_stored_app_mode_when_the_document_has_none(
        self, session_factory
    ):
        await _add(session_factory, [("app", "connectivityMode", "offgrid")])
        async with session_factory() as session:
            await apply_config(session, {"air": {"sourceOverride": "auto"}})
        assert await _value(session_factory, "air", "sourceOverride") == "offgrid"

    async def test_a_section_auto_becomes_online_when_the_stored_app_mode_is_invalid(
        self, session_factory
    ):
        await _add(session_factory, [("app", "connectivityMode", "auto")])
        async with session_factory() as session:
            await apply_config(session, {"space": {"sourceOverride": "auto"}})
        assert await _value(session_factory, "space", "sourceOverride") == "online"

    async def test_an_explicit_section_mode_is_kept(self, session_factory):
        async with session_factory() as session:
            await apply_config(
                session,
                {
                    "app": {"connectivityMode": "online"},
                    "sea": {"sourceOverride": "offgrid"},
                },
            )
        assert await _value(session_factory, "sea", "sourceOverride") == "offgrid"

    async def test_sections_without_a_mode_of_their_own_are_not_touched(
        self, session_factory
    ):
        async with session_factory() as session:
            await apply_config(session, {"land": {"sourceOverride": "auto"}})
        # Land has no data-source mode; its keys are not the 'auto' resolver's business.
        assert await _value(session_factory, "land", "sourceOverride") == "auto"


def test_the_source_mode_sections_are_air_space_and_sea():
    assert app_config.SOURCE_MODE_SECTIONS == ("air", "space", "sea")
    assert app_config.SOURCE_MODES == frozenset({"online", "offgrid"})
