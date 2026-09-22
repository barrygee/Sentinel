"""Tests for merge_default_land_feeds() — backend/database.py.

Seeding only inserts missing *keys*, so a feed added to default_config.json
after an install already has a ``land.feeds`` row would never reach it. The
merge appends such feeds by id and must leave everything the operator has
(order, enabled flags, edits) exactly as it is.

The contract these pin is that each default is offered **once**. Appending
every default the stored list lacked could not tell a feed the operator had
deleted from one they had never seen, so a removed feed silently came back —
disabled, as if freshly seeded — on the next startup, and after every restart
thereafter. ``land``/``defaultFeedsOffered`` is the memory that makes a
deletion stick, and most of what follows is about that.

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
    factory = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(db, "AsyncSessionLocal", factory)
    return factory


@pytest.fixture()
def default_feeds(monkeypatch):
    """Pin the defaults the merge reads, independent of default_config.json."""

    def _build_default_settings():
        return [("land", "enabled", False), ("land", "feeds", _DEFAULT_FEEDS)]

    monkeypatch.setattr(db, "_build_default_settings", _build_default_settings)
    return _DEFAULT_FEEDS


def _set_defaults(monkeypatch, feeds: list) -> None:
    """Point the merge at a different shipped default list mid-test."""
    monkeypatch.setattr(db, "_build_default_settings", lambda: [("land", "feeds", feeds)])


async def _store_setting(factory, key: str, value: object) -> None:
    async with factory() as session:
        session.add(UserSettings(namespace="land", key=key, value=json.dumps(value), updated_at=1))
        await session.commit()


async def _read_setting(factory, key: str):
    async with factory() as session:
        row = (
            await session.execute(
                select(UserSettings).where(UserSettings.namespace == "land", UserSettings.key == key)
            )
        ).scalar_one_or_none()
        return None if row is None else (json.loads(row.value), row.updated_at)


async def _store_feeds(factory, value: object) -> None:
    await _store_setting(factory, "feeds", value)


async def _stored_feeds(factory):
    return await _read_setting(factory, "feeds")


async def _offered(factory):
    result = await _read_setting(factory, db._OFFERED_FEEDS_KEY)
    return None if result is None else result[0]


class TestFirstRunOnAnExistingInstall:
    """An install predating the bookkeeping key is assumed to have seen
    everything shipped today — the merge ran on every boot, so any current
    default is either stored or was deliberately removed."""

    async def test_records_what_is_shipped_without_appending_anything(self, session_factory, default_feeds):
        stored = [{"id": "tfl-jamcams", "name": "TfL (renamed)", "enabled": True}]
        await _store_feeds(session_factory, stored)

        await db.merge_default_land_feeds()

        feeds, updated_at = await _stored_feeds(session_factory)
        assert feeds == stored, "a pre-existing install must not have defaults re-appended"
        assert updated_at == 1
        assert await _offered(session_factory) == ["durham-cc", "tfl-jamcams", "twni"]

    async def test_an_already_deleted_feed_does_not_come_back(self, session_factory, default_feeds):
        # The reported bug: a feed removed in Settings reappeared, disabled, on
        # the next restart — and every restart after it.
        await _store_feeds(session_factory, [_DEFAULT_FEEDS[0], _DEFAULT_FEEDS[1]])

        await db.merge_default_land_feeds()
        await db.merge_default_land_feeds()  # a second restart must not resurrect it either

        feeds, _updated_at = await _stored_feeds(session_factory)
        assert [feed["id"] for feed in feeds] == ["durham-cc", "tfl-jamcams"]


class TestOfferingANewDefault:
    async def test_appends_a_newly_shipped_default_once(self, session_factory, default_feeds, monkeypatch):
        await _store_feeds(session_factory, [_DEFAULT_FEEDS[0]])
        await db.merge_default_land_feeds()  # settle the install's history

        new_feed = {"id": "utmc-tyne-wear", "name": "Tyne & Wear UTMC", "enabled": False}
        _set_defaults(monkeypatch, [*_DEFAULT_FEEDS, new_feed])
        await db.merge_default_land_feeds()

        feeds, updated_at = await _stored_feeds(session_factory)
        assert feeds == [_DEFAULT_FEEDS[0], new_feed]
        assert updated_at > 1
        assert "utmc-tyne-wear" in await _offered(session_factory)

    async def test_appends_it_disabled_as_seeded_and_keeps_operator_feeds_intact(
        self, session_factory, default_feeds, monkeypatch
    ):
        stored = [
            {"id": "tfl-jamcams", "name": "TfL (renamed)", "enabled": True},
            {"id": "my-snapshot", "name": "Mine", "enabled": True},
        ]
        await _store_feeds(session_factory, stored)
        await db.merge_default_land_feeds()

        new_feed = {"id": "utmc-tyne-wear", "name": "Tyne & Wear UTMC", "enabled": False}
        _set_defaults(monkeypatch, [*_DEFAULT_FEEDS, new_feed])
        await db.merge_default_land_feeds()

        feeds, _updated_at = await _stored_feeds(session_factory)
        assert feeds == [*stored, new_feed], "operator entries must keep their order and edits"
        assert feeds[-1]["enabled"] is False

    async def test_deleting_a_newly_offered_feed_sticks(self, session_factory, default_feeds, monkeypatch):
        # The whole point: offered once, then the operator's removal is final.
        await _store_feeds(session_factory, [_DEFAULT_FEEDS[0]])
        await db.merge_default_land_feeds()
        new_feed = {"id": "utmc-tyne-wear", "name": "Tyne & Wear UTMC", "enabled": False}
        _set_defaults(monkeypatch, [*_DEFAULT_FEEDS, new_feed])
        await db.merge_default_land_feeds()

        # Operator deletes it, then the backend restarts twice.
        await _store_feeds_replacing(session_factory, [_DEFAULT_FEEDS[0]])
        await db.merge_default_land_feeds()
        await db.merge_default_land_feeds()

        feeds, _updated_at = await _stored_feeds(session_factory)
        assert [feed["id"] for feed in feeds] == ["durham-cc"]

    async def test_is_a_no_op_when_every_default_has_been_offered(self, session_factory, default_feeds):
        await _store_feeds(session_factory, _DEFAULT_FEEDS)
        await db.merge_default_land_feeds()
        _feeds, settled_at = await _stored_feeds(session_factory)

        await db.merge_default_land_feeds()

        feeds, updated_at = await _stored_feeds(session_factory)
        assert feeds == _DEFAULT_FEEDS
        assert updated_at == settled_at, "a no-op must not rewrite the row"


class TestFreshDatabase:
    async def test_leaves_the_feed_row_to_the_seeder_but_records_the_offer(self, session_factory, default_feeds):
        # seed_default_settings inserts the full default list, so every default
        # is being offered right now and must not be offered again later.
        await db.merge_default_land_feeds()

        assert await _stored_feeds(session_factory) is None
        assert await _offered(session_factory) == ["durham-cc", "tfl-jamcams", "twni"]


class TestDefensiveCases:
    @pytest.mark.parametrize("stored_value", ["not json", {"not": "a list"}])
    async def test_leaves_a_corrupt_feed_row_alone(self, session_factory, default_feeds, stored_value):
        raw = stored_value if isinstance(stored_value, str) else json.dumps(stored_value)
        async with session_factory() as session:
            session.add(UserSettings(namespace="land", key="feeds", value=raw, updated_at=1))
            await session.commit()

        await db.merge_default_land_feeds()

        async with session_factory() as session:
            rows = (await session.execute(select(UserSettings))).scalars().all()
        assert [row.value for row in rows] == [raw], "a corrupt row must not be rewritten or joined by others"

    async def test_recovers_from_a_corrupt_bookkeeping_row(self, session_factory, default_feeds):
        # Unparseable history is treated as no history: record, append nothing.
        await _store_feeds(session_factory, [_DEFAULT_FEEDS[0]])
        async with session_factory() as session:
            session.add(
                UserSettings(namespace="land", key=db._OFFERED_FEEDS_KEY, value="not json", updated_at=1)
            )
            await session.commit()

        await db.merge_default_land_feeds()

        feeds, _updated_at = await _stored_feeds(session_factory)
        assert [feed["id"] for feed in feeds] == ["durham-cc"]
        assert await _offered(session_factory) == ["durham-cc", "tfl-jamcams", "twni"]

    async def test_ignores_non_dict_entries_on_both_sides(self, session_factory, monkeypatch):
        _set_defaults(monkeypatch, ["junk", {"id": "twni", "name": "TrafficWatchNI"}])
        await _store_feeds(session_factory, ["junk", {"id": "durham-cc"}])
        await _store_setting(session_factory, db._OFFERED_FEEDS_KEY, ["durham-cc"])

        await db.merge_default_land_feeds()

        feeds, _updated_at = await _stored_feeds(session_factory)
        assert feeds == ["junk", {"id": "durham-cc"}, {"id": "twni", "name": "TrafficWatchNI"}]

    async def test_does_nothing_when_the_defaults_carry_no_feed_list(self, session_factory, monkeypatch):
        monkeypatch.setattr(db, "_build_default_settings", lambda: [("land", "enabled", False)])
        await _store_feeds(session_factory, [{"id": "durham-cc"}])

        await db.merge_default_land_feeds()

        feeds, updated_at = await _stored_feeds(session_factory)
        assert feeds == [{"id": "durham-cc"}]
        assert updated_at == 1
        assert await _offered(session_factory) is None


async def _store_feeds_replacing(factory, value: object) -> None:
    """Overwrite the stored feed list, as saving from Settings does."""
    async with factory() as session:
        row = (
            await session.execute(
                select(UserSettings).where(UserSettings.namespace == "land", UserSettings.key == "feeds")
            )
        ).scalar_one()
        row.value = json.dumps(value)
        await session.commit()
