"""P0 parity baseline: the database schema.

Runs the real `backend.database.create_tables()` — ORM `Base.metadata.create_all`
plus every `ALTER TABLE` migration it applies on top (SQLite's `create_all`
does not add columns to a pre-existing table, so those ALTERs are how a table
that predates a later column gets it) — against a fresh in-memory engine, then
records every table's columns, primary key, indexes and unique constraints.

This covers the ALTER-migrated columns, not only `Base.metadata` on its own:
running `create_tables()` itself (rather than just `Base.metadata.create_all`)
is what makes the two paths indistinguishable in the golden, exactly what a
container split must preserve.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import inspect
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import create_async_engine

from backend import database as database_module
from tests.backend.parity.conftest import assert_golden, render_json


@pytest.fixture()
async def schema_engine(monkeypatch):
    """A fresh in-memory engine, with `database.engine` monkeypatched to it so
    `create_tables()` (which references the module-level `engine` global
    directly) builds the schema there instead of the real DB file."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    monkeypatch.setattr(database_module, "engine", engine)
    await database_module.create_tables()
    yield engine
    await engine.dispose()


def _reflect_schema(sync_connection) -> dict:
    inspector = inspect(sync_connection)
    schema: dict = {}
    for table_name in sorted(inspector.get_table_names()):
        pk_constraint = inspector.get_pk_constraint(table_name)
        pk_columns = set(pk_constraint.get("constrained_columns") or [])

        columns = []
        for column in inspector.get_columns(table_name):
            default = column.get("default")
            columns.append(
                {
                    "name": column["name"],
                    "type": str(column["type"]),
                    "nullable": bool(column["nullable"]),
                    "default": str(default) if default is not None else None,
                    "primary_key": column["name"] in pk_columns,
                }
            )

        indexes = [
            {
                "name": index["name"],
                "column_names": list(index["column_names"]),
                "unique": bool(index["unique"]),
            }
            for index in sorted(
                inspector.get_indexes(table_name), key=lambda entry: entry["name"] or ""
            )
        ]

        unique_constraints = [
            {
                "name": constraint["name"],
                "column_names": list(constraint["column_names"]),
            }
            for constraint in sorted(
                inspector.get_unique_constraints(table_name),
                key=lambda entry: entry["name"] or "",
            )
        ]

        schema[table_name] = {
            "columns": columns,
            "primary_key_columns": sorted(pk_columns),
            "indexes": indexes,
            "unique_constraints": unique_constraints,
        }
    return schema


async def _build_schema_snapshot(engine) -> dict:
    async with engine.connect() as connection:
        return await connection.run_sync(_reflect_schema)


class TestDatabaseSchema:
    async def test_schema_matches_golden(self, schema_engine):
        schema = await _build_schema_snapshot(schema_engine)
        assert_golden("db_schema", render_json(schema, sort_keys=True))

    async def test_schema_has_the_expected_core_tables(self, schema_engine):
        """Sanity check independent of the golden file."""
        schema = await _build_schema_snapshot(schema_engine)
        for table_name in (
            "user_settings",
            "sdr_radios",
            "sdr_stored_frequencies",
            "satellite_catalogue",
        ):
            assert table_name in schema

    async def test_alter_migrated_columns_are_present(self, schema_engine):
        """Sanity check that the ALTER-added columns (not part of the base ORM
        model definition on an old table) actually landed — this is the part
        plain `Base.metadata.create_all` alone would not prove."""
        schema = await _build_schema_snapshot(schema_engine)
        column_names = {
            column["name"] for column in schema["sdr_stored_frequencies"]["columns"]
        }
        assert "favourite" in column_names
        assert "zoom" in column_names

    async def test_can_actually_fail_on_a_dropped_column(self, schema_engine):
        """Validity check: removing a column from the snapshot must turn the
        golden comparison red."""
        schema = await _build_schema_snapshot(schema_engine)
        mutated = json.loads(render_json(schema, sort_keys=True))
        mutated["user_settings"]["columns"].pop()
        with pytest.raises(AssertionError):
            assert_golden(
                "db_schema", render_json(mutated, sort_keys=True), allow_update=False
            )
