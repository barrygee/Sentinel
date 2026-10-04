"""SDR section router — frequency storage, band plan and recordings.

Radios, connections, the spectrum/IQ WebSockets and decode live in the radio
hub (`backend/radio_hub/`); this router keeps what belongs to the SDR section.

  GET    /api/sdr/groups                  — list frequency groups (with frequencies)
  POST   /api/sdr/groups                  — create a group
  PUT    /api/sdr/groups/{id}             — update a group
  DELETE /api/sdr/groups/{id}             — delete a group

  GET    /api/sdr/frequencies             — list all stored frequencies
  POST   /api/sdr/frequencies             — save a frequency
  PUT    /api/sdr/frequencies/{id}        — update a frequency (full replace)
  PATCH  /api/sdr/frequencies/{id}        — partial update (currently: favourite)
  DELETE /api/sdr/frequencies/{id}        — delete a frequency

  GET/POST/PUT/DELETE /api/sdr/search-ranges[/{id}]   — scanner search ranges
  GET/POST /api/sdr/data/{frequencies,bandplan}        — Settings › SDR bulk editors
  GET/POST/PATCH/DELETE /api/sdr/recordings[...]       — recordings + their WAV/IQ files
"""

from __future__ import annotations

import asyncio
import datetime
import logging
from pathlib import Path

from backend.cache import now_ms
from backend.config import settings
from backend.database import get_db, sync_sdr_groups_to_config, sync_sdr_search_ranges_to_config
from backend.db_helpers import get_setting
from backend.models import SdrFrequencyGroup, SdrFrequencyGroupLink, SdrRecording, SdrSearchRange, SdrStoredFrequency
from backend.radio_hub import radios as radio_registry
from backend.radio_hub.services import sdr as sdr_svc
from backend.services.sdr_data import write_sdr_frequencies_file
from backend.services.sdr_frequencies import reconcile_sdr_frequencies
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sdr"])


class GroupIn(BaseModel):
    name: str
    color: str = "#c8ff00"
    sort_order: int = 0

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        from backend.utils import InvalidGroupName, clean_group_name

        try:
            return clean_group_name(v)
        except InvalidGroupName as exc:
            raise ValueError(str(exc)) from exc


class FrequencyIn(BaseModel):
    group_id: int | None = None
    group_ids: list[int] | None = None
    label: str
    frequency_hz: int
    mode: str = "AM"
    squelch: float = -60.0
    gain: float = 30.0
    bandwidth: int | None = None  # demod bandwidth Hz; None = per-mode default
    sample_rate: int | None = None  # device sample rate Hz; None = keep current
    volume: int = 80  # audio volume 0-100 (%)
    zoom: float = 1.0  # waterfall zoom factor
    zmin: float = 0.0  # waterfall Min dB (0 = auto/unset)
    zmax: float = 0.0  # waterfall Max dB (0 = auto/unset)
    scannable: bool = True
    favourite: bool = False
    notes: str = ""


class SearchRangeIn(BaseModel):
    label: str
    low_hz: int
    high_hz: int
    step_hz: int = 12_500
    mode: str = "NFM"
    threshold_dbfs: float = -35.0
    dwell_ms: int = 250
    band_name: str = ""
    enabled: bool = True
    notes: str = ""
    sort_order: int = 0


class RecordingStartIn(BaseModel):
    radio_id: int | None = None
    radio_name: str = ""
    frequency_hz: int
    mode: str = "AM"
    gain_db: float = 30.0
    squelch_dbfs: float = -60.0
    sample_rate: int = 2_048_000


class FrequencyPatchIn(BaseModel):
    """Body for the partial-update `PATCH /api/sdr/frequencies/{id}` endpoint.

    Deliberately narrow (currently just `favourite`) rather than a partial
    `FrequencyIn`: the sibling `PUT /api/sdr/frequencies/{id}` is a full
    replace (`setattr`s every `FrequencyIn` field from `body.model_dump()`),
    so routing a star-toggle through it would silently reset every field a
    stale client omitted (mode, gain, scannable, group links, …). Only fields
    set to a non-None value here are applied; anything else on the row is
    left untouched.
    """

    favourite: bool | None = None


class RecordingPatchIn(BaseModel):
    name: str | None = None
    notes: str | None = None

    @field_validator("name", "notes")
    @classmethod
    def _sanitize_text(cls, v: str | None) -> str | None:
        """Defence-in-depth for user-supplied text.

        Queries go through the SQLAlchemy ORM (bound parameters), so SQL
        injection is not reachable here, and Vue escapes interpolated text so
        stored XSS is mitigated at render. We still validate the input: strip
        control characters (keeping tab/newline), collapse to a sane length,
        and reject anything implausible so junk never reaches the DB.
        """
        if v is None:
            return None
        # Drop C0/C1 control chars except tab (\t) and newline (\n).
        cleaned = "".join(ch for ch in v if ch in ("\t", "\n") or (ord(ch) >= 0x20 and ord(ch) != 0x7F)).strip()
        if len(cleaned) > 250:
            raise ValueError("text too long (max 250 characters)")
        return cleaned


async def _sync_groups(db: AsyncSession) -> None:
    """Mirror groups/frequencies into UserSettings and write the file back, so
    every group/frequency mutation keeps sdr_frequencies.json the source of
    truth (matches the satellite-radio write-through)."""
    await sync_sdr_groups_to_config(db)
    await write_sdr_frequencies_file(db)


async def _sync_search_ranges(db: AsyncSession) -> None:
    """Mirror search ranges into UserSettings and write the file back."""
    await sync_sdr_search_ranges_to_config(db)
    await write_sdr_frequencies_file(db)


def _group_to_dict(g: SdrFrequencyGroup) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "slug": g.slug,
        "color": g.color,
        "sort_order": g.sort_order,
        "created_at": g.created_at,
    }


def _freq_to_dict(f: SdrStoredFrequency, group_ids: list[int] | None = None) -> dict:
    return {
        "id": f.id,
        "group_id": f.group_id,
        "group_ids": group_ids if group_ids is not None else [],
        "label": f.label,
        "frequency_hz": f.frequency_hz,
        "mode": f.mode,
        "squelch": f.squelch,
        "gain": f.gain,
        "bandwidth": f.bandwidth,
        "sample_rate": f.sample_rate,
        "volume": f.volume,
        "zoom": f.zoom,
        "zmin": f.zmin,
        "zmax": f.zmax,
        "scannable": f.scannable,
        "favourite": f.favourite,
        "notes": f.notes,
        "created_at": f.created_at,
    }


async def _load_freq_group_map(db: AsyncSession) -> dict[int, list[int]]:
    rows = (await db.execute(select(SdrFrequencyGroupLink))).scalars().all()
    out: dict[int, list[int]] = {}
    for link in rows:
        out.setdefault(link.frequency_id, []).append(link.group_id)
    return out


async def _set_freq_groups(db: AsyncSession, freq_id: int, group_ids: list[int]) -> None:
    existing = (
        (await db.execute(select(SdrFrequencyGroupLink).where(SdrFrequencyGroupLink.frequency_id == freq_id)))
        .scalars()
        .all()
    )
    for link in existing:
        await db.delete(link)
    seen: set[int] = set()
    for gid in group_ids:
        if gid is None or gid in seen:
            continue
        seen.add(gid)
        db.add(SdrFrequencyGroupLink(frequency_id=freq_id, group_id=gid))


def _recording_to_dict(r: SdrRecording) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "notes": r.notes,
        "radio_id": r.radio_id,
        "radio_name": r.radio_name,
        "frequency_hz": r.frequency_hz,
        "mode": r.mode,
        "gain_db": r.gain_db,
        "squelch_dbfs": r.squelch_dbfs,
        "sample_rate": r.sample_rate,
        "started_at": r.started_at,
        "ended_at": r.ended_at,
        "duration_s": r.duration_s,
        "file_size_bytes": r.file_size_bytes,
        "has_iq_file": r.has_iq_file,
        "iq_file_size_bytes": r.iq_file_size_bytes,
        "status": r.status,
        "created_at": r.created_at,
    }


def _recordings_dir() -> Path:
    return Path(settings.db_path).parent / "recordings"


# In-memory map of active IQ recording queues: recording_id → asyncio.Queue
_active_iq_recordings: dict[int, asyncio.Queue] = {}


# ── Group CRUD ────────────────────────────────────────────────────────────────


@router.get("/api/sdr/groups")
async def list_groups(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(SdrFrequencyGroup).order_by(SdrFrequencyGroup.sort_order))).scalars().all()
    return JSONResponse([_group_to_dict(g) for g in rows])


@router.post("/api/sdr/groups", status_code=201)
async def create_group(body: GroupIn, db: AsyncSession = Depends(get_db)):
    from backend.utils import slugify

    # Slug is derived once from the name and stays stable across later renames.
    existing = set((await db.execute(select(SdrFrequencyGroup.slug))).scalars().all())
    base = slugify(body.name) or "group"
    slug, n = base, 2
    while slug in existing:
        slug, n = f"{base}-{n}", n + 1
    group = SdrFrequencyGroup(**body.model_dump(), slug=slug, created_at=now_ms())
    db.add(group)
    await db.commit()
    await db.refresh(group)
    await _sync_groups(db)
    return JSONResponse(_group_to_dict(group), status_code=201)


@router.put("/api/sdr/groups/{group_id}")
async def update_group(group_id: int, body: GroupIn, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrFrequencyGroup).where(SdrFrequencyGroup.id == group_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Group not found")
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    await _sync_groups(db)
    return JSONResponse(_group_to_dict(row))


@router.delete("/api/sdr/groups/{group_id}", status_code=204)
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrFrequencyGroup).where(SdrFrequencyGroup.id == group_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Group not found")
    # Ungroup any frequencies that belonged to this group
    freqs = (
        (await db.execute(select(SdrStoredFrequency).where(SdrStoredFrequency.group_id == group_id))).scalars().all()
    )
    for freq in freqs:
        freq.group_id = None
    links = (
        (await db.execute(select(SdrFrequencyGroupLink).where(SdrFrequencyGroupLink.group_id == group_id)))
        .scalars()
        .all()
    )
    for link in links:
        await db.delete(link)
    await db.delete(row)
    await db.commit()
    await _sync_groups(db)


# ── Frequency CRUD ────────────────────────────────────────────────────────────


def _resolve_group_ids(body: FrequencyIn) -> list[int]:
    if body.group_ids is not None:
        return [g for g in body.group_ids if g is not None]
    if body.group_id is not None:
        return [body.group_id]
    return []


@router.get("/api/sdr/frequencies")
async def list_frequencies(db: AsyncSession = Depends(get_db)):
    rows = (
        (
            await db.execute(
                select(SdrStoredFrequency).order_by(SdrStoredFrequency.group_id, SdrStoredFrequency.frequency_hz)
            )
        )
        .scalars()
        .all()
    )
    group_map = await _load_freq_group_map(db)
    return JSONResponse([_freq_to_dict(freq, group_map.get(freq.id, [])) for freq in rows])


@router.post("/api/sdr/frequencies", status_code=201)
async def create_frequency(body: FrequencyIn, db: AsyncSession = Depends(get_db)):
    gids = _resolve_group_ids(body)
    payload = body.model_dump(exclude={"group_ids"})
    payload["group_id"] = gids[0] if gids else None
    freq = SdrStoredFrequency(**payload, created_at=now_ms())
    db.add(freq)
    await db.flush()
    await _set_freq_groups(db, freq.id, gids)
    await db.commit()
    await _sync_groups(db)
    await db.refresh(freq)
    return JSONResponse(_freq_to_dict(freq, gids), status_code=201)


@router.put("/api/sdr/frequencies/{freq_id}")
async def update_frequency(freq_id: int, body: FrequencyIn, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrStoredFrequency).where(SdrStoredFrequency.id == freq_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Frequency not found")
    gids = _resolve_group_ids(body)
    payload = body.model_dump(exclude={"group_ids"})
    payload["group_id"] = gids[0] if gids else None
    for k, v in payload.items():
        setattr(row, k, v)
    await _set_freq_groups(db, freq_id, gids)
    await db.commit()
    await _sync_groups(db)
    await db.refresh(row)
    return JSONResponse(_freq_to_dict(row, gids))


@router.patch("/api/sdr/frequencies/{freq_id}")
async def patch_frequency(freq_id: int, body: FrequencyPatchIn, db: AsyncSession = Depends(get_db)):
    """Apply a partial update to a stored frequency (currently just `favourite`).

    Unlike `update_frequency` above — a full replace that `setattr`s every
    `FrequencyIn` field from the request body — this only touches fields the
    caller explicitly set. That is what makes a star-toggle (or any future
    single-field patch) safe: a stale client's cached copy can never clobber
    the frequency's other tuning settings or group links by omission.
    """
    row = (await db.execute(select(SdrStoredFrequency).where(SdrStoredFrequency.id == freq_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Frequency not found")
    # Only fields the caller actually sent AND set to a real value count as an
    # update — an explicit `null` applies nothing, so it must take the no-op
    # path too rather than sneaking past the guard below.
    applied_fields = {name: value for name, value in body.model_dump(exclude_unset=True).items() if value is not None}
    if not applied_fields:
        # Nothing to apply — skip commit/_sync_groups entirely. _sync_groups is
        # expensive (rewrites the user_settings config mirror AND rewrites
        # sdr_frequencies.json to disk), so an empty patch looping on this
        # unauthenticated endpoint must not become a free disk-write amplifier.
        # Still a valid no-op, so return 200 with the row unchanged rather than
        # rejecting the request.
        group_map = await _load_freq_group_map(db)
        return JSONResponse(_freq_to_dict(row, group_map.get(row.id, [])))
    for field_name, field_value in applied_fields.items():
        setattr(row, field_name, field_value)
    await db.commit()
    await _sync_groups(db)
    await db.refresh(row)
    group_map = await _load_freq_group_map(db)
    return JSONResponse(_freq_to_dict(row, group_map.get(row.id, [])))


@router.delete("/api/sdr/frequencies/{freq_id}", status_code=204)
async def delete_frequency(freq_id: int, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrStoredFrequency).where(SdrStoredFrequency.id == freq_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Frequency not found")
    links = (
        (await db.execute(select(SdrFrequencyGroupLink).where(SdrFrequencyGroupLink.frequency_id == freq_id)))
        .scalars()
        .all()
    )
    for link in links:
        await db.delete(link)
    await db.delete(row)
    await db.commit()
    await _sync_groups(db)


# ── Search Range CRUD ─────────────────────────────────────────────────────────


def _search_range_to_dict(r: SdrSearchRange) -> dict:
    return {
        "id": r.id,
        "label": r.label,
        "low_hz": r.low_hz,
        "high_hz": r.high_hz,
        "step_hz": r.step_hz,
        "mode": r.mode,
        "threshold_dbfs": r.threshold_dbfs,
        "dwell_ms": r.dwell_ms,
        "band_name": r.band_name,
        "enabled": r.enabled,
        "notes": r.notes,
        "sort_order": r.sort_order,
        "created_at": r.created_at,
    }


@router.get("/api/sdr/search-ranges")
async def list_search_ranges(db: AsyncSession = Depends(get_db)):
    rows = (
        (await db.execute(select(SdrSearchRange).order_by(SdrSearchRange.sort_order, SdrSearchRange.id)))
        .scalars()
        .all()
    )
    return JSONResponse([_search_range_to_dict(r) for r in rows])


@router.post("/api/sdr/search-ranges", status_code=201)
async def create_search_range(body: SearchRangeIn, db: AsyncSession = Depends(get_db)):
    if body.low_hz >= body.high_hz:
        raise HTTPException(400, "low_hz must be less than high_hz")
    if body.step_hz <= 0:
        raise HTTPException(400, "step_hz must be positive")
    row = SdrSearchRange(**body.model_dump(), created_at=now_ms())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await _sync_search_ranges(db)
    return JSONResponse(_search_range_to_dict(row), status_code=201)


@router.put("/api/sdr/search-ranges/{range_id}")
async def update_search_range(range_id: int, body: SearchRangeIn, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrSearchRange).where(SdrSearchRange.id == range_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Search range not found")
    if body.low_hz >= body.high_hz:
        raise HTTPException(400, "low_hz must be less than high_hz")
    if body.step_hz <= 0:
        raise HTTPException(400, "step_hz must be positive")
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    await _sync_search_ranges(db)
    return JSONResponse(_search_range_to_dict(row))


@router.delete("/api/sdr/search-ranges/{range_id}", status_code=204)
async def delete_search_range(range_id: int, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrSearchRange).where(SdrSearchRange.id == range_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Search range not found")
    await db.delete(row)
    await db.commit()
    await _sync_search_ranges(db)


# ── Bulk data editors (textarea JSON for Settings > SDR) ──────────────────────


@router.get("/api/sdr/data/frequencies")
async def get_sdr_data_frequencies(db: AsyncSession = Depends(get_db)):
    """Return {groups, frequencies, searchRanges} as the textarea source — the
    current DB state mirrored into the flat config representation."""
    return JSONResponse(
        {
            "groups": await get_setting(db, "sdr", "groups", default=[]),
            "frequencies": await get_setting(db, "sdr", "frequencies", default=[]),
            "searchRanges": await get_setting(db, "sdr", "searchRanges", default=[]),
        }
    )


@router.post("/api/sdr/data/frequencies")
async def set_sdr_data_frequencies(body: dict, db: AsyncSession = Depends(get_db)):
    """Replace SDR groups/frequencies/search-ranges from an edited JSON object.

    Reconciles into the dedicated tables (reusing the same logic as the config
    upload), then re-derives the snapshot and writes sdr_frequencies.json."""
    from backend.services.sdr_data import reconcile_search_ranges

    if not isinstance(body, dict):
        raise HTTPException(400, "Body must be a JSON object")
    groups = body.get("groups") if isinstance(body.get("groups"), list) else []
    freqs = body.get("frequencies") if isinstance(body.get("frequencies"), list) else []
    ranges = body.get("searchRanges") if isinstance(body.get("searchRanges"), list) else []

    await reconcile_sdr_frequencies(db, freqs, groups)
    await reconcile_search_ranges(db, ranges)
    await db.commit()
    await _sync_groups(db)  # mirrors groups+frequencies, writes the file
    await sync_sdr_search_ranges_to_config(db)
    return JSONResponse({"status": "ok"})


@router.get("/api/sdr/data/bandplan")
async def get_sdr_data_bandplan(db: AsyncSession = Depends(get_db)):
    """Return {bandPlan} as the textarea source."""
    from backend.services.sdr_data import get_bandplan

    return JSONResponse({"bandPlan": await get_bandplan(db)})


@router.post("/api/sdr/data/bandplan")
async def set_sdr_data_bandplan(body: dict, db: AsyncSession = Depends(get_db)):
    """Replace the band plan from an edited JSON object {bandPlan: [...]}."""
    from backend.services.sdr_data import set_bandplan

    if not isinstance(body, dict) or not isinstance(body.get("bandPlan"), list):
        raise HTTPException(400, "Body must be a JSON object with a bandPlan array")
    await set_bandplan(db, body["bandPlan"])
    return JSONResponse({"status": "ok"})


@router.get("/api/sdr/recordings")
async def list_recordings(db: AsyncSession = Depends(get_db)):
    rows = (
        (
            await db.execute(
                select(SdrRecording).where(SdrRecording.status == "complete").order_by(SdrRecording.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return JSONResponse([_recording_to_dict(r) for r in rows])


@router.post("/api/sdr/recordings/start", status_code=201)
async def start_recording(body: RecordingStartIn, db: AsyncSession = Depends(get_db)):
    """Create a pending recording row and (optionally) start server-side IQ capture."""
    started_at = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    rec = SdrRecording(
        name=f"Recording {started_at[:16].replace('T', ' ')}",
        notes="",
        radio_id=body.radio_id,
        radio_name=body.radio_name,
        frequency_hz=body.frequency_hz,
        mode=body.mode,
        gain_db=body.gain_db,
        squelch_dbfs=body.squelch_dbfs,
        sample_rate=body.sample_rate,
        started_at=started_at,
        ended_at="",
        duration_s=0.0,
        file_size_bytes=0,
        has_iq_file=False,
        iq_file_size_bytes=0,
        status="recording",
        created_at=now_ms(),
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)

    # Check if raw IQ recording is enabled in settings
    record_iq = await get_setting(db, "sdr", "recordRawIq", default=False) is True

    if record_iq and body.radio_id is not None:
        # Look up the radio's host/port so we can find its broadcaster
        radios = await radio_registry.get_radios(db)
        radio = radio_registry.get_radio_by_id(radios, body.radio_id)
        if radio:
            try:
                broadcaster = sdr_svc.get_broadcaster(radio["host"], radio["port"])
                if broadcaster:
                    rdir = _recordings_dir()
                    rdir.mkdir(parents=True, exist_ok=True)
                    iq_path = str(rdir / f"{rec.id}.u8")
                    q = await broadcaster.start_iq_recording(iq_path)
                    _active_iq_recordings[rec.id] = q
                    rec.has_iq_file = True
                    await db.commit()
            except Exception as exc:
                logger.warning("Could not start IQ recording for rec %d: %s", rec.id, exc)

    return JSONResponse({"id": rec.id}, status_code=201)


@router.post("/api/sdr/recordings/stop")
async def stop_recording(
    recording_id: int = Form(...),
    file: UploadFile = File(...),
    name: str = Form(""),
    ended_at: str = Form(""),
    duration_s: float = Form(0.0),
    db: AsyncSession = Depends(get_db),
):
    """Finalise a recording: upload WAV, stop IQ capture, update DB row."""
    row = (await db.execute(select(SdrRecording).where(SdrRecording.id == recording_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Recording not found")

    # Stop IQ recording if active
    if recording_id in _active_iq_recordings:
        q = _active_iq_recordings.pop(recording_id)
        # Find the broadcaster to call stop properly
        try:
            radios_cache = await radio_registry.get_radios(db)
            radio = radio_registry.get_radio_by_id(radios_cache, row.radio_id)
            if radio:
                broadcaster = sdr_svc.get_broadcaster(radio["host"], radio["port"])
                if broadcaster:
                    broadcaster.stop_iq_recording(q)
                    await asyncio.sleep(0.2)  # let drain task finish flushing
        except Exception as exc:
            logger.warning("Error stopping IQ recording %d: %s", recording_id, exc)

    # Save WAV file
    rdir = _recordings_dir()
    rdir.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    wav_path = rdir / f"{recording_id}.wav"
    wav_path.write_bytes(content)

    # Update IQ file size if it was recorded
    iq_file_size = 0
    if row.has_iq_file:
        iq_path = rdir / f"{recording_id}.u8"
        if iq_path.exists():
            iq_file_size = iq_path.stat().st_size

    if not ended_at:
        ended_at = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    row.name = name or row.name
    row.ended_at = ended_at
    row.duration_s = duration_s
    row.file_size_bytes = len(content)
    row.iq_file_size_bytes = iq_file_size
    row.status = "complete"
    await db.commit()
    await db.refresh(row)
    return JSONResponse(_recording_to_dict(row))


@router.patch("/api/sdr/recordings/{rec_id}")
async def update_recording(rec_id: int, body: RecordingPatchIn, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrRecording).where(SdrRecording.id == rec_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Recording not found")
    if body.name is not None:
        row.name = body.name
    if body.notes is not None:
        row.notes = body.notes
    await db.commit()
    await db.refresh(row)
    return JSONResponse(_recording_to_dict(row))


@router.delete("/api/sdr/recordings/{rec_id}", status_code=204)
async def delete_recording(rec_id: int, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrRecording).where(SdrRecording.id == rec_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Recording not found")
    rdir = _recordings_dir()
    for ext in ("wav", "u8"):
        p = rdir / f"{rec_id}.{ext}"
        if p.exists():
            p.unlink()
    await db.delete(row)
    await db.commit()


@router.get("/api/sdr/recordings/{rec_id}/file")
async def get_recording_wav(rec_id: int, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrRecording).where(SdrRecording.id == rec_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Recording not found")
    wav_path = _recordings_dir() / f"{rec_id}.wav"
    if not wav_path.exists():
        raise HTTPException(404, "WAV file not found on disk")
    safe = "".join(c for c in row.name if c.isalnum() or c in " _-").strip() or f"recording_{rec_id}"
    return FileResponse(str(wav_path), media_type="audio/wav", filename=f"{safe}.wav")


@router.get("/api/sdr/recordings/{rec_id}/iq")
async def get_recording_iq(rec_id: int, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(SdrRecording).where(SdrRecording.id == rec_id))).scalar_one_or_none()
    if not row or not row.has_iq_file:
        raise HTTPException(404, "IQ file not found")
    iq_path = _recordings_dir() / f"{rec_id}.u8"
    if not iq_path.exists():
        raise HTTPException(404, "IQ file not found on disk")
    safe = "".join(c for c in row.name if c.isalnum() or c in " _-").strip() or f"recording_{rec_id}"
    return FileResponse(str(iq_path), media_type="application/octet-stream", filename=f"{safe}.u8")
