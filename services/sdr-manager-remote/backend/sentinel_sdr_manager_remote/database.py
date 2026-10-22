"""sdr-manager-remote's schema: `create_sdr_manager_remote_tables()` builds its one table.

That is its service database's whole schema (or its share of the test suite's
shared one). No migrations: every installation starts from this model (ADR 0007).
"""

from backend.database import create_section_tables

# All the sdr-manager-remote service's own database holds.
SDR_MANAGER_REMOTE_TABLES: tuple[str, ...] = ("remote_sdr_hosts",)


async def create_sdr_manager_remote_tables() -> None:
    """Create the remote SDR hosts table the service polls and leases dongles through."""
    from sentinel_sdr_manager_remote import models  # noqa: F401 — import triggers model registration with Base

    await create_section_tables(SDR_MANAGER_REMOTE_TABLES)
