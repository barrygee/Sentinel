"""Tests for merge_default_land_feeds() — backend/database.py.

Seeding only inserts missing *keys*, so a feed added to default_config.json
after an install already has a ``land.feeds`` row would never reach it. The
merge appends such feeds by id and must leave everything the operator has
(order, enabled flags, edits) exactly as it is.

Like the prune migration, it opens its own session from the module-level
AsyncSessionLocal, so each test points that factory at the in-memory engine.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as db
from backend.models import UserSettings

_DEFAULT_FEEDS = [
    {"id": "durham-cc", "name": "Durham County Council", "enabled": False},
    {"id": "tfl-jamcams", "name": "TfL JamCams", "enabled": False},
    {"id": "twni", "name": "TrafficWatchNI", "enabled": False},
]


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(db, "AsyncSessionLocal", factory)
    return factory


@pytest.fixture()
def default_feeds(monkeypatch):
    """Pin the defaults the merge reads, independent of default_config.json."""

    def _build_default_settings():
        return [("land", "enabled", False), ("land", "feeds", _DEFAULT_FEEDS)]

    monkeypatch.setattr(db, "_build_default_settings", _build_default_settings)
    return _DEFAULT_FEEDS


async def _store_feeds(factory, value: object) -> None:
    async with factory() as session:
        session.add(
            UserSettings(
                namespace="land", key="feeds", value=json.dumps(value), updated_at=1
            )
        )
        await session.commit()


async def _stored_feeds(factory):
    async with factory() as session:
        row = (
            await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == "land", UserSettings.key == "feeds"
                )
            )
        ).scalar_one_or_none()
        return None if row is None else (json.loads(row.value), row.updated_at)


class TestMergeDefaultLandFeeds:
    async def test_appends_missing_defaults_after_the_operators_feeds_unchanged(
        self, session_factory, default_feeds
    ):
        stored = [
            {"id": "tfl-jamcams", "name": "TfL (renamed)", "enabled": True},
            {"id": "my-snapshot", "name": "Mine", "enabled": True},
        ]
        await _store_feeds(session_factory, stored)
        await db.merge_default_land_feeds()
        feeds, updated_at = await _stored_feeds(session_factory)
        assert feeds == [*stored, default_feeds[0], default_feeds[2]]
        assert updated_at > 1

    async def test_is_a_no_op_when_every_default_is_already_present(
        self, session_factory, default_feeds
    ):
        await _store_feeds(session_factory, default_feeds)
        await db.merge_default_land_feeds()
        feeds, updated_at = await _stored_feeds(session_factory)
        assert feeds == default_feeds
        assert updated_at == 1

    async def test_does_nothing_on_a_fresh_database(
        self, session_factory, default_feeds
    ):
        # No row yet: seed_default_settings inserts the full list; the merge must not.
        await db.merge_default_land_feeds()
        assert await _stored_feeds(session_factory) is None

    @pytest.mark.parametrize("stored_value", ["not json", {"not": "a list"}])
    async def test_leaves_a_corrupt_row_alone(
        self, session_factory, default_feeds, stored_value
    ):
        async with session_factory() as session:
            raw = (
                stored_value
                if isinstance(stored_value, str)
                else json.dumps(stored_value)
            )
            session.add(
                UserSettings(namespace="land", key="feeds", value=raw, updated_at=1)
            )
            await session.commit()
        await db.merge_default_land_feeds()
        async with session_factory() as session:
            row = (await session.execute(select(UserSettings))).scalar_one()
            assert row.value == (
                stored_value
                if isinstance(stored_value, str)
                else json.dumps(stored_value)
            )

    async def test_ignores_non_dict_entries_on_both_sides(
        self, session_factory, monkeypatch
    ):
        def _build_default_settings():
            return [
                ("land", "feeds", ["junk", {"id": "twni", "name": "TrafficWatchNI"}])
            ]

        monkeypatch.setattr(db, "_build_default_settings", _build_default_settings)
        await _store_feeds(session_factory, ["junk", {"id": "durham-cc"}])
        await db.merge_default_land_feeds()
        feeds, _updated_at = await _stored_feeds(session_factory)
        assert feeds == [
            "junk",
            {"id": "durham-cc"},
            {"id": "twni", "name": "TrafficWatchNI"},
        ]

    async def test_does_nothing_when_the_defaults_carry_no_feed_list(
        self, session_factory, monkeypatch
    ):
        monkeypatch.setattr(
            db, "_build_default_settings", lambda: [("land", "enabled", False)]
        )
        await _store_feeds(session_factory, [{"id": "durham-cc"}])
        await db.merge_default_land_feeds()
        feeds, updated_at = await _stored_feeds(session_factory)
        assert feeds == [{"id": "durham-cc"}]
        assert updated_at == 1
