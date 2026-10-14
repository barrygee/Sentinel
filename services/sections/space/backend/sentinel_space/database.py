"""The Space section's schema and startup data work.

`create_space_tables()` builds Space's own tables (its service database, or the
test suite's shared one); `backfill_satellite_radio_store()`
reconciles `backend/data/satellite_radio.json` into core's settings.
"""

from backend import database as core_database
from backend.database import create_section_tables
from backend.platform import settings_client

from sentinel_space import models  # noqa: F401 — registers Space's tables with Base
from sentinel_space.services import sat_radio

SPACE_TABLES: tuple[str, ...] = ("tle_cache", "satellite_catalogue")

# Columns added to satellite_catalogue after its first release. SQLite's
# create_all never adds a column to an existing table, so each is ALTERed in
# (a duplicate is an OperationalError, ignored).
SATELLITE_CATALOGUE_ADDED_COLUMNS: tuple[str, ...] = (
    "ALTER TABLE satellite_catalogue ADD COLUMN name_source TEXT",
    "ALTER TABLE satellite_catalogue ADD COLUMN uplink_hz INTEGER",
    "ALTER TABLE satellite_catalogue ADD COLUMN uplink_mode TEXT",
    "ALTER TABLE satellite_catalogue ADD COLUMN downlink_hz INTEGER",
    "ALTER TABLE satellite_catalogue ADD COLUMN downlink_mode TEXT",
    "ALTER TABLE satellite_catalogue ADD COLUMN ctcss_hz REAL",
    "ALTER TABLE satellite_catalogue ADD COLUMN transponder_type TEXT",
    "ALTER TABLE satellite_catalogue ADD COLUMN beacon_hz INTEGER",
    "ALTER TABLE satellite_catalogue ADD COLUMN packet_info TEXT",
    "ALTER TABLE satellite_catalogue ADD COLUMN radio_status TEXT",
    "ALTER TABLE satellite_catalogue ADD COLUMN radio_notes TEXT",
)


async def create_space_tables() -> None:
    """Create Space's tables, and ALTER in columns added since their first release."""
    await create_section_tables(SPACE_TABLES, SATELLITE_CATALOGUE_ADDED_COLUMNS)


async def backfill_satellite_radio_store() -> None:
    """Reconcile the on-disk satellite_radio.json source of truth into the
    persistent store (UserSettings space/satelliteRadio) on every startup.

    The file is authoritative for the entries it defines: its values are merged
    into the store, overwriting per-NORAD entries the file specifies. Entries
    that exist only in the store (e.g. a UI edit for a sat the file doesn't
    mention) are preserved. Hand-edits to the file therefore take effect on the
    next restart, while UI write-through keeps the file and store in sync.

    No-ops when nothing changes, so it's cheap to run on every boot.
    """
    # Through the settings client, because the store is core's: the Space
    # service reaches it over HTTP (`backend/platform/settings_client.py`).
    # Module lookups at call time, so tests can swap the store and the file.
    file_map = sat_radio.load_radio_file()

    # Looked up at call time, so a test's patch of core's session factory applies.
    async with core_database.AsyncSessionLocal() as session:
        stored = await settings_client.read_setting(session, "space", "satelliteRadio")
        store = stored if isinstance(stored, dict) else {}

        merged = {**store, **file_map}  # file wins per-key it defines
        if stored is not None and merged == store:
            return  # already in sync — nothing to write

        await settings_client.write_setting(session, "space", "satelliteRadio", merged)
