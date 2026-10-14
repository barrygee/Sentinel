"""The radio hub's schema: `create_radio_hub_tables()` builds its one table.

That is its service database's whole schema, or its share of the shared one
when core hosts the hub in-process.
"""

from backend.database import create_section_tables

# All the radio hub service's own database holds; a legacy import copies it.
RADIO_HUB_TABLES: tuple[str, ...] = ("sentry_hosts",)


async def create_radio_hub_tables() -> None:
    """Create the Sentry hosts table the hub polls and claims dongles through.

    `sentry_hosts` has not gained a column since its first release.
    """
    from sentinel_radio import models  # noqa: F401 — import triggers model registration with Base

    await create_section_tables(RADIO_HUB_TABLES)
