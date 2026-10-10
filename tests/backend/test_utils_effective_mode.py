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


class TestDerivingFromOneRead:
    """effective_mode_of / domain_urls_of answer from a map read once (P6.4):
    in a section's own container every read is a round trip to core."""

    def test_effective_mode_prefers_the_sections_override(self):
        from backend.utils import effective_mode_of

        settings_map = {"sea.sourceOverride": "offgrid", "app.connectivityMode": "online"}

        assert effective_mode_of("sea", settings_map) == "offgrid"

    def test_effective_mode_falls_back_to_the_app_mode_then_online(self):
        from backend.utils import effective_mode_of

        assert effective_mode_of("sea", {"app.connectivityMode": "offgrid"}) == "offgrid"
        assert effective_mode_of("sea", {}) == "online"

    def test_effective_mode_ignores_another_sections_override(self):
        from backend.utils import effective_mode_of

        assert effective_mode_of("sea", {"air.sourceOverride": "offgrid"}) == "online"

    def test_urls_follow_the_mode(self):
        from backend.utils import domain_urls_of

        settings_map = {
            "sea.onlineUrl": "wss://online.test/stream",
            "sea.offgridSource": {"url": "http://box.test/ais"},
        }

        assert domain_urls_of("sea", settings_map) == ("wss://online.test/stream", "http://box.test/ais")
        assert domain_urls_of("sea", {**settings_map, "sea.sourceOverride": "offgrid"}) == (
            "http://box.test/ais",
            "wss://online.test/stream",
        )

    def test_urls_use_the_defaults_when_unset(self):
        from backend.utils import domain_urls_of

        assert domain_urls_of("sea", {}, online_default="wss://default.test") == ("wss://default.test", None)
        assert domain_urls_of("sea", {"sea.sourceOverride": "offgrid"}, offgrid_default="http://d.test") == (
            "http://d.test",
            None,
        )

    async def test_the_map_is_one_namespace_plus_the_app_mode(self, db):
        from backend.db_helpers import upsert_setting
        from backend.utils import domain_settings_map

        await upsert_setting(db, "sea", "enabled", True)
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        await upsert_setting(db, "app", "location", {"latitude": 1, "longitude": 2})
        await upsert_setting(db, "air", "sourceOverride", "online")

        assert await domain_settings_map("sea", db) == {"sea.enabled": True, "app.connectivityMode": "offgrid"}
