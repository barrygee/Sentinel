"""
tests/backend/test_platform_aprs_channel.py

Tests for backend/platform/aprs_channel.py — the ``land``/``aprsChannelHz``
contract (valid range, coercion, and the hub's read with its fallback). Moved
from test_aprs_store.py with the code when the radio hub stopped importing Land.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.config import settings
from backend.database import Base
from backend.db_helpers import upsert_setting
from backend.models import UserSettings  # noqa: F401 — register the ORM model with Base
from backend.platform import aprs_channel


@pytest.fixture()
async def session_factory():
    """Per-test in-memory DB holding the user_settings table."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


# ── APRS channel setting ──────────────────────────────────────────────────────


class TestCoerceAprsChannelHz:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            (144_800_000, 144_800_000),
            (144_390_000.4, 144_390_000),  # float rounds to whole Hz
            ("144800000", 144_800_000),  # numeric string
            (aprs_channel.APRS_CHANNEL_MIN_HZ, aprs_channel.APRS_CHANNEL_MIN_HZ),
            (aprs_channel.APRS_CHANNEL_MAX_HZ, aprs_channel.APRS_CHANNEL_MAX_HZ),
        ],
    )
    def test_accepts_in_range_numeric_values(self, raw, expected):
        assert aprs_channel.coerce_aprs_channel_hz(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        [
            None,
            True,  # bool is an int subclass but never a frequency
            "",
            "two metres",
            [],
            aprs_channel.APRS_CHANNEL_MIN_HZ - 1,
            aprs_channel.APRS_CHANNEL_MAX_HZ + 1,
            0,
            -144_800_000,
        ],
    )
    def test_rejects_missing_non_numeric_and_out_of_range(self, raw):
        assert aprs_channel.coerce_aprs_channel_hz(raw) is None


class TestReadAprsChannelHz:
    async def test_defaults_to_settings_when_unset(self, session_factory):
        async with session_factory() as db:
            assert await aprs_channel.read_aprs_channel_hz(db) == settings.aprs_channel_hz

    async def test_reads_a_valid_user_override(self, session_factory):
        async with session_factory() as db:
            await upsert_setting(db, "land", "aprsChannelHz", 144_390_000)
            assert await aprs_channel.read_aprs_channel_hz(db) == 144_390_000

    async def test_falls_back_on_an_invalid_override(self, session_factory):
        async with session_factory() as db:
            await upsert_setting(db, "land", "aprsChannelHz", "nope")
            assert await aprs_channel.read_aprs_channel_hz(db) == settings.aprs_channel_hz
