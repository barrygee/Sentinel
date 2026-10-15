"""Where a recording's files go: its WAV (`<id>.wav`) and raw IQ (`<id>.u8`), side by side.

Two settings decide it:

- the **recordings root**, `RECORDINGS_DIRECTORY` (backend/config.py): a folder
  the SDR service can write. Under compose it is `/recordings`, the
  `sdr_recordings` volume or the host folder `SENTINEL_RECORDINGS_DIRECTORY`
  names in `.env`. Unset, it is `recordings/` next to the database.
- the **recordings folder**, `sdr.recordingsFolder` (Settings › SDR and the
  config file): a subfolder of the root, e.g. `satellites/noaa`. Empty means
  the root itself.

The setting comes from a browser or a hand-edited config file, so it is never
trusted as a path: an absolute path, a `..` or `.` part, a backslash or a
control character is refused, and the result must still sit under the root
after symlinks resolve. A refused or unreadable value falls back to the root,
so a recording is never lost to a bad setting.

Each recording remembers the folder it was saved in (`SdrRecording.directory`),
so changing either setting only moves *new* recordings; older ones keep
playing, downloading and deleting from where they are. A row with no folder
predates this and lives in `recordings/` next to the database.
"""

from __future__ import annotations

import logging
from pathlib import Path, PurePosixPath

from backend.config import settings
from backend.platform import settings_client
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sdr.database import sdr_recordings_dir
from sentinel_sdr.models import SdrRecording

logger = logging.getLogger(__name__)

RECORDINGS_FOLDER_SETTING = "recordingsFolder"

# Generous for a folder name, small enough that a path can never grow unbounded.
MAX_FOLDER_LENGTH = 200
MAX_FOLDER_DEPTH = 8


class RecordingsFolderError(ValueError):
    """The `sdr.recordingsFolder` value is not a safe subfolder of the recordings root."""


def recordings_root() -> Path:
    """The folder every new recording is saved under (see the module docstring)."""
    if settings.recordings_directory:
        return Path(settings.recordings_directory)
    return sdr_recordings_dir()


def parse_recordings_folder(value: object) -> PurePosixPath:
    """`value` as a relative subfolder of the root; raises `RecordingsFolderError` when it isn't a safe one."""
    if not isinstance(value, str):
        raise RecordingsFolderError("the recordings folder must be text")
    folder = value.strip()
    if len(folder) > MAX_FOLDER_LENGTH:
        raise RecordingsFolderError(f"the recordings folder is longer than {MAX_FOLDER_LENGTH} characters")
    if any(ord(character) < 32 or character == "\\" for character in folder):
        raise RecordingsFolderError("the recordings folder holds a backslash or control character")
    if folder.startswith("/") or (len(folder) > 1 and folder[1] == ":"):
        raise RecordingsFolderError("the recordings folder must be relative to the recordings root")
    # "a//b" and a trailing "/" are harmless; "." and ".." parts are not.
    parts = [part for part in folder.split("/") if part]
    if any(part.strip() in (".", "..") for part in parts):
        raise RecordingsFolderError("the recordings folder may not contain '.' or '..'")
    if len(parts) > MAX_FOLDER_DEPTH:
        raise RecordingsFolderError(f"the recordings folder is deeper than {MAX_FOLDER_DEPTH} levels")
    return PurePosixPath(*parts)


def recordings_folder_path(value: object) -> Path:
    """The absolute folder `value` names under the root; raises `RecordingsFolderError` when unsafe.

    Checked again after resolving, so a symlink inside the root can't lead out of it.
    """
    root = recordings_root().resolve()
    folder = (root / parse_recordings_folder(value)).resolve()
    if not folder.is_relative_to(root):
        raise RecordingsFolderError("the recordings folder leads outside the recordings root")
    return folder


async def folder_for_new_recording(db: AsyncSession | None) -> Path:
    """The folder a recording starting now is saved in, created if needed.

    Falls back to the root (with a warning) when the setting is unreadable,
    unsafe, or names a folder that can't be created.
    """
    root = recordings_root()
    try:
        # Looked up at call time, so tests can patch the settings client.
        value = await settings_client.read_setting(db, "sdr", RECORDINGS_FOLDER_SETTING, default="")
    except Exception as error:  # noqa: BLE001 - core unreachable must not stop a recording
        # Read and create are kept apart: a connection error is an OSError too.
        logger.warning("Could not read sdr.%s (%s); saving to %s", RECORDINGS_FOLDER_SETTING, error, root)
    else:
        try:
            folder = recordings_folder_path(value)
            folder.mkdir(parents=True, exist_ok=True)
            return folder
        except RecordingsFolderError as error:
            logger.warning("Ignoring sdr.%s (%s); saving to %s", RECORDINGS_FOLDER_SETTING, error, root)
        except OSError as error:
            logger.warning("Could not create the recordings folder (%s); saving to %s", error, root)
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
