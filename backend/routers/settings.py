"""
Settings router — user preferences and overlay toggle persistence.

Endpoints:
  GET  /api/settings                    — all settings as { namespace: { key: value } }
  GET  /api/settings/{namespace}        — settings for one namespace as { key: value }
  PUT  /api/settings/{namespace}/{key}  — upsert a single setting
  GET  /api/settings/config/preview     — current settings as a downloadable config JSON
  POST /api/settings/config/upload      — replace all settings from an uploaded config JSON
"""

import json
from typing import Any

from backend.cache import now_ms
from backend.database import get_db
from backend.db_helpers import upsert_setting
from backend.models import UserSettings
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

def _rows_to_namespace_dict(rows) -> dict:
    """Convert a list of UserSettings rows to { key: parsed_value }."""
    result = {}
    for row in rows:
        try:
            result[row.key] = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            result[row.key] = row.value
    return result


_VALID_MODES = {"AM", "NFM", "WFM", "USB", "LSB", "CW"}


async def _reconcile_sdr_frequencies(
    db: AsyncSession, payload: list, catalogue: list | None = None
) -> None:
    """Rebuild SDR groups + stored frequencies to match the flat config
    payload (a list of {label, frequency_hz, mode, notes, groups:[slug, ...]}).

    Each frequency carries its own `groups` as group *slugs* (never
    duplicated). `catalogue` is the `sdr.groups` list — {name, slug} objects
    (current shape) or bare name strings (legacy) — and supplies the readable
    name for each slug plus the set of default/empty groups that must exist and
    must never be pruned. Groups are matched by slug so a renamed group still
    resolves and existing colours / sort order survive a round-trip (the config
    omits colour). Slugs referenced but absent are created. Groups neither
    referenced by a frequency nor in the catalogue, and all existing
    frequencies, are removed so the config is authoritative."""
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

    # Frequencies are fully rebuilt from the payload.
    await db.execute(delete(SdrStoredFrequency))
    await db.execute(delete(SdrFrequencyGroupLink))

    ts = now_ms()
    next_sort = max((g.sort_order for g in existing_groups), default=-1) + 1
    keep_group_ids: set[int] = set()

    async def _resolve_group(slug: str) -> int:
        nonlocal next_sort
        group = by_slug.get(slug)
        if group is None:
            group = SdrFrequencyGroup(
                name=name_by_slug.get(slug, slug), slug=slug, color="#c8ff00",
                sort_order=next_sort, created_at=ts,
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
            gid = await _resolve_group(slugify(raw_slug.strip()))
            if gid not in gids:
                gids.append(gid)
        keep_group_ids.update(gids)

        freq = SdrStoredFrequency(
            group_id=gids[0] if gids else None,
            label=label[:60],
            frequency_hz=hz,
            mode=mode,
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

    return JSONResponse({ns: _rows_to_namespace_dict(ns_rows) for ns, ns_rows in grouped.items()})


# ── Config preview (must be registered before /{namespace}) ─────────────────

@router.get("/config/preview")
async def config_preview(db: AsyncSession = Depends(get_db)):
    """Return the current settings as a config JSON file (downloadable)."""
    result = await db.execute(select(UserSettings))
    rows = result.scalars().all()

    grouped: dict[str, list] = {}
    for row in rows:
        grouped.setdefault(row.namespace, []).append(row)

    config = {ns: _rows_to_namespace_dict(ns_rows) for ns, ns_rows in grouped.items()}
    payload = json.dumps(config, indent=2, ensure_ascii=False)
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

    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="Config must be a JSON object")

    # Assign sequential IDs to any sdr.radios entries that are missing them
    sdr_radios = config.get("sdr", {}).get("radios") if isinstance(config.get("sdr"), dict) else None
    if isinstance(sdr_radios, list):
        next_id = max((r.get("id", 0) for r in sdr_radios if isinstance(r, dict)), default=0) + 1
        for r in sdr_radios:
            if isinstance(r, dict) and not isinstance(r.get("id"), int):
                r["id"] = next_id
                next_id += 1

    # Reconcile SDR frequency groups + frequencies from the flat config
    # representation back into their dedicated tables, so editing them in the
    # app config JSON actually takes effect. The `sdr.groups` catalogue
    # ({name, slug} objects) supplies slug→name and protects empty groups
    # from being pruned for having no frequencies.
    sdr_ns = config.get("sdr")
    if isinstance(sdr_ns, dict) and isinstance(sdr_ns.get("frequencies"), list):
        catalogue = sdr_ns.get("groups")
        await _reconcile_sdr_frequencies(
            db,
            sdr_ns["frequencies"],
            catalogue if isinstance(catalogue, list) else [],
        )

    ts = now_ms()
    for namespace, keys in config.items():
        if not isinstance(keys, dict):
            continue
        for key, value in keys.items():
            result = await db.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace,
                    UserSettings.key == key,
                )
            )
            row = result.scalar_one_or_none()
            value_str = json.dumps(value)
            if row:
                row.value = value_str
                row.updated_at = ts
            else:
                db.add(UserSettings(
                    namespace=namespace,
                    key=key,
                    value=value_str,
                    updated_at=ts,
                ))

    await db.commit()
    return JSONResponse({"status": "ok"})


# ── Namespace / key endpoints (registered after /config/* to avoid shadowing) ─

@router.get("/{namespace}")
async def get_namespace_settings(namespace: str, db: AsyncSession = Depends(get_db)):
    """Return settings for a single namespace as { key: value }."""
    result = await db.execute(
        select(UserSettings).where(UserSettings.namespace == namespace)
    )
    rows = result.scalars().all()
    return JSONResponse(_rows_to_namespace_dict(rows))


@router.put("/{namespace}/{key}", status_code=200)
async def upsert_setting_endpoint(
    namespace: str,
    key: str,
    body: SettingValueIn,
    db: AsyncSession = Depends(get_db),
):
    """Upsert a single user setting. Creates the row if it doesn't exist."""
    await upsert_setting(db, namespace, key, body.value)
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
