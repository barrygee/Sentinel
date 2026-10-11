"""The SDR section as its own service (P6.6): `uvicorn backend.standalone.sdr:app`.

Owns the stored frequencies, frequency groups, scanner search ranges and
recordings in its own database (`DB_PATH`), copied from the monolith's on first
boot (`LEGACY_DB_PATH`) together with the recordings' WAV and IQ files, which
live in `recordings/` next to the database. It serves the rest of `/api/sdr/`:
everything that touches a radio has longer prefixes (the radio hub's) or is
Air's (`/api/sdr/adsb/`), and the gateway's longest-prefix match sends those
there. Its UI remote is the SDR section's, radio panes and audio engine included.

Settings stay in core and are read over HTTP: the band plan (`sdr.bandPlan`,
which the waterfall reads), `sdr.recordRawIq`, and the settings mirrors of its
tables (`sdr.groups`, `sdr.frequencies`, `sdr.searchRanges`), which it rewrites
in core after every edit so the live config file keeps showing them. Raw-IQ
captures go through the radio hub over NATS (`hub.iq-capture.*`), so
`NATS_URL` must be set; the hub writes `<id>.u8` straight into this service's
recordings folder (its volume is mounted wherever the hub runs).
"""

from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

from backend.config import settings
from backend.database import SDR_TABLES, create_sdr_tables, sdr_recordings_dir
from backend.modules.sdr import lifecycle as sdr_lifecycle
from backend.modules.sdr import manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.remote_files import remotes_dir
from backend.platform.sdk import create_service
from backend.platform.sdk.legacy_import import import_legacy_files, import_legacy_tables
from backend.routers import sdr


def _recording_file_names(db_path: str) -> list[str]:
    """The files the recordings in `db_path` refer to: each one's WAV, and its raw IQ when it has one."""
    connection = sqlite3.connect(db_path)
    try:
        rows = connection.execute("SELECT id, has_iq_file FROM sdr_recordings").fetchall()
    finally:
        connection.close()
    file_names = []
    for recording_id, has_iq_file in rows:
        file_names.append(f"{int(recording_id)}.wav")
        if has_iq_file:
            file_names.append(f"{int(recording_id)}.u8")
    return file_names


def _import_legacy() -> None:
    copied = import_legacy_tables(settings.db_path, settings.legacy_db_path, SDR_TABLES)
    # Only on the boot that copied the recordings: a recording deleted here
    # since must not have its file brought back.
    if "sdr_recordings" in copied:
        import_legacy_files(
            Path(settings.legacy_db_path).parent / "recordings",
            sdr_recordings_dir(),
            _recording_file_names(settings.db_path),
        )


async def _prepare() -> None:
    await create_sdr_tables()
    await asyncio.to_thread(_import_legacy)


app = create_service(
    manifest=manifest,
    routers=[sdr.router],
    # The monolith's SDR lifecycle (seed the frequency tables and the band plan
    # from their data files, then mirror the tables into core's settings),
    # unchanged, after this service's own schema and legacy import — so an
    # imported catalogue is never re-seeded from the file.
    lifecycles=[
        ModuleLifecycle(name="sdr-schema", prepare=_prepare),
        sdr_lifecycle,
    ],
    remote_dir=remotes_dir() / "sdr",
)
