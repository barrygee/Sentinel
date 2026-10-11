"""Copying a section's tables out of the monolith's database (plan §4.3, "legacy import").

When a section first starts in its own container its database is empty, while
its data still sits in the monolith's `sentinel.db`. With that file mounted
(`LEGACY_DB_PATH`), each listed table that is empty here is filled from the
legacy one. A table that already has rows is never touched, so the import runs
once in effect and is safe on every boot.

Only the columns both sides have are copied, so a legacy file from before a
column was added still imports (the new column takes its default).

Some rows name files that sit beside the monolith's database (the SDR
section's recordings); `import_legacy_files` copies those along with them.
"""

from __future__ import annotations

import logging
import shutil
import sqlite3
from collections.abc import Iterable, Sequence
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
        # Said out loud: on a fresh stack the service can start before the app
        # has created its database, and silence would look like a failed import.
        logger.info("legacy import: no monolith database at %r; nothing to import", legacy_db_path)
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
    if not copied:
        logger.info("legacy import: %s already hold data or are missing from %s", ", ".join(tables), legacy_db_path)
    return copied


def import_legacy_files(legacy_dir: Path, target_dir: Path, file_names: Iterable[str]) -> int:
    """Copy each of `file_names` from `legacy_dir` into `target_dir`; returns how many were copied.

    Meant for the files a just-imported table's rows refer to, so call it only
    for a table `import_legacy_tables` copied on this boot: a file deleted
    since then, together with its row, must not come back on the next boot.
    A file already in `target_dir` is kept, and one missing from `legacy_dir`
    (a recording whose file was lost) is skipped. Names come from the copied
    rows, never from input, and are taken as bare file names.
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    copied_count = 0
    copied_bytes = 0
    for file_name in file_names:
        source = legacy_dir / Path(file_name).name
        destination = target_dir / Path(file_name).name
        if destination.exists() or not source.is_file():
            continue
        try:
            shutil.copy2(source, destination)
        except OSError:
            # One unreadable file (or a full disk) must not stop the service starting.
            logger.exception("legacy import: could not copy %s", source)
            destination.unlink(missing_ok=True)
            continue
        copied_count += 1
        copied_bytes += destination.stat().st_size
    if copied_count:
        logger.info(
            "legacy import: copied %d files (%.1f MB) from %s into %s",
            copied_count,
            copied_bytes / 1_000_000,
            legacy_dir,
            target_dir,
        )
    return copied_count
