"""Sea's schema upgrade (sentinel_sea.database): ``sea_vessel_cache`` gained
``source_mode`` after its first release, so ``create_sea_tables()`` must add it
to an existing database, keeping the rows already there with no source."""

import pytest
from backend import database
from backend.config import settings
from sqlalchemy import inspect
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from sentinel_sea import database as sea_database
from sentinel_sea.models import SeaVesselCache

# The snapshot table as it was before ``source_mode`` was added.
LEGACY_VESSEL_CACHE_TABLE = (
    "CREATE TABLE sea_vessel_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, mmsi TEXT NOT NULL UNIQUE, "
    "payload TEXT NOT NULL, track TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL)"
)


@pytest.fixture
async def sea_engine(monkeypatch, tmp_path):
    """An empty in-memory database wired in as core's `database.engine`, its folder in `tmp_path`."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "data" / "sea.db"))
    yield engine
    await engine.dispose()


async def columns_of(engine, table: str) -> set[str]:
    async with engine.connect() as connection:
        return await connection.run_sync(lambda sync: {column["name"] for column in inspect(sync).get_columns(table)})


class TestAddedColumns:
    async def test_adds_source_mode_to_an_older_snapshot_table_and_keeps_its_rows(self, sea_engine):
        async with sea_engine.begin() as connection:
            await connection.execute(sa_text(LEGACY_VESSEL_CACHE_TABLE))
            await connection.execute(
                sa_text("INSERT INTO sea_vessel_cache (mmsi, payload, updated_at) VALUES ('1', '{}', 5)")
            )

        await sea_database.create_sea_tables()

        assert await columns_of(sea_engine, "sea_vessel_cache") == set(SeaVesselCache.__table__.columns.keys())
        async with sea_engine.connect() as connection:
            rows = (await connection.execute(sa_text("SELECT mmsi, source_mode FROM sea_vessel_cache"))).all()
        # An old row has no recorded source, which the first source check drops.
        assert [tuple(row) for row in rows] == [("1", None)]

    async def test_a_second_boot_skips_the_column_it_already_added(self, sea_engine):
        await sea_database.create_sea_tables()
        await sea_database.create_sea_tables()

        assert "source_mode" in await columns_of(sea_engine, "sea_vessel_cache")

    async def test_names_only_columns_the_models_declare(self):
        for statement in sea_database.SEA_ADDED_COLUMNS:
            _, _, table, _, _, column, *_ = statement.split()
            assert column in database.Base.metadata.tables[table].columns, statement
