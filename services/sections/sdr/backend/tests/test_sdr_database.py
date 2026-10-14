"""The SDR section's schema upgrades (sentinel_sdr.database): the columns added
to its tables after their first release and the backfills that give existing
rows sensible values. They moved here from core's `create_tables()` with the
section, so `create_sdr_tables()` now upgrades an older database itself —
in-process and in the SDR service alike."""

import pytest
from backend import database
from backend.config import settings
from sqlalchemy import inspect
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from sentinel_sdr import database as sdr_database
from sentinel_sdr.models import SdrFrequencyGroup, SdrStoredFrequency

# The two tables as they were before any column was added to them.
LEGACY_GROUPS_TABLE = (
    "CREATE TABLE sdr_frequency_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, "
    "color TEXT NOT NULL DEFAULT '#c8ff00', sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)"
)
LEGACY_FREQUENCIES_TABLE = (
    "CREATE TABLE sdr_stored_frequencies (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER, "
    "label TEXT NOT NULL, frequency_hz INTEGER NOT NULL, mode TEXT NOT NULL DEFAULT 'AM', "
    "squelch REAL NOT NULL DEFAULT -60.0, gain REAL NOT NULL DEFAULT 30.0, "
    "scannable INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)"
)


@pytest.fixture
async def sdr_engine(monkeypatch, tmp_path):
    """An empty in-memory database wired in as core's `database.engine`, its folder in `tmp_path`."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "data" / "sdr.db"))
    yield engine
    await engine.dispose()


async def execute(engine, *statements: str, **parameters) -> None:
    async with engine.begin() as connection:
        for statement in statements:
            await connection.execute(sa_text(statement), parameters)


async def fetch(engine, query: str) -> list[tuple]:
    async with engine.connect() as connection:
        return [tuple(row) for row in (await connection.execute(sa_text(query))).all()]


async def columns_of(engine, table: str) -> set[str]:
    async with engine.connect() as connection:
        return await connection.run_sync(lambda sync: {column["name"] for column in inspect(sync).get_columns(table)})


async def legacy_database(engine) -> None:
    """The two pre-upgrade tables, before `create_sdr_tables()` has ever run."""
    await execute(engine, LEGACY_GROUPS_TABLE, LEGACY_FREQUENCIES_TABLE)


async def add_legacy_frequency(engine, frequency_id: int, mode: str, group_id: int | None = None) -> None:
    await execute(
        engine,
        "INSERT INTO sdr_stored_frequencies (id, group_id, label, frequency_hz, mode, created_at) "
        "VALUES (:frequency_id, :group_id, 'f', 100000000, :mode, 0)",
        frequency_id=frequency_id,
        group_id=group_id,
        mode=mode,
    )


class TestAddedColumns:
    async def test_alters_every_added_column_into_an_older_database(self, sdr_engine):
        await legacy_database(sdr_engine)

        await sdr_database.create_sdr_tables()

        # The upgraded tables end up with exactly the models' columns.
        assert await columns_of(sdr_engine, "sdr_frequency_groups") == set(SdrFrequencyGroup.__table__.columns.keys())
        assert await columns_of(sdr_engine, "sdr_stored_frequencies") == set(
            SdrStoredFrequency.__table__.columns.keys()
        )

    async def test_names_only_columns_the_models_declare(self):
        for statement in sdr_database.SDR_ADDED_COLUMNS:
            _, _, table, _, _, column, *_ = statement.split()
            assert column in database.Base.metadata.tables[table].columns, statement

    async def test_gives_altered_columns_their_declared_defaults(self, sdr_engine):
        await legacy_database(sdr_engine)
        await add_legacy_frequency(sdr_engine, 1, "AM")

        await sdr_database.create_sdr_tables()

        assert await fetch(sdr_engine, "SELECT volume, zoom, zmin, zmax, favourite FROM sdr_stored_frequencies") == [
            (80, 1.0, 0.0, 0.0, 0)
        ]


class TestFrequencyBackfill:
    @pytest.mark.parametrize(
        ("mode", "bandwidth"),
        [
            ("WFM", 500000),
            ("NFM", 12500),
            ("AM", 10000),
            ("USB", 3000),
            ("LSB", 3000),
            ("CW", 500),
            ("DMR", 10000),  # any other mode
        ],
    )
    async def test_backfills_the_bandwidth_from_the_mode(self, sdr_engine, mode, bandwidth):
        await legacy_database(sdr_engine)
        await add_legacy_frequency(sdr_engine, 1, mode)

        await sdr_database.create_sdr_tables()

        assert await fetch(sdr_engine, "SELECT bandwidth, sample_rate FROM sdr_stored_frequencies") == [
            (bandwidth, 2048000)
        ]

    async def test_leaves_values_already_set_alone(self, sdr_engine):
        await sdr_database.create_sdr_tables()
        await execute(
            sdr_engine,
            "INSERT INTO sdr_stored_frequencies (id, label, frequency_hz, mode, squelch, gain, bandwidth, sample_rate, "
            "volume, zoom, zmin, zmax, scannable, favourite, notes, created_at) VALUES "
            "(1, 'set', 1, 'WFM', 0, 0, 7000, 1000000, 80, 1, 0, 0, 1, 0, '', 0), "
            "(2, 'unset', 1, 'NFM', 0, 0, NULL, NULL, 80, 1, 0, 0, 1, 0, '', 0)",
        )

        await sdr_database.create_sdr_tables()

        assert await fetch(sdr_engine, "SELECT id, bandwidth, sample_rate FROM sdr_stored_frequencies ORDER BY id") == [
            (1, 7000, 1000000),
            (2, 12500, 2048000),
        ]


class TestGroupSlugBackfill:
    async def test_derives_a_blank_slug_from_the_group_name(self, sdr_engine):
        await legacy_database(sdr_engine)
        await execute(sdr_engine, "INSERT INTO sdr_frequency_groups (id, name, created_at) VALUES (1, 'Air Band', 0)")

        await sdr_database.create_sdr_tables()

        assert await fetch(sdr_engine, "SELECT slug FROM sdr_frequency_groups") == [("air-band",)]

    @pytest.mark.parametrize("name", ["!!!", None])
    async def test_falls_back_to_the_group_id_when_the_name_gives_no_slug(self, sdr_engine, name):
        await legacy_database(sdr_engine)
        await execute(
            sdr_engine, "INSERT INTO sdr_frequency_groups (id, name, created_at) VALUES (7, :name, 0)", name=name
        )

        await sdr_database.create_sdr_tables()

        assert await fetch(sdr_engine, "SELECT slug FROM sdr_frequency_groups") == [("group-7",)]

    async def test_keeps_an_existing_slug_when_the_group_was_renamed(self, sdr_engine):
        await sdr_database.create_sdr_tables()
        await execute(
            sdr_engine,
            "INSERT INTO sdr_frequency_groups (id, name, slug, color, sort_order, created_at) "
            "VALUES (1, 'Renamed', 'original', '#c8ff00', 0, 0), (2, 'Blank', '', '#c8ff00', 0, 0)",
        )

        await sdr_database.create_sdr_tables()

        assert await fetch(sdr_engine, "SELECT id, slug FROM sdr_frequency_groups ORDER BY id") == [
            (1, "original"),
            (2, "blank"),
        ]


class TestGroupLinkBackfill:
    async def test_carries_each_legacy_group_id_into_the_links_table(self, sdr_engine):
        await legacy_database(sdr_engine)
        await add_legacy_frequency(sdr_engine, 1, "AM", group_id=3)
        await add_legacy_frequency(sdr_engine, 2, "AM", group_id=None)

        await sdr_database.create_sdr_tables()

        assert await fetch(sdr_engine, "SELECT frequency_id, group_id FROM sdr_frequency_group_links") == [(1, 3)]

    async def test_never_duplicates_a_link_on_a_later_boot(self, sdr_engine):
        await legacy_database(sdr_engine)
        await add_legacy_frequency(sdr_engine, 1, "AM", group_id=3)

        await sdr_database.create_sdr_tables()
        await sdr_database.create_sdr_tables()

        assert await fetch(sdr_engine, "SELECT frequency_id, group_id FROM sdr_frequency_group_links") == [(1, 3)]


class TestBackfillWithoutTheTables:
    async def test_skips_every_backfill_when_its_table_is_missing(self, sdr_engine):
        # Each backfill stands alone: a missing table (an OperationalError) is
        # skipped, never raised, so startup goes on.
        async with sdr_engine.begin() as connection:
            await sdr_database._backfill_added_columns(connection)

        assert await fetch(sdr_engine, "SELECT name FROM sqlite_master WHERE type = 'table'") == []
