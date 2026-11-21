"""The ``/history/*`` endpoints, built once per section so all four answer alike.

They read only the section's own database, never an upstream source, so
replay works the same with the internet unplugged.
"""

from __future__ import annotations

import time
from typing import Annotated, Any

from backend.database import get_db
from backend.platform.history import queries
from backend.platform.history.recorder import ENABLED_SETTING_KEY
from backend.platform.history.retention import read_retention_days, retention_cutoff_ms
from backend.platform.settings_client import read_setting
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

# Unix ms in a sane range (2000-01-01 … 2100-01-01): anything else is a client bug.
_EARLIEST_MS = 946_684_800_000
_LATEST_MS = 4_102_444_800_000
TimestampMs = Annotated[int, Query(ge=_EARLIEST_MS, le=_LATEST_MS)]


def _now_ms() -> int:
    return int(time.time() * 1000)


def build_history_router(
    prefix: str, namespace: str, model: type, lookback_ms: int, tags: list[str] | None = None
) -> APIRouter:
    """``GET {prefix}/history/{status,coverage,samples}`` over `model`.

    `lookback_ms` is how far before ``from`` the samples query also reaches,
    so a seek starts with every entity that was on the map at that moment (an
    aircraft last heard 40 s before the seek point is still shown). It is
    capped at an hour.
    """
    if not 0 <= lookback_ms <= queries.MAX_LOOKBACK_MS:
        raise ValueError(f"lookback_ms must be within 0..{queries.MAX_LOOKBACK_MS}")
    router = APIRouter(prefix=f"{prefix}/history", tags=tags or [namespace])

    @router.get("/status")
    async def history_status(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
        """Whether recording is on, the retention window, and what is stored."""
        enabled = bool(await read_setting(db, namespace, ENABLED_SETTING_KEY, False))
        retention_days = await read_retention_days(db, namespace)
        return {
            "enabled": enabled,
            "retentionDays": retention_days,
            "lookbackMs": lookback_ms,
            **(await queries.fetch_status(db, model)),
        }

    @router.get("/coverage")
    async def history_coverage(
        from_ms: Annotated[int | None, Query(alias="from", ge=_EARLIEST_MS, le=_LATEST_MS)] = None,
        to_ms: Annotated[int | None, Query(alias="to", ge=_EARLIEST_MS, le=_LATEST_MS)] = None,
        db: AsyncSession = Depends(get_db),
    ) -> dict[str, Any]:
        """Time buckets that hold data (whole retention window by default)."""
        now = _now_ms()
        retention_days = await read_retention_days(db, namespace)
        window_to = now if to_ms is None else to_ms
        window_from = retention_cutoff_ms(now, retention_days) if from_ms is None else from_ms
        try:
            window_from, window_to = queries.clamp_window(
                window_from, window_to, now, retention_days, queries.MAX_COVERAGE_SPAN_MS
            )
        except queries.HistoryQueryError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return await queries.fetch_coverage(db, model, window_from, window_to)

    @router.get("/samples")
    async def history_samples(
        from_ms: Annotated[int, Query(alias="from", ge=_EARLIEST_MS, le=_LATEST_MS)],
        to_ms: Annotated[int, Query(alias="to", ge=_EARLIEST_MS, le=_LATEST_MS)],
        bbox: Annotated[str | None, Query(max_length=100)] = None,
        db: AsyncSession = Depends(get_db),
    ) -> dict[str, Any]:
        """Samples in [from − lookback, to] (at most 30 minutes from..to), grouped by entity."""
        now = _now_ms()
        retention_days = await read_retention_days(db, namespace)
        try:
            area = queries.parse_bbox(bbox)
            window_from, window_to = queries.clamp_window(from_ms, to_ms, now, retention_days, queries.MAX_WINDOW_MS)
            # Lookback is added after the span check so it never eats into the
            # caller's 30-minute allowance, and it is clamped to retention too.
            window_from = max(window_from - lookback_ms, retention_cutoff_ms(now, retention_days))
        except queries.HistoryQueryError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        if window_to < window_from:
            # Entirely outside retention (or in the future): an empty, valid reply.
            return {"from": from_ms, "to": to_ms, "truncated": False, "entities": {}}
        return await queries.fetch_samples(db, model, window_from, window_to, area)

    return router
