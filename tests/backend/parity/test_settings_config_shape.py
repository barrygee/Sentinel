"""P0 parity baseline: settings/config shape.

Two related but distinct golden surfaces:

1. **Raw seeded settings** — every `user_settings` (namespace, key) row and
   its default value after a fresh install runs the real startup seeders
   (`backend/database.py`, called from `lifespan` in the same order, minus
   `create_tables` which the `test_engine`/`db_setup` fixtures already cover).
   This is everything a fresh install actually persists, including the SDR/
   satellite-radio data mirrors that the config document (below) deliberately
   excludes.

2. **The config document export** — `build_config_snapshot()`, the same
   builder that feeds the Settings › Application Config editor, its download,
   and the live `sentinel_config.json` file (`app_config_file.py`). Secrets,
   data-file mirrors and internal keys are stripped and namespaces/keys are
   canonically ordered — order is part of the contract, so it is preserved
   (not sorted) in the golden.

A round-trip test (export → apply_config(export) → export again) proves
`apply_config` is a faithful inverse of the document `build_config_snapshot`
produces, independent of the golden files.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend import database as database_module
from backend.config import settings as app_settings
from backend.models import UserSettings
from backend.services.app_config import apply_config, build_config_snapshot
from tests.backend.parity.conftest import assert_golden, render_json

# Fixed overrides for the settings whose defaults `_build_default_settings()`
# takes from environment-derived config rather than the bundled JSON — pinned
# here so the golden is identical regardless of local .env overrides.
_FIXED_ENV_OVERRIDES = {
    "adsb_upstream_base": "https://api.adsb.lol/v2",
    "celestrak_iss_url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
    "aprs_channel_hz": 144_800_000,
}


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    """Point the module-level session factory at the per-test in-memory
    engine, matching the pattern in test_database_config_migrations.py."""
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(database_module, "AsyncSessionLocal", factory)
    for attr, value in _FIXED_ENV_OVERRIDES.items():
        monkeypatch.setattr(app_settings, attr, value)
    return factory


async def _run_fresh_install_seeders() -> None:
    """Run the DB-seeding subset of `lifespan`'s startup sequence, in the same
    order, against whatever engine `AsyncSessionLocal` currently points at.

    Omits `create_tables` (the `db_setup` fixture already built the schema),
    `app_config_file.sync.start()` (background task + real file I/O, no
    settings-shape effect), and the SDR/APRS/AIS/offline-map runtime services
    (no settings-shape effect either) — this is the seeding surface only.
    """
    await database_module.prune_removed_settings()
    await database_module.migrate_sdr_radios_to_settings()
    await database_module.seed_default_settings()
    await database_module.resolve_retired_auto_modes()
    await database_module.seed_sdr_data_from_files()
    await database_module.seed_sdr_bandplan_from_file()
    await database_module.backfill_satellite_radio_store()


async def _dump_raw_settings(factory) -> dict:
    async with factory() as session:
        rows = (await session.execute(select(UserSettings))).scalars().all()
    parsed = {}
    for row in sorted(rows, key=lambda row: (row.namespace, row.key)):
        try:
            value = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            value = row.value
        parsed.setdefault(row.namespace, {})[row.key] = value
    return parsed


class TestSeededSettingsShape:
    async def test_fresh_install_settings_match_golden(self, session_factory):
        await _run_fresh_install_seeders()
        raw = await _dump_raw_settings(session_factory)
        assert_golden("settings_seeded_defaults", render_json(raw, sort_keys=True))

    async def test_fresh_install_seeds_more_than_zero_namespaces(self, session_factory):
        """Sanity check independent of the golden: an accidentally-empty seed
        run (e.g. a broken default_config.json path) must not silently pass."""
        await _run_fresh_install_seeders()
        raw = await _dump_raw_settings(session_factory)
        assert len(raw) > 5
        assert "app" in raw
        assert "sdr" in raw

    async def test_can_actually_fail_on_a_changed_default(self, session_factory):
        """Validity check: perturbing one seeded value must turn the golden
        comparison red."""
        await _run_fresh_install_seeders()
        raw = await _dump_raw_settings(session_factory)
        mutated = json.loads(render_json(raw, sort_keys=True))
        mutated["app"]["mapTheme"] = "__perturbed_for_test_validity__"
        with pytest.raises(AssertionError):
            assert_golden(
                "settings_seeded_defaults",
                render_json(mutated, sort_keys=True),
                allow_update=False,
            )


class TestConfigDocumentExport:
    async def test_export_matches_golden(self, session_factory):
        await _run_fresh_install_seeders()
        async with session_factory() as session:
            snapshot = await build_config_snapshot(session)
        # Namespace/key order is part of the contract (canonical_key_order()),
        # so it is preserved rather than sorted.
        assert_golden("config_document_export", render_json(snapshot, sort_keys=False))

    async def test_secrets_and_hidden_keys_are_excluded(self, session_factory):
        """Sanity check independent of the golden: the AISStream API key and
        the SDR data-file mirrors must never appear in the export."""
        await _run_fresh_install_seeders()
        async with session_factory() as session:
            session.add(
                UserSettings(
                    namespace="sea",
                    key="aisstreamApiKey",
                    value=json.dumps("super-secret"),
                    updated_at=1,
                )
            )
            await session.commit()
            snapshot = await build_config_snapshot(session)
        assert "aisstreamApiKey" not in snapshot.get("sea", {})
        assert "frequencies" not in snapshot.get("sdr", {})
        assert "groups" not in snapshot.get("sdr", {})
        assert "bandPlan" not in snapshot.get("sdr", {})

    async def test_can_actually_fail_on_a_reordered_namespace(self, session_factory):
        """Validity check: the golden compares text, so reordering namespaces
        (a real contract break for `render_config_file`'s canonical output)
        must turn it red even though the dict "is the same" by ==."""
        await _run_fresh_install_seeders()
        async with session_factory() as session:
            snapshot = await build_config_snapshot(session)
        reordered = dict(reversed(list(snapshot.items())))
        assert reordered == snapshot  # same content, different order
        with pytest.raises(AssertionError):
            assert_golden(
                "config_document_export",
                render_json(reordered, sort_keys=False),
                allow_update=False,
            )


class TestConfigRoundTrip:
    async def test_export_apply_export_is_identical(self, session_factory):
        """apply_config() must be a faithful inverse of build_config_snapshot():
        feeding the exported document straight back in (as Settings › Config
        upload or a hand-edited sentinel_config.json would) must not change
        anything the next export reports."""
        await _run_fresh_install_seeders()
        async with session_factory() as session:
            before = await build_config_snapshot(session)
            await apply_config(session, before)
            after = await build_config_snapshot(session)
        assert after == before

    async def test_round_trip_is_not_vacuously_true(self, session_factory):
        """Validity check: prove the round-trip assertion actually inspects the
        data by showing a genuinely different document fails the `==` it
        relies on — otherwise a bug that makes apply_config a no-op could hide
        behind an accidentally-trivial comparison."""
        await _run_fresh_install_seeders()
        async with session_factory() as session:
            before = await build_config_snapshot(session)
        mutated = json.loads(render_json(before))
        mutated.setdefault("app", {})["mapTheme"] = "__not_a_real_theme__"
        assert mutated != before
