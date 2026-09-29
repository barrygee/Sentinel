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

from backend.cache import now_ms
from backend.database import get_db
from backend.db_helpers import upsert_setting
from backend.models import UserSettings
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


_VALID_MODES = {"AM", "NFM", "WFM", "USB", "LSB", "CW"}

# Per-mode demod bandwidth defaults (Hz), mirroring defaultBwHz() in the SPA
# (frontend/vue/src/components/sdr/sdrPanelUtils.ts). Used when an imported
# frequency omits an explicit bandwidth.
_DEFAULT_BW_BY_MODE = {
    "WFM": 500_000,
    "NFM": 12_500,
    "AM": 10_000,
    "USB": 3_000,
    "LSB": 3_000,
    "CW": 500,
}


def _coerce_float(value: object, default: float) -> float:
    """Best-effort float coercion for hand-written/imported config values.
    Returns ``default`` for missing or non-numeric input."""
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _coerce_optional_int(value: object, default: int) -> int:
    """Best-effort int coercion; returns ``default`` for missing/non-numeric
    input. Used for bandwidth/sample_rate so an omitted value is filled with a
    sensible concrete default rather than left NULL."""
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


async def _reconcile_sdr_frequencies(db: AsyncSession, payload: list, catalogue: list | None = None) -> None:
    """Rebuild SDR groups + stored frequencies to match the flat config
    payload (a list of {label, frequency_hz, mode, notes, groups:[slug, ...]}).

    Each frequency carries its own `groups` as group *slugs* (never
    duplicated). `catalogue` is the `sdr.groups` list — {name, slug} objects
    (current shape) or bare name strings (legacy) — and supplies the readable
    name for each slug plus the set of default/empty groups that must exist and
    must never be pruned. Groups are matched by slug so a renamed group still
    resolves and existing colours / sort order survive a round-trip (the config
    omits colour).

    Catalogue authority: when a non-empty catalogue is supplied, `sdr.groups`
    is the source of truth. A frequency slug not present in the catalogue is
    dropped from that frequency (the removed group is NOT resurrected), and any
    DB group neither in the catalogue nor referenced by a surviving frequency
    is deleted by the prune below. When the catalogue is empty/absent (legacy
    or hand-written config that omits sdr.groups) this is relaxed: slugs
    referenced by a frequency are auto-created so such imports are not wiped.
    All existing frequencies are always rebuilt from the payload."""
    from backend.models import (
        SdrFrequencyGroup,
        SdrFrequencyGroupLink,
        SdrStoredFrequency,
    )
    from backend.utils import InvalidGroupName, clean_group_name, slugify

    existing_groups = (await db.execute(select(SdrFrequencyGroup))).scalars().all()
    by_slug: dict[str, SdrFrequencyGroup] = {g.slug: g for g in existing_groups if g.slug}

    # Build slug -> display name from the catalogue, accepting {name, slug}
    # objects or legacy bare strings. A missing slug is derived from the name.
    # Names from an uploaded config bypass the GroupIn validator, so sanitise
    # here too; a malformed entry is skipped rather than aborting the import.
    name_by_slug: dict[str, str] = {}
    keep_slugs: list[str] = []
    for entry in catalogue or []:
        if isinstance(entry, dict):
            raw_name = str(entry.get("name", ""))
            raw_slug = str(entry.get("slug", "")).strip()
        elif isinstance(entry, str):
            raw_name, raw_slug = entry, ""
        else:
            continue
        try:
            nm = clean_group_name(raw_name)
        except InvalidGroupName:
            continue
        sl = slugify(raw_slug or nm)
        if not sl:
            continue
        name_by_slug.setdefault(sl, nm)
        keep_slugs.append(sl)

    # When a usable catalogue is supplied, `sdr.groups` is authoritative: a
    # frequency may only reference groups listed there, and groups absent from
    # it are pruned (the existing prune loop handles deletion). When the
    # catalogue is empty/absent (legacy or hand-written config that omits
    # sdr.groups), fall back to the historical behaviour of auto-creating
    # groups from frequency refs so such imports are not silently wiped.
    catalogue_authoritative = bool(keep_slugs)
    allowed_slugs = set(keep_slugs)

    # Frequencies are fully rebuilt from the payload.
    await db.execute(delete(SdrStoredFrequency))
    await db.execute(delete(SdrFrequencyGroupLink))

    ts = now_ms()
    next_sort = max((g.sort_order for g in existing_groups), default=-1) + 1
    keep_group_ids: set[int] = set()

    async def _resolve_group(slug: str) -> int:
        # Invariant: when catalogue_authoritative, callers only pass slugs in
        # `allowed_slugs` (the frequency loop filters first; the keep-slugs
        # pre-pass iterates the catalogue itself). So the create branch below
        # can only ever mint in-catalogue groups — a removed group is never
        # resurrected here.
        nonlocal next_sort
        group = by_slug.get(slug)
        if group is None:
            group = SdrFrequencyGroup(
                name=name_by_slug.get(slug, slug),
                slug=slug,
                color="#c8ff00",
                sort_order=next_sort,
                created_at=ts,
            )
            next_sort += 1
            db.add(group)
            await db.flush()
            by_slug[slug] = group
        return group.id

    # Default/empty groups must exist and survive pruning even with no freqs.
    for slug in keep_slugs:
        keep_group_ids.add(await _resolve_group(slug))

    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            hz = int(item.get("frequency_hz", 0))
        except (TypeError, ValueError):
            continue
        mode = str(item.get("mode", "AM")).upper().strip()
        label = str(item.get("label", "")).strip()
        if hz <= 0 or mode not in _VALID_MODES or not label:
            continue

        # Resolve this frequency's group memberships (de-duplicated, ordered).
        gids: list[int] = []
        for raw_slug in item.get("groups", []):
            if not isinstance(raw_slug, str) or not raw_slug.strip():
                continue
            sl = slugify(raw_slug.strip())
            # Catalogue is authoritative: a slug the user removed from
            # sdr.groups is dropped from the frequency rather than resurrecting
            # the group. (Legacy empty-catalogue imports keep auto-create.)
            if catalogue_authoritative and sl not in allowed_slugs:
                continue
            gid = await _resolve_group(sl)
            if gid not in gids:
                gids.append(gid)
        keep_group_ids.update(gids)

        freq = SdrStoredFrequency(
            group_id=gids[0] if gids else None,
            label=label[:60],
            frequency_hz=hz,
            mode=mode,
            squelch=_coerce_float(item.get("squelch"), -60.0),
            gain=_coerce_float(item.get("gain"), 30.0),
            bandwidth=_coerce_optional_int(item.get("bandwidth"), _DEFAULT_BW_BY_MODE.get(mode, 10000)),
            sample_rate=_coerce_optional_int(item.get("sample_rate"), 2_048_000),
            volume=int(_coerce_float(item.get("volume"), 80.0)),
            zoom=_coerce_float(item.get("zoom"), 1.0),
            zmin=_coerce_float(item.get("zmin"), 0.0),
            zmax=_coerce_float(item.get("zmax"), 0.0),
            scannable=bool(item.get("scannable", True)),
            favourite=bool(item.get("favourite", False)),
            notes=str(item.get("notes", ""))[:500],
            created_at=ts,
        )
        db.add(freq)
        await db.flush()
        for gid in gids:
            db.add(SdrFrequencyGroupLink(frequency_id=freq.id, group_id=gid))

    # Drop groups no longer referenced by any frequency.
    for group in existing_groups:
        if group.id not in keep_group_ids:
            await db.delete(group)


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
    if namespace == "land" and key == "aprsChannelHz":
        from backend.routers.sdr import apply_aprs_channel  # avoid import cycle at module load

        await apply_aprs_channel(value)
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
