"""
tests/backend/test_utils_resolve_domain_urls.py

Tests for backend/utils.py::resolve_domain_urls's ``offgrid_default``.

AIR no longer has an Off Grid Data Source field in Settings: off grid it reads
the bundled `adsb-decoder` sidecar, supplied as ``offgrid_default``. A value
stored in the config database must still win, and a domain that passes no
default must keep resolving to ``None`` when nothing is stored.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.db_helpers import upsert_setting
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
