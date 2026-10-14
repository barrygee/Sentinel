"""The SDR recording length limit (backend/platform/recording_limits.py).

Both the SDR section (ending abandoned recordings) and the radio hub (stopping
IQ captures) read `sdr.recordingMaxDurationMinutes` through it. Pinned here:
the setting in minutes becomes seconds; unset, invalid or unreadable falls back
to the six-hour default, so a bad value or an unreachable core never lifts the
limit and lets a capture fill the disk.
"""

from __future__ import annotations

import logging

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.platform import recording_limits, settings_client

DEFAULT_SECONDS = 360 * 60


def serve_setting(monkeypatch, value) -> list[tuple]:
    """Make the settings client answer `value` for the limit; returns the reads it got."""
    reads: list[tuple] = []

    async def read_setting(db, namespace, key, default=None):
        reads.append((db, namespace, key, default))
        return default if value is ... else value

    monkeypatch.setattr(settings_client, "read_setting", read_setting)
    return reads


async def test_reads_the_sdr_setting_and_converts_minutes_to_seconds(monkeypatch):
    session = object()
    reads = serve_setting(monkeypatch, 90)

    assert await recording_limits.recording_max_duration_seconds(session) == 5400.0
    assert reads == [(session, "sdr", "recordingMaxDurationMinutes", 360)]


async def test_accepts_a_fractional_number_of_minutes(monkeypatch):
    serve_setting(monkeypatch, 0.5)

    assert await recording_limits.recording_max_duration_seconds(None) == 30.0


async def test_defaults_to_six_hours_when_unset(monkeypatch):
    serve_setting(monkeypatch, ...)

    assert await recording_limits.recording_max_duration_seconds(None) == DEFAULT_SECONDS


@pytest.mark.parametrize(
    "stored",
    [0, -5, "120", None, True, False, [120], {"minutes": 120}],
    ids=["zero", "negative", "string", "null", "true", "false", "list", "object"],
)
async def test_an_invalid_value_falls_back_to_the_default(monkeypatch, stored):
    serve_setting(monkeypatch, stored)

    assert await recording_limits.recording_max_duration_seconds(None) == DEFAULT_SECONDS


async def test_an_unreadable_setting_falls_back_to_the_default_and_says_so(monkeypatch, caplog):
    async def read_setting(db, namespace, key, default=None):
        raise ConnectionError("core unreachable")

    monkeypatch.setattr(settings_client, "read_setting", read_setting)

    with caplog.at_level(logging.WARNING, logger=recording_limits.__name__):
        assert await recording_limits.recording_max_duration_seconds(None) == DEFAULT_SECONDS

    assert "Could not read sdr.recordingMaxDurationMinutes, using the default: core unreachable" in caplog.text


async def test_reads_the_real_setting_from_the_database(test_engine, db_setup):
    session_factory = sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        await settings_client.write_setting(session, "sdr", "recordingMaxDurationMinutes", 15)

        assert await recording_limits.recording_max_duration_seconds(session) == 900.0
