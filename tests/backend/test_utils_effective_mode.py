"""
tests/backend/test_utils_effective_mode.py

Tests for backend/utils.py::resolve_effective_mode — the source-selection
precedence for domains whose sources are not URLs.

Sea is the case in point: its online source is the AISStream WebSocket and its
off-grid source is a local SDR decoder, so there is no URL pair to resolve, but
the *choice* must be made exactly as `resolve_domain_urls` makes it. If the two
ever disagreed, Sentinel would hold a dongle while reading vessels from the
internet, or read locally while decoding nothing.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.db_helpers import upsert_setting
from backend.utils import resolve_effective_mode


@pytest.fixture
async def db(test_engine, db_setup):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with factory() as session:
        yield session


class TestResolveEffectiveMode:
    async def test_defaults_to_online_when_nothing_is_set(self, db):
        assert await resolve_effective_mode("sea", db) == "online"

    @pytest.mark.parametrize("mode", ["online", "offgrid"])
    async def test_follows_the_global_connectivity_mode(self, db, mode):
        await upsert_setting(db, "app", "connectivityMode", mode)
        assert await resolve_effective_mode("sea", db) == mode

    @pytest.mark.parametrize("override", ["online", "offgrid"])
    async def test_a_domain_override_beats_the_global_mode(self, db, override):
        # The whole point of the per-domain override: one domain can be pinned
        # while the rest follow the app-wide setting.
        await upsert_setting(
            db,
            "app",
            "connectivityMode",
            "online" if override == "offgrid" else "offgrid",
        )
        await upsert_setting(db, "sea", "sourceOverride", override)
        assert await resolve_effective_mode("sea", db) == override

    async def test_auto_override_defers_to_the_global_mode(self, db):
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        await upsert_setting(db, "sea", "sourceOverride", "auto")
        assert await resolve_effective_mode("sea", db) == "offgrid"

    async def test_an_unrecognised_override_defers_to_the_global_mode(self, db):
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        await upsert_setting(db, "sea", "sourceOverride", "nonsense")
        assert await resolve_effective_mode("sea", db) == "offgrid"

    async def test_an_unrecognised_global_mode_falls_back_to_online(self, db):
        # Anything that is not exactly "offgrid" must read as online — the safe
        # direction, since online needs no local hardware.
        await upsert_setting(db, "app", "connectivityMode", "nonsense")
        assert await resolve_effective_mode("sea", db) == "online"

    async def test_an_empty_global_mode_falls_back_to_online(self, db):
        await upsert_setting(db, "app", "connectivityMode", "")
        assert await resolve_effective_mode("sea", db) == "online"

    async def test_another_domains_override_is_ignored(self, db):
        # Only the named domain's override counts; reading a sibling's would
        # couple two domains that are meant to be independent.
        await upsert_setting(db, "air", "sourceOverride", "offgrid")
        assert await resolve_effective_mode("sea", db) == "online"

    async def test_resolves_per_domain_independently(self, db):
        await upsert_setting(db, "app", "connectivityMode", "online")
        await upsert_setting(db, "sea", "sourceOverride", "offgrid")
        assert await resolve_effective_mode("sea", db) == "offgrid"
        assert await resolve_effective_mode("air", db) == "online"
