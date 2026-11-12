"""The Sea section's schema: its own tables, in its service database (or the shared one in-process)."""

from backend.database import create_section_tables

from sentinel_sea import models  # noqa: F401 — registers Sea's tables with Base

SEA_TABLES: tuple[str, ...] = ("sea_vessel_cache", "sea_vessel_static")

# Columns added after a table's first release (each ALTER is skipped where the
# column already exists).
SEA_ADDED_COLUMNS: tuple[str, ...] = ("ALTER TABLE sea_vessel_cache ADD COLUMN source_mode TEXT",)


async def create_sea_tables() -> None:
    """Create Sea's tables: the vessel warm-start snapshot and static data.

    The snapshot gained ``source_mode`` (which feed heard each vessel). The
    AISStream key is not Sea's to store: it is a setting, kept in core (secret).
    """
    await create_section_tables(SEA_TABLES, SEA_ADDED_COLUMNS)
