"""Background job runner for offline map region downloads.

One `asyncio.Queue` worker, started from FastAPI's `lifespan` (see
`backend/main.py`), runs jobs strictly one at a time via
`asyncio.create_subprocess_exec` — an argv list, never a shell, so nothing in
a region's bbox/label can reach a shell interpreter. Each job runs a basemap
extract phase then a terrain phase (as selected), writing to a `.part` file
that is atomically renamed on success. Progress is derived purely from the
growing `.part` file size (plus whatever earlier phases already finished, so
it's cumulative and never jumps backwards) against the estimate recorded at
queue time — never by scraping go-pmtiles' own progress output — sampled
roughly once a second.

Three distinct things can interrupt a running phase, and each is tracked and
reported differently so the region's `error` field is honest:
  - a user CANCELs the region (`cancel()`): recorded, then the row and every
    file for that region (part *and* final, either phase) are removed.
  - the disk-space sampler decides free space is running out: recorded as a
    failure with a specific message, files removed.
  - the SERVER is shutting down (`wake()`/`stop()`, chained from
    SIGTERM/SIGINT in main.py's lifespan): recorded as a failure with
    "Interrupted by a server restart", matching the message a genuinely
    unclean shutdown gets from `region_repository.mark_stale_jobs_failed_on_startup`
    on the *next* boot — and the worker stops picking up further queued jobs.

Because two different requests (a DELETE, and this job's own completion) can
race on the same region row, completion writes go through
`region_repository.update_region`'s atomic UPDATE and check its returned
"row still existed" signal before trusting the write — see `_run_job`.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import time
from pathlib import Path

from backend.config import resolved_offline_tiles_dir, settings
from backend.database import AsyncSessionLocal
from backend.services.offline_map import region_repository, tile_tier_resolver
from backend.services.offline_map.estimator import TERRAIN_MAX_ZOOM, estimate_area

logger = logging.getLogger(__name__)

# Absolute floor kept free regardless of how small the estimate is (megabytes).
_MIN_FREE_BYTES_FLOOR = 50 * 1024 * 1024
# Extra safety margin as a fraction of the *remaining* estimated bytes for the
# phase in progress — a shrinking cushion so a wildly-wrong estimate can't
# still run the disk to empty.
_REMAINING_ESTIMATE_MARGIN = 0.05
_RESTART_INTERRUPTED_MESSAGE = "Interrupted by a server restart."


def _now_ms() -> int:
    return int(time.time() * 1000)


class OfflineMapJobRunner:
    """Process-wide singleton; only one instance is ever constructed (module-level `runner`)."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._current_process: asyncio.subprocess.Process | None = None
        self._current_region_id: str | None = None
        # region_id -> "cancelled" | "disk_full", set by cancel()/the disk-space
        # sampler before terminating the process, consumed once the process exits.
        self._pending_abort: dict[str, str] = {}
        # Set by wake()/stop() — a server shutdown in progress. Distinct from
        # _pending_abort (which is per-job) because it also tells the worker
        # loop not to start the next queued job.
        self._stopping = False

    def tiles_dir(self) -> Path:
        return resolved_offline_tiles_dir()

    def basemap_part_path(self, region_id: str) -> Path:
        return self.tiles_dir() / f"{region_id}.pmtiles.part"

    def basemap_final_path(self, region_id: str) -> Path:
        return self.tiles_dir() / f"{region_id}.pmtiles"

    def terrain_part_path(self, region_id: str) -> Path:
        return self.tiles_dir() / f"{region_id}.terrain.pmtiles.part"

    def terrain_final_path(self, region_id: str) -> Path:
        return self.tiles_dir() / f"{region_id}.terrain.pmtiles"

    async def start(self) -> None:
        """Called once from `lifespan`: prepares the tiles directory, recovers
        from an unclean previous shutdown, and starts the worker task."""
        self.tiles_dir().mkdir(parents=True, exist_ok=True)
        stale_ids = await region_repository.mark_stale_jobs_failed_on_startup()
        for region_id in stale_ids:
            self._remove_all_region_files(region_id)
        await self._sweep_orphaned_files()
        async with AsyncSessionLocal() as db:
            await tile_tier_resolver.refresh_tiers(db)
        self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self) -> None:
        """Called from `lifespan` shutdown: stop accepting work and let the
        current job's subprocess be killed rather than block shutdown."""
        self._stopping = True
        self._terminate_current_process()
        if self._worker_task is not None:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    def wake(self) -> None:
        """Server is shutting down: terminate whatever subprocess is running
        and mark this a shutdown so the worker records a friendly message and
        stops picking up further work. Called from the SIGTERM/SIGINT chain
        in main.py's lifespan (so `--reload` never hangs on a live go-pmtiles
        process). NOT used for a per-job cancel or the disk-space abort —
        those go through `_terminate_current_process` directly so they don't
        also flip this server-wide flag."""
        self._stopping = True
        self._terminate_current_process()

    def _terminate_current_process(self) -> None:
        process = self._current_process
        if process is not None and process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass

    async def enqueue(self, region_id: str) -> None:
        await self._queue.put(region_id)

    def cancel(self, region_id: str) -> None:
        """Request cancellation of a queued-or-running job. Safe to call for a
        job that's still sitting in the queue (it will be skipped when
        dequeued) or the one currently running (its subprocess is killed)."""
        self._pending_abort[region_id] = "cancelled"
        if self._current_region_id == region_id:
            self._terminate_current_process()

    def _remove_all_region_files(self, region_id: str) -> None:
        """Remove every file a region could have left behind — both phases,
        both the in-progress `.part` and (in case a race let one be written)
        the renamed final archive. Used for cancellation, the disk-space
        sampler's cleanup, startup recovery, and undoing a completion that
        lost a race with a DELETE."""
        for path in (
            self.basemap_part_path(region_id),
            self.basemap_final_path(region_id),
            self.terrain_part_path(region_id),
            self.terrain_final_path(region_id),
        ):
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.warning("Could not remove offline-map file %s", path)

    async def _sweep_orphaned_files(self) -> None:
        """Startup-only: remove any `.part` file (an interrupted extract) and
        any `*.pmtiles` archive whose region id no longer has a matching row
        at all (not merely non-complete — a genuinely unknown id), so a crash
        at exactly the wrong moment can't leak disk space forever."""
        tiles_dir = self.tiles_dir()
        if not tiles_dir.exists():
            return
        async with AsyncSessionLocal() as db:
            known_ids = await region_repository.list_all_region_ids(db)
        for path in tiles_dir.iterdir():
            if not path.is_file():
                continue
            if path.name.endswith(".part"):
                path.unlink(missing_ok=True)
                continue
            if path.suffix == ".pmtiles":
                stem = path.stem
                if stem.endswith(".terrain"):
                    stem = stem[: -len(".terrain")]
                if stem not in known_ids:
                    logger.warning("Removing orphaned offline-map archive with no matching region row: %s", path)
                    path.unlink(missing_ok=True)

    async def _worker_loop(self) -> None:
        while True:
            try:
                region_id = await self._queue.get()
            except asyncio.CancelledError:
                return
            if self._stopping:
                # Shutdown started while we were idle. Leave the row
                # "queued" — the next startup's stale-job sweep marks it
                # failed with the same restart message.
                self._queue.task_done()
                return
            try:
                await self._run_job(region_id)
            except Exception:
                logger.exception("Offline map job %s failed unexpectedly", region_id)
                async with AsyncSessionLocal() as db:
                    await region_repository.update_region(
                        db,
                        region_id,
                        status="failed",
                        phase=None,
                        error="Internal error during extraction.",
                        completed_at=_now_ms(),
                    )
                self._remove_all_region_files(region_id)
            finally:
                self._current_region_id = None
                self._current_process = None
                self._pending_abort.pop(region_id, None)
                self._queue.task_done()

    async def _run_job(self, region_id: str) -> None:
        if self._pending_abort.get(region_id) == "cancelled":
            await self._finish_cancelled(region_id)
            return

        async with AsyncSessionLocal() as db:
            region = await region_repository.get_region(db, region_id)
            if region is None:
                return
            include_basemap = bool(region.include_basemap)
            include_terrain = bool(region.include_terrain)
            bbox = (region.west, region.south, region.east, region.north)
            max_zoom = int(region.max_zoom)
            # The build address chosen when the job was queued, so every job
            # extracts from the exact build its size was checked against.
            basemap_source_url = region.source_url or settings.offline_basemap_source_url
            await region_repository.update_region(db, region_id, status="running")

        # Recomputed (not re-read from the stored total) so each phase has its
        # own byte estimate for the disk-space guard and cumulative progress —
        # deterministic and always identical to what was estimated at queue
        # time, so this never drifts from the row's combined bytes_estimated.
        estimate = estimate_area(*bbox, max_zoom, include_basemap, include_terrain)

        self._current_region_id = region_id
        bytes_done_so_far = 0

        if include_basemap:
            outcome = await self._extract_phase(
                region_id=region_id,
                phase="basemap",
                source_url=basemap_source_url,
                out_part=self.basemap_part_path(region_id),
                out_final=self.basemap_final_path(region_id),
                bbox=bbox,
                max_zoom=max_zoom,
                phase_bytes_estimated=estimate.basemap_bytes,
                bytes_done_offset=bytes_done_so_far,
            )
            if outcome != "ok":
                return
            bytes_done_so_far += self.basemap_final_path(region_id).stat().st_size

        if include_terrain:
            terrain_zoom = min(max_zoom, TERRAIN_MAX_ZOOM)
            outcome = await self._extract_phase(
                region_id=region_id,
                phase="terrain",
                source_url=settings.offline_terrain_source_url,
                out_part=self.terrain_part_path(region_id),
                out_final=self.terrain_final_path(region_id),
                bbox=bbox,
                max_zoom=terrain_zoom,
                phase_bytes_estimated=estimate.terrain_bytes,
                bytes_done_offset=bytes_done_so_far,
            )
            if outcome != "ok":
                return
            bytes_done_so_far += self.terrain_final_path(region_id).stat().st_size

        # Last chance to honour a cancel that arrived after the final phase's
        # subprocess already finished but before we've written "complete".
        if self._pending_abort.get(region_id) == "cancelled":
            await self._finish_cancelled(region_id)
            return

        # Update the resolver BEFORE the DB row is visible as complete, so no
        # concurrent request can observe "complete" before its tiles are
        # already being served (see the tile_tier_resolver module docstring).
        tile_tier_resolver.resolver.add_region(
            region_id, include_basemap=include_basemap, include_terrain=include_terrain
        )
        async with AsyncSessionLocal() as db:
            updated = await region_repository.update_region(
                db,
                region_id,
                status="complete",
                phase=None,
                bytes_done=bytes_done_so_far,
                size_bytes=bytes_done_so_far,
                completed_at=_now_ms(),
            )
        if not updated:
            # A DELETE removed the row while we were finishing. Undo the
            # resolver addition and clean up — there's no row left to serve
            # this region's tiles for.
            tile_tier_resolver.resolver.remove_region(region_id)
            self._remove_all_region_files(region_id)

    async def _finish_cancelled(self, region_id: str) -> None:
        tile_tier_resolver.resolver.remove_region(region_id)
        self._remove_all_region_files(region_id)
        async with AsyncSessionLocal() as db:
            # The row may already have been deleted by the DELETE endpoint
            # (which responds immediately rather than waiting on the
            # subprocess); delete is a no-op if it's already gone.
            await region_repository.delete_region(db, region_id)

    async def _extract_phase(
        self,
        *,
        region_id: str,
        phase: str,
        source_url: str,
        out_part: Path,
        out_final: Path,
        bbox: tuple[float, float, float, float],
        max_zoom: int,
        phase_bytes_estimated: int,
        bytes_done_offset: int,
    ) -> str:
        """Run one `pmtiles extract` phase. Returns "ok", "cancelled" or "failed"."""
        if self._pending_abort.get(region_id) == "cancelled":
            await self._finish_cancelled(region_id)
            return "cancelled"
        if self._stopping:
            await self._fail(region_id, _RESTART_INTERRUPTED_MESSAGE)
            self._remove_all_region_files(region_id)
            return "failed"

        west, south, east, north = bbox
        argv = [
            settings.pmtiles_bin,
            "extract",
            source_url,
            str(out_part),
            f"--bbox={west},{south},{east},{north}",
            f"--maxzoom={max_zoom}",
            "--download-threads=4",
        ]

        async with AsyncSessionLocal() as db:
            await region_repository.update_region(db, region_id, phase=phase)

        # Re-check right before spawning: a cancel or shutdown could have
        # arrived during the `await` above.
        if self._pending_abort.get(region_id) == "cancelled":
            await self._finish_cancelled(region_id)
            return "cancelled"
        if self._stopping:
            await self._fail(region_id, _RESTART_INTERRUPTED_MESSAGE)
            self._remove_all_region_files(region_id)
            return "failed"

        try:
            process = await asyncio.create_subprocess_exec(
                *argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except (FileNotFoundError, OSError) as error:
            logger.error("Could not launch pmtiles binary %r: %s", settings.pmtiles_bin, error)
            await self._fail(region_id, "The map extraction tool is not available on the server.")
            return "failed"

        self._current_process = process
        # One more check: a cancel/shutdown landing in the gap between the
        # pre-spawn check and this assignment would otherwise be missed,
        # since cancel()/wake() only terminate a process already recorded
        # in _current_process.
        if self._pending_abort.get(region_id) == "cancelled" or self._stopping:
            self._terminate_current_process()

        sampler_task = asyncio.create_task(
            self._sample_progress(region_id, out_part, phase_bytes_estimated, bytes_done_offset)
        )
        try:
            _stdout, stderr = await process.communicate()
        finally:
            sampler_task.cancel()
            try:
                await sampler_task
            except asyncio.CancelledError:
                pass
            self._current_process = None

        abort_reason = self._pending_abort.get(region_id)
        if abort_reason == "cancelled":
            await self._finish_cancelled(region_id)
            return "cancelled"
        if abort_reason == "disk_full":
            self._remove_all_region_files(region_id)
            # The sampler already recorded the disk-space error on the row.
            return "failed"
        if self._stopping:
            await self._fail(region_id, _RESTART_INTERRUPTED_MESSAGE)
            self._remove_all_region_files(region_id)
            return "failed"

        if process.returncode != 0:
            # Never surface raw stderr to the client — log it for operators,
            # store only a generic message on the row.
            logger.error(
                "pmtiles extract (%s phase) failed for region %s, exit %s: %s",
                phase,
                region_id,
                process.returncode,
                stderr.decode("utf-8", errors="replace")[:4000],
            )
            await self._fail(region_id, "Map extraction failed. Check server logs for details.")
            self._remove_all_region_files(region_id)
            return "failed"

        if not out_part.exists():
            logger.error("pmtiles extract (%s phase) reported success but wrote no output for %s", phase, region_id)
            await self._fail(region_id, "Map extraction produced no output.")
            return "failed"

        out_part.replace(out_final)  # same filesystem (both under the tiles dir) — atomic
        return "ok"

    async def _fail(self, region_id: str, message: str) -> None:
        await self._update_region_best_effort(
            region_id, status="failed", phase=None, error=message, completed_at=_now_ms()
        )

    async def _update_region_best_effort(self, region_id: str, **fields: object) -> None:
        async with AsyncSessionLocal() as db:
            await region_repository.update_region(db, region_id, **fields)

    async def _sample_progress(
        self, region_id: str, out_part: Path, phase_bytes_estimated: int, bytes_done_offset: int
    ) -> None:
        """Runs alongside the subprocess: updates bytes_done (offset from
        already-finished phases, plus the growing .part file size, so
        progress is cumulative and never jumps backwards) and aborts the job
        cleanly if free disk space is running out — better than letting
        go-pmtiles hit ENOSPC mid-write. The disk-space check is scoped to
        THIS phase's own remaining estimate, not the whole job's."""
        while True:
            await asyncio.sleep(settings.offline_progress_sample_s)
            try:
                phase_bytes_written = out_part.stat().st_size if out_part.exists() else 0
            except OSError:
                phase_bytes_written = 0
            total_bytes_done = bytes_done_offset + phase_bytes_written

            try:
                free_bytes = shutil.disk_usage(self.tiles_dir()).free
            except OSError:
                free_bytes = None

            if free_bytes is not None:
                remaining_estimate = max(0, phase_bytes_estimated - phase_bytes_written)
                safety_floor = max(_MIN_FREE_BYTES_FLOOR, int(remaining_estimate * _REMAINING_ESTIMATE_MARGIN))
                if free_bytes < safety_floor:
                    logger.warning("Aborting offline map job %s: only %d bytes free on disk", region_id, free_bytes)
                    self._pending_abort[region_id] = "disk_full"
                    await self._update_region_best_effort(
                        region_id,
                        status="failed",
                        phase=None,
                        bytes_done=total_bytes_done,
                        error="Ran out of disk space during download.",
                        completed_at=_now_ms(),
                    )
                    self._terminate_current_process()
                    return

            await self._update_region_best_effort(region_id, bytes_done=total_bytes_done)


# Module-level singleton, started/stopped from backend.main's lifespan.
runner = OfflineMapJobRunner()
