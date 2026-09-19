"""Configuration, seeding and schema for the UK repeater directory.

Three small surfaces the feature added or changed, each of which silently breaks
the Land repeater layer if it drifts:

* `backend/config.py` — the upstream URL and the fresh/stale/manual windows the
  service reads on every request.
* `backend/default_config.json` + `seed_default_settings()` — the Land repeater
  defaults a fresh install gets, and the now-obsolete Land connectivity keys an
  upgraded install must have pruned (Land has no remote feed URL, so a lingering
  `sourceOverride` row would put a dead control back in Settings).
* `backend/models.py` — the `repeater_cache` table the service writes through.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as database_module
from backend.config import settings
from backend.models import RepeaterCache, UserSettings

OBSOLETE_LAND_KEYS = [
    ("land", "sourceOverride"),
    ("land", "onlineDataSourceURL"),
    ("land", "offgridDataSourceURL"),
]


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    """Point the module-level session factory at the per-test in-memory engine."""
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(database_module, "AsyncSessionLocal", factory)
    return factory


async def _add_setting(factory, namespace: str, key: str, value: object) -> None:
    async with factory() as session:
        session.add(
            UserSettings(
                namespace=namespace, key=key, value=json.dumps(value), updated_at=1
            )
        )
        await session.commit()


async def _stored_setting(factory, namespace: str, key: str):
    async with factory() as session:
        row = (
            await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace, UserSettings.key == key
                )
            )
        ).scalar_one_or_none()
        return None if row is None else json.loads(row.value)


class TestRepeaterSettings:
    def test_upstream_url_points_at_the_etcc_export(self):
        assert (
            settings.repeaters_upstream_url == "https://ukrepeater.net/csvcreate8.php"
        )

    def test_fresh_window_is_a_day(self):
        assert settings.repeaters_ttl_ms == 86_400_000

    def test_stale_window_is_a_month_and_outlasts_the_fresh_window(self):
        # The ladder only has a STALE rung if the stale window is the longer one.
        assert settings.repeaters_stale_ms == 2_592_000_000
        assert settings.repeaters_stale_ms > settings.repeaters_ttl_ms

    def test_manual_upload_outlives_a_daily_refresh(self):
        # An upload from Settings must not be overwritten by tomorrow's fetch.
        assert settings.repeaters_manual_ttl_ms > settings.repeaters_ttl_ms

    def test_fetch_timeout_is_positive_and_finite(self):
        assert 0 < settings.repeaters_fetch_timeout_s < 120

    def test_windows_are_overridable_from_the_environment(self, monkeypatch):
        # Every other TTL is env-overridable; these must be too, or an offline
        # install cannot widen its stale window.
        from backend.config import Settings

        monkeypatch.setenv("REPEATERS_TTL_MS", "1234")
        monkeypatch.setenv("REPEATERS_UPSTREAM_URL", "http://nas.local/repeaters.csv")
        overridden = Settings()
        assert overridden.repeaters_ttl_ms == 1234
        assert overridden.repeaters_upstream_url == "http://nas.local/repeaters.csv"


class TestDefaultConfigRepeaterEntries:
    @pytest.fixture()
    def land_defaults(self) -> dict:
        defaults = {
            (namespace, key): value
            for namespace, key, value in database_module._build_default_settings()
        }
        return {
            key: value
            for (namespace, key), value in defaults.items()
            if namespace == "land"
        }

    def test_repeaters_are_a_default_land_layer(self, land_defaults):
        assert "repeaters" in land_defaults["defaultLayers"]

    def test_repeater_filters_default_to_everything(self, land_defaults):
        assert land_defaults["repeaterFilters"] == {
            "bands": [],
            "modes": [],
            "status": "all",
        }

    def test_repeater_label_fields_default_to_the_identifying_trio(self, land_defaults):
        label_fields = land_defaults["repeaterLabelFields"]
        assert [name for name, enabled in label_fields.items() if enabled] == [
            "symbol",
            "callsign",
            "band",
        ]

    def test_every_repeater_label_field_is_a_boolean(self, land_defaults):
        # The Settings control renders one checkbox per entry; a non-boolean
        # would render an unusable control.
        assert all(
            isinstance(enabled, bool)
            for enabled in land_defaults["repeaterLabelFields"].values()
        )

    def test_land_has_no_default_connectivity_override(self, land_defaults):
        # Land has no remote feed URL, so the key was removed from the defaults.
        assert "sourceOverride" not in land_defaults


class TestSeedDefaultSettings:
    async def test_seeds_the_repeater_defaults_on_a_fresh_install(
        self, session_factory
    ):
        await database_module.seed_default_settings()
        assert await _stored_setting(session_factory, "land", "repeaterFilters") == {
            "bands": [],
            "modes": [],
            "status": "all",
        }
        label_fields = await _stored_setting(
            session_factory, "land", "repeaterLabelFields"
        )
        assert label_fields["callsign"] is True

    @pytest.mark.parametrize("namespace,key", OBSOLETE_LAND_KEYS)
    async def test_prunes_the_obsolete_land_connectivity_key(
        self, session_factory, namespace, key
    ):
        await _add_setting(session_factory, namespace, key, "auto")
        await database_module.seed_default_settings()
        assert await _stored_setting(session_factory, namespace, key) is None

    async def test_pruning_leaves_live_land_settings_alone(self, session_factory):
        # The blast radius is the land namespace, so a live neighbour must survive.
        await _add_setting(session_factory, "land", "sourceOverride", "auto")
        await _add_setting(session_factory, "land", "aprsRetentionMinutes", 9)
        await database_module.seed_default_settings()
        assert await _stored_setting(session_factory, "land", "sourceOverride") is None
        assert (
            await _stored_setting(session_factory, "land", "aprsRetentionMinutes") == 9
        )

    async def test_does_not_overwrite_a_customised_repeater_setting(
        self, session_factory
    ):
        customised = {"bands": ["2M"], "modes": ["A"], "status": "OPERATIONAL"}
        await _add_setting(session_factory, "land", "repeaterFilters", customised)
        await database_module.seed_default_settings()
        assert (
            await _stored_setting(session_factory, "land", "repeaterFilters")
            == customised
        )

    async def test_is_idempotent_across_startups(self, session_factory):
        await database_module.seed_default_settings()
        await database_module.seed_default_settings()
        assert (
            await _stored_setting(session_factory, "land", "repeaterFilters")
            is not None
        )
        assert await _stored_setting(session_factory, "land", "sourceOverride") is None


class TestRepeaterCacheModel:
    async def test_table_is_created_from_the_orm_models(self, test_engine, db_setup):
        async with test_engine.connect() as connection:
            table_names = await connection.run_sync(
                lambda sync: inspect(sync).get_table_names()
            )
        assert "repeater_cache" in table_names

    async def test_columns_match_what_the_service_writes(self, test_engine, db_setup):
        async with test_engine.connect() as connection:
            columns = await connection.run_sync(
                lambda sync: {
                    column["name"]: column
                    for column in inspect(sync).get_columns("repeater_cache")
                }
            )
        assert set(columns) == {
            "id",
            "cache_key",
            "payload",
            "fetched_at",
            "expires_at",
        }
        assert all(
            not columns[name]["nullable"]
            for name in ("cache_key", "payload", "fetched_at", "expires_at")
        )

    async def test_cache_key_is_unique_so_one_row_per_source(
        self, test_engine, db_setup
    ):
        from sqlalchemy.exc import IntegrityError

        factory = sessionmaker(
            bind=test_engine, class_=AsyncSession, expire_on_commit=False
        )
        async with factory() as session:
            session.add(
                RepeaterCache(cache_key="uk", payload="[]", fetched_at=1, expires_at=2)
            )
            await session.commit()
        async with factory() as session:
            session.add(
                RepeaterCache(cache_key="uk", payload="[]", fetched_at=3, expires_at=4)
            )
            with pytest.raises(IntegrityError):
                await session.commit()
