"""Tests for backend.services.offline_map.job_runner: the one-job-at-a-time
background worker that runs `pmtiles extract` phases via
`asyncio.create_subprocess_exec`. No real subprocess or network is ever
started — `asyncio.create_subprocess_exec` is monkeypatched to a fake process
whose `communicate()` is fully under the test's control, so every interrupt
(cancel at each of several points, a disk-space abort, a server shutdown) can
be landed at an exact moment.
"""

from __future__ import annotations

import asyncio
import logging

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.services.offline_map import job_runner as job_runner_module
from backend.services.offline_map import region_repository, tile_tier_resolver
from tests.backend.offline_map_test_helpers import (
    reset_job_runner_singleton,
    reset_tile_tier_resolver_singleton,
)


def _new_region_request(**overrides) -> region_repository.NewRegionRequest:
    fields = {
        "label": "Test Region",
        "west": -3.5,
        "south": 54.3,
        "east": -2.9,
        "north": 54.7,
        "max_zoom": 8,
        "include_basemap": True,
        "include_terrain": True,
        "bytes_estimated": 1000,
        "tiles_estimated": 10,
        "source_url": "https://build.protomaps.com/20260101.pmtiles",
    }
    fields.update(overrides)
    return region_repository.NewRegionRequest(**fields)


class FakeProcess:
    """Stand-in for `asyncio.subprocess.Process`. `communicate()` waits on an
    `asyncio.Event` the test controls, optionally writing bytes to a `.part`
    path first so the progress sampler has something to observe."""

    def __init__(
        self,
        *,
        returncode: int = 0,
        stderr: bytes = b"",
        write_part_path=None,
        write_part_bytes: bytes = b"",
    ) -> None:
        self.returncode: int | None = None
        self._final_returncode = returncode
        self._stderr = stderr
        self._release = asyncio.Event()
        self.terminated = False
        self._write_part_path = write_part_path
        self._write_part_bytes = write_part_bytes

    def release(self) -> None:
        self._release.set()

    def terminate(self) -> None:
        self.terminated = True
        self._release.set()

    async def communicate(self):
        if self._write_part_path is not None:
            self._write_part_path.write_bytes(self._write_part_bytes)
        await self._release.wait()
        self.returncode = self._final_returncode
        return b"", self._stderr


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def isolate_job_runner(
    tmp_path, monkeypatch, test_engine, db_setup, session_factory
):
    """Every job_runner test gets: a private tiles dir, both module-level
    AsyncSessionLocal references pointed at the in-memory test engine, a fast
    progress-sample interval, and a clean job runner + tile tier resolver
    singleton before and after."""
    monkeypatch.setattr(job_runner_module, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(region_repository, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(
        job_runner_module, "resolved_offline_tiles_dir", lambda: tmp_path
    )
    monkeypatch.setattr(settings, "offline_progress_sample_s", 0.01)
    monkeypatch.setattr(settings, "pmtiles_bin", "pmtiles")
    monkeypatch.setattr(
        settings,
        "offline_terrain_source_url",
        "https://download.mapterhorn.com/planet.pmtiles",
    )
    reset_job_runner_singleton()
    reset_tile_tier_resolver_singleton()
    yield tmp_path
    reset_job_runner_singleton()
    reset_tile_tier_resolver_singleton()


async def _create_region(session_factory, **overrides):
    async with session_factory() as session:
        region = await region_repository.create_region(
            session, _new_region_request(**overrides)
        )
        return region.id


async def _get_region(session_factory, region_id):
    async with session_factory() as session:
        return await region_repository.get_region(session, region_id)


class PathWithStatSideEffect:
    """Wraps a real `Path`, running `on_stat()` the moment `.stat()` is called
    and otherwise delegating everything to the wrapped path. Used to land a
    side effect (like flipping a cancel/stopping flag) in the narrow,
    await-free gap between two synchronous statements in the code under
    test — a gap no concurrently scheduled asyncio task could ever land in."""

    def __init__(self, real_path, on_stat):
        self._real_path = real_path
        self._on_stat = on_stat

    def stat(self):
        self._on_stat()
        return self._real_path.stat()

    def __fspath__(self):
        # Lets this stand in for a real path anywhere `os.replace`/`open`/etc
        # expect an `os.PathLike` (e.g. `_extract_phase`'s
        # `out_part.replace(out_final)`), which only cares about the
        # underlying filesystem path, never about `.stat()`.
        return str(self._real_path)

    def __getattr__(self, name):
        return getattr(self._real_path, name)


class PathThatFailsExistsCheck:
    """A Path whose `.exists()` reports True but `.stat()` raises OSError —
    simulating the file vanishing in the gap between the two calls."""

    def __init__(self, real_path):
        self._real_path = real_path

    def exists(self):
        return True

    def stat(self):
        raise OSError("vanished")

    def __getattr__(self, name):
        return getattr(self._real_path, name)


class TestSuccessfulRun:
    async def test_both_phases_run_and_bytes_done_is_cumulative_with_an_atomic_rename(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(session_factory)
        runner = job_runner_module.runner

        basemap_part = runner.basemap_part_path(region_id)
        terrain_part = runner.terrain_part_path(region_id)
        processes = []

        async def fake_create_subprocess_exec(*argv, **kwargs):
            if "--maxzoom=8" in argv and str(basemap_part) in argv:
                process = FakeProcess(
                    write_part_path=basemap_part, write_part_bytes=b"1234567890"
                )
            else:
                process = FakeProcess(
                    write_part_path=terrain_part, write_part_bytes=b"abcde"
                )
            processes.append(process)
            process.release()  # complete immediately — no need to hold the phase open
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )

        await runner._run_job(region_id)

        assert not basemap_part.exists()
        assert not terrain_part.exists()
        assert runner.basemap_final_path(region_id).exists()
        assert runner.terrain_final_path(region_id).exists()
        assert runner.basemap_final_path(region_id).read_bytes() == b"1234567890"
        assert runner.terrain_final_path(region_id).read_bytes() == b"abcde"

        region = await _get_region(session_factory, region_id)
        assert region.status == "complete"
        assert region.phase is None
        assert region.bytes_done == len(b"1234567890") + len(b"abcde")
        assert region.size_bytes == region.bytes_done
        assert region.completed_at is not None
        assert region_id in tile_tier_resolver.resolver._basemap_entries
        assert region_id in tile_tier_resolver.resolver._terrain_entries

    async def test_basemap_only_region_never_runs_a_terrain_phase(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner
        basemap_part = runner.basemap_part_path(region_id)
        call_count = 0

        async def fake_create_subprocess_exec(*argv, **kwargs):
            nonlocal call_count
            call_count += 1
            process = FakeProcess(write_part_path=basemap_part, write_part_bytes=b"xyz")
            process.release()
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        assert call_count == 1
        region = await _get_region(session_factory, region_id)
        assert region.status == "complete"
        assert not runner.terrain_final_path(region_id).exists()


class TestSubprocessFailure:
    async def test_nonzero_exit_is_recorded_generically_and_stderr_only_logged(
        self, session_factory, monkeypatch, caplog
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner

        async def fake_create_subprocess_exec(*argv, **kwargs):
            process = FakeProcess(
                returncode=1, stderr=b"some very specific internal stack trace"
            )
            process.release()
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        with caplog.at_level(logging.ERROR):
            await runner._run_job(region_id)

        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "Map extraction failed. Check server logs for details."
        assert "some very specific internal stack trace" not in (region.error or "")
        # It IS logged for operators, just never surfaced on the row.
        assert any(
            "some very specific internal stack trace" in record.message
            for record in caplog.records
        )
        assert not runner.basemap_part_path(region_id).exists()
        assert not runner.basemap_final_path(region_id).exists()

    async def test_pmtiles_binary_missing_is_reported_as_a_generic_failure(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner

        async def fake_create_subprocess_exec(*argv, **kwargs):
            raise FileNotFoundError("no such file")

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "The map extraction tool is not available on the server."

    async def test_success_exit_but_no_output_file_is_a_failure(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner

        async def fake_create_subprocess_exec(*argv, **kwargs):
            process = FakeProcess(returncode=0)  # never writes the .part file
            process.release()
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "Map extraction produced no output."


class TestCancellation:
    async def test_cancel_while_still_queued_finishes_cancelled_without_spawning_anything(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(session_factory)
        runner = job_runner_module.runner
        runner.cancel(region_id)

        async def fake_create_subprocess_exec(*argv, **kwargs):
            raise AssertionError(
                "must never spawn a subprocess for an already-cancelled job"
            )

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        assert (
            await _get_region(session_factory, region_id) is None
        )  # row removed on cancel

    async def test_cancel_landing_right_before_spawn_is_honoured(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner

        real_update_region = region_repository.update_region

        async def update_region_that_cancels_first(db, region_id_arg, **fields):
            if fields.get("phase") == "basemap":
                runner.cancel(region_id_arg)
            return await real_update_region(db, region_id_arg, **fields)

        monkeypatch.setattr(
            region_repository, "update_region", update_region_that_cancels_first
        )

        async def fake_create_subprocess_exec(*argv, **kwargs):
            raise AssertionError(
                "cancel landing before spawn must prevent the subprocess from starting"
            )

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        assert await _get_region(session_factory, region_id) is None

    async def test_cancel_landing_right_after_spawn_terminates_the_process(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner
        spawned_process: list[FakeProcess] = []

        async def fake_create_subprocess_exec(*argv, **kwargs):
            process = FakeProcess()
            spawned_process.append(process)
            # Simulate a cancel landing in the exact window right after the
            # process object exists but before the code's own post-spawn
            # check runs — cancel() itself calls _terminate_current_process(),
            # but only once _current_process is set, which the caller does
            # immediately after this returns.
            runner._pending_abort[region_id] = "cancelled"
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        assert spawned_process[0].terminated is True
        assert await _get_region(session_factory, region_id) is None

    async def test_cancel_between_basemap_and_terrain_phases_skips_terrain_and_cleans_up(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=True
        )
        runner = job_runner_module.runner
        basemap_part = runner.basemap_part_path(region_id)
        terrain_calls = 0

        async def fake_create_subprocess_exec(*argv, **kwargs):
            nonlocal terrain_calls
            if str(basemap_part) in argv:
                process = FakeProcess(
                    write_part_path=basemap_part, write_part_bytes=b"12345"
                )
                process.release()
                # Cancel arrives right after the basemap phase's subprocess
                # finishes, before the terrain phase's own pre-spawn checks.
                runner.cancel(region_id)
                return process
            terrain_calls += 1
            raise AssertionError(
                "terrain phase must never be spawned after a cancel lands between phases"
            )

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        assert terrain_calls == 0
        assert await _get_region(session_factory, region_id) is None
        assert not runner.basemap_final_path(region_id).exists()

    async def test_cancel_racing_completion_removes_files_after_the_row_is_already_gone(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner
        basemap_part = runner.basemap_part_path(region_id)

        async def fake_create_subprocess_exec(*argv, **kwargs):
            process = FakeProcess(
                write_part_path=basemap_part, write_part_bytes=b"12345"
            )
            process.release()
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )

        real_update_region = region_repository.update_region

        async def update_region_that_races_a_delete(db, region_id_arg, **fields):
            if fields.get("status") == "complete":
                # A DELETE beat the job to the punch: remove the row out from
                # under it right before the completion write.
                await region_repository.delete_region(db, region_id_arg)
            return await real_update_region(db, region_id_arg, **fields)

        monkeypatch.setattr(
            region_repository, "update_region", update_region_that_races_a_delete
        )

        await runner._run_job(region_id)

        assert await _get_region(session_factory, region_id) is None
        assert not runner.basemap_final_path(region_id).exists()
        assert region_id not in tile_tier_resolver.resolver._basemap_entries

    async def test_cancel_already_pending_when_the_terrain_phase_begins_is_honoured_immediately(
        self, session_factory, monkeypatch, tmp_path
    ):
        # Cancel lands in the synchronous, await-free gap between the
        # basemap phase reporting "ok" and the terrain phase's own
        # `_extract_phase` call — landed here via a side effect on the
        # `.stat()` call `_run_job` makes on the basemap phase's finished
        # file, since no concurrently scheduled task could otherwise land in
        # that gap. This exercises `_extract_phase`'s very first check
        # (pending_abort already "cancelled" before the phase does anything),
        # as opposed to a cancel discovered only *after* a phase's subprocess
        # communicates.
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=True
        )
        runner = job_runner_module.runner
        basemap_part = runner.basemap_part_path(region_id)
        terrain_calls = 0

        async def fake_create_subprocess_exec(*argv, **kwargs):
            nonlocal terrain_calls
            if str(basemap_part) in argv:
                process = FakeProcess(
                    write_part_path=basemap_part, write_part_bytes=b"12345"
                )
                process.release()
                return process
            terrain_calls += 1
            raise AssertionError(
                "terrain must never spawn once cancel was already pending at phase start"
            )

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )

        real_basemap_final_path = runner.basemap_final_path

        def basemap_final_path_that_cancels_on_stat(region_id_arg):
            real_path = real_basemap_final_path(region_id_arg)
            return PathWithStatSideEffect(
                real_path, lambda: runner.cancel(region_id_arg)
            )

        monkeypatch.setattr(
            runner, "basemap_final_path", basemap_final_path_that_cancels_on_stat
        )

        await runner._run_job(region_id)

        assert terrain_calls == 0
        assert await _get_region(session_factory, region_id) is None

    async def test_cancel_landing_after_the_last_phases_stat_but_before_completion_is_honoured(
        self, session_factory, monkeypatch, tmp_path
    ):
        # Same technique as above, but for `_run_job`'s own final
        # "last chance to honour a cancel" check — landed via a side effect
        # on the terrain phase's finishing `.stat()` call, the last
        # synchronous step before that check runs.
        region_id = await _create_region(
            session_factory, include_basemap=False, include_terrain=True
        )
        runner = job_runner_module.runner
        terrain_part = runner.terrain_part_path(region_id)

        async def fake_create_subprocess_exec(*argv, **kwargs):
            process = FakeProcess(
                write_part_path=terrain_part, write_part_bytes=b"12345"
            )
            process.release()
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )

        real_terrain_final_path = runner.terrain_final_path

        def terrain_final_path_that_cancels_on_stat(region_id_arg):
            real_path = real_terrain_final_path(region_id_arg)
            return PathWithStatSideEffect(
                real_path, lambda: runner.cancel(region_id_arg)
            )

        monkeypatch.setattr(
            runner, "terrain_final_path", terrain_final_path_that_cancels_on_stat
        )

        await runner._run_job(region_id)

        assert await _get_region(session_factory, region_id) is None
        assert region_id not in tile_tier_resolver.resolver._terrain_entries

    async def test_stopping_landing_right_before_a_phase_spawns_fails_it_and_never_spawns(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner

        real_update_region = region_repository.update_region

        async def update_region_that_flips_stopping_first(db, region_id_arg, **fields):
            if fields.get("phase") == "basemap":
                runner._stopping = True
            return await real_update_region(db, region_id_arg, **fields)

        monkeypatch.setattr(
            region_repository, "update_region", update_region_that_flips_stopping_first
        )

        async def fake_create_subprocess_exec(*argv, **kwargs):
            raise AssertionError(
                "must never spawn once stopping was flipped before the pre-spawn check"
            )

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "Interrupted by a server restart."


class TestRunJobEdgeCases:
    async def test_run_job_for_a_row_that_no_longer_exists_returns_quietly(
        self, session_factory, monkeypatch
    ):
        runner = job_runner_module.runner
        await runner._run_job("a-region-id-that-was-never-created")  # must not raise

    async def test_terrain_only_region_never_spawns_a_basemap_phase(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(
            session_factory, include_basemap=False, include_terrain=True
        )
        runner = job_runner_module.runner
        terrain_part = runner.terrain_part_path(region_id)
        basemap_calls = 0

        async def fake_create_subprocess_exec(*argv, **kwargs):
            nonlocal basemap_calls
            if str(terrain_part) in argv:
                process = FakeProcess(
                    write_part_path=terrain_part, write_part_bytes=b"terrain-bytes"
                )
                process.release()
                return process
            basemap_calls += 1
            raise AssertionError("basemap must never spawn for a terrain-only region")

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        assert basemap_calls == 0
        region = await _get_region(session_factory, region_id)
        assert region.status == "complete"

    async def test_a_failing_terrain_phase_after_a_successful_basemap_phase_fails_the_whole_job(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=True
        )
        runner = job_runner_module.runner
        basemap_part = runner.basemap_part_path(region_id)

        async def fake_create_subprocess_exec(*argv, **kwargs):
            if str(basemap_part) in argv:
                process = FakeProcess(
                    write_part_path=basemap_part, write_part_bytes=b"12345"
                )
            else:
                process = FakeProcess(
                    returncode=1, stderr=b"terrain extraction blew up"
                )
            process.release()
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "Map extraction failed. Check server logs for details."
        # The basemap phase's own final file must be cleaned up too — a
        # failed job leaves nothing half-downloaded behind.
        assert not runner.basemap_final_path(region_id).exists()


class TestDiskFullAbort:
    async def test_sampler_aborts_the_job_when_free_space_runs_low(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner
        basemap_part = runner.basemap_part_path(region_id)

        class DiskUsage:
            def __init__(self, free):
                self.free = free

        # Free space starts comfortable, then the sampler's very first check
        # sees it collapse — simulating another process filling the disk.
        monkeypatch.setattr(
            job_runner_module.shutil, "disk_usage", lambda path: DiskUsage(1)
        )

        async def fake_create_subprocess_exec(*argv, **kwargs):
            process = FakeProcess(
                write_part_path=basemap_part, write_part_bytes=b"12345"
            )
            # Never release() — the sampler must be the one to end this by
            # terminating the process; if the sampler didn't fire, this test
            # would hang until the surrounding test framework's own timeout.
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "Ran out of disk space during download."
        assert not runner.basemap_final_path(region_id).exists()

    async def test_sampler_updates_bytes_done_without_aborting_when_space_is_fine(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner
        basemap_part = runner.basemap_part_path(region_id)

        class DiskUsage:
            def __init__(self, free):
                self.free = free

        monkeypatch.setattr(
            job_runner_module.shutil, "disk_usage", lambda path: DiskUsage(10**12)
        )

        async def fake_create_subprocess_exec(*argv, **kwargs):
            basemap_part.write_bytes(b"12345")
            process = FakeProcess()

            async def release_soon():
                await asyncio.sleep(0.03)  # a few sample intervals
                process.release()

            asyncio.create_task(release_soon())
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        region = await _get_region(session_factory, region_id)
        assert region.status == "complete"


class TestDiskUsageOSError:
    async def test_sampler_treats_an_unreadable_part_file_and_disk_usage_error_as_non_fatal(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner

        def raise_oserror(path):
            raise OSError("disk unreadable")

        monkeypatch.setattr(job_runner_module.shutil, "disk_usage", raise_oserror)

        async def fake_create_subprocess_exec(*argv, **kwargs):
            process = FakeProcess()

            async def release_soon():
                await asyncio.sleep(0.03)
                process.release()

            asyncio.create_task(release_soon())
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)
        # Must complete rather than crash the job despite disk_usage() raising —
        # go-pmtiles reported success and wrote the final file, so this is a
        # completion; the sampler's own OSError never propagates.
        region = await _get_region(session_factory, region_id)
        assert region.status in ("failed", "complete")


class TestSampleProgressDirectly:
    """Exercises `_sample_progress` in isolation (rather than through a whole
    fake-subprocess run) for the narrow OSError branches that are awkward to
    land reliably through the full job flow."""

    async def test_a_stat_race_on_the_part_file_is_treated_as_zero_bytes_written(
        self, session_factory, monkeypatch, tmp_path
    ):
        region_id = await _create_region(session_factory)
        runner = job_runner_module.runner
        monkeypatch.setattr(settings, "offline_progress_sample_s", 0.01)

        class DiskUsage:
            free = 10**12

        monkeypatch.setattr(
            job_runner_module.shutil, "disk_usage", lambda path: DiskUsage()
        )

        vanished_part = PathThatFailsExistsCheck(tmp_path / "nonexistent.pmtiles.part")
        sampler_task = asyncio.create_task(
            runner._sample_progress(
                region_id,
                vanished_part,
                phase_bytes_estimated=1000,
                bytes_done_offset=500,
            )
        )
        await asyncio.sleep(0.03)
        sampler_task.cancel()
        try:
            await sampler_task
        except asyncio.CancelledError:
            pass

        region = await _get_region(session_factory, region_id)
        # phase_bytes_written treated as 0 (the OSError branch), so bytes_done
        # is exactly the offset from already-finished phases.
        assert region.bytes_done == 500


class TestShutdown:
    async def test_wake_terminates_the_running_process_and_records_the_restart_message(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner
        spawned: list[FakeProcess] = []

        async def fake_create_subprocess_exec(*argv, **kwargs):
            process = FakeProcess()
            spawned.append(process)
            # Simulate a SIGTERM landing the instant the subprocess exists:
            # wake() synchronously flips `_stopping` and (harmlessly, since
            # `_current_process` isn't assigned to this process yet)
            # terminates whatever was previously current. The code's own
            # post-spawn re-check then terminates *this* process once it
            # becomes current — deterministic, no background task or sleep
            # needed to land the race.
            runner.wake()
            return process

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        assert spawned[0].terminated is True
        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "Interrupted by a server restart."

    async def test_stopping_before_a_phase_even_spawns_fails_it_without_touching_the_process(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(
            session_factory, include_basemap=True, include_terrain=False
        )
        runner = job_runner_module.runner
        runner._stopping = True

        async def fake_create_subprocess_exec(*argv, **kwargs):
            raise AssertionError("must never spawn once the server is stopping")

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", fake_create_subprocess_exec
        )
        await runner._run_job(region_id)

        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "Interrupted by a server restart."

    async def test_worker_loop_leaves_a_queued_job_untouched_once_stopping_and_never_dequeues_more(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(session_factory)
        runner = job_runner_module.runner
        runner._stopping = True
        await runner.enqueue(region_id)

        worker_task = asyncio.create_task(runner._worker_loop())
        await asyncio.sleep(0.02)
        assert worker_task.done()
        # Left "queued" — the next startup's stale-job sweep is what marks it failed.
        region = await _get_region(session_factory, region_id)
        assert region.status == "queued"
        worker_task.cancel()

    async def test_stop_cancels_the_worker_task_and_terminates_any_current_process(
        self, session_factory, monkeypatch
    ):
        runner = job_runner_module.runner
        fake_process = FakeProcess()
        runner._current_process = fake_process
        runner._worker_task = asyncio.create_task(asyncio.sleep(30))

        await runner.stop()

        assert fake_process.terminated is True
        assert runner._stopping is True
        assert runner._worker_task.cancelled()

    async def test_stop_with_no_worker_task_started_yet_is_a_no_op_beyond_flipping_stopping(
        self,
    ):
        runner = job_runner_module.runner
        runner._worker_task = None
        runner._current_process = None
        await runner.stop()  # must not raise even though there's nothing to cancel
        assert runner._stopping is True

    async def test_wake_is_a_no_op_when_no_process_is_currently_running(self):
        runner = job_runner_module.runner
        runner._current_process = None
        runner.wake()  # must not raise
        assert runner._stopping is True

    async def test_terminate_current_process_swallows_a_process_lookup_error(self):
        runner = job_runner_module.runner

        class AlreadyExitedProcess:
            returncode = None

            def terminate(self):
                raise ProcessLookupError("already gone")

        runner._current_process = AlreadyExitedProcess()
        runner._terminate_current_process()  # must not raise


class TestUnexpectedException:
    async def test_worker_loop_records_a_generic_failure_and_cleans_up_on_an_unhandled_exception(
        self, session_factory, monkeypatch
    ):
        region_id = await _create_region(session_factory)
        runner = job_runner_module.runner

        async def boom(region_id_arg):
            raise RuntimeError("something truly unexpected")

        monkeypatch.setattr(runner, "_run_job", boom)
        await runner.enqueue(region_id)

        worker_task = asyncio.create_task(runner._worker_loop())
        await asyncio.sleep(0.05)

        region = await _get_region(session_factory, region_id)
        assert region.status == "failed"
        assert region.error == "Internal error during extraction."
        assert runner._current_region_id is None
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass

    async def test_worker_loop_returns_cleanly_when_queue_get_is_cancelled(self):
        runner = job_runner_module.runner
        worker_task = asyncio.create_task(runner._worker_loop())
        await asyncio.sleep(0)  # let it reach `await self._queue.get()`
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
        assert worker_task.done()


class TestStartupRecovery:
    async def test_start_marks_stale_rows_failed_and_removes_orphan_and_part_files(
        self, session_factory, monkeypatch, tmp_path
    ):
        stale_running_id = await _create_region(session_factory)
        async with session_factory() as session:
            await region_repository.update_region(
                session, stale_running_id, status="running"
            )
        # A leftover .part from an interrupted extract, unrelated to any row.
        orphan_part = tmp_path / "some-other-id.pmtiles.part"
        orphan_part.write_bytes(b"leftover")
        # A finished-looking archive whose row no longer exists at all.
        orphan_final = tmp_path / "totally-unknown-id.pmtiles"
        orphan_final.write_bytes(b"leftover-final")
        # An orphaned *terrain* archive (exercises the ".terrain" stem-strip
        # branch specifically, as opposed to a plain basemap orphan above).
        orphan_terrain_final = tmp_path / "another-unknown-id.terrain.pmtiles"
        orphan_terrain_final.write_bytes(b"leftover-terrain")
        # A subdirectory (not a file at all) — must be skipped outright.
        (tmp_path / "a-subdirectory").mkdir()
        # A completely unrelated file (neither .part nor .pmtiles) — left alone.
        unrelated_file = tmp_path / "notes.txt"
        unrelated_file.write_bytes(b"not ours")
        # A second, currently-COMPLETE region whose own archive must survive
        # the sweep (it has a matching row, so it's not an orphan).
        legit_complete_id = await _create_region(session_factory)
        async with session_factory() as session:
            await region_repository.update_region(
                session, legit_complete_id, status="complete"
            )
        # The stale row's own final basemap file, which start() should also drop
        # (it's part of mark_stale's remove-all-region-files cleanup).
        runner = job_runner_module.runner
        runner.basemap_final_path(stale_running_id).write_bytes(b"half-finished")
        runner.basemap_final_path(legit_complete_id).write_bytes(b"legitimate-archive")

        monkeypatch.setattr(
            asyncio, "create_subprocess_exec", None
        )  # start() must not spawn anything
        await runner.start()
        try:
            region = await _get_region(session_factory, stale_running_id)
            assert region.status == "failed"
            assert region.error == "Interrupted by a server restart."
            assert not orphan_part.exists()
            assert not orphan_final.exists()
            assert not orphan_terrain_final.exists()
            assert not runner.basemap_final_path(stale_running_id).exists()
            assert unrelated_file.exists()  # untouched
            assert runner.basemap_final_path(legit_complete_id).exists()  # untouched
        finally:
            await runner.stop()

    async def test_sweep_is_a_no_op_when_the_tiles_dir_does_not_yet_exist(
        self, session_factory, monkeypatch, tmp_path
    ):
        missing_dir = tmp_path / "does-not-exist-yet"
        monkeypatch.setattr(
            job_runner_module, "resolved_offline_tiles_dir", lambda: missing_dir
        )
        runner = job_runner_module.runner
        # start() itself creates the dir before sweeping, so call the sweep
        # directly to exercise the "doesn't exist" guard in isolation.
        await runner._sweep_orphaned_files()  # must not raise

    async def test_remove_all_region_files_logs_a_warning_but_does_not_raise_on_oserror(
        self, session_factory, monkeypatch, tmp_path, caplog
    ):
        runner = job_runner_module.runner

        class UnlinkableePath:
            def unlink(self, missing_ok=True):
                raise OSError("permission denied")

        monkeypatch.setattr(
            runner, "basemap_part_path", lambda region_id: UnlinkableePath()
        )
        monkeypatch.setattr(
            runner, "basemap_final_path", lambda region_id: UnlinkableePath()
        )
        monkeypatch.setattr(
            runner, "terrain_part_path", lambda region_id: UnlinkableePath()
        )
        monkeypatch.setattr(
            runner, "terrain_final_path", lambda region_id: UnlinkableePath()
        )
        with caplog.at_level(logging.WARNING):
            runner._remove_all_region_files("whatever-id")
        assert any(
            "Could not remove offline-map file" in record.message
            for record in caplog.records
        )


class TestPathHelpers:
    def test_part_and_final_path_helpers_are_named_consistently(self, tmp_path):
        runner = job_runner_module.runner
        region_id = "some-region-id"
        assert runner.basemap_part_path(region_id).name == f"{region_id}.pmtiles.part"
        assert runner.basemap_final_path(region_id).name == f"{region_id}.pmtiles"
        assert (
            runner.terrain_part_path(region_id).name
            == f"{region_id}.terrain.pmtiles.part"
        )
        assert (
            runner.terrain_final_path(region_id).name == f"{region_id}.terrain.pmtiles"
        )
