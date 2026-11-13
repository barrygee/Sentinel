"""`forget_host_radios`: what it leaves in `sdr.radios`, and what it never writes.

Run with:  uv run --project backend pytest services/sdr-manager-remote/backend/tests/test_sdr_manager_remote_host_radios.py
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from backend.db_helpers import upsert_setting
from backend.platform import settings_client
from backend.platform.settings_client import SettingsUnavailable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from sentinel_sdr_manager_remote.services import host_radios
from sentinel_sdr_manager_remote.services.host_radios import forget_host_radios


@pytest.fixture
async def db(test_engine, db_setup) -> AsyncIterator[AsyncSession]:
    session_factory = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session


async def _stored_radios(db) -> object:
    return await settings_client.read_setting(db, "sdr", "radios", default=None)


async def test_removes_only_the_hosts_linked_radios(db):
    await upsert_setting(
        db,
        "sdr",
        "radios",
        [
            {"id": 1, "sdr_manager_host_id": 7},
            {"id": 2, "sdr_manager_host_id": 8},
            {"id": 3, "sdr_manager_host_id": None},
            {"id": 4},
            "not a radio",
        ],
    )
    await db.commit()

    assert await forget_host_radios(db, 7) == 1
    assert await _stored_radios(db) == [
        {"id": 2, "sdr_manager_host_id": 8},
        {"id": 3, "sdr_manager_host_id": None},
        {"id": 4},
        "not a radio",
    ]


@pytest.mark.parametrize(
    "stored",
    [
        pytest.param([{"id": 2, "sdr_manager_host_id": 8}], id="none-of-its-radios"),
        pytest.param(None, id="no-radios-setting"),
        pytest.param({"unexpected": "shape"}, id="not-a-list"),
    ],
)
async def test_writes_nothing_when_there_is_nothing_to_remove(db, monkeypatch, stored):
    if stored is not None:
        await upsert_setting(db, "sdr", "radios", stored)
        await db.commit()
    writes: list[object] = []

    async def record_write(*args, **kwargs):
        writes.append(args)

    monkeypatch.setattr(host_radios, "write_setting", record_write)

    assert await forget_host_radios(db, 7) == 0
    assert writes == []


async def test_an_unreachable_core_is_raised_for_the_caller_to_refuse(db, monkeypatch):
    async def core_down(*args, **kwargs):
        raise SettingsUnavailable("core unreachable")

    monkeypatch.setattr(host_radios, "read_setting", core_down)

    with pytest.raises(SettingsUnavailable):
        await forget_host_radios(db, 7)
