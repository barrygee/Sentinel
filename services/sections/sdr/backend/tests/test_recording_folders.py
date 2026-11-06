"""Where recordings are saved (sentinel_sdr.services.recording_folders).

Pinned here:
  * the root is `RECORDINGS_DIRECTORY`, or recordings/ beside the database;
  * a new recording's folder is the root, created if needed;
  * each recording's files are found in the folder it remembers, and a row
    from before recordings remembered one in the old recordings/ folder.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from backend.config import settings

from sentinel_sdr.models import SdrRecording
from sentinel_sdr.services.recording_folders import (
    folder_for_new_recording,
    iq_path,
    recording_folder,
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
    monkeypatch.setattr(settings, "recordings_directory", str(root))
    return root


def recording(recording_id: int, directory: str = "") -> SdrRecording:
    return SdrRecording(id=recording_id, directory=directory)


class TestRecordingsRoot:
    def test_is_recordings_beside_the_database_by_default(self, tmp_path):
        assert recordings_root() == tmp_path / "data" / "recordings"

    def test_is_the_configured_directory_when_set(self, configured_root):
        assert recordings_root() == configured_root


class TestFolderForNewRecording:
    def test_creates_and_returns_the_configured_root(self, configured_root):
        assert folder_for_new_recording() == configured_root
        assert configured_root.is_dir()

    def test_creates_the_default_root_when_nothing_is_configured(self, tmp_path):
        folder = folder_for_new_recording()

        assert folder == tmp_path / "data" / "recordings"
        assert folder.is_dir()

    def test_a_root_that_already_exists_is_fine(self, configured_root):
        configured_root.mkdir()

        assert folder_for_new_recording() == configured_root


class TestARecordingsFiles:
    def test_are_in_the_folder_it_was_saved_in(self, tmp_path):
        saved_in = tmp_path / "anywhere" / "noaa"

        assert recording_folder(recording(4, str(saved_in))) == saved_in
        assert wav_path(recording(4, str(saved_in))) == saved_in / "4.wav"
        assert iq_path(recording(4, str(saved_in))) == saved_in / "4.u8"

    def test_of_a_recording_with_no_folder_are_beside_the_database(self, tmp_path, configured_root):
        # Even with a root configured now: it was saved before there was one.
        legacy = tmp_path / "data" / "recordings"

        assert wav_path(recording(9)) == legacy / "9.wav"
        assert iq_path(recording(9)) == legacy / "9.u8"
