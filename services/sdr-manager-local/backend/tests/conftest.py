"""Shared fixtures for sdr-manager-local's tests.

Every test gets its own SQLite file in place of Sentinel's shared engine,
which `sentinel_sdr_manager_local` writes through (`database.py`,
`container.py`) and which otherwise points at the developer's `DB_PATH`.

`sdr_manager_local_app_factory` builds the real service app
(`service.create_sdr_manager_local_app`), so a `TestClient` runs its actual
lifespan: schema, seeding, the composition root and both API mounts. It is
kept hermetic — an empty sysfs tree (no dongles), and a core address nothing
listens on, so the location refresh and registration fail fast instead of
reaching out.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from backend import database as core_database
from backend.config import settings as backend_settings
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from sentinel_sdr_manager_local.config import get_settings
from sentinel_sdr_manager_local.database import create_sdr_manager_local_tables, seed_single_row_tables

# Connection refused at once: port 9 (discard) has no listener on a test host.
UNREACHABLE_CORE_URL = "http://127.0.0.1:9"


@pytest.fixture(autouse=True)
def sdr_manager_local_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[AsyncEngine]:
    """Point Sentinel's engine and session factory at a throwaway file for this test."""
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'sdr-manager-local.db'}")
    monkeypatch.setattr(core_database, "engine", engine)
    monkeypatch.setattr(
        core_database, "AsyncSessionLocal", async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    )
    yield engine


@pytest.fixture(autouse=True)
def sdr_manager_local_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Fresh `SDR_MANAGER_LOCAL_*` settings per test, on an empty sysfs tree.

    The host platform is pinned to Linux, so on a developer's Mac "real"
    hardware is still the empty sysfs tree, never the Mac's own USB bus (where
    a plugged-in dongle would be started).
    """
    empty_sysfs = tmp_path / "sysfs"
    empty_sysfs.mkdir()
    monkeypatch.setenv("SDR_MANAGER_LOCAL_SYSFS_ROOT", str(empty_sysfs))
    monkeypatch.setattr("sentinel_sdr_manager_local.container.HOST_PLATFORM", "linux")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def seeded_database(sdr_manager_local_database: AsyncEngine) -> AsyncIterator[AsyncEngine]:
    """The schema built and the single-row tables seeded, as the service's `prepare` does."""
    await create_sdr_manager_local_tables()
    await seed_single_row_tables()
    yield sdr_manager_local_database
    await sdr_manager_local_database.dispose()


@pytest.fixture
def sdr_manager_local_app_factory(monkeypatch: pytest.MonkeyPatch) -> Callable[[], FastAPI]:
    """Build the real service app, as `uvicorn sentinel_sdr_manager_local.service:app` would."""
    monkeypatch.setattr(backend_settings, "sentinel_core_url", UNREACHABLE_CORE_URL)
    monkeypatch.setattr(backend_settings, "service_internal_url", "http://sdr-manager-local:8000")
    monkeypatch.setattr(backend_settings, "nats_url", "")
    # TestClient runs the lifespan off the main thread, where signal handlers
    # can't be installed. The wake hook itself is tested directly.
    monkeypatch.setattr("backend.platform.lifecycle._install_wake_chain", lambda modules: {})
    # Imported here, once the settings above are in place: the module builds
    # its own `app` at import, which needs them.
    from sentinel_sdr_manager_local.service import create_sdr_manager_local_app

    return create_sdr_manager_local_app
