"""sdr-manager-remote's schema: `create_sdr_manager_remote_tables()` builds its one table.

That is its service database's whole schema (or its share of the test suite's
shared one). No migrations: a column added later is an idempotent ALTER
(`SDR_MANAGER_REMOTE_ADDED_COLUMNS`), as core's own tables do (ADR 0007).
"""

from backend.database import create_section_tables

# All the sdr-manager-remote service's own database holds.
SDR_MANAGER_REMOTE_TABLES: tuple[str, ...] = ("remote_sdr_hosts",)

# Columns added after the table first shipped, for databases created before them.
SDR_MANAGER_REMOTE_ADDED_COLUMNS: tuple[str, ...] = (
    "ALTER TABLE remote_sdr_hosts ADD COLUMN auto_add_sdrs BOOLEAN NOT NULL DEFAULT 0",
)


async def create_sdr_manager_remote_tables() -> None:
    """Create the remote SDR hosts table the service polls and leases dongles through."""
    from sentinel_sdr_manager_remote import models  # noqa: F401 — import triggers model registration with Base

    await create_section_tables(SDR_MANAGER_REMOTE_TABLES, SDR_MANAGER_REMOTE_ADDED_COLUMNS)
