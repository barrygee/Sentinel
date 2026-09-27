"""Tests for backend.routers.offline_map: request validation (the highest
priority per the project's standards), the connectivity/outstanding-jobs/
source/disk-space gates on POST /regions, the tile resolver endpoints, and
DELETE's path-safety (filenames always built from the *database* id, never
the raw path parameter).

Uses the standard `client` TestClient fixture (in-memory DB, `get_db`
overridden). The job runner and tile-tier-resolver singletons are process-wide
and must be reset between tests; both are pointed at a private tmp_path tiles
directory so nothing here ever touches a real archive.
"""

from __future__ import annotations

import uuid

import pydantic
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.routers import offline_map
from backend.services.offline_map import job_runner as job_runner_module
from backend.services.offline_map import region_repository, tile_tier_resolver
from tests.backend.offline_map_test_helpers import (
    reset_job_runner_singleton,
    reset_tile_tier_resolver_singleton,
    write_test_pmtiles_archive,
)

VALID_AREA = {
    "west": -3.5,
    "south": 54.3,
    "east": -2.9,
    "north": 54.7,
    "max_zoom": 10,
    "include_basemap": True,
    "include_terrain": True,
}


@pytest.fixture(autouse=True)
def isolate_offline_map_singletons(tmp_path, monkeypatch):
    base_basemap = tmp_path / "base.pmtiles"
    base_terrain = tmp_path / "base-terrain.pmtiles"
    write_test_pmtiles_archive(base_basemap, {(0, 0, 0): b"base-basemap"})
    write_test_pmtiles_archive(base_terrain, {(0, 0, 0): b"base-terrain"})
    monkeypatch.setattr(settings, "offline_basemap_base_archive", str(base_basemap))
    monkeypatch.setattr(settings, "offline_terrain_base_archive", str(base_terrain))
    monkeypatch.setattr(
        tile_tier_resolver, "resolved_offline_tiles_dir", lambda: tmp_path
    )
    monkeypatch.setattr(
        job_runner_module, "resolved_offline_tiles_dir", lambda: tmp_path
    )
    monkeypatch.setattr(settings, "pmtiles_bin", "pmtiles")
    monkeypatch.setattr(
        settings,
        "offline_terrain_source_url",
        "https://download.mapterhorn.com/planet.pmtiles",
    )
    monkeypatch.setattr(settings, "offline_basemap_source_url", "")
    reset_job_runner_singleton()
    reset_tile_tier_resolver_singleton()
    yield tmp_path
    reset_job_runner_singleton()
    reset_tile_tier_resolver_singleton()


@pytest.fixture()
def session_factory(test_engine, db_setup):
    # `db_setup` (root conftest) creates the schema on `test_engine` — needed
    # even when a test never touches the `client` fixture directly (e.g. the
    # direct-call tests below, which build their own session).
    return sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


async def _seed_region(session_factory, **overrides):
    fields = {
        "label": "Seed Region",
        "west": -3.5,
        "south": 54.3,
        "east": -2.9,
        "north": 54.7,
        "max_zoom": 10,
        "include_basemap": True,
        "include_terrain": True,
        "bytes_estimated": 1000,
        "tiles_estimated": 10,
        "source_url": "https://build.protomaps.com/20260101.pmtiles",
    }
    fields.update(overrides)
    async with session_factory() as session:
        region = await region_repository.create_region(
            session, region_repository.NewRegionRequest(**fields)
        )
        return region.id


class TestBasemapTileEndpoint:
    def test_zoom_below_zero_is_rejected(self, client):
        response = client.get("/api/offline-map/basemap/-1/0/0")
        assert response.status_code == 422

    def test_zoom_above_fourteen_is_rejected(self, client):
        response = client.get("/api/offline-map/basemap/15/0/0")
        assert response.status_code == 422

    def test_zoom_at_the_maximum_of_fourteen_is_accepted(self, client, tmp_path):
        write_test_pmtiles_archive(
            tmp_path / "base.pmtiles", {(0, 0, 0): b"x", (14, 0, 0): b"deep"}
        )
        response = client.get("/api/offline-map/basemap/14/0/0")
        assert response.status_code in (200, 204)  # valid range, whether or not covered

    def test_tile_x_out_of_range_for_its_zoom_is_rejected(self, client):
        # zoom 1 has a 2x2 grid — x=2 is out of range.
        response = client.get("/api/offline-map/basemap/1/2/0")
        assert response.status_code == 422

    def test_tile_y_out_of_range_for_its_zoom_is_rejected(self, client):
        response = client.get("/api/offline-map/basemap/1/0/2")
        assert response.status_code == 422

    def test_negative_tile_x_is_rejected(self, client):
        response = client.get("/api/offline-map/basemap/1/-1/0")
        assert response.status_code == 422

    def test_returns_the_base_archive_tile_with_gzip_encoding(self, client):
        response = client.get("/api/offline-map/basemap/0/0/0")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/x-protobuf"
        assert response.headers["content-encoding"] == "gzip"

    def test_returns_204_when_nothing_covers_the_tile(self, client):
        response = client.get("/api/offline-map/basemap/1/0/0")
        assert response.status_code == 204

    def test_unversioned_request_gets_no_cache(self, client):
        response = client.get("/api/offline-map/basemap/0/0/0")
        assert response.headers["cache-control"] == "no-cache"

    def test_versioned_request_gets_a_long_lived_cache_control(self, client):
        response = client.get("/api/offline-map/basemap/0/0/0?v=abc123")
        assert "immutable" in response.headers["cache-control"]

    def test_uncompressed_archive_tile_has_no_content_encoding_header(
        self, client, tmp_path
    ):
        from pmtiles.tile import Compression

        write_test_pmtiles_archive(
            tmp_path / "base.pmtiles",
            {(0, 0, 0): b"raw-bytes"},
            compression=Compression.NONE,
        )
        response = client.get("/api/offline-map/basemap/0/0/0")
        assert response.status_code == 200
        assert "content-encoding" not in response.headers
        assert response.content == b"raw-bytes"


class TestTerrainTileEndpoint:
    def test_zoom_above_twelve_is_rejected(self, client):
        response = client.get("/api/offline-map/terrain/13/0/0")
        assert response.status_code == 422

    def test_zoom_at_the_maximum_of_twelve_is_accepted(self, client):
        response = client.get("/api/offline-map/terrain/12/0/0")
        assert response.status_code in (200, 204)

    def test_returns_the_base_terrain_archive_tile(self, client):
        response = client.get("/api/offline-map/terrain/0/0/0")
        assert response.status_code == 200
        # httpx transparently decodes the gzip Content-Encoding, so `.content`
        # is already the original stored bytes.
        assert response.content == b"base-terrain"

    def test_returns_204_when_nothing_covers_the_tile(self, client):
        response = client.get("/api/offline-map/terrain/1/0/0")
        assert response.status_code == 204

    def test_uncompressed_terrain_archive_tile_has_no_content_encoding_header(
        self, client, tmp_path
    ):
        from pmtiles.tile import Compression, TileType

        write_test_pmtiles_archive(
            tmp_path / "base-terrain.pmtiles",
            {(0, 0, 0): b"raw-terrain-bytes"},
            compression=Compression.NONE,
            tile_type=TileType.WEBP,
        )
        response = client.get("/api/offline-map/terrain/0/0/0")
        assert response.status_code == 200
        assert "content-encoding" not in response.headers
        assert response.content == b"raw-terrain-bytes"


class TestStatusEndpoint:
    def test_reports_basemap_and_terrain_available_with_calibration_table(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )
        response = client.get("/api/offline-map/status")
        assert response.status_code == 200
        body = response.json()
        assert body["basemap_available"] is True
        assert body["terrain_available"] is True
        assert body["sources_configured"] is True  # offline_terrain_source_url is set
        assert body["pmtiles_available"] is True
        assert "0" in body["avg_tile_bytes"]["basemap"]
        assert "12" in body["avg_tile_bytes"]["terrain"]
        assert isinstance(body["tiers_version"], str)

    def test_reports_pmtiles_unavailable_when_the_binary_cannot_be_found(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: False
        )
        response = client.get("/api/offline-map/status")
        assert response.json()["pmtiles_available"] is False

    def test_sources_configured_is_false_when_no_terrain_source_url_is_set(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(settings, "offline_terrain_source_url", "")
        response = client.get("/api/offline-map/status")
        assert response.json()["sources_configured"] is False


class TestEstimateEndpointValidation:
    def test_valid_area_returns_estimate_fields(self, client):
        response = client.post("/api/offline-map/estimate", json=VALID_AREA)
        assert response.status_code == 200
        body = response.json()
        assert body["basemap_tiles"] > 0
        assert body["terrain_tiles"] > 0
        assert body["total_bytes"] == body["basemap_bytes"] + body["terrain_bytes"]
        assert "free_bytes" in body and "fits" in body

    def test_reports_fits_false_when_the_estimate_exceeds_free_disk_space(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.shutil, "disk_usage", lambda path: _DiskUsage(free=1)
        )
        response = client.post("/api/offline-map/estimate", json=VALID_AREA)
        assert response.json()["fits"] is False

    @pytest.mark.parametrize(
        "overrides",
        [
            {"west": float("nan")},
            {"south": float("inf")},
            {"east": float("-inf")},
            {"north": float("nan")},
        ],
        ids=["west-nan", "south-inf", "east-neg-inf", "north-nan"],
    )
    def test_non_finite_bbox_values_are_rejected(self, client, overrides):
        body = {**VALID_AREA, **overrides}
        response = _post_json_allowing_non_finite_floats(
            client, "/api/offline-map/estimate", body
        )
        assert response.status_code == 422

    @pytest.mark.parametrize(
        "field,value", [("west", 181.0), ("west", -181.0), ("east", 200.0)]
    )
    def test_longitude_beyond_180_is_rejected(self, client, field, value):
        body = {**VALID_AREA, field: value}
        response = client.post("/api/offline-map/estimate", json=body)
        assert response.status_code == 422

    def test_inverted_bbox_west_not_less_than_east_is_rejected(self, client):
        body = {**VALID_AREA, "west": -2.9, "east": -3.5}
        response = client.post("/api/offline-map/estimate", json=body)
        assert response.status_code == 422

    def test_antimeridian_crossing_west_greater_than_east_is_rejected(self, client):
        body = {**VALID_AREA, "west": 170.0, "east": -170.0}
        response = client.post("/api/offline-map/estimate", json=body)
        assert response.status_code == 422

    def test_inverted_bbox_south_not_less_than_north_is_rejected(self, client):
        body = {**VALID_AREA, "south": 54.7, "north": 54.3}
        response = client.post("/api/offline-map/estimate", json=body)
        assert response.status_code == 422

    def test_latitude_beyond_mercator_limit_is_clamped_not_rejected(self, client):
        body = {**VALID_AREA, "south": -89.9, "north": 89.9}
        response = client.post("/api/offline-map/estimate", json=body)
        assert response.status_code == 200  # clamped, not an error

    def test_max_zoom_five_is_rejected_below_the_minimum(self, client):
        body = {**VALID_AREA, "max_zoom": 5}
        response = client.post("/api/offline-map/estimate", json=body)
        assert response.status_code == 422

    def test_max_zoom_fifteen_is_rejected_above_the_maximum(self, client):
        body = {**VALID_AREA, "max_zoom": 15}
        response = client.post("/api/offline-map/estimate", json=body)
        assert response.status_code == 422

    def test_max_zoom_six_and_fourteen_are_both_accepted(self, client):
        for boundary_zoom in (6, 14):
            body = {**VALID_AREA, "max_zoom": boundary_zoom}
            response = client.post("/api/offline-map/estimate", json=body)
            assert response.status_code == 200

    def test_both_includes_false_is_rejected(self, client):
        body = {**VALID_AREA, "include_basemap": False, "include_terrain": False}
        response = client.post("/api/offline-map/estimate", json=body)
        assert response.status_code == 422

    def test_only_basemap_or_only_terrain_is_accepted(self, client):
        for combo in (
            {"include_basemap": True, "include_terrain": False},
            {"include_basemap": False, "include_terrain": True},
        ):
            body = {**VALID_AREA, **combo}
            response = client.post("/api/offline-map/estimate", json=body)
            assert response.status_code == 200


class TestRegionCreateValidation:
    def test_label_blank_after_stripping_is_rejected(self, client):
        body = {**VALID_AREA, "label": "   "}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 422

    def test_label_empty_string_is_rejected(self, client):
        body = {**VALID_AREA, "label": ""}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 422

    def test_label_sixty_characters_after_stripping_is_accepted(
        self, client, monkeypatch
    ):
        _stub_success_gates(monkeypatch)
        label = "x" * 60
        body = {**VALID_AREA, "label": f"  {label}  "}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 202
        assert response.json()["label"] == label

    def test_label_sixty_one_characters_after_stripping_is_rejected(self, client):
        body = {**VALID_AREA, "label": "x" * 61}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 422

    def test_label_is_stripped_of_surrounding_whitespace(self, client, monkeypatch):
        _stub_success_gates(monkeypatch)
        body = {**VALID_AREA, "label": "  Lake District  "}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 202
        assert response.json()["label"] == "Lake District"


class TestRegionCreateGates:
    def test_offgrid_connectivity_is_refused_with_409(self, client, monkeypatch):
        _stub_success_gates(monkeypatch)
        client.put("/api/settings/app/connectivityMode", json={"value": "offgrid"})
        body = {**VALID_AREA, "label": "Should Be Refused"}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 409
        assert "internet connection" in response.json()["detail"]

    def test_online_connectivity_is_accepted(self, client, monkeypatch):
        _stub_success_gates(monkeypatch)
        client.put("/api/settings/app/connectivityMode", json={"value": "online"})
        body = {**VALID_AREA, "label": "Fine"}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 202

    def test_outstanding_jobs_at_the_cap_is_refused_with_409(
        self, client, monkeypatch, session_factory
    ):
        _stub_success_gates(monkeypatch)
        # Seed exactly the cap's worth of outstanding rows directly, using the
        # same engine the client's overridden get_db uses.
        _run_sync(_seed_five_outstanding(session_factory))

        body = {**VALID_AREA, "label": "One Too Many"}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 409
        assert "Too many downloads" in response.json()["detail"]

    def test_pmtiles_binary_missing_is_refused_with_503(self, client, monkeypatch):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: False
        )
        body = {**VALID_AREA, "label": "No Binary"}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 503
        assert "extraction tool" in response.json()["detail"]

    def test_terrain_requested_with_no_terrain_source_configured_is_refused_with_503(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )
        monkeypatch.setattr(settings, "offline_terrain_source_url", "")
        body = {
            **VALID_AREA,
            "label": "No Terrain Source",
            "include_terrain": True,
            "include_basemap": False,
        }
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 503
        assert "terrain source" in response.json()["detail"]

    def test_no_resolvable_basemap_build_is_refused_with_503(self, client, monkeypatch):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )

        async def resolve_none():
            return None

        monkeypatch.setattr(
            offline_map.basemap_source, "resolve_basemap_source_url", resolve_none
        )
        body = {
            **VALID_AREA,
            "label": "No Build",
            "include_basemap": True,
            "include_terrain": False,
        }
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 503
        assert "Couldn't find a current map build" in response.json()["detail"]

    def test_manual_override_source_that_fails_the_probe_is_refused_with_503(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )
        monkeypatch.setattr(
            settings, "offline_basemap_source_url", "https://mine.example/build.pmtiles"
        )

        async def resolve_override():
            return "https://mine.example/build.pmtiles"

        async def probe_fails(url):
            return False

        monkeypatch.setattr(
            offline_map.basemap_source, "resolve_basemap_source_url", resolve_override
        )
        monkeypatch.setattr(offline_map.basemap_source, "is_automatic", lambda: False)
        monkeypatch.setattr(
            offline_map.source_probe, "probe_basemap_source", probe_fails
        )
        body = {
            **VALID_AREA,
            "label": "Bad Override",
            "include_basemap": True,
            "include_terrain": False,
        }
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 503
        assert "unreachable or invalid" in response.json()["detail"]

    def test_an_automatically_found_build_is_not_re_probed(self, client, monkeypatch):
        # is_automatic() True means the URL was already probed while being
        # chosen — the router must not probe it again.
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )

        async def resolve_automatic():
            return "https://build.protomaps.com/20260101.pmtiles"

        probe_calls = 0

        async def probe_spy(url):
            nonlocal probe_calls
            probe_calls += 1
            return True

        monkeypatch.setattr(
            offline_map.basemap_source, "resolve_basemap_source_url", resolve_automatic
        )
        monkeypatch.setattr(offline_map.basemap_source, "is_automatic", lambda: True)
        monkeypatch.setattr(offline_map.source_probe, "probe_basemap_source", probe_spy)
        monkeypatch.setattr(offline_map.job_runner.runner, "enqueue", _noop_enqueue)
        body = {
            **VALID_AREA,
            "label": "Automatic",
            "include_basemap": True,
            "include_terrain": False,
        }
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 202
        assert probe_calls == 0

    def test_insufficient_disk_space_is_refused_with_507(self, client, monkeypatch):
        _stub_success_gates(monkeypatch)
        monkeypatch.setattr(
            offline_map.shutil, "disk_usage", lambda path: _DiskUsage(free=1)
        )
        body = {**VALID_AREA, "label": "Too Big"}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 507
        assert "Not enough free disk space" in response.json()["detail"]

    def test_disk_gate_reserves_space_for_outstanding_queued_jobs(
        self, client, monkeypatch, session_factory, tmp_path
    ):
        _stub_success_gates(monkeypatch)
        # Enough free space for one request's own estimate, but not enough
        # once an already-queued region's own remaining estimate is reserved
        # too.
        area_only_estimate = offline_map.estimate_area(
            VALID_AREA["west"],
            VALID_AREA["south"],
            VALID_AREA["east"],
            VALID_AREA["north"],
            VALID_AREA["max_zoom"],
            True,
            True,
        )
        _run_sync(
            _seed_outstanding_with_bytes(
                session_factory, bytes_estimated=area_only_estimate.total_bytes * 5
            )
        )
        free_bytes = int(
            area_only_estimate.total_bytes * 1.05
        )  # fits alone, not with the reservation
        monkeypatch.setattr(
            offline_map.shutil, "disk_usage", lambda path: _DiskUsage(free=free_bytes)
        )
        body = {**VALID_AREA, "label": "Should Be Blocked By Reservation"}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 507

    def test_successful_queue_returns_202_with_a_queued_region(
        self, client, monkeypatch
    ):
        _stub_success_gates(monkeypatch)
        body = {**VALID_AREA, "label": "Lake District"}
        response = client.post("/api/offline-map/regions", json=body)
        assert response.status_code == 202
        region = response.json()
        assert region["status"] == "queued"
        assert region["label"] == "Lake District"
        assert uuid.UUID(region["id"])  # a real UUID
        assert region["bytes_estimated"] > 0
        assert region["completed_at"] is None


class TestRegionIdPathValidation:
    def test_get_region_with_a_non_uuid_id_is_rejected_with_422(self, client):
        response = client.get("/api/offline-map/regions/not-a-uuid")
        assert response.status_code == 422

    def test_get_region_with_an_unknown_uuid_is_404(self, client):
        response = client.get(f"/api/offline-map/regions/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_delete_region_with_a_non_uuid_id_is_rejected_with_422(self, client):
        response = client.delete("/api/offline-map/regions/not-a-uuid-at-all")
        assert response.status_code == 422

    def test_delete_region_with_an_unknown_uuid_is_404(self, client):
        response = client.delete(f"/api/offline-map/regions/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_get_region_returns_the_seeded_row(self, client, session_factory):
        region_id = _run_sync(_seed_region(session_factory, label="Findable"))
        response = client.get(f"/api/offline-map/regions/{region_id}")
        assert response.status_code == 200
        assert response.json()["label"] == "Findable"


class TestListRegions:
    def test_lists_newest_first(self, client, session_factory):
        first_id = _run_sync(_seed_region(session_factory, label="Older"))
        _run_sync(_bump_created_at(session_factory, first_id, 1000))
        second_id = _run_sync(_seed_region(session_factory, label="Newer"))
        _run_sync(_bump_created_at(session_factory, second_id, 2000))

        response = client.get("/api/offline-map/regions")
        assert response.status_code == 200
        labels = [region["label"] for region in response.json()]
        assert labels == ["Newer", "Older"]


class TestDeleteRegion:
    def test_deleting_a_queued_or_running_region_cancels_the_job(
        self, client, monkeypatch, session_factory
    ):
        region_id = _run_sync(_seed_region(session_factory, label="Cancel Me"))
        _run_sync(_set_status(session_factory, region_id, "running"))
        cancel_calls = []
        monkeypatch.setattr(
            offline_map.job_runner.runner,
            "cancel",
            lambda rid: cancel_calls.append(rid),
        )

        response = client.delete(f"/api/offline-map/regions/{region_id}")
        assert response.status_code == 204
        assert cancel_calls == [region_id]
        assert client.get(f"/api/offline-map/regions/{region_id}").status_code == 404

    def test_deleting_a_completed_region_does_not_call_cancel(
        self, client, monkeypatch, session_factory
    ):
        region_id = _run_sync(_seed_region(session_factory, label="Finished"))
        _run_sync(_set_status(session_factory, region_id, "complete"))
        cancel_calls = []
        monkeypatch.setattr(
            offline_map.job_runner.runner,
            "cancel",
            lambda rid: cancel_calls.append(rid),
        )

        response = client.delete(f"/api/offline-map/regions/{region_id}")
        assert response.status_code == 204
        assert cancel_calls == []

    def test_delete_removes_files_named_from_the_database_id_not_the_raw_path_param(
        self, client, session_factory, tmp_path
    ):
        region_id = _run_sync(_seed_region(session_factory, label="Path Safety"))
        _run_sync(_set_status(session_factory, region_id, "complete"))
        basemap_file = job_runner_module.runner.basemap_final_path(region_id)
        terrain_file = job_runner_module.runner.terrain_final_path(region_id)
        basemap_file.write_bytes(b"basemap-bytes")
        terrain_file.write_bytes(b"terrain-bytes")

        # Request with an upper-cased, differently-formatted UUID — validated
        # and normalised by `_parse_region_id` before ever being used to
        # locate the row (equal, but a different string than the DB's own
        # lowercase `str(uuid.uuid4())`).
        uppercase_id = region_id.upper()
        response = client.delete(f"/api/offline-map/regions/{uppercase_id}")
        assert response.status_code == 204
        assert not basemap_file.exists()
        assert not terrain_file.exists()

    def test_delete_only_touches_files_under_the_tiles_dir_leaving_bystanders_alone(
        self, client, session_factory, tmp_path
    ):
        region_id = _run_sync(_seed_region(session_factory, label="Bystander Test"))
        _run_sync(_set_status(session_factory, region_id, "complete"))
        bystander = tmp_path / "unrelated-file-that-happens-to-be-here.txt"
        bystander.write_bytes(b"leave me alone")

        response = client.delete(f"/api/offline-map/regions/{region_id}")
        assert response.status_code == 204
        assert bystander.exists()


class TestPostRegionAndRegionEndpointsCalledDirectly:
    """Same gates/behaviour as the HTTP-level tests above, but calling the
    router's endpoint functions directly as plain coroutines (not through
    TestClient/ASGI dispatch).

    This isn't redundant busywork: FastAPI/Starlette's own request-dispatch
    path (`solve_dependencies` + `run_endpoint_function`) has a coverage-tool
    blind spot for any statement that runs *after* the first `await` that
    crosses into SQLAlchemy's async-ORM greenlet bridge, in the SAME
    function — confirmed by temporarily adding a `print()` right after such a
    statement: it demonstrably ran (visible in stdout) on every HTTP-level
    test above, yet the coverage tool never credited it, with byte-identical
    "missing" results regardless of tracer backend (ctrace/pytrace/sysmon) or
    concurrency setting, and regardless of running one test or eleven
    different ones. Calling the same functions directly (bypassing FastAPI's
    dispatch machinery) traces correctly, proving these lines run exactly as
    asserted; it's these tests that close that coverage-measurement gap.
    Every assertion here mirrors a genuine behavioural expectation already
    covered black-box above — this class exists for coverage completeness,
    not because the HTTP-level tests were wrong or insufficient.
    """

    async def _make_session(self, session_factory):
        return session_factory()

    async def test_offgrid_connectivity_raises_409(self, session_factory, monkeypatch):
        _stub_success_gates(monkeypatch)
        async with session_factory() as session:
            from backend.db_helpers import upsert_setting

            await upsert_setting(session, "app", "connectivityMode", "offgrid")
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.post_region(_area_request(label="Blocked"), session)
            assert excinfo.value.status_code == 409

    async def test_outstanding_cap_raises_409(self, session_factory, monkeypatch):
        _stub_success_gates(monkeypatch)
        await _seed_five_outstanding(session_factory)
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.post_region(_area_request(label="Too Many"), session)
            assert excinfo.value.status_code == 409

    async def test_pmtiles_binary_missing_raises_503(
        self, session_factory, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: False
        )
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.post_region(_area_request(label="No Binary"), session)
            assert excinfo.value.status_code == 503

    async def test_terrain_source_missing_raises_503(
        self, session_factory, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )
        monkeypatch.setattr(settings, "offline_terrain_source_url", "")
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.post_region(
                    _area_request(
                        label="No Terrain", include_basemap=False, include_terrain=True
                    ),
                    session,
                )
            assert excinfo.value.status_code == 503

    async def test_unresolvable_basemap_build_raises_503(
        self, session_factory, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )

        async def resolve_none():
            return None

        monkeypatch.setattr(
            offline_map.basemap_source, "resolve_basemap_source_url", resolve_none
        )
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.post_region(
                    _area_request(
                        label="No Build", include_basemap=True, include_terrain=False
                    ),
                    session,
                )
            assert excinfo.value.status_code == 503

    async def test_manual_override_probe_failure_raises_503(
        self, session_factory, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )
        monkeypatch.setattr(
            settings, "offline_basemap_source_url", "https://mine.example/build.pmtiles"
        )

        async def resolve_override():
            return "https://mine.example/build.pmtiles"

        async def probe_fails(url):
            return False

        monkeypatch.setattr(
            offline_map.basemap_source, "resolve_basemap_source_url", resolve_override
        )
        monkeypatch.setattr(offline_map.basemap_source, "is_automatic", lambda: False)
        monkeypatch.setattr(
            offline_map.source_probe, "probe_basemap_source", probe_fails
        )
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.post_region(
                    _area_request(
                        label="Bad Override",
                        include_basemap=True,
                        include_terrain=False,
                    ),
                    session,
                )
            assert excinfo.value.status_code == 503

    async def test_automatic_build_is_not_re_probed_and_succeeds(
        self, session_factory, monkeypatch
    ):
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )

        async def resolve_automatic():
            return "https://build.protomaps.com/20260101.pmtiles"

        probe_calls = 0

        async def probe_spy(url):
            nonlocal probe_calls
            probe_calls += 1
            return True

        monkeypatch.setattr(
            offline_map.basemap_source, "resolve_basemap_source_url", resolve_automatic
        )
        monkeypatch.setattr(offline_map.basemap_source, "is_automatic", lambda: True)
        monkeypatch.setattr(offline_map.source_probe, "probe_basemap_source", probe_spy)
        monkeypatch.setattr(offline_map.job_runner.runner, "enqueue", _noop_enqueue)
        async with session_factory() as session:
            region = await offline_map.post_region(
                _area_request(
                    label="Automatic", include_basemap=True, include_terrain=False
                ),
                session,
            )
        assert region.status == "queued"
        assert probe_calls == 0

    async def test_insufficient_disk_space_raises_507(
        self, session_factory, monkeypatch
    ):
        _stub_success_gates(monkeypatch)
        monkeypatch.setattr(
            offline_map.shutil, "disk_usage", lambda path: _DiskUsage(free=1)
        )
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.post_region(_area_request(label="Too Big"), session)
            assert excinfo.value.status_code == 507

    async def test_disk_gate_reserves_space_for_outstanding_jobs_raises_507(
        self, session_factory, monkeypatch
    ):
        _stub_success_gates(monkeypatch)
        area = _area_request(label="Reservation Check")
        estimate = offline_map.estimate_area(
            area.west, area.south, area.east, area.north, area.max_zoom, True, True
        )
        await _seed_outstanding_with_bytes(
            session_factory, bytes_estimated=estimate.total_bytes * 5
        )
        free_bytes = int(estimate.total_bytes * 1.05)
        monkeypatch.setattr(
            offline_map.shutil, "disk_usage", lambda path: _DiskUsage(free=free_bytes)
        )
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.post_region(area, session)
            assert excinfo.value.status_code == 507

    async def test_successful_queue_returns_a_queued_region(
        self, session_factory, monkeypatch
    ):
        _stub_success_gates(monkeypatch)
        async with session_factory() as session:
            region = await offline_map.post_region(
                _area_request(label="Direct Success"), session
            )
        assert region.status == "queued"
        assert region.label == "Direct Success"

    async def test_get_regions_lists_newest_first(self, session_factory):
        first_id = await _seed_region(session_factory, label="Older")
        await _bump_created_at(session_factory, first_id, 1000)
        second_id = await _seed_region(session_factory, label="Newer")
        await _bump_created_at(session_factory, second_id, 2000)
        async with session_factory() as session:
            regions = await offline_map.get_regions(session)
        assert [region.label for region in regions] == ["Newer", "Older"]

    async def test_get_region_raises_404_for_an_unknown_id(self, session_factory):
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.get_region(str(uuid.uuid4()), session)
            assert excinfo.value.status_code == 404

    async def test_get_region_returns_the_matching_row(self, session_factory):
        region_id = await _seed_region(session_factory, label="Direct Fetch")
        async with session_factory() as session:
            region = await offline_map.get_region(region_id, session)
        assert region.label == "Direct Fetch"

    async def test_post_region_terrain_only_succeeds_without_touching_the_basemap_gates(
        self, session_factory, monkeypatch
    ):
        # Confirms `if body.include_basemap:` is genuinely skipped for a
        # terrain-only request — resolving/probing a basemap source must
        # never be attempted.
        monkeypatch.setattr(
            offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
        )
        monkeypatch.setattr(offline_map.job_runner.runner, "enqueue", _noop_enqueue)

        async def resolve_should_not_be_called():
            raise AssertionError(
                "basemap source must never be resolved for a terrain-only request"
            )

        monkeypatch.setattr(
            offline_map.basemap_source,
            "resolve_basemap_source_url",
            resolve_should_not_be_called,
        )
        async with session_factory() as session:
            region = await offline_map.post_region(
                _area_request(
                    label="Terrain Only", include_basemap=False, include_terrain=True
                ),
                session,
            )
        assert region.status == "queued"
        assert region.include_basemap is False
        assert region.include_terrain is True

    async def test_area_request_rejects_a_non_finite_bbox_value_at_the_model_level(
        self,
    ):
        # Exercises `_must_be_finite`'s raise branch directly against the
        # Pydantic model — the HTTP round trip for this same input is covered
        # separately (and currently exposes a genuine framework bug: see
        # TestEstimateEndpointValidation.test_non_finite_bbox_values_are_rejected).
        with pytest.raises(pydantic.ValidationError):
            offline_map.AreaRequest(
                west=float("nan"),
                south=54.3,
                east=-2.9,
                north=54.7,
                max_zoom=10,
                include_basemap=True,
                include_terrain=True,
            )

    async def test_region_create_request_passes_a_non_string_label_through_unchanged(
        self,
    ):
        # `_strip_label`'s `mode="before"` validator only calls `.strip()` on
        # a `str`; for anything else (here, `None`) it must return the value
        # untouched rather than raise itself — Pydantic's own `str` field
        # validation is what rejects `None` downstream, with a type error
        # rather than the "blank after stripping" message a real blank label
        # would get.
        with pytest.raises(pydantic.ValidationError) as excinfo:
            offline_map.RegionCreateRequest(
                west=VALID_AREA["west"],
                south=VALID_AREA["south"],
                east=VALID_AREA["east"],
                north=VALID_AREA["north"],
                max_zoom=VALID_AREA["max_zoom"],
                include_basemap=True,
                include_terrain=True,
                label=None,
            )
        assert "string_type" in str(excinfo.value)

    async def test_delete_region_raises_404_for_an_unknown_id(self, session_factory):
        async with session_factory() as session:
            with pytest.raises(HTTPException) as excinfo:
                await offline_map.delete_region(str(uuid.uuid4()), session)
            assert excinfo.value.status_code == 404

    async def test_delete_region_queued_cancels_and_removes_the_row(
        self, session_factory, monkeypatch
    ):
        region_id = await _seed_region(session_factory, label="Cancel Direct")
        await _set_status(session_factory, region_id, "queued")
        cancel_calls = []
        monkeypatch.setattr(
            offline_map.job_runner.runner,
            "cancel",
            lambda rid: cancel_calls.append(rid),
        )
        async with session_factory() as session:
            await offline_map.delete_region(region_id, session)
        assert cancel_calls == [region_id]
        async with session_factory() as session:
            assert await region_repository.get_region(session, region_id) is None

    async def test_delete_region_complete_does_not_cancel_and_removes_the_row(
        self, session_factory, monkeypatch
    ):
        region_id = await _seed_region(session_factory, label="Finished Direct")
        await _set_status(session_factory, region_id, "complete")
        cancel_calls = []
        monkeypatch.setattr(
            offline_map.job_runner.runner,
            "cancel",
            lambda rid: cancel_calls.append(rid),
        )
        async with session_factory() as session:
            await offline_map.delete_region(region_id, session)
        assert cancel_calls == []
        async with session_factory() as session:
            assert await region_repository.get_region(session, region_id) is None


def _area_request(
    *, label: str, include_basemap: bool = True, include_terrain: bool = True
):
    return offline_map.RegionCreateRequest(
        west=VALID_AREA["west"],
        south=VALID_AREA["south"],
        east=VALID_AREA["east"],
        north=VALID_AREA["north"],
        max_zoom=VALID_AREA["max_zoom"],
        include_basemap=include_basemap,
        include_terrain=include_terrain,
        label=label,
    )


def _stub_success_gates(monkeypatch) -> None:
    """Stub every external gate on POST /regions to succeed, for tests that
    care about a different concern (label validation, connectivity, disk
    reservation math) and want the request to reach 202 cleanly."""
    monkeypatch.setattr(
        offline_map.source_probe, "pmtiles_binary_available", lambda binary: True
    )

    async def resolve_automatic():
        return "https://build.protomaps.com/20260101.pmtiles"

    monkeypatch.setattr(
        offline_map.basemap_source, "resolve_basemap_source_url", resolve_automatic
    )
    monkeypatch.setattr(offline_map.basemap_source, "is_automatic", lambda: True)
    monkeypatch.setattr(offline_map.job_runner.runner, "enqueue", _noop_enqueue)


async def _noop_enqueue(region_id: str) -> None:
    return None


def _post_json_allowing_non_finite_floats(client, path: str, body: dict):
    """httpx's own `json=` kwarg serialises with `allow_nan=False`, raising
    a ValueError in the *test* before a request is even sent for a NaN/Infinity
    payload — but the whole point here is to prove the API itself rejects
    those values over the wire. Serialise manually (stdlib `json.dumps`
    defaults to `allow_nan=True`, matching what a real non-Python client could
    still send) and post as raw content instead."""
    import json

    return client.post(
        path, content=json.dumps(body), headers={"Content-Type": "application/json"}
    )


class _DiskUsage:
    def __init__(self, free: int, total: int = 10**12) -> None:
        self.free = free
        self.total = total


def _run_sync(coroutine):
    """Run a coroutine to completion from inside a synchronous test function
    driven by TestClient. TestClient's requests each run FastAPI's own async
    handlers via Starlette's test portal, which does not leave a running
    event loop visible to the *test* function itself, so a plain
    `asyncio.run` here is safe."""
    import asyncio

    return asyncio.run(coroutine)


async def _seed_five_outstanding(session_factory) -> None:
    for index in range(offline_map._MAX_OUTSTANDING_JOBS):
        await _seed_region(session_factory, label=f"Outstanding {index}")


async def _seed_outstanding_with_bytes(
    session_factory, *, bytes_estimated: int
) -> None:
    await _seed_region(
        session_factory, label="Reserving Space", bytes_estimated=bytes_estimated
    )


async def _bump_created_at(session_factory, region_id, created_at) -> None:
    async with session_factory() as session:
        await region_repository.update_region(session, region_id, created_at=created_at)


async def _set_status(session_factory, region_id, status) -> None:
    async with session_factory() as session:
        await region_repository.update_region(session, region_id, status=status)
