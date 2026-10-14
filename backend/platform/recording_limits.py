"""The longest an SDR recording may run: the `sdr.recordingMaxDurationMinutes` setting.

A recording only ends when the browser sends stop, so one whose browser went
away (tab closed or reloaded mid-recording, a stop lost in a restart) would
otherwise never end. Past this age the SDR section marks it failed and drops
its raw-IQ capture, and the radio hub stops any IQ capture that reaches it, so
a lost stop can't fill the disk (raw IQ is ~4 MB/s at 2.048 MS/s). Shared here
because the SDR section and the radio hub may not import each other.

The setting is core's (Settings › SDR), read through the settings client so it
works in every service.
"""

from __future__ import annotations

import logging

from backend.platform import settings_client
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Six hours: long enough for back-to-back satellite passes.
DEFAULT_RECORDING_MAX_DURATION_MINUTES = 360


async def recording_max_duration_seconds(db: AsyncSession | None) -> float:
    """The configured limit in seconds; the default when the setting is unset, invalid or unreadable."""
    try:
        # Looked up at call time, so tests can patch the settings client.
        minutes = await settings_client.read_setting(
            db, "sdr", "recordingMaxDurationMinutes", default=DEFAULT_RECORDING_MAX_DURATION_MINUTES
        )
    except Exception as error:  # noqa: BLE001 - core unreachable must not lift the limit
        logger.warning("Could not read sdr.recordingMaxDurationMinutes, using the default: %s", error)
        minutes = DEFAULT_RECORDING_MAX_DURATION_MINUTES
    # bool is an int subclass: a stray true/false is not a duration.
    if isinstance(minutes, bool) or not isinstance(minutes, int | float) or minutes <= 0:
        minutes = DEFAULT_RECORDING_MAX_DURATION_MINUTES
    return float(minutes) * 60
