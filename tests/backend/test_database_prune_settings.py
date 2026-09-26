"""Tests for prune_removed_settings() — backend/database.py.

The migration deletes settings rows belonging to features that no longer exist
(trunk tracking, removed in ADR-0004; the ADS-B label switches; and the Land
live camera feeds, whose per-feed credential rows are matched by key prefix). It runs on every startup, so
the cases that matter most are the negative ones: it must never touch a live
setting, and a second run must be a no-op.

prune_removed_settings() opens its own session from the module-level
AsyncSessionLocal rather than taking one, so each test points that factory at
the in-memory test engine.
"""

from __future__ import annotations

import json
import time

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as db
from backend.models import UserSettings


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    """Point the module-level session factory at the per-test in-memory engine."""
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(db, "AsyncSessionLocal", factory)
    return factory


async def _add_settings(factory, rows: list[tuple[str, str, object]]) -> None:
    async with factory() as session:
        for namespace, key, value in rows:
            session.add(
                UserSettings(
                    namespace=namespace,
                    key=key,
                    value=json.dumps(value),
                    updated_at=int(time.time() * 1000),
                )
            )
        await session.commit()


async def _stored_keys(factory) -> list[tuple[str, str]]:
    async with factory() as session:
        rows = (await session.execute(select(UserSettings))).scalars().all()
        return sorted((row.namespace, row.key) for row in rows)


class TestPruneRemovedSettings:
    async def test_deletes_every_removed_key(self, session_factory):
        await _add_settings(
            session_factory,
            [
                ("sdr", "trunkTrackingEnabled", True),
                ("sdr", "channel_maps", [{"name": "site", "channels": []}]),
            ],
        )
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == []

    async def test_leaves_live_settings_untouched(self, session_factory):
        # The blast radius is the whole settings table, so a live SDR setting
        # sitting beside the removed ones must survive.
        await _add_settings(
            session_factory,
            [
                ("sdr", "trunkTrackingEnabled", True),
                ("sdr", "showBandPlan", True),
                ("sdr", "radios", []),
                ("app", "theme", "dark"),
            ],
        )
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == [
            ("app", "theme"),
            ("sdr", "radios"),
            ("sdr", "showBandPlan"),
        ]

    async def test_matches_on_namespace_as_well_as_key(self, session_factory):
        # Keys are (namespace, key) pairs: the same key name in another
        # namespace is a different setting and must be left alone.
        await _add_settings(
            session_factory,
            [
                ("sdr", "channel_maps", [{"name": "site", "channels": []}]),
                ("air", "channel_maps", ["not the sdr one"]),
            ],
        )
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == [("air", "channel_maps")]

    async def test_no_op_on_a_fresh_database(self, session_factory):
        # A fresh install has no such rows — the early return path.
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == []

    async def test_no_op_when_only_live_settings_exist(self, session_factory):
        await _add_settings(session_factory, [("sdr", "showBandPlan", True)])
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == [("sdr", "showBandPlan")]

    async def test_is_idempotent_across_startups(self, session_factory):
        # It runs on every startup, so the second run must neither fail nor
        # delete anything further.
        await _add_settings(
            session_factory,
            [("sdr", "trunkTrackingEnabled", True), ("sdr", "showBandPlan", True)],
        )
        await db.prune_removed_settings()
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == [("sdr", "showBandPlan")]

    async def test_removed_keys_are_all_namespace_key_pairs(self):
        # The delete builds one AND-clause per entry; a bare string would make
        # the query match on the namespace alone and delete a whole namespace.
        assert db._REMOVED_SETTING_KEYS
        for entry in db._REMOVED_SETTING_KEYS:
            assert isinstance(entry, tuple)
            assert len(entry) == 2
            assert all(isinstance(part, str) and part for part in entry)


class TestPruneRemovedLandCameraFeeds:
    """The Land live camera feeds were removed: their feed list, the
    offered-defaults bookkeeping and every per-feed credential must go."""

    async def test_deletes_the_feed_list_and_offered_bookkeeping(self, session_factory):
        await _add_settings(
            session_factory,
            [
                ("land", "feeds", [{"id": "durham-cc", "enabled": True}]),
                ("land", "defaultFeedsOffered", ["durham-cc", "tfl-jamcams"]),
            ],
        )
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == []

    async def test_deletes_every_feed_credential_row_by_prefix(self, session_factory):
        # Credentials were stored one secret row per feed id, so there is no
        # fixed key — only the prefix identifies them. No exact-key row is
        # present here, so the prefix clause alone must do the deleting.
        await _add_settings(
            session_factory,
            [
                ("land", "feedCredential:utmc", {"username": "u", "password": "p"}),
                ("land", "feedCredential:tfl-jamcams", {"apiKey": "k"}),
            ],
        )
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == []

    async def test_leaves_live_land_settings_and_near_miss_keys(self, session_factory):
        # The prefix includes its colon, so a key that merely starts with
        # "feedCredential" (or "feeds") is a different setting and survives,
        # as do the live Land settings beside the removed rows.
        await _add_settings(
            session_factory,
            [
                ("land", "feedCredential:utmc", {"username": "u"}),
                ("land", "feeds", []),
                ("land", "feedCredentialNote", "keep"),
                ("land", "feedsLegend", "keep"),
                ("land", "defaultLayers", ["repeaters"]),
                ("land", "aprsChannelHz", 144_800_000),
            ],
        )
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == [
            ("land", "aprsChannelHz"),
            ("land", "defaultLayers"),
            ("land", "feedCredentialNote"),
            ("land", "feedsLegend"),
        ]

    async def test_prefix_match_is_scoped_to_the_land_namespace(self, session_factory):
        await _add_settings(
            session_factory,
            [
                ("land", "feedCredential:utmc", {"username": "u"}),
                ("sea", "feedCredential:utmc", "another namespace"),
            ],
        )
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == [("sea", "feedCredential:utmc")]

    async def test_prefix_is_matched_literally_not_as_a_like_pattern(self, session_factory, monkeypatch):
        # startswith(autoescape=True) must escape LIKE wildcards: a prefix
        # containing "_" must not match an arbitrary character in its place.
        monkeypatch.setattr(db, "_REMOVED_SETTING_PREFIXES", (("land", "old_cred:"),))
        await _add_settings(
            session_factory,
            [("land", "old_cred:a", 1), ("land", "oldXcred:b", 2)],
        )
        await db.prune_removed_settings()
        assert await _stored_keys(session_factory) == [("land", "oldXcred:b")]

    async def test_removed_prefixes_are_all_namespace_prefix_pairs(self):
        # An empty prefix would match every key in the namespace and wipe it.
        assert db._REMOVED_SETTING_PREFIXES
        for entry in db._REMOVED_SETTING_PREFIXES:
            assert isinstance(entry, tuple)
            assert len(entry) == 2
            assert all(isinstance(part, str) and part for part in entry)
