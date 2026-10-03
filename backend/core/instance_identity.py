"""This Sentinel's stable identity (`app.instanceId`).

Owned by core rather than by whichever section first needs it (Air used to
generate it for ADS-B reservations): the radio hub sends it verbatim to Sentry
as the reservation holder, so it must outlive any one section and keep the
same key in the config file.
"""

from __future__ import annotations

import uuid

from backend.db_helpers import get_setting, upsert_setting
from sqlalchemy.ext.asyncio import AsyncSession

INSTANCE_ID_NAMESPACE = "app"
INSTANCE_ID_KEY = "instanceId"


async def get_instance_id(db: AsyncSession) -> str:
    """This Sentinel's stable identity, as seen by Sentry's reservations.

    Generated once and stored, because it is the only thing distinguishing
    "renewing my own lease" from "stealing someone else's". A value regenerated
    per process — or per request — would lock this Sentinel out of the device it
    is holding the moment it restarted, and it would have to wait out the lease
    it took itself.
    """
    stored = await get_setting(db, INSTANCE_ID_NAMESPACE, INSTANCE_ID_KEY)
    if isinstance(stored, str) and stored:
        return stored
    generated = f"sentinel:{uuid.uuid4()}"
    await upsert_setting(db, INSTANCE_ID_NAMESPACE, INSTANCE_ID_KEY, generated)
    return generated
