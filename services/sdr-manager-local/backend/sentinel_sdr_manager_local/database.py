"""SDR Manager's schema and the rows it seeds, in its own database (`DB_PATH`).

No Alembic (ADR 0007): the tables are built from the models with
`create_section_tables`, the way every section builds its own, at Sentry's
final schema. A column added after this release gets an ALTER in
`SDR_MANAGER_LOCAL_ADDED_COLUMNS`, because SQLite's `create_all` never adds a
column to an existing table.

The single-row tables (`console_auth`, `host_control_settings`) are seeded
here, as Sentry's migrations seeded them, so no request path has to decide
whether its row exists. Seeding never touches a row that is already there.
"""

from __future__ import annotations

import secrets

from backend import database as core_database
from backend.database import create_section_tables
from sqlalchemy import select

from sentinel_sdr_manager_local.models import ConsoleAuthModel, HostControlSettingsModel

SDR_MANAGER_LOCAL_TABLES: tuple[str, ...] = (
    "sdr_devices",
    "device_reservations",
    "console_auth",
    "host_control_settings",
)

# ALTERs for columns added after the first release (a duplicate is ignored). None yet.
SDR_MANAGER_LOCAL_ADDED_COLUMNS: tuple[str, ...] = ()

SINGLE_ROW_ID = 1


async def create_sdr_manager_local_tables() -> None:
    """Create SDR Manager's tables, and ALTER in columns added since their first release."""
    await create_section_tables(SDR_MANAGER_LOCAL_TABLES, SDR_MANAGER_LOCAL_ADDED_COLUMNS)


async def seed_single_row_tables() -> None:
    """Insert the `console_auth` and `host_control_settings` rows when missing.

    The session secret is generated per install, so a cookie minted by one
    machine's SDR Manager means nothing to another's — they all answer on
    port 8000, and an operator may well run several.
    """
    # Looked up at call time, so a test's patch of the session factory applies.
    async with core_database.AsyncSessionLocal() as session:
        if await session.scalar(select(ConsoleAuthModel.id).where(ConsoleAuthModel.id == SINGLE_ROW_ID)) is None:
            session.add(
                ConsoleAuthModel(
                    id=SINGLE_ROW_ID,
                    password_hash=None,
                    password_version=0,
                    session_secret=secrets.token_urlsafe(48),
                    updated_at=0,
                )
            )
        if (
            await session.scalar(
                select(HostControlSettingsModel.id).where(HostControlSettingsModel.id == SINGLE_ROW_ID)
            )
            is None
        ):
            session.add(HostControlSettingsModel(id=SINGLE_ROW_ID, hotspot_control_enabled=False, updated_at=0))
        await session.commit()
