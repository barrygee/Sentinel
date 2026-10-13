"""The Land section's schema: its own tables, in its service database (or the shared one in-process)."""

from backend.database import create_section_tables

from sentinel_land import models  # noqa: F401 — registers Land's tables with Base

LAND_TABLES: tuple[str, ...] = ("aprs_stations", "repeater_cache")


async def create_land_tables() -> None:
    """Create Land's tables. Neither has gained a column since its first release."""
    await create_section_tables(LAND_TABLES)
