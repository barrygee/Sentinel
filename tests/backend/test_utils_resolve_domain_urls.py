"""
tests/backend/test_utils_resolve_domain_urls.py

Tests for backend/utils.py::resolve_domain_urls's ``offgrid_default``.

AIR no longer has an Off Grid Data Source field in Settings: off grid it reads
the bundled `adsb-decoder` sidecar, supplied as ``offgrid_default``. A value
stored in the config database must still win, and a domain that passes no
default must keep resolving to ``None`` when nothing is stored.
"""

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.db_helpers import upsert_setting
from backend.platform import settings_client as settings_client_module
from backend.utils import resolve_domain_urls

DECODER = "http://adsb-decoder:8080/data/aircraft.json"
STORED = "http://other.box:8090/data/aircraft.json"


@pytest.fixture
async def db(test_engine, db_setup):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with factory() as session:
        yield session


class TestOffgridDefault:
    async def test_is_the_primary_off_grid_when_nothing_is_stored(self, db):
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        primary, _ = await resolve_domain_urls("air", db, offgrid_default=DECODER)
        assert primary == DECODER

    async def test_fills_in_for_the_seeded_empty_url(self, db):
        # default_config.json seeds air.offgridDataSourceURL as {"url": ""},
        # which is what an install that never used the old field holds.
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        await upsert_setting(db, "air", "offgridDataSourceURL", {"url": ""})
        primary, _ = await resolve_domain_urls("air", db, offgrid_default=DECODER)
        assert primary == DECODER

    async def test_a_stored_url_object_wins(self, db):
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        await upsert_setting(db, "air", "offgridDataSourceURL", {"url": STORED})
        primary, _ = await resolve_domain_urls("air", db, offgrid_default=DECODER)
        assert primary == STORED

    async def test_a_stored_plain_string_wins(self, db):
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        await upsert_setting(db, "air", "offgridDataSourceURL", STORED)
        primary, _ = await resolve_domain_urls("air", db, offgrid_default=DECODER)
        assert primary == STORED

    async def test_is_the_fallback_online(self, db):
        await upsert_setting(db, "app", "connectivityMode", "online")
        primary, fallback = await resolve_domain_urls(
            "air",
            db,
            online_default="https://online.example/v2",
            offgrid_default=DECODER,
        )
        assert primary == "https://online.example/v2"
        assert fallback == DECODER

    async def test_a_placeholder_default_is_ignored(self, db):
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        primary, _ = await resolve_domain_urls(
            "air", db, offgrid_default="http://localhost"
        )
        assert primary is None

    async def test_without_a_default_nothing_stored_still_means_none(self, db):
        # Domains that pass no default keep the old contract: no source, None.
        await upsert_setting(db, "app", "connectivityMode", "offgrid")
        primary, _ = await resolve_domain_urls("space", db)
        assert primary is None


class TestRemoteSettings:
    """A section in its own container has no user_settings table: the same
    resolution runs on the namespaces core returns over HTTP (P6)."""

    @pytest.fixture
    def core_settings(self, monkeypatch):
        namespaces: dict[str, dict] = {}
        requested: list[str] = []
        real_client = httpx.AsyncClient

        def answer(request: httpx.Request) -> httpx.Response:
            namespace = request.url.path.rsplit("/", 1)[-1]
            requested.append(namespace)
            return httpx.Response(200, json=namespaces.get(namespace, {}))

        monkeypatch.setattr(settings, "sentinel_core_url", "http://core.test:8000")
        monkeypatch.setattr(
            settings_client_module.httpx,
            "AsyncClient",
            lambda **options: real_client(transport=httpx.MockTransport(answer), **options),
        )
        namespaces["requested"] = requested  # type: ignore[assignment]  # test-only record
        return namespaces

    async def test_online_mode_puts_the_online_url_first(self, core_settings):
        core_settings["space"] = {"onlineUrl": "https://online.test/tle", "offgridSource": {"url": "http://box.test/tle"}}
        core_settings["app"] = {"connectivityMode": "online"}

        assert await resolve_domain_urls("space", None) == ("https://online.test/tle", "http://box.test/tle")
        assert core_settings["requested"] == ["space", "app"]

    async def test_the_app_mode_applies_without_a_section_override(self, core_settings):
        core_settings["space"] = {"onlineUrl": "https://online.test/tle", "offgridSource": {"url": "http://box.test/tle"}}
        core_settings["app"] = {"connectivityMode": "offgrid"}

        assert await resolve_domain_urls("space", None) == ("http://box.test/tle", "https://online.test/tle")

    async def test_a_section_override_beats_the_app_mode(self, core_settings):
        core_settings["space"] = {
            "onlineUrl": "https://online.test/tle",
            "offgridSource": {"url": "http://box.test/tle"},
            "sourceOverride": "online",
        }
        core_settings["app"] = {"connectivityMode": "offgrid"}

        assert await resolve_domain_urls("space", None) == ("https://online.test/tle", "http://box.test/tle")

    async def test_unset_settings_fall_back_to_the_defaults(self, core_settings):
        assert await resolve_domain_urls("space", None, online_default="https://default.test/tle") == (
            "https://default.test/tle",
            None,
        )


class TestLocalSettingsRows:
    async def test_a_value_stored_as_bare_text_is_used_as_is(self, db):
        # Rows written before every value was JSON-encoded hold the bare URL.
        from backend.models import UserSettings

        db.add(UserSettings(namespace="space", key="onlineUrl", value="https://bare.test/tle", updated_at=0))
        await db.commit()

        primary, _ = await resolve_domain_urls("space", db)

        assert primary == "https://bare.test/tle"
