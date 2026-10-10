"""Copying a section's tables out of the monolith's database (plan §4.3, "legacy import").

When a section first starts in its own container its database is empty, while
its data still sits in the monolith's `sentinel.db`. With that file mounted
(`LEGACY_DB_PATH`), each listed table that is empty here is filled from the
legacy one. A table that already has rows is never touched, so the import runs
once in effect and is safe on every boot.

Only the columns both sides have are copied, so a legacy file from before a
column was added still imports (the new column takes its default).
"""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Sequence
from pathlib import Path

logger = logging.getLogger(__name__)


def _columns(connection: sqlite3.Connection, schema: str, table: str) -> list[str]:
    return [row[1] for row in connection.execute(f'PRAGMA "{schema}".table_info("{table}")')]


def import_legacy_tables(target_db_path: str, legacy_db_path: str, tables: Sequence[str]) -> dict[str, int]:
    """Copy each of `tables` that is empty in the target from the legacy database.

    Returns `{table: rows copied}` for the tables that were copied. Table names
    come from code, never from input. Missing legacy file, missing legacy table
    or an unreadable file all mean "nothing to import" — a fresh install has none.
    """
    legacy = Path(legacy_db_path) if legacy_db_path else None
    if legacy is None or not legacy.is_file() or Path(target_db_path).resolve() == legacy.resolve():
        return {}
    copied: dict[str, int] = {}
    connection = sqlite3.connect(target_db_path, uri=True)
    try:
        # Read-only, so this can never write into the monolith's database.
        connection.execute("ATTACH DATABASE ? AS legacy", (f"{legacy.resolve().as_uri()}?mode=ro",))
        for table in tables:
            target_columns = _columns(connection, "main", table)
            legacy_columns = set(_columns(connection, "legacy", table))
            shared = [column for column in target_columns if column in legacy_columns]
            if not shared:
                continue
            if connection.execute(f'SELECT 1 FROM main."{table}" LIMIT 1').fetchone() is not None:
                continue
            column_list = ", ".join(f'"{column}"' for column in shared)
            cursor = connection.execute(
                f'INSERT INTO main."{table}" ({column_list}) SELECT {column_list} FROM legacy."{table}"'
            )
            copied[table] = cursor.rowcount
        connection.commit()
    except sqlite3.Error:
        logger.exception("legacy import from %s failed; starting with empty tables", legacy_db_path)
        connection.rollback()
        return {}
    finally:
        connection.close()
    for table, row_count in copied.items():
        logger.info("legacy import: copied %d rows into %s", row_count, table)
    return copied
