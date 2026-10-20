"""Tests for Air's ADS-B snapshot cache helper, shared by the map's endpoint and the squawk watcher.

Run with:  uv run --project backend pytest services/sections/air/backend/tests/test_adsb_cache.py
"""

from __future__ import annotations

import json

import pytest
from backend.database import Base
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool

from sentinel_air.models import AdsbCache
from sentinel_air.services import adsb_cache


@pytest.fixture
async def session():
    """A real in-memory SQLite session holding only `adsb_cache`."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection, tables=[Base.metadata.tables["adsb_cache"]]
            )
        )
    async with AsyncSession(engine, expire_on_commit=False) as db:
        yield db
    await engine.dispose()


class TestCacheKey:
    def test_four_decimals_and_the_radius(self):
        assert adsb_cache.cache_key(54.14531, -4.48149, 250) == "54.1453_-4.4815_250"

    def test_whole_degrees_keep_their_decimals(self):
        # The map's default centre: must match the key the map's own polls use.
        assert adsb_cache.cache_key(54.0, -2.0, 250) == "54.0000_-2.0000_250"

    def test_another_radius_is_another_row(self):
        assert adsb_cache.cache_key(54.0, -2.0, 250) != adsb_cache.cache_key(54.0, -2.0, 100)


class TestStoreAndFind:
    async def test_a_new_point_gets_a_new_row(self, session):
        adsb_cache.store_snapshot(session, None, 54.0, -2.0, 250, {"ac": [{"hex": "a"}, {"hex": "b"}]}, 1_000, 60_000)
        await session.commit()

        row = await adsb_cache.find_snapshot(session, 54.0, -2.0, 250)
        assert row is not None
        assert (row.cache_key, row.lat, row.lon, row.radius_nm) == ("54.0000_-2.0000_250", 54.0, -2.0, 250)
        assert json.loads(row.payload) == {"ac": [{"hex": "a"}, {"hex": "b"}]}
        assert (row.ac_count, row.fetched_at, row.expires_at) == (2, 1_000, 61_000)

    async def test_an_existing_row_is_updated_in_place(self, session):
        adsb_cache.store_snapshot(session, None, 54.0, -2.0, 250, {"ac": [{"hex": "old"}]}, 1_000, 60_000)
        await session.commit()
        existing = await adsb_cache.find_snapshot(session, 54.0, -2.0, 250)

        adsb_cache.store_snapshot(session, existing, 54.0, -2.0, 250, {"ac": []}, 5_000, 10_000)
        await session.commit()

        rows = (await session.execute(select(AdsbCache))).scalars().all()
        assert len(rows) == 1
        assert (json.loads(rows[0].payload), rows[0].ac_count, rows[0].fetched_at, rows[0].expires_at) == (
            {"ac": []},
            0,
            5_000,
            15_000,
        )

    async def test_a_snapshot_without_an_aircraft_list_counts_none(self, session):
        adsb_cache.store_snapshot(session, None, 54.0, -2.0, 250, {"total": 0}, 1_000, 60_000)
        await session.commit()
        assert (await adsb_cache.find_snapshot(session, 54.0, -2.0, 250)).ac_count == 0

    async def test_it_is_not_committed_for_the_caller(self, session):
        # The map's endpoint decides what a failed commit means (BYPASS).
        adsb_cache.store_snapshot(session, None, 54.0, -2.0, 250, {"ac": []}, 1_000, 60_000)
        await session.rollback()
        assert await adsb_cache.find_snapshot(session, 54.0, -2.0, 250) is None

    async def test_find_matches_only_the_exact_point_and_radius(self, session):
        adsb_cache.store_snapshot(session, None, 54.0, -2.0, 250, {"ac": []}, 1_000, 60_000)
        await session.commit()
        assert await adsb_cache.find_snapshot(session, 54.0001, -2.0, 250) is None
        assert await adsb_cache.find_snapshot(session, 54.0, -2.0, 100) is None
        # Rounding to four decimals is the same point.
        assert await adsb_cache.find_snapshot(session, 54.00004, -2.0, 250) is not None
