"""Tests for the config-related startup steps in backend/database.py.

- resolve_retired_auto_modes(): the connectivity 'auto' mode is gone; stored
  'auto' values become the explicit mode they meant.
- is_removed_setting(): what config imports must skip so they can't bring back
  a setting prune_removed_settings() deleted.
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


class TestIsRemovedSetting:
    def test_matches_a_removed_key(self):
        assert db.is_removed_setting("app", "connectivityProbeUrl") is True

    def test_matches_a_removed_key_prefix(self):
        assert db.is_removed_setting("land", "feedCredential:42") is True

    def test_does_not_match_a_live_setting(self):
        assert db.is_removed_setting("app", "connectivityMode") is False

    def test_does_not_match_a_prefix_in_another_namespace(self):
        assert db.is_removed_setting("sea", "feedCredential:42") is False


class TestResolveRetiredAutoModes:
    async def test_an_app_auto_becomes_online_and_so_do_auto_sections(
        self, session_factory
    ):
        await _add(
            session_factory,
            [
                ("app", "connectivityMode", '"auto"'),
                ("air", "sourceOverride", '"auto"'),
            ],
        )
        await db.resolve_retired_auto_modes()
        stored = await _stored(session_factory)
        assert stored[("app", "connectivityMode")][0] == '"online"'
        assert stored[("air", "sourceOverride")][0] == '"online"'
        assert stored[("app", "connectivityMode")][1] > 1

    async def test_an_auto_section_takes_the_app_mode_it_was_following(
        self, session_factory
    ):
        await _add(
            session_factory,
            [
                ("app", "connectivityMode", '"offgrid"'),
                ("sea", "sourceOverride", '"auto"'),
                ("space", "sourceOverride", "not json"),
            ],
        )
        await db.resolve_retired_auto_modes()
        stored = await _stored(session_factory)
        assert stored[("sea", "sourceOverride")][0] == '"offgrid"'
        assert stored[("space", "sourceOverride")][0] == '"offgrid"'
        assert stored[("app", "connectivityMode")] == ('"offgrid"', 1)

    async def test_with_no_app_mode_stored_sections_become_online(
        self, session_factory
    ):
        await _add(session_factory, [("air", "sourceOverride", '"auto"')])
        await db.resolve_retired_auto_modes()
        stored = await _stored(session_factory)
        assert stored[("air", "sourceOverride")][0] == '"online"'
        # It converts existing rows only — it does not invent an app mode row.
        assert ("app", "connectivityMode") not in stored

    async def test_an_unreadable_app_mode_is_treated_as_online(self, session_factory):
        await _add(
            session_factory,
            [
                ("app", "connectivityMode", "{broken"),
                ("air", "sourceOverride", '"auto"'),
            ],
        )
        await db.resolve_retired_auto_modes()
        stored = await _stored(session_factory)
        assert stored[("app", "connectivityMode")][0] == '"online"'
        assert stored[("air", "sourceOverride")][0] == '"online"'

    async def test_explicit_modes_and_other_namespaces_are_left_alone(
        self, session_factory
    ):
        await _add(
            session_factory,
            [
                ("app", "connectivityMode", '"online"'),
                ("air", "sourceOverride", '"offgrid"'),
                ("land", "sourceOverride", '"auto"'),
            ],
        )
        await db.resolve_retired_auto_modes()
        stored = await _stored(session_factory)
        assert stored[("air", "sourceOverride")] == ('"offgrid"', 1)
        assert stored[("land", "sourceOverride")] == ('"auto"', 1)

    async def test_running_it_twice_changes_nothing_more(self, session_factory):
        await _add(session_factory, [("app", "connectivityMode", '"auto"')])
        await db.resolve_retired_auto_modes()
        first = await _stored(session_factory)
        await db.resolve_retired_auto_modes()
        assert await _stored(session_factory) == first


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

    def test_every_section_starts_online(self, default_config):
        assert default_config["app"]["connectivityMode"] == "online"
        for section in ("air", "space", "sea"):
            assert default_config[section]["sourceOverride"] == "online"

    def test_holds_nothing_a_startup_step_would_prune(self, default_config):
        for namespace, entries in default_config.items():
            if isinstance(entries, dict):
                for key in entries:
                    assert not db.is_removed_setting(namespace, key), (
                        f"{namespace}.{key}"
                    )
