"""The legacy import (backend/platform/sdk/legacy_import.py): a section's own
database is filled from the monolith's on first boot, once, read-only."""

import sqlite3
from pathlib import Path

import pytest

from backend.platform.sdk.legacy_import import import_legacy_tables


def make_db(path: Path, schema: list[str], rows: dict[str, list[tuple]] | None = None) -> Path:
    connection = sqlite3.connect(path)
    for statement in schema:
        connection.execute(statement)
    for table, table_rows in (rows or {}).items():
        for row in table_rows:
            placeholders = ", ".join("?" for _ in row)
            connection.execute(f"INSERT INTO {table} VALUES ({placeholders})", row)
    connection.commit()
    connection.close()
    return path


def rows(path: Path, table: str) -> list[tuple]:
    connection = sqlite3.connect(path)
    try:
        return connection.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
    finally:
        connection.close()


TLE_SCHEMA = "CREATE TABLE tle (norad_id TEXT PRIMARY KEY, line1 TEXT, line2 TEXT)"
CATALOGUE_SCHEMA = "CREATE TABLE catalogue (norad_id TEXT PRIMARY KEY, name TEXT)"


@pytest.fixture
def legacy(tmp_path) -> Path:
    return make_db(
        tmp_path / "legacy.db",
        [TLE_SCHEMA, CATALOGUE_SCHEMA, "CREATE TABLE unrelated (id INTEGER)"],
        {
            "tle": [("25544", "1 25544", "2 25544"), ("40069", "1 40069", "2 40069")],
            "catalogue": [("25544", "ISS")],
            "unrelated": [(1,)],
        },
    )


@pytest.fixture
def target(tmp_path) -> Path:
    return make_db(tmp_path / "service.db", [TLE_SCHEMA, CATALOGUE_SCHEMA])


class TestImportLegacyTables:
    def test_copies_every_listed_empty_table(self, legacy, target):
        copied = import_legacy_tables(str(target), str(legacy), ["tle", "catalogue"])

        assert copied == {"tle": 2, "catalogue": 1}
        assert rows(target, "tle") == [("25544", "1 25544", "2 25544"), ("40069", "1 40069", "2 40069")]
        assert rows(target, "catalogue") == [("25544", "ISS")]

    def test_only_listed_tables_are_copied(self, legacy, target):
        import_legacy_tables(str(target), str(legacy), ["catalogue"])

        assert rows(target, "tle") == []

    def test_a_table_that_already_has_rows_is_never_touched(self, legacy, target):
        connection = sqlite3.connect(target)
        connection.execute("INSERT INTO tle VALUES ('99999', 'mine', 'mine')")
        connection.commit()
        connection.close()

        copied = import_legacy_tables(str(target), str(legacy), ["tle", "catalogue"])

        assert copied == {"catalogue": 1}
        assert rows(target, "tle") == [("99999", "mine", "mine")]

    def test_is_idempotent(self, legacy, target):
        import_legacy_tables(str(target), str(legacy), ["tle"])

        assert import_legacy_tables(str(target), str(legacy), ["tle"]) == {}
        assert len(rows(target, "tle")) == 2

    def test_copies_only_the_columns_both_sides_have(self, tmp_path, target):
        # A legacy file from before `line2` existed, with a column since dropped.
        old = make_db(
            tmp_path / "old.db",
            ["CREATE TABLE tle (norad_id TEXT PRIMARY KEY, line1 TEXT, retired TEXT)"],
            {"tle": [("25544", "1 25544", "gone")]},
        )

        assert import_legacy_tables(str(target), str(old), ["tle"]) == {"tle": 1}
        assert rows(target, "tle") == [("25544", "1 25544", None)]

    def test_a_table_missing_from_the_legacy_file_is_skipped(self, tmp_path, target):
        partial = make_db(tmp_path / "partial.db", [TLE_SCHEMA], {"tle": [("25544", "a", "b")]})

        assert import_legacy_tables(str(target), str(partial), ["tle", "catalogue"]) == {"tle": 1}

    def test_never_writes_to_the_legacy_database(self, legacy, target):
        before = legacy.read_bytes()

        import_legacy_tables(str(target), str(legacy), ["tle", "catalogue"])

        assert legacy.read_bytes() == before

    @pytest.mark.parametrize("legacy_path", ["", "does-not-exist.db"])
    def test_no_legacy_file_means_nothing_to_import(self, tmp_path, target, legacy_path):
        path = str(tmp_path / legacy_path) if legacy_path else ""

        assert import_legacy_tables(str(target), path, ["tle"]) == {}

    def test_a_database_is_never_imported_into_itself(self, legacy):
        assert import_legacy_tables(str(legacy), str(legacy), ["tle"]) == {}

    def test_an_unreadable_legacy_file_imports_nothing_and_rolls_back(self, tmp_path, target):
        corrupt = tmp_path / "corrupt.db"
        corrupt.write_bytes(b"this is not a sqlite database" * 100)

        assert import_legacy_tables(str(target), str(corrupt), ["tle"]) == {}
        assert rows(target, "tle") == []

    def test_a_failure_part_way_rolls_back_every_table(self, tmp_path):
        # The second table's copy violates a constraint after the first has
        # been copied: neither may be left half-imported.
        legacy = make_db(
            tmp_path / "legacy.db",
            [TLE_SCHEMA, "CREATE TABLE strict (id TEXT)"],
            {"tle": [("25544", "a", "b")], "strict": [(None,)]},
        )
        target = make_db(tmp_path / "service.db", [TLE_SCHEMA, "CREATE TABLE strict (id TEXT NOT NULL)"])

        assert import_legacy_tables(str(target), str(legacy), ["tle", "strict"]) == {}
        assert rows(target, "tle") == []

    def test_the_legacy_database_is_attached_read_only(self, legacy, target, monkeypatch):
        """Even a bug that tried to write to the monolith's database could not."""
        from backend.platform.sdk import legacy_import

        write_attempts: list[str] = []
        real_connect = sqlite3.connect

        def connect_and_try_writing(*args, **kwargs):
            connection = real_connect(*args, **kwargs)

            class WriteProbe:
                def execute(self, sql, *params):
                    cursor = connection.execute(sql, *params)
                    if sql.startswith("ATTACH"):
                        try:
                            connection.execute("DELETE FROM legacy.tle")
                            write_attempts.append("written")
                        except sqlite3.OperationalError as error:
                            write_attempts.append(str(error))
                    return cursor

                def __getattr__(self, name):
                    return getattr(connection, name)

            return WriteProbe()

        monkeypatch.setattr(legacy_import.sqlite3, "connect", connect_and_try_writing)

        import_legacy_tables(str(target), str(legacy), ["tle"])

        assert write_attempts == ["attempt to write a readonly database"]
        assert len(rows(legacy, "tle")) == 2


class TestLegacyImportLogging:
    """A first boot that copies nothing must say so: on a fresh stack the
    service can start before the app has created its database."""

    def test_says_so_when_there_is_no_legacy_database(self, tmp_path, target, caplog):
        with caplog.at_level("INFO", logger="backend.platform.sdk.legacy_import"):
            import_legacy_tables(str(target), str(tmp_path / "missing.db"), ["tle"])

        assert "no monolith database" in caplog.text

    def test_says_so_when_every_table_already_has_data(self, legacy, target, caplog):
        import_legacy_tables(str(target), str(legacy), ["tle"])
        caplog.clear()

        with caplog.at_level("INFO", logger="backend.platform.sdk.legacy_import"):
            import_legacy_tables(str(target), str(legacy), ["tle"])

        assert "tle already hold data or are missing" in caplog.text

    def test_reports_each_table_it_copied(self, legacy, target, caplog):
        with caplog.at_level("INFO", logger="backend.platform.sdk.legacy_import"):
            import_legacy_tables(str(target), str(legacy), ["tle", "catalogue"])

        assert "copied 2 rows into tle" in caplog.text
        assert "copied 1 rows into catalogue" in caplog.text
        assert "already hold data" not in caplog.text
