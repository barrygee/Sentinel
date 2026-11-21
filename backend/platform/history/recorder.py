"""Buffered, gated recording of positions into a section's history table.

A section calls :meth:`HistoryRecorder.offer` from the single place its data
already flows through *after* the online/off-grid source was chosen (Air's
snapshot observer, Sea's envelope ingest, Land's station upsert). So the
recorder never knows or cares which source is live, and a source switch needs
no code here: the per-entity gate just keeps going.

Writes are batched: ``offer`` only appends to an in-memory buffer, and one
background task flushes it every ``flush_interval_s`` in a single
``INSERT … ON CONFLICT DO NOTHING``. It never writes once per fix, which would
fight the live tables for SQLite's single write lock.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from backend.platform.settings_client import read_setting
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# The setting key every section uses for its on/off switch (``<ns>.historyEnabled``).
ENABLED_SETTING_KEY = "historyEnabled"

DEFAULT_FLUSH_INTERVAL_S = 15.0
# Bounds memory if the database stalls: the oldest buffered samples go first.
MAX_BUFFERED_SAMPLES = 50_000
# A gate entry older than this is forgotten, so a long-running process doesn't
# keep one entry for every aircraft or vessel it has ever seen.
GATE_FORGET_AFTER_MS = 60 * 60 * 1000
# A wall clock that jumps back this far is logged: an off-grid box without NTP
# that then syncs. Samples keep the time they were stored with.
CLOCK_JUMP_WARN_MS = 5 * 60 * 1000
EARTH_RADIUS_M = 6_371_000.0


@dataclass(frozen=True)
class PositionSample:
    """One observed position, offered to the recorder."""

    entity_id: str
    t_ms: int
    lat: float
    lon: float
    alt: float | None = None
    heading: float | None = None
    speed: float | None = None
    source_mode: str = "online"
    extra: dict[str, Any] | None = None


@dataclass(frozen=True)
class SampleGate:
    """When a new position of an entity is worth storing.

    A sample is kept when ``min_interval_s`` has passed since the last stored
    one, **or** — once at least ``min_gap_s`` has passed — it moved
    ``min_move_m``, or its heading/altitude changed that much. So straight-line
    cruising is thinned out, turns and climbs keep their shape, and something
    that reports every few seconds (a ship underway) is never stored faster
    than ``min_gap_s``.
    """

    min_interval_s: float
    min_move_m: float = 0.0
    heading_change_deg: float | None = 20.0
    altitude_change_ft: float | None = None
    min_gap_s: float = 0.0


@dataclass
class _LastStored:
    t_ms: int
    lat: float
    lon: float
    heading: float | None
    alt: float | None


def distance_m(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    """Great-circle distance between two points in metres (haversine)."""
    phi_a, phi_b = math.radians(lat_a), math.radians(lat_b)
    delta_phi = phi_b - phi_a
    delta_lambda = math.radians(lon_b - lon_a)
    haversine = math.sin(delta_phi / 2) ** 2 + math.cos(phi_a) * math.cos(phi_b) * math.sin(delta_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(haversine)))


def heading_difference_deg(heading_a: float, heading_b: float) -> float:
    """Smallest angle between two headings, 0–180."""
    difference = abs(heading_a - heading_b) % 360
    return 360 - difference if difference > 180 else difference


def is_valid_position(lat: Any, lon: Any) -> bool:
    """True for a finite latitude/longitude inside the globe (0,0 is a real place, so it passes)."""
    try:
        latitude, longitude = float(lat), float(lon)
    except (TypeError, ValueError):
        return False
    return math.isfinite(latitude) and math.isfinite(longitude) and -90 <= latitude <= 90 and -180 <= longitude <= 180


@dataclass
class HistoryRecorder:
    """Gate, buffer and flush one section's positions into its history table.

    ``namespace`` is the section's settings namespace; recording only happens
    while ``<namespace>.historyEnabled`` is true. The flag is re-read on every
    flush, so the Settings toggle takes effect within one flush interval and
    without a restart.
    """

    namespace: str
    model: type
    gate: SampleGate
    session_factory: Callable[[], AsyncSession]
    flush_interval_s: float = DEFAULT_FLUSH_INTERVAL_S
    enabled: bool = False
    _buffer: deque[PositionSample] = field(default_factory=lambda: deque(maxlen=MAX_BUFFERED_SAMPLES))
    _last_stored: dict[str, _LastStored] = field(default_factory=dict)
    _task: asyncio.Task[None] | None = None
    _last_wall_ms: int | None = None
    _dropped_logged: bool = False

    def offer(self, sample: PositionSample) -> bool:
        """Buffer `sample` if recording is on and the gate lets it through. Returns True when buffered."""
        if not self.enabled or not sample.entity_id or not is_valid_position(sample.lat, sample.lon):
            return False
        last = self._last_stored.get(sample.entity_id)
        if last is not None and not self._passes_gate(last, sample):
            return False
        if len(self._buffer) == self._buffer.maxlen and not self._dropped_logged:
            # The deque drops the oldest by itself; say so once rather than per sample.
            self._dropped_logged = True
            logger.warning("%s history: buffer full, dropping the oldest unsaved samples", self.namespace)
        self._buffer.append(sample)
        self._last_stored[sample.entity_id] = _LastStored(
            sample.t_ms, sample.lat, sample.lon, sample.heading, sample.alt
        )
        return True

    def _passes_gate(self, last: _LastStored, sample: PositionSample) -> bool:
        # Same or older observation: a cached snapshot, or the other source's
        # copy of a report we already have. Never a new sample.
        if sample.t_ms <= last.t_ms:
            return False
        elapsed_ms = sample.t_ms - last.t_ms
        if elapsed_ms >= self.gate.min_interval_s * 1000:
            return True
        if elapsed_ms < self.gate.min_gap_s * 1000:
            return False
        if self.gate.min_move_m and distance_m(last.lat, last.lon, sample.lat, sample.lon) >= self.gate.min_move_m:
            return True
        if (
            self.gate.heading_change_deg is not None
            and sample.heading is not None
            and last.heading is not None
            and heading_difference_deg(sample.heading, last.heading) >= self.gate.heading_change_deg
        ):
            return True
        return (
            self.gate.altitude_change_ft is not None
            and sample.alt is not None
            and last.alt is not None
            and abs(sample.alt - last.alt) >= self.gate.altitude_change_ft
        )

    async def refresh_enabled(self, db: AsyncSession) -> None:
        """Re-read ``<namespace>.historyEnabled``; turning it off discards anything unsaved."""
        try:
            enabled = bool(await read_setting(db, self.namespace, ENABLED_SETTING_KEY, False))
        except Exception:
            # Core briefly unreachable: keep the last known state rather than
            # flapping recording off and on.
            logger.warning(
                "%s history: could not read %s; keeping it %s",
                self.namespace,
                ENABLED_SETTING_KEY,
                "on" if self.enabled else "off",
            )
            return
        if self.enabled and not enabled:
            self._buffer.clear()
            self._last_stored.clear()
        self.enabled = enabled

    async def flush(self, db: AsyncSession) -> int:
        """Write every buffered sample in one statement. Returns how many were offered to the database."""
        if not self._buffer:
            return 0
        samples = list(self._buffer)
        self._buffer.clear()
        self._dropped_logged = False
        rows = [
            {
                "entity_id": sample.entity_id,
                "t_ms": sample.t_ms,
                "lat": sample.lat,
                "lon": sample.lon,
                "alt": sample.alt,
                "heading": sample.heading,
                "speed": sample.speed,
                "source_mode": sample.source_mode,
                "extra": json.dumps(sample.extra, separators=(",", ":")) if sample.extra else None,
            }
            for sample in samples
        ]
        statement = sqlite_insert(self.model).on_conflict_do_nothing(index_elements=["entity_id", "t_ms"])
        await db.execute(statement, rows)
        await db.commit()
        return len(rows)

    def _forget_stale_gate_entries(self, now_ms: int) -> None:
        cutoff = now_ms - GATE_FORGET_AFTER_MS
        for entity_id in [key for key, last in self._last_stored.items() if last.t_ms < cutoff]:
            del self._last_stored[entity_id]

    def _note_clock(self, now_ms: int) -> None:
        if self._last_wall_ms is not None and self._last_wall_ms - now_ms > CLOCK_JUMP_WARN_MS:
            logger.warning(
                "%s history: the system clock went back %d s; recorded times may overlap",
                self.namespace,
                (self._last_wall_ms - now_ms) // 1000,
            )
            # A backward jump would otherwise make every entity's next sample
            # look "older than the last" and be refused until the clock caught up.
            self._last_stored.clear()
        self._last_wall_ms = now_ms

    async def run_once(self) -> None:
        """One loop pass: refresh the switch, flush, tidy the gate."""
        now_ms = int(time.time() * 1000)
        self._note_clock(now_ms)
        async with self.session_factory() as db:
            await self.refresh_enabled(db)
            await self.flush(db)
        self._forget_stale_gate_entries(now_ms)

    async def _run(self) -> None:
        while True:
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("%s history: flush failed; retrying next interval", self.namespace)
            await asyncio.sleep(self.flush_interval_s)

    async def start(self) -> None:
        """Start the flush loop (idempotent). Its first pass reads the switch straight away."""
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Stop the loop and write whatever is still buffered."""
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if self._buffer:
            try:
                async with self.session_factory() as db:
                    await self.flush(db)
            except Exception:
                logger.exception("%s history: final flush failed", self.namespace)
