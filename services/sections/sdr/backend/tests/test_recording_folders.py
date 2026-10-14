"""Where recordings are saved (sentinel_sdr.services.recording_folders).

Pinned here:
  * the root is `RECORDINGS_DIRECTORY`, or recordings/ beside the database;
  * the `sdr.recordingsFolder` setting is only ever a subfolder of the root —
    absolute paths, `.`/`..`, backslashes, control characters, over-long or
    over-deep values and symlinks out of the root are refused;
  * a new recording's folder falls back to the root, with a warning, whenever
    the setting is refused, unreadable or can't be created;
  * each recording's files are found in the folder it remembers, and a row
    from before the setting existed in the old recordings/ folder.
"""

from __future__ import annotations

import logging
from pathlib import Path, PurePosixPath

import pytest
from backend.config import settings

from sentinel_sdr.models import SdrRecording
from sentinel_sdr.services import recording_folders
from sentinel_sdr.services.recording_folders import (
    MAX_FOLDER_DEPTH,
    MAX_FOLDER_LENGTH,
    RecordingsFolderError,
    folder_for_new_recording,
    iq_path,
    parse_recordings_folder,
    recording_folder,
    recordings_folder_path,
    recordings_root,
    wav_path,
)


@pytest.fixture(autouse=True)
def data_directory(monkeypatch, tmp_path):
    """The SDR database lives in tmp_path/data; no recordings root is configured."""
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "data" / "sdr.db"))
    monkeypatch.setattr(settings, "recordings_directory", "")


@pytest.fixture()
def configured_root(monkeypatch, tmp_path) -> Path:
    """A recordings root of its own, as compose's /recordings."""
    root = tmp_path / "recordings-root"
    root.mkdir()
    monkeypatch.setattr(settings, "recordings_directory", str(root))
    return root


def stored_folder(monkeypatch, value=None, *, error: Exception | None = None) -> None:
    """Make the settings client answer `value` (or raise `error`) for sdr.recordingsFolder."""

    async def read_setting(db, namespace, key, default=None):
        assert (namespace, key) == ("sdr", "recordingsFolder")
        if error is not None:
            raise error
        return default if value is None else value

    monkeypatch.setattr(recording_folders.settings_client, "read_setting", read_setting)


def recording(recording_id: int, directory: str = "") -> SdrRecording:
    return SdrRecording(id=recording_id, directory=directory)


class TestRecordingsRoot:
    def test_is_recordings_beside_the_database_by_default(self, tmp_path):
        assert recordings_root() == tmp_path / "data" / "recordings"

    def test_is_the_configured_directory_when_set(self, configured_root):
        assert recordings_root() == configured_root


class TestParseRecordingsFolder:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("", PurePosixPath()),
            ("   ", PurePosixPath()),
            ("noaa", PurePosixPath("noaa")),
            ("satellites/noaa", PurePosixPath("satellites/noaa")),
            # Doubled and trailing slashes and surrounding spaces are harmless.
            ("  satellites//noaa/ ", PurePosixPath("satellites/noaa")),
            ("my recordings/2026-10", PurePosixPath("my recordings/2026-10")),
            ("v1.2", PurePosixPath("v1.2")),
            ("...", PurePosixPath("...")),
        ],
    )
    def test_accepts_a_relative_subfolder(self, value, expected):
        assert parse_recordings_folder(value) == expected

    @pytest.mark.parametrize(
        ("value", "reason"),
        [
            (None, "must be text"),
            (7, "must be text"),
            (["noaa"], "must be text"),
            ("/etc", "relative"),
            ("/", "relative"),
            ("C:/recordings", "relative"),
            ("c:", "relative"),
            ("..", "'.' or '..'"),
            ("../escape", "'.' or '..'"),
            ("noaa/../../escape", "'.' or '..'"),
            ("noaa/ .. /x", "'.' or '..'"),
            (".", "'.' or '..'"),
            ("./noaa", "'.' or '..'"),
            ("noaa\\escape", "backslash"),
            ("noaa\x00", "control character"),
            ("noaa\nnext", "control character"),
        ],
    )
    def test_refuses_anything_that_is_not_a_safe_subfolder(self, value, reason):
        with pytest.raises(RecordingsFolderError, match=reason):
            parse_recordings_folder(value)

    def test_accepts_the_longest_and_deepest_allowed(self):
        assert len(parse_recordings_folder("a" * MAX_FOLDER_LENGTH).parts) == 1
        assert len(parse_recordings_folder("/".join(["a"] * MAX_FOLDER_DEPTH)).parts) == MAX_FOLDER_DEPTH

    def test_refuses_one_character_too_long(self):
        with pytest.raises(RecordingsFolderError, match="longer than"):
            parse_recordings_folder("a" * (MAX_FOLDER_LENGTH + 1))

    def test_refuses_one_level_too_deep(self):
        with pytest.raises(RecordingsFolderError, match="deeper than"):
            parse_recordings_folder("/".join(["a"] * (MAX_FOLDER_DEPTH + 1)))


class TestRecordingsFolderPath:
    def test_is_the_subfolder_under_the_root(self, configured_root):
        assert recordings_folder_path("satellites/noaa") == configured_root.resolve() / "satellites" / "noaa"

    def test_empty_is_the_root(self, configured_root):
        assert recordings_folder_path("") == configured_root.resolve()

    def test_refuses_a_symlink_that_leads_out_of_the_root(self, configured_root, tmp_path):
        outside = tmp_path / "outside"
        outside.mkdir()
        (configured_root / "elsewhere").symlink_to(outside)

        with pytest.raises(RecordingsFolderError, match="outside the recordings root"):
            recordings_folder_path("elsewhere/noaa")

    def test_refuses_an_unsafe_value_before_resolving_it(self, configured_root):
        with pytest.raises(RecordingsFolderError):
            recordings_folder_path("../escape")


class TestFolderForNewRecording:
    async def test_creates_and_returns_the_configured_subfolder(self, configured_root, monkeypatch):
        stored_folder(monkeypatch, "satellites/noaa")

        folder = await folder_for_new_recording(None)

        assert folder == configured_root.resolve() / "satellites" / "noaa"
        assert folder.is_dir()

    async def test_unset_is_the_root(self, configured_root, monkeypatch):
        stored_folder(monkeypatch, None)

        assert await folder_for_new_recording(None) == configured_root.resolve()

    async def test_creates_the_default_root_when_nothing_is_configured(self, monkeypatch, tmp_path):
        stored_folder(monkeypatch, "")

        folder = await folder_for_new_recording(None)

        assert folder == (tmp_path / "data" / "recordings").resolve()
        assert folder.is_dir()

    async def test_an_unsafe_setting_falls_back_to_the_root_with_a_warning(self, configured_root, monkeypatch, caplog):
        stored_folder(monkeypatch, "../../app/data")

        with caplog.at_level(logging.WARNING, logger=recording_folders.__name__):
            folder = await folder_for_new_recording(None)

        assert folder == configured_root
        assert "Ignoring sdr.recordingsFolder (the recordings folder may not contain '.' or '..')" in caplog.text
        assert not (configured_root.parent / "app").exists()

    async def test_an_unreadable_setting_falls_back_to_the_root(self, configured_root, monkeypatch, caplog):
        stored_folder(monkeypatch, error=ConnectionError("core is down"))

        with caplog.at_level(logging.WARNING, logger=recording_folders.__name__):
            folder = await folder_for_new_recording(None)

        assert folder == configured_root
        assert "Could not read sdr.recordingsFolder (core is down)" in caplog.text

    async def test_a_folder_that_cannot_be_created_falls_back_to_the_root(self, configured_root, monkeypatch, caplog):
        # A file where the folder should go: mkdir fails.
        (configured_root / "taken").write_bytes(b"not a folder")
        stored_folder(monkeypatch, "taken/noaa")

        with caplog.at_level(logging.WARNING, logger=recording_folders.__name__):
            folder = await folder_for_new_recording(None)

        assert folder == configured_root
        assert "Could not create the recordings folder" in caplog.text


class TestARecordingsFiles:
    def test_are_in_the_folder_it_was_saved_in(self, tmp_path):
        saved_in = tmp_path / "anywhere" / "noaa"

        assert recording_folder(recording(4, str(saved_in))) == saved_in
        assert wav_path(recording(4, str(saved_in))) == saved_in / "4.wav"
        assert iq_path(recording(4, str(saved_in))) == saved_in / "4.u8"

    def test_of_a_recording_from_before_the_setting_are_beside_the_database(self, tmp_path, configured_root):
        # Even with a root configured now: it was saved before there was one.
        legacy = tmp_path / "data" / "recordings"

        assert wav_path(recording(9)) == legacy / "9.wav"
        assert iq_path(recording(9)) == legacy / "9.u8"
