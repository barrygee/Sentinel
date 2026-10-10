"""Secret settings for the service that owns them (section-containers plan §4.3 rule 4).

  GET    /internal/settings/secrets/{namespace}/{key} — `{"value": "<secret>"}` (`""` when unset)
  PUT    /internal/settings/secrets/{namespace}/{key} — `{"value": "<secret>"}` → store it
  DELETE /internal/settings/secrets/{namespace}/{key} — forget it

Secrets live in core's `user_settings` like every other setting, but the public
settings API redacts them on read and refuses them on write, so a section in its
own container can't reach its own secret through it (the AISStream key is Sea's).
These routes are its way in: under `/internal/`, which the gateway never routes,
behind the deployment's join token, and only for keys listed in
`SECRET_SETTING_KEYS` — so they can't be used to write ordinary settings around
the settings router's validation.

No `settings.changed` event is published: a secret's owner re-reads it on its
own schedule (Sea's AIS reader, every watchdog tick), and the config document
never carries it.
"""

from __future__ import annotations

from backend.core.internal_auth import require_join_token
from backend.database import get_db
from backend.db_helpers import get_setting, upsert_setting
from backend.models import UserSettings
from backend.services.app_config import is_secret_setting
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/internal/settings/secrets", tags=["settings"], include_in_schema=False)


class SecretValue(BaseModel):
    """A secret's value on the wire, both ways."""

    value: str = Field(max_length=512)


def _require_secret(namespace: str, key: str, authorization: str | None) -> None:
    require_join_token(authorization)
    if not is_secret_setting(namespace, key):
        # Not "forbidden": as far as this route is concerned, nothing else exists.
        raise HTTPException(status_code=404, detail="No such secret setting")


@router.get("/{namespace}/{key}", response_model=SecretValue)
async def read_secret(
    namespace: str,
    key: str,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> SecretValue:
    """The stored secret, or `""` when none is saved."""
    _require_secret(namespace, key, authorization)
    stored = await get_setting(db, namespace, key, default="")
    return SecretValue(value=stored if isinstance(stored, str) else "")


@router.put("/{namespace}/{key}", status_code=204)
async def write_secret(
    namespace: str,
    key: str,
    body: SecretValue,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Store the secret. Its owner validated it; this only keeps it."""
    _require_secret(namespace, key, authorization)
    await upsert_setting(db, namespace, key, body.value)


@router.delete("/{namespace}/{key}", status_code=204)
async def delete_secret(
    namespace: str,
    key: str,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Forget the secret (a no-op when none is saved)."""
    _require_secret(namespace, key, authorization)
    await db.execute(delete(UserSettings).where(UserSettings.namespace == namespace, UserSettings.key == key))
    await db.commit()
