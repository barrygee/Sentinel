"""
tests/backend/test_platform_settings_client.py

Unit tests for backend/platform/settings_client.py — how a module writes a
setting it doesn't own (B7). A write must both store the value and announce
`settings.changed.<namespace>`, exactly like PUT /api/settings/{ns}/{key}, so a
level-triggered reconciler can't tell a background writer from the UI.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.db_helpers import get_setting
from backend.platform.bus import bus
from backend.platform.settings_client import read_setting, write_setting


@pytest.fixture
async def db(test_engine, db_setup) -> AsyncIterator[AsyncSession]:
    session_factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest.fixture
def announcements() -> Iterator[list[tuple[str, dict[str, Any]]]]:
    """Record every settings.changed.* event published on the process bus."""
    received: list[tuple[str, dict[str, Any]]] = []
    unsubscribe = bus.subscribe(
        "settings.changed.radiotest",
        lambda payload: received.append(("radiotest", payload)),
    )
    try:
        yield received
    finally:
        unsubscribe()


class TestReadSetting:
    async def test_returns_the_stored_value(self, db):
        await write_setting(db, "radiotest", "radios", [{"id": 1}])

        assert await read_setting(db, "radiotest", "radios") == [{"id": 1}]

    async def test_returns_the_default_when_unset(self, db):
        assert await read_setting(db, "radiotest", "missing", default=[]) == []


class TestWriteSetting:
    async def test_stores_then_announces_the_namespace_and_key(self, db, announcements):
        await write_setting(db, "radiotest", "radios", [{"id": 1, "port": 4343}])

        assert await get_setting(db, "radiotest", "radios") == [{"id": 1, "port": 4343}]
        assert len(announcements) == 1
        _, payload = announcements[0]
        assert payload["keys"] == ["radios"]
        # The subscriber reads through the same session that committed.
        assert payload["db"] is db

    async def test_the_value_is_committed_before_subscribers_run(self, db):
        seen: list[Any] = []

        async def reader(payload: dict[str, Any]) -> None:
            seen.append(await get_setting(payload["db"], "radiotest", "radios"))

        unsubscribe = bus.subscribe("settings.changed.radiotest", reader)
        try:
            await write_setting(db, "radiotest", "radios", ["new"])
        finally:
            unsubscribe()

        assert seen == [["new"]]

    async def test_a_failing_subscriber_is_swallowed_by_default(self, db):
        def broken(payload: dict[str, Any]) -> None:
            raise RuntimeError("reconcile failed")

        unsubscribe = bus.subscribe("settings.changed.radiotest", broken)
        try:
            await write_setting(db, "radiotest", "radios", [])
        finally:
            unsubscribe()

        # Still stored: a background writer's loop must survive a bad reaction.
        assert await get_setting(db, "radiotest", "radios") == []

    async def test_raise_errors_surfaces_a_failing_subscriber(self, db):
        def broken(payload: dict[str, Any]) -> None:
            raise RuntimeError("reconcile failed")

        unsubscribe = bus.subscribe("settings.changed.radiotest", broken)
        try:
            with pytest.raises(RuntimeError, match="reconcile failed"):
                await write_setting(db, "radiotest", "radios", [], raise_errors=True)
        finally:
            unsubscribe()

    async def test_other_namespaces_are_not_announced(self, db, announcements):
        await write_setting(db, "othertest", "radios", [])

        assert announcements == []
