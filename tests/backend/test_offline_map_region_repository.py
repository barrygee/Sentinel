"""Tests for backend.services.offline_map.region_repository: the thin data
access layer over OfflineMapRegion. Uses the standard in-memory
`test_engine`/`db_setup` fixtures from the root conftest, plus a dedicated
session bound to that engine for `mark_stale_jobs_failed_on_startup` (which
opens its own session via `AsyncSessionLocal`, so that module attribute is
monkeypatched to point at the test engine)."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.services.offline_map import region_repository


def _new_region_request(**overrides) -> region_repository.NewRegionRequest:
    fields = {
        "label": "Lake District",
        "west": -3.5,
        "south": 54.3,
        "east": -2.9,
        "north": 54.7,
        "max_zoom": 12,
        "include_basemap": True,
        "include_terrain": True,
        "bytes_estimated": 1_000_000,
        "tiles_estimated": 500,
        "source_url": "https://build.protomaps.com/20260101.pmtiles",
    }
    fields.update(overrides)
    return region_repository.NewRegionRequest(**fields)


@pytest.fixture()
def session_factory(test_engine):
    return sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture()
async def db_session(session_factory, db_setup):
    async with session_factory() as session:
        yield session


class TestCreateAndGetRegion:
    async def test_create_region_persists_a_queued_row_with_a_generated_uuid(
        self, db_session
    ):
        region = await region_repository.create_region(
            db_session, _new_region_request()
        )
        assert region.status == "queued"
        assert region.phase is None
        assert region.bytes_done == 0
        assert region.completed_at is None
        assert len(region.id) == 36  # str(uuid.uuid4())

    async def test_get_region_returns_the_created_row(self, db_session):
        created = await region_repository.create_region(
            db_session, _new_region_request()
        )
        fetched = await region_repository.get_region(db_session, created.id)
        assert fetched is not None
        assert fetched.id == created.id
        assert fetched.label == "Lake District"

    async def test_get_region_returns_none_for_an_unknown_id(self, db_session):
        assert await region_repository.get_region(db_session, "no-such-id") is None


class TestListRegions:
    async def test_list_regions_is_empty_when_none_exist(self, db_session):
        assert await region_repository.list_regions(db_session) == []

    async def test_list_regions_orders_newest_first(self, db_session):
        first = await region_repository.create_region(
            db_session, _new_region_request(label="First")
        )
        await region_repository.update_region(db_session, first.id, created_at=1000)
        second = await region_repository.create_region(
            db_session, _new_region_request(label="Second")
        )
        await region_repository.update_region(db_session, second.id, created_at=2000)

        regions = await region_repository.list_regions(db_session)
        assert [region.label for region in regions] == ["Second", "First"]

    async def test_list_all_region_ids_includes_every_status(self, db_session):
        queued = await region_repository.create_region(
            db_session, _new_region_request()
        )
        completed = await region_repository.create_region(
            db_session, _new_region_request()
        )
        await region_repository.update_region(
            db_session, completed.id, status="complete"
        )

        all_ids = await region_repository.list_all_region_ids(db_session)
        assert all_ids == {queued.id, completed.id}


class TestListCompletedArchives:
    async def test_only_completed_regions_with_the_requested_tier_are_returned(
        self, db_session
    ):
        basemap_only = await region_repository.create_region(
            db_session, _new_region_request(include_basemap=True, include_terrain=False)
        )
        await region_repository.update_region(
            db_session, basemap_only.id, status="complete", completed_at=1000
        )

        terrain_only = await region_repository.create_region(
            db_session, _new_region_request(include_basemap=False, include_terrain=True)
        )
        await region_repository.update_region(
            db_session, terrain_only.id, status="complete", completed_at=2000
        )

        still_running = await region_repository.create_region(
            db_session, _new_region_request()
        )
        await region_repository.update_region(
            db_session, still_running.id, status="running"
        )

        basemap_archives = await region_repository.list_completed_archives(
            db_session, terrain=False
        )
        assert [region_id for region_id, _completed_at in basemap_archives] == [
            basemap_only.id
        ]

        terrain_archives = await region_repository.list_completed_archives(
            db_session, terrain=True
        )
        assert [region_id for region_id, _completed_at in terrain_archives] == [
            terrain_only.id
        ]

    async def test_newest_completed_first(self, db_session):
        older = await region_repository.create_region(db_session, _new_region_request())
        await region_repository.update_region(
            db_session, older.id, status="complete", completed_at=1000
        )
        newer = await region_repository.create_region(db_session, _new_region_request())
        await region_repository.update_region(
            db_session, newer.id, status="complete", completed_at=2000
        )

        archives = await region_repository.list_completed_archives(
            db_session, terrain=False
        )
        assert [region_id for region_id, _completed_at in archives] == [
            newer.id,
            older.id,
        ]


class TestOutstandingCounters:
    async def test_count_outstanding_counts_only_queued_and_running(self, db_session):
        queued = await region_repository.create_region(
            db_session, _new_region_request()
        )
        running = await region_repository.create_region(
            db_session, _new_region_request()
        )
        await region_repository.update_region(db_session, running.id, status="running")
        finished = await region_repository.create_region(
            db_session, _new_region_request()
        )
        await region_repository.update_region(
            db_session, finished.id, status="complete"
        )

        assert await region_repository.count_outstanding(db_session) == 2
        assert queued.status == "queued"  # sanity: unmodified

    async def test_count_outstanding_is_zero_with_no_rows(self, db_session):
        assert await region_repository.count_outstanding(db_session) == 0

    async def test_sum_outstanding_remaining_bytes_only_counts_outstanding_rows(
        self, db_session
    ):
        running = await region_repository.create_region(
            db_session, _new_region_request(bytes_estimated=1000)
        )
        await region_repository.update_region(
            db_session, running.id, status="running", bytes_done=400
        )
        await region_repository.create_region(
            db_session, _new_region_request(bytes_estimated=500)
        )
        finished = await region_repository.create_region(
            db_session, _new_region_request(bytes_estimated=999)
        )
        await region_repository.update_region(
            db_session, finished.id, status="complete", bytes_done=999
        )

        # running: 1000-400=600 remaining; queued: 500-0=500 remaining; finished excluded.
        assert (
            await region_repository.sum_outstanding_remaining_bytes(db_session) == 1100
        )

    async def test_sum_outstanding_remaining_bytes_never_goes_negative_per_row(
        self, db_session
    ):
        # bytes_done can momentarily exceed bytes_estimated if the estimate
        # undershot reality; a single row must contribute 0, not a negative
        # number that would let another row's positive remainder offset it.
        overshot = await region_repository.create_region(
            db_session, _new_region_request(bytes_estimated=100)
        )
        await region_repository.update_region(
            db_session, overshot.id, status="running", bytes_done=150
        )

        assert await region_repository.sum_outstanding_remaining_bytes(db_session) == 0


class TestUpdateRegion:
    async def test_update_region_with_no_fields_reports_existence_without_writing(
        self, db_session
    ):
        region = await region_repository.create_region(
            db_session, _new_region_request()
        )
        assert await region_repository.update_region(db_session, region.id) is True
        assert await region_repository.update_region(db_session, "missing-id") is False

    async def test_update_region_returns_true_and_applies_fields_for_an_existing_row(
        self, db_session
    ):
        region = await region_repository.create_region(
            db_session, _new_region_request()
        )
        updated = await region_repository.update_region(
            db_session, region.id, status="running", phase="basemap"
        )
        assert updated is True
        refreshed = await region_repository.get_region(db_session, region.id)
        assert refreshed.status == "running"
        assert refreshed.phase == "basemap"

    async def test_update_region_returns_false_for_a_row_that_no_longer_exists(
        self, db_session
    ):
        updated = await region_repository.update_region(
            db_session, "never-existed", status="failed"
        )
        assert updated is False


class TestDeleteRegion:
    async def test_delete_region_removes_the_row(self, db_session):
        region = await region_repository.create_region(
            db_session, _new_region_request()
        )
        await region_repository.delete_region(db_session, region.id)
        assert await region_repository.get_region(db_session, region.id) is None

    async def test_delete_region_is_a_no_op_for_an_unknown_id(self, db_session):
        # Must not raise even though nothing matches.
        await region_repository.delete_region(db_session, "does-not-exist")


class TestMarkStaleJobsFailedOnStartup:
    async def test_marks_queued_and_running_rows_failed_and_returns_their_ids(
        self, db_session, session_factory, monkeypatch
    ):
        queued = await region_repository.create_region(
            db_session, _new_region_request()
        )
        running = await region_repository.create_region(
            db_session, _new_region_request()
        )
        await region_repository.update_region(db_session, running.id, status="running")
        already_complete = await region_repository.create_region(
            db_session, _new_region_request()
        )
        await region_repository.update_region(
            db_session, already_complete.id, status="complete"
        )

        monkeypatch.setattr(region_repository, "AsyncSessionLocal", session_factory)
        stale_ids = await region_repository.mark_stale_jobs_failed_on_startup()

        assert set(stale_ids) == {queued.id, running.id}
        # mark_stale_jobs_failed_on_startup wrote through a *different* session
        # (its own AsyncSessionLocal-backed one); db_session's identity map
        # still holds the pre-update objects, so verification reads go through
        # a brand new session instead of db_session's stale cached attributes.
        async with session_factory() as verify_session:
            refreshed_queued = await region_repository.get_region(
                verify_session, queued.id
            )
            refreshed_running = await region_repository.get_region(
                verify_session, running.id
            )
            refreshed_complete = await region_repository.get_region(
                verify_session, already_complete.id
            )
        assert refreshed_queued.status == "failed"
        assert refreshed_queued.error == "Interrupted by a server restart."
        assert refreshed_queued.phase is None
        assert refreshed_queued.completed_at is not None
        assert refreshed_running.status == "failed"
        assert refreshed_complete.status == "complete"  # untouched

    async def test_returns_an_empty_list_when_nothing_is_outstanding(
        self, db_session, session_factory, monkeypatch
    ):
        monkeypatch.setattr(region_repository, "AsyncSessionLocal", session_factory)
        assert await region_repository.mark_stale_jobs_failed_on_startup() == []
