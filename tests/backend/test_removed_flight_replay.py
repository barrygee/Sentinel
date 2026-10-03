"""Startup migration for the removed Air flight-replay feature.

Flight replay (removed 2026-10-03) recorded ADS-B history into air_aircraft,
air_flights and air_snapshots behind the opt-in `air.replayEnabled` setting.
Existing installs still carry those tables and that setting, so startup must:

- drop the three tables (and their indexes) from an existing database,
  leaving every live table alone, and be a no-op on the next start;
- prune a stored `air.replayEnabled`;
- ignore `air.replayEnabled` when it arrives in an uploaded or hand-edited
  config document, so it cannot come back.
"""

from __future__ import annotations

import json
import time

import pytest
from sqlalchemy import inspect, select
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import database
from backend.models import UserSettings
from backend.services.app_config import apply_config

REPLAY_TABLES = ("air_aircraft", "air_flights", "air_snapshots")

# The pre-removal schema, as an existing install has it on disk.
_LEGACY_REPLAY_SCHEMA = (
    "CREATE TABLE air_aircraft (registration TEXT PRIMARY KEY, last_seen INTEGER, "
    "callsign TEXT NOT NULL DEFAULT '')",
    "CREATE TABLE air_flights (id INTEGER PRIMARY KEY, registration TEXT, "
    "started_at INTEGER, last_active_at INTEGER)",
    "CREATE TABLE air_snapshots (id INTEGER PRIMARY KEY, flight_id INTEGER, ts INTEGER)",
    "CREATE INDEX ix_air_flights_registration ON air_flights (registration)",
    "CREATE INDEX ix_air_snapshots_ts ON air_snapshots (ts)",
    "INSERT INTO air_aircraft VALUES ('G-ABCD', 1, 'BAW1')",
    "INSERT INTO air_flights VALUES (1, 'G-ABCD', 1, 2)",
    "INSERT INTO air_snapshots VALUES (1, 1, 1)",
)


@pytest.fixture()
async def legacy_engine(monkeypatch):
    """An in-memory database that already holds the replay tables with rows,
    wired in as `database.engine` so `create_tables()` migrates it."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        for statement in _LEGACY_REPLAY_SCHEMA:
            await connection.execute(sa_text(statement))
    monkeypatch.setattr(database, "engine", engine)
    yield engine
    await engine.dispose()


async def _table_names(engine) -> set[str]:
    async with engine.connect() as connection:
        return set(
            await connection.run_sync(lambda sync: inspect(sync).get_table_names())
        )


async def _index_names(engine) -> set[str]:
    async with engine.connect() as connection:
        rows = await connection.execute(
            sa_text("SELECT name FROM sqlite_master WHERE type = 'index'")
        )
        return {row[0] for row in rows}


class TestReplayTablesAreDropped:
    async def test_existing_replay_tables_and_indexes_are_dropped(self, legacy_engine):
        assert set(REPLAY_TABLES) <= await _table_names(legacy_engine)

        await database.create_tables()

        assert set(REPLAY_TABLES).isdisjoint(await _table_names(legacy_engine))
        assert not {
            "ix_air_flights_registration",
            "ix_air_snapshots_ts",
        } & await _index_names(legacy_engine)

    async def test_live_tables_survive_the_drop(self, legacy_engine):
        await database.create_tables()

        tables = await _table_names(legacy_engine)
        # The Tracking panel's table shares the air_ prefix but is not replay.
        assert {"air_tracking", "adsb_cache", "user_settings"} <= tables

    async def test_a_second_startup_is_a_no_op(self, legacy_engine):
        await database.create_tables()
        tables_after_first_start = await _table_names(legacy_engine)

        await database.create_tables()

        assert await _table_names(legacy_engine) == tables_after_first_start


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(database, "AsyncSessionLocal", factory)
    return factory


async def _store(factory, namespace: str, key: str, value: object) -> None:
    async with factory() as session:
        session.add(
            UserSettings(
                namespace=namespace,
                key=key,
                value=json.dumps(value),
                updated_at=int(time.time() * 1000),
            )
        )
        await session.commit()


async def _air_keys(factory) -> set[str]:
    async with factory() as session:
        rows = await session.execute(
            select(UserSettings.key).where(UserSettings.namespace == "air")
        )
        return set(rows.scalars().all())


class TestReplaySettingIsRemoved:
    async def test_a_stored_replay_switch_is_pruned(self, session_factory):
        await _store(session_factory, "air", "replayEnabled", True)
        await _store(session_factory, "air", "sourceOverride", "online")

        await database.prune_removed_settings()

        assert await _air_keys(session_factory) == {"sourceOverride"}

    async def test_an_uploaded_config_cannot_bring_it_back(self, session_factory):
        async with session_factory() as session:
            await apply_config(
                session, {"air": {"replayEnabled": True, "sourceOverride": "online"}}
            )

        keys = await _air_keys(session_factory)
        assert "replayEnabled" not in keys
        assert "sourceOverride" in keys
