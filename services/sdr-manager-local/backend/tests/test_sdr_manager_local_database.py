"""Tests for `database.py`: the schema without Alembic, and the single-row seeding.

Seeding runs on every start, so it must be idempotent and must never touch a
row that is already there — re-seeding the console row would rotate the
session secret (signing everyone out) or, worse, clear a password.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_database.py
"""

from __future__ import annotations

from backend import database as core_database
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncEngine

from sentinel_sdr_manager_local.database import (
    SDR_MANAGER_LOCAL_ADDED_COLUMNS,
    SDR_MANAGER_LOCAL_TABLES,
    SINGLE_ROW_ID,
    create_sdr_manager_local_tables,
    seed_single_row_tables,
)
from sentinel_sdr_manager_local.models import ConsoleAuthModel, HostControlSettingsModel


async def _table_names(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as connection:
        return set(await connection.run_sync(lambda sync_connection: inspect(sync_connection).get_table_names()))


async def _console_rows() -> list[ConsoleAuthModel]:
    async with core_database.AsyncSessionLocal() as session:
        return list((await session.scalars(select(ConsoleAuthModel))).all())


async def _host_control_rows() -> list[HostControlSettingsModel]:
    async with core_database.AsyncSessionLocal() as session:
        return list((await session.scalars(select(HostControlSettingsModel))).all())


class TestSchema:
    async def test_creates_exactly_its_own_tables(self, sdr_manager_local_database: AsyncEngine) -> None:
        await create_sdr_manager_local_tables()

        # Only SDR Manager's tables: none of core's, and no `sentry_location`
        # (its position is Sentinel's Location setting now).
        assert await _table_names(sdr_manager_local_database) == set(SDR_MANAGER_LOCAL_TABLES)
        assert "sentry_location" not in SDR_MANAGER_LOCAL_TABLES

    async def test_is_safe_to_run_on_every_start(self, sdr_manager_local_database: AsyncEngine) -> None:
        await create_sdr_manager_local_tables()
        await create_sdr_manager_local_tables()

        assert await _table_names(sdr_manager_local_database) == set(SDR_MANAGER_LOCAL_TABLES)

    def test_has_no_added_columns_yet(self) -> None:
        # Its tables start at Sentry's final schema; the first column added
        # after this release belongs here as an ALTER.
        assert SDR_MANAGER_LOCAL_ADDED_COLUMNS == ()


class TestSeeding:
    async def test_seeds_an_open_console_and_hotspot_control_off(self, seeded_database: AsyncEngine) -> None:
        (console,) = await _console_rows()
        (host_control,) = await _host_control_rows()

        assert console.id == SINGLE_ROW_ID
        assert console.password_hash is None
        assert console.password_version == 0
        assert len(console.session_secret) >= 48
        assert host_control.id == SINGLE_ROW_ID
        assert host_control.hotspot_control_enabled is False

    async def test_is_idempotent(self, seeded_database: AsyncEngine) -> None:
        (before,) = await _console_rows()

        await seed_single_row_tables()
        await seed_single_row_tables()

        (after,) = await _console_rows()
        assert len(await _host_control_rows()) == 1
        # The same secret: re-seeding must not sign every session out.
        assert after.session_secret == before.session_secret

    async def test_never_overwrites_a_set_password_or_switched_on_control(self, seeded_database: AsyncEngine) -> None:
        async with core_database.AsyncSessionLocal() as session:
            console = await session.get(ConsoleAuthModel, SINGLE_ROW_ID)
            host_control = await session.get(HostControlSettingsModel, SINGLE_ROW_ID)
            assert console is not None and host_control is not None
            console.password_hash = "argon2-hash"
            console.password_version = 3
            host_control.hotspot_control_enabled = True
            await session.commit()

        await seed_single_row_tables()

        (console_after,) = await _console_rows()
        (host_control_after,) = await _host_control_rows()
        assert (console_after.password_hash, console_after.password_version) == ("argon2-hash", 3)
        assert host_control_after.hotspot_control_enabled is True

    async def test_seeds_only_the_row_that_is_missing(self, sdr_manager_local_database: AsyncEngine) -> None:
        await create_sdr_manager_local_tables()
        async with core_database.AsyncSessionLocal() as session:
            session.add(HostControlSettingsModel(id=SINGLE_ROW_ID, hotspot_control_enabled=True, updated_at=5))
            await session.commit()

        await seed_single_row_tables()

        assert len(await _console_rows()) == 1
        (host_control,) = await _host_control_rows()
        assert (host_control.hotspot_control_enabled, host_control.updated_at) == (True, 5)

    async def test_a_reseeded_console_row_gets_a_new_session_secret(self, seeded_database: AsyncEngine) -> None:
        # Generated per row, never a constant: two installs never share a
        # secret, so a cookie minted by one machine means nothing to another.
        (first,) = await _console_rows()
        async with core_database.AsyncSessionLocal() as session:
            await session.delete(await session.get(ConsoleAuthModel, SINGLE_ROW_ID))
            await session.commit()

        await seed_single_row_tables()

        (second,) = await _console_rows()
        assert second.session_secret != first.session_secret
