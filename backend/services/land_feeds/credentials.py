"""Resolving and storing Land feed credentials.

Credentials never live inside a `land.feeds` config item — each feed's secret
is a separate `user_settings` row (`namespace="land"`, `key="feedCredential:
<id>"`), following the AISStream-key pattern in `routers/sea.py`. The generic
settings router redacts/refuses this key prefix (see `_SECRET_SETTING_PREFIXES`
in `routers/settings.py`); this module is the only code that reads or writes
the actual value.

A `.env`-provided `LAND_FEED_CREDENTIALS_JSON` is the fallback for a headless
deployment with no saved DB row, mirroring `AISSTREAM_API_KEY`. A saved DB row
always takes precedence.
"""

from __future__ import annotations

import json
import logging

from backend.config import settings as app_settings
from backend.db_helpers import get_setting, upsert_setting
from backend.models import UserSettings
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_CREDENTIAL_KEY_PREFIX = "feedCredential:"


def credential_key(feed_id: str) -> str:
    """The `user_settings` key a feed's credential is stored under."""
    return f"{_CREDENTIAL_KEY_PREFIX}{feed_id}"


def _env_credentials() -> dict[str, dict]:
    """Parse `LAND_FEED_CREDENTIALS_JSON` once per call — this only runs on
    infrequent paths (settings reads, poller ticks), so no caching is needed
    and a bad env value never sticks around as stale cached state."""
    raw = app_settings.land_feed_credentials_json.strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("LAND_FEED_CREDENTIALS_JSON is not valid JSON — ignoring it")
        return {}
    return parsed if isinstance(parsed, dict) else {}


async def get_credential(db: AsyncSession, feed_id: str) -> dict | None:
    """Return the resolved credential dict for `feed_id`, or None if unset.

    A saved Settings row wins; otherwise falls back to the matching entry (if
    any) in `LAND_FEED_CREDENTIALS_JSON`.
    """
    saved = await get_setting(db, "land", credential_key(feed_id), default=None)
    if isinstance(saved, dict) and saved:
        return saved
    env_entry = _env_credentials().get(feed_id)
    return env_entry if isinstance(env_entry, dict) and env_entry else None


async def is_configured(db: AsyncSession, feed_id: str) -> bool:
    """True if a credential is available from either source (never exposes it)."""
    return await get_credential(db, feed_id) is not None


async def set_credential(db: AsyncSession, feed_id: str, value: dict) -> None:
    """Save/replace the stored credential for `feed_id`."""
    await upsert_setting(db, "land", credential_key(feed_id), value)


async def clear_credential(db: AsyncSession, feed_id: str) -> None:
    """Forget the saved credential; the `.env` fallback (if any) applies again."""
    await db.execute(
        delete(UserSettings).where(
            UserSettings.namespace == "land",
            UserSettings.key == credential_key(feed_id),
        )
    )
    await db.commit()
