"""The Air section's schema: its own tables, in its service database (or the shared one in-process)."""

from backend.database import create_section_tables

from sentinel_air import models  # noqa: F401 — registers Air's tables with Base

AIR_TABLES: tuple[str, ...] = ("adsb_cache", "air_tracking")
"""The tables copied from the legacy shared database on first boot."""

AIR_SERVICE_ONLY_TABLES: tuple[str, ...] = ("adsb_online_call", "adsb_online_refusal")
"""Tables added after the split: nothing to import, so only created."""


async def create_air_tables() -> None:
    """Create Air's tables. None has gained a column since its first release.

    `air_messages` is not Air's: notifications are core's, despite the path.
    """
    await create_section_tables(AIR_TABLES + AIR_SERVICE_ONLY_TABLES)
