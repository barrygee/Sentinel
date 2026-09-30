"""
Settings router — user preferences and overlay toggle persistence.

Endpoints:
  GET  /api/settings                     — all settings as { namespace: { key: value } }
  GET  /api/settings/{namespace}         — settings for one namespace as { key: value }
  PUT  /api/settings/{namespace}/{key}   — upsert a single setting
  GET  /api/settings/config/preview      — current settings as a downloadable config JSON
  POST /api/settings/config/upload       — replace all settings from an uploaded config JSON
  GET  /api/settings/config/file-status  — where the live config file is, and when it was last edited outside the app
"""

import json
from typing import Any

from backend.database import get_db
from backend.db_helpers import upsert_setting
from backend.models import UserSettings
from backend.platform.bus import bus
from backend.services import app_config_file
from backend.services.app_config import (
    SOURCE_MODE_SECTIONS,
    SOURCE_MODES,
    InvalidConfigError,
    apply_config,
    build_config_snapshot,
    is_secret_setting,
    rows_to_namespace_dict,
    validated_location,
)
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

# ── Request body schemas ───────────────────────────────────────────────────────


class SettingValueIn(BaseModel):
    """Body for PUT /api/settings/{namespace}/{key}."""

    value: Any  # accepts bool, str, dict, list — stored as JSON string


router = APIRouter(prefix="/api/settings", tags=["settings"])


# ── Helpers ────────────────────────────────────────────────────────────────────


def _validated_aprs_channel_hz(value: Any) -> int:
    """Validate a `land/aprsChannelHz` write: an integer Hz within the tunable range.

    Rejected (400) rather than silently defaulted so a typo in Settings doesn't
    quietly leave APRS decoding the wrong channel.
    """
    from backend.services.aprs_store import (  # avoid import cycle at module load
        APRS_CHANNEL_MAX_HZ,
        APRS_CHANNEL_MIN_HZ,
        coerce_aprs_channel_hz,
    )

    channel_hz = coerce_aprs_channel_hz(value)
    if channel_hz is None:
        raise HTTPException(
            status_code=400,
            detail=f"aprsChannelHz must be a frequency in Hz between {APRS_CHANNEL_MIN_HZ} and {APRS_CHANNEL_MAX_HZ}",
        )
    return channel_hz


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("")
async def get_all_settings(db: AsyncSession = Depends(get_db)):
    """Return all user settings grouped by namespace."""
    result = await db.execute(select(UserSettings))
    rows = result.scalars().all()

    grouped: dict[str, list] = {}
    for row in rows:
        grouped.setdefault(row.namespace, []).append(row)

    return JSONResponse({ns: rows_to_namespace_dict(ns_rows, ns) for ns, ns_rows in grouped.items()})


# ── Config document (must be registered before /{namespace}) ────────────────
# Which keys make up the document (and which are secret / data / internal) is
# owned by services/app_config.py, shared with the live config-file sync.


@router.get("/config/preview")
async def config_preview(db: AsyncSession = Depends(get_db)):
    """Return the current settings as a config JSON file (downloadable)."""
    payload = json.dumps(await build_config_snapshot(db), indent=2, ensure_ascii=False)
    return Response(content=payload, media_type="application/json")


@router.post("/config/upload", status_code=200)
async def config_upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Replace all settings from an uploaded config JSON file."""
    try:
        content = await file.read()
        config = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc

    try:
        await apply_config(db, config)
    except InvalidConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return JSONResponse({"status": "ok"})


@router.get("/config/file-status")
async def config_file_status():
    """Report the live config file and when it was last edited outside the app.

    `external_edit_at` (epoch ms, 0 = not since startup) moves whenever a saved
    edit to the file is applied; the SPA polls it and reloads its settings.
    """
    return JSONResponse(
        {
            "path": str(app_config_file.sync.path),
            "syncing": app_config_file.sync.is_running,
            "external_edit_at": app_config_file.sync.external_edit_at,
        }
    )


# ── Namespace / key endpoints (registered after /config/* to avoid shadowing) ─


@router.get("/{namespace}")
async def get_namespace_settings(namespace: str, db: AsyncSession = Depends(get_db)):
    """Return settings for a single namespace as { key: value }."""
    result = await db.execute(select(UserSettings).where(UserSettings.namespace == namespace))
    rows = result.scalars().all()
    return JSONResponse(rows_to_namespace_dict(rows, namespace))


@router.put("/{namespace}/{key}", status_code=200)
async def upsert_setting_endpoint(
    namespace: str,
    key: str,
    body: SettingValueIn,
    db: AsyncSession = Depends(get_db),
):
    """Upsert a single user setting. Creates the row if it doesn't exist."""
    if is_secret_setting(namespace, key):
        raise HTTPException(status_code=400, detail=f"{namespace}/{key} is a secret — use its dedicated endpoint")
    value = body.value
    if namespace == "app" and key == "location":
        try:
            value = validated_location(value)
        except InvalidConfigError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if namespace == "land" and key == "aprsChannelHz":
        value = _validated_aprs_channel_hz(value)
    is_mode_setting = (namespace in SOURCE_MODE_SECTIONS and key == "sourceOverride") or (
        namespace == "app" and key == "connectivityMode"
    )
    if is_mode_setting and value not in SOURCE_MODES:
        raise HTTPException(status_code=400, detail=f"{key} must be 'online' or 'offgrid'")
    await upsert_setting(db, namespace, key, value)
    # Announce the write on the event bus rather than calling into whichever
    # module owns a reaction to it (e.g. SDR retuning a running APRS bridge
    # when land/aprsChannelHz changes) — this is what lets routers/settings.py
    # avoid importing routers/sdr.py. `db` rides along in the payload (not
    # just the JSON-safe `keys` list) so a subscriber reads the value it just
    # saw committed, through the same session/engine as this request — not a
    # generic module-level session, which would diverge under a test's
    # per-request `get_db` override. That is an in-process-only convenience
    # this bus deliberately keeps to (see backend/platform/bus.py); it goes
    # away once a subscriber lives in a separate process from the writer.
    await bus.publish(
        f"settings.changed.{namespace}",
        {"keys": [key], "db": db},
        # Preserves today's behaviour: before this change, a raised exception
        # from apply_aprs_channel() (the one subscriber this currently
        # reaches) propagated out of this handler as an unhandled exception
        # (FastAPI turns that into a 500). raise_errors=True keeps that.
        raise_errors=True,
    )
    return JSONResponse({"status": "ok"})


@router.delete("/{namespace}/{key}", status_code=200)
async def delete_setting_endpoint(
    namespace: str,
    key: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single user setting. No-op if the row doesn't exist."""
    await db.execute(
        delete(UserSettings).where(
            UserSettings.namespace == namespace,
            UserSettings.key == key,
        )
    )
    await db.commit()
    return JSONResponse({"status": "ok"})
