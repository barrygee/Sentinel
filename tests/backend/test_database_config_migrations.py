"""Tests for the config-related startup steps in backend/database.py.

- seed_default_settings(): carries the legacy `app.lightMapTheme` flag onto
  `app.mapTheme`, and seeds `land.aprsChannelHz` from the configured default.
- default_config.json: holds every setting the Settings panel offers.

The startup steps open their own sessions from the module-level
AsyncSessionLocal, so each test points that factory at the in-memory engine.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as db
from backend.config import settings
from backend.models import UserSettings


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(db, "AsyncSessionLocal", factory)
    return factory


async def _add(factory, rows: list[tuple[str, str, str]]) -> None:
    """Insert rows whose values are given as raw stored text."""
    async with factory() as session:
        for namespace, key, value_text in rows:
            session.add(
                UserSettings(
                    namespace=namespace, key=key, value=value_text, updated_at=1
                )
            )
        await session.commit()


async def _stored(factory) -> dict[tuple[str, str], tuple[str, int]]:
    async with factory() as session:
        rows = (await session.execute(select(UserSettings))).scalars().all()
        return {(row.namespace, row.key): (row.value, row.updated_at) for row in rows}


class TestLegacyMapThemeMigration:
    async def test_a_light_flag_becomes_the_light_map_theme(self, session_factory):
        await _add(session_factory, [("app", "lightMapTheme", "true")])
        await db.seed_default_settings()
        stored = await _stored(session_factory)
        assert stored[("app", "mapTheme")][0] == '"light"'
        assert ("app", "lightMapTheme") not in stored

    async def test_a_dark_flag_becomes_the_dark_map_theme(self, session_factory):
        await _add(session_factory, [("app", "lightMapTheme", "false")])
        await db.seed_default_settings()
        assert (await _stored(session_factory))[("app", "mapTheme")][0] == '"dark"'

    async def test_an_unreadable_flag_becomes_dark(self, session_factory):
        await _add(session_factory, [("app", "lightMapTheme", "{broken")])
        await db.seed_default_settings()
        assert (await _stored(session_factory))[("app", "mapTheme")][0] == '"dark"'

    async def test_an_existing_map_theme_wins_and_the_flag_is_dropped(
        self, session_factory
    ):
        await _add(
            session_factory,
            [("app", "lightMapTheme", "true"), ("app", "mapTheme", '"colour"')],
        )
        await db.seed_default_settings()
        stored = await _stored(session_factory)
        assert stored[("app", "mapTheme")][0] == '"colour"'
        assert ("app", "lightMapTheme") not in stored

    async def test_a_fresh_install_seeds_the_dark_map_theme(self, session_factory):
        await db.seed_default_settings()
        assert (await _stored(session_factory))[("app", "mapTheme")][0] == '"dark"'


class TestSeededDefaults:
    async def test_aprs_channel_is_seeded_from_the_configured_default(
        self, session_factory, monkeypatch
    ):
        monkeypatch.setattr(settings, "aprs_channel_hz", 144_390_000)
        await db.seed_default_settings()
        assert (await _stored(session_factory))[("land", "aprsChannelHz")][
            0
        ] == "144390000"


class TestDefaultConfigJson:
    """default_config.json seeds every setting, so each one is in the live config file."""

    @pytest.fixture()
    def default_config(self) -> dict:
        return json.loads(Path(db._CONFIG_PATH).read_text(encoding="utf-8"))

    @pytest.mark.parametrize(
        ("namespace", "key"),
        [
            ("app", "rangeRingOrigin"),
            ("app", "mapTheme"),
            ("air", "offgridSdrSource"),
            ("air", "mapLayers"),
            ("land", "aprsChannelHz"),
            ("sdr", "snapToKnown"),
            ("sdr", "showWaterfallTimestamps"),
            ("sdr", "waterfallTimestampIntervalSec"),
            ("sdr", "resumeDelaySec"),
            ("sdr", "recordRawIq"),
            ("sdr", "aprs_radio_id"),
            ("sdr", "ais_radio_id"),
        ],
    )
    def test_seeds_a_setting_the_settings_panel_offers(
        self, default_config, namespace, key
    ):
        assert key in default_config[namespace]
