"""sdr-manager-remote's schema (sentinel_sdr_manager_remote/database.py): its one
table, built the same way in its own database as in the test suite's shared one.

Moved with the table from the radio hub's standalone tests.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from backend import database
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from sentinel_sdr_manager_remote import database as remote_database

REPO_ROOT = Path(__file__).resolve().parents[4]


# ── schema ────────────────────────────────────────────────────────────────────


@pytest.fixture
async def service_engine(monkeypatch):
    """An empty in-memory database wired in as `database.engine`."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    monkeypatch.setattr(database, "engine", engine)
    yield engine
    await engine.dispose()


async def table_columns(engine) -> dict[str, set[str]]:
    async with engine.connect() as connection:
        return await connection.run_sync(
            lambda sync: {
                table: {column["name"] for column in inspect(sync).get_columns(table)}
                for table in inspect(sync).get_table_names()
            }
        )


class TestCreateSdrManagerRemoteTables:
    async def test_creates_only_the_remote_sdr_hosts_table(self, service_engine):
        await remote_database.create_sdr_manager_remote_tables()

        # No user_settings: the radios are a setting, kept in core.
        assert set(await table_columns(service_engine)) == {"remote_sdr_hosts"}

    async def test_matches_the_monoliths_schema_for_it(self, service_engine):
        await remote_database.create_sdr_manager_remote_tables()
        service_schema = await table_columns(service_engine)

        monolith = create_async_engine(
            "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        try:
            async with monolith.begin() as connection:
                await connection.run_sync(database.Base.metadata.create_all)
            monolith_schema = await table_columns(monolith)
        finally:
            await monolith.dispose()

        assert remote_database.SDR_MANAGER_REMOTE_TABLES == ("remote_sdr_hosts",)
        assert service_schema["remote_sdr_hosts"] == monolith_schema["remote_sdr_hosts"]

    async def test_is_idempotent(self, service_engine):
        await remote_database.create_sdr_manager_remote_tables()
        await remote_database.create_sdr_manager_remote_tables()

        assert set(await table_columns(service_engine)) == {"remote_sdr_hosts"}

    async def test_the_lifecycle_prepare_builds_it_on_an_empty_database(self, service_engine):
        from sentinel_sdr_manager_remote import module as remote_module

        await remote_module.lifecycle.prepare()

        assert set(await table_columns(service_engine)) == {"remote_sdr_hosts"}

    def test_registers_its_model_itself_in_a_fresh_interpreter(self, tmp_path):
        # Core's backend.models doesn't define RemoteSdrHost, so nothing else
        # registers the table with Base before the service's prepare runs.
        database_file = tmp_path / "sdr-manager-remote.db"
        probe = (
            "import asyncio, json, sqlite3, sys\n"
            "from sentinel_sdr_manager_remote.database import create_sdr_manager_remote_tables\n"
            "assert 'sentinel_sdr_manager_remote.models' not in sys.modules\n"
            "asyncio.run(create_sdr_manager_remote_tables())\n"
            f"connection = sqlite3.connect({str(database_file)!r})\n"
            "print(json.dumps(sorted(row[0] for row in connection.execute("
            "\"SELECT name FROM sqlite_master WHERE type = 'table'\"))))\n"
        )
        environment = {**os.environ, "PYTHONPATH": str(REPO_ROOT), "DB_PATH": str(database_file)}

        result = subprocess.run(
            [sys.executable, "-c", probe], cwd=REPO_ROOT, env=environment, capture_output=True, text=True, check=True
        )

        assert json.loads(result.stdout.strip().splitlines()[-1]) == ["remote_sdr_hosts"]
