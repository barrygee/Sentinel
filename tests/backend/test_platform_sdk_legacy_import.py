"""The legacy import (backend/platform/sdk/legacy_import.py): a section's own
database is filled from the monolith's on first boot, once, read-only."""

import sqlite3
from pathlib import Path

import pytest

from backend.platform.sdk import legacy_import
from backend.platform.sdk.legacy_import import import_legacy_files, import_legacy_tables


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


@pytest.fixture
def legacy_files(tmp_path) -> Path:
    """The monolith's recordings folder."""
    folder = tmp_path / "legacy-recordings"
    folder.mkdir()
    (folder / "1.wav").write_bytes(b"wav one")
    (folder / "1.u8").write_bytes(b"iq one")
    (folder / "2.wav").write_bytes(b"wav two")
    return folder


class TestImportLegacyFiles:
    def test_copies_each_named_file_into_a_folder_it_makes(self, legacy_files, tmp_path):
        target_dir = tmp_path / "service" / "recordings"

        copied = import_legacy_files(legacy_files, target_dir, ["1.wav", "1.u8"])

        assert copied == 2
        assert {path.name: path.read_bytes() for path in target_dir.iterdir()} == {
            "1.wav": b"wav one",
            "1.u8": b"iq one",
        }

    def test_leaves_the_legacy_files_in_place(self, legacy_files, tmp_path):
        import_legacy_files(legacy_files, tmp_path / "target", ["1.wav"])

        assert (legacy_files / "1.wav").read_bytes() == b"wav one"

    def test_keeps_a_file_already_in_the_target(self, legacy_files, tmp_path):
        target_dir = tmp_path / "target"
        target_dir.mkdir()
        (target_dir / "1.wav").write_bytes(b"newer")

        copied = import_legacy_files(legacy_files, target_dir, ["1.wav", "2.wav"])

        assert copied == 1
        assert (target_dir / "1.wav").read_bytes() == b"newer"
        assert (target_dir / "2.wav").read_bytes() == b"wav two"

    def test_skips_a_file_missing_from_the_legacy_folder(self, legacy_files, tmp_path):
        target_dir = tmp_path / "target"

        copied = import_legacy_files(legacy_files, target_dir, ["3.wav", "2.wav"])

        assert copied == 1
        assert sorted(path.name for path in target_dir.iterdir()) == ["2.wav"]

    def test_skips_a_name_that_is_a_folder_not_a_file(self, legacy_files, tmp_path):
        (legacy_files / "4.wav").mkdir()

        assert import_legacy_files(legacy_files, tmp_path / "target", ["4.wav"]) == 0

    def test_takes_only_the_bare_file_name_so_nothing_outside_either_folder_is_touched(self, legacy_files, tmp_path):
        (tmp_path / "secret.wav").write_bytes(b"outside")
        target_dir = tmp_path / "service" / "recordings"

        copied = import_legacy_files(legacy_files, target_dir, ["../secret.wav", "../../1.wav"])

        # "../secret.wav" is looked up as legacy_files/secret.wav, which doesn't exist.
        assert copied == 1
        assert sorted(path.name for path in target_dir.iterdir()) == ["1.wav"]
        assert not (tmp_path / "service" / "secret.wav").exists()

    def test_copies_nothing_for_no_names(self, legacy_files, tmp_path):
        assert import_legacy_files(legacy_files, tmp_path / "target", []) == 0

    def test_a_failed_copy_is_logged_cleaned_up_and_does_not_stop_the_rest(
        self, legacy_files, tmp_path, monkeypatch, caplog
    ):
        target_dir = tmp_path / "target"
        real_copy = legacy_import.shutil.copy2

        def copy_failing_on_the_first(source, destination):
            if Path(source).name == "1.wav":
                Path(destination).write_bytes(b"partial")
                raise OSError("No space left on device")
            return real_copy(source, destination)

        monkeypatch.setattr(legacy_import.shutil, "copy2", copy_failing_on_the_first)

        with caplog.at_level("INFO", logger="backend.platform.sdk.legacy_import"):
            copied = import_legacy_files(legacy_files, target_dir, ["1.wav", "2.wav"])

        assert copied == 1
        assert not (target_dir / "1.wav").exists()
        assert (target_dir / "2.wav").read_bytes() == b"wav two"
        assert f"could not copy {legacy_files / '1.wav'}" in caplog.text
        assert "No space left on device" in caplog.text

    def test_a_failed_copy_that_left_nothing_behind_is_still_skipped(self, legacy_files, tmp_path, monkeypatch):
        def refuse(source, destination):
            raise PermissionError("Permission denied")

        monkeypatch.setattr(legacy_import.shutil, "copy2", refuse)

        assert import_legacy_files(legacy_files, tmp_path / "target", ["1.wav"]) == 0


class TestLegacyFileImportLogging:
    def test_reports_how_many_files_and_megabytes_it_copied_and_where(self, legacy_files, tmp_path, caplog):
        (legacy_files / "big.u8").write_bytes(b"\0" * 2_500_000)
        target_dir = tmp_path / "target"

        with caplog.at_level("INFO", logger="backend.platform.sdk.legacy_import"):
            import_legacy_files(legacy_files, target_dir, ["big.u8", "2.wav"])

        assert f"copied 2 files (2.5 MB) from {legacy_files} into {target_dir}" in caplog.text

    def test_says_nothing_when_it_copied_nothing(self, legacy_files, tmp_path, caplog):
        with caplog.at_level("INFO", logger="backend.platform.sdk.legacy_import"):
            import_legacy_files(legacy_files, tmp_path / "target", ["missing.wav"])

        assert caplog.text == ""
