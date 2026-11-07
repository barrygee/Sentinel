"""Where a recording's files go: its WAV (`<id>.wav`) and raw IQ (`<id>.u8`), side by side.

New recordings are saved in the **recordings root**, `RECORDINGS_DIRECTORY`
(backend/config.py): a folder the SDR service can write. Under compose it is
`/recordings`, the `sdr_recordings` volume or the host folder
`SENTINEL_RECORDINGS_DIRECTORY` names in `.env`. Unset, it is `recordings/` next
to the database.

Each recording remembers the folder it was saved in (`SdrRecording.directory`),
so moving the root only moves *new* recordings; older ones keep playing,
downloading and deleting from where they are, including any saved in a subfolder
while that setting existed. A row with no folder predates that and lives in
`recordings/` next to the database.
"""

from __future__ import annotations

from pathlib import Path

from backend.config import settings

from sentinel_sdr.database import sdr_recordings_dir
from sentinel_sdr.models import SdrRecording


def recordings_root() -> Path:
    """The folder every new recording is saved in (see the module docstring)."""
    if settings.recordings_directory:
        return Path(settings.recordings_directory)
    return sdr_recordings_dir()


def folder_for_new_recording() -> Path:
    """The folder a recording starting now is saved in, created if needed."""
    root = recordings_root()
    root.mkdir(parents=True, exist_ok=True)
    return root


def recording_folder(recording: SdrRecording) -> Path:
    """The folder `recording`'s files were saved in."""
    return Path(recording.directory) if recording.directory else sdr_recordings_dir()


def wav_path(recording: SdrRecording) -> Path:
    """Where `recording`'s audio lives."""
    return recording_folder(recording) / f"{recording.id}.wav"


def iq_path(recording: SdrRecording) -> Path:
    """Where `recording`'s raw IQ lives once the SDR section holds it."""
    return recording_folder(recording) / f"{recording.id}.u8"
