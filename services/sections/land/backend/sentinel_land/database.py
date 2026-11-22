"""The Land section's schema: its own tables, in its service database (or the shared one in-process)."""

from backend.database import create_section_tables

from sentinel_land import models  # noqa: F401 — registers Land's tables with Base

LAND_TABLES: tuple[str, ...] = ("aprs_stations", "repeater_cache")


# Movement history & replay (removed 2026-11-22) recorded into this table; it is
# dropped on startup so the history doesn't linger on disk.
REMOVED_HISTORY_TABLES: tuple[str, ...] = ("land_position_history",)


async def create_land_tables() -> None:
    """Create Land's tables. Neither has gained a column since its first release."""
    await create_section_tables(LAND_TABLES, removed_tables=REMOVED_HISTORY_TABLES)
