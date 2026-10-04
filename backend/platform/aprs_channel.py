"""The ``land``/``aprsChannelHz`` setting's contract: its valid range and how to read it.

Shared by two parties that must not import Land: core's settings router, which
validates a PUT, and the radio hub, which tunes the APRS bridge to the stored
channel. Land owns the setting; this module stands in for its manifest schema
until sections declare one (plan §4.3 rule 1), so the bounds live in one place.
"""

from __future__ import annotations

from backend.config import settings
from backend.platform.settings_client import read_setting
from sqlalchemy.ext.asyncio import AsyncSession

# Sanity bounds for a user-set APRS channel: anything an RTL-SDR can tune.
APRS_CHANNEL_MIN_HZ = 24_000_000
APRS_CHANNEL_MAX_HZ = 1_766_000_000


def coerce_aprs_channel_hz(raw: object) -> int | None:
    """Return ``raw`` as a valid APRS channel frequency (Hz), or None.

    Accepts an int/float/numeric string within the tunable range; anything else
    (blank, non-numeric, out of range) is None so callers fall back to the
    default rather than tuning the dongle somewhere nonsensical.
    """
    if raw is None or isinstance(raw, bool):
        return None
    try:
        channel_hz = int(round(float(raw)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not APRS_CHANNEL_MIN_HZ <= channel_hz <= APRS_CHANNEL_MAX_HZ:
        return None
    return channel_hz


async def read_aprs_channel_hz(db: AsyncSession) -> int:
    """Resolve the APRS channel (Hz) the decode bridge should keep the radio on.

    Reads ``land``/``aprsChannelHz``; falls back to ``settings.aprs_channel_hz``
    (144.800 MHz) when unset or invalid.
    """
    raw = await read_setting(db, "land", "aprsChannelHz", default=None)
    return coerce_aprs_channel_hz(raw) or settings.aprs_channel_hz
