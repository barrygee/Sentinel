"""Offline map downloads — user-selected region extracts for the three offline
basemap themes plus terrain, served back through two tile resolver endpoints.

Endpoints (prefix `/api/offline-map`):
  GET    /basemap/{z}/{x}/{y}   — resolved basemap tile: regions, then uk.pmtiles, else 204
  GET    /terrain/{z}/{x}/{y}   — resolved terrain tile: regions, then uk-terrain.pmtiles, else 204
  GET    /status                — configured sources, disk space, calibration table
  POST   /estimate               — tile count / byte size estimate for a bbox+depth+content selection
  POST   /regions                — queue a new region download
  GET    /regions                — list all regions, newest first
  GET    /regions/{id}           — one region's status/progress (polled)
  DELETE /regions/{id}           — cancel a queued/running job, or delete a finished one

Every filesystem path here is derived from server state (a region row's own
`.id`, or the configured base-archive paths) — no client input is ever used
to build a path; `region_id` path parameters are validated as well-formed
UUIDs before they're used for anything, including the database lookup.

Tile URLs may carry an arbitrary `?v=...` query string (the frontend uses the
current `tiers_version` so downloaded regions bust any HTTP cache); FastAPI/
Starlette simply ignores query parameters that aren't declared on the
handler, so it needs no code here to "support" — only Cache-Control needs to
know whether one was present, since a versioned URL is safe to cache long-term
and an unversioned one is not.
"""

from __future__ import annotations

import shutil
import uuid

from backend.config import settings
from backend.database import get_db
from backend.db_helpers import get_setting
from backend.services.offline_map import (
    basemap_source,
    job_runner,
    region_repository,
    source_probe,
    tile_tier_resolver,
)
from backend.services.offline_map.estimator import (
    MAX_MAX_ZOOM,
    MAX_MERCATOR_LATITUDE,
    MIN_MAX_ZOOM,
    estimate_area,
)
from backend.services.offline_map.tile_size_table import BASEMAP_AVG_TILE_BYTES, TERRAIN_AVG_TILE_BYTES
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/offline-map", tags=["offline-map"])

_LABEL_MAX_LEN = 60
# Cap on simultaneously queued+running regions (Security M2). A single
# operator queuing dozens of large regions would otherwise let their combined
# "reserved" estimate balloon past anything the disk gate can sensibly check,
# and there is no realistic workflow that needs more than a handful in flight.
_MAX_OUTSTANDING_JOBS = 5
# How long a served tile stays cacheable when the request carries a version
# query string (any value — the frontend uses tiers_version). Without one,
# responses are marked no-cache, since an unversioned URL could otherwise
# serve stale bytes forever once a browser caches it.
_VERSIONED_TILE_CACHE_CONTROL = "public, max-age=86400, immutable"
_UNVERSIONED_TILE_CACHE_CONTROL = "no-cache"


class AreaRequest(BaseModel):
    """A bounding box, depth and content selection — the shared shape behind
    both the estimate and the region-creation endpoints."""

    west: float
    south: float
    east: float
    north: float
    max_zoom: int = Field(ge=MIN_MAX_ZOOM, le=MAX_MAX_ZOOM)
    include_basemap: bool
    include_terrain: bool

    @field_validator("west", "south", "east", "north")
    @classmethod
    def _must_be_finite(cls, value: float) -> float:
        if value != value or value in (float("inf"), float("-inf")):  # noqa: PLR0124 — NaN check
            raise ValueError("bbox values must be finite numbers")
        return value

    @field_validator("west", "east")
    @classmethod
    def _longitude_range(cls, value: float) -> float:
        if not (-180.0 <= value <= 180.0):
            raise ValueError("longitude must be between -180 and 180")
        return value

    @field_validator("south", "north")
    @classmethod
    def _clamp_latitude(cls, value: float) -> float:
        # Clamped, not rejected — Web Mercator simply has no representation
        # beyond this latitude, and "use current view" can hand us exactly
        # this value from map.getBounds() on a tall viewport.
        return max(-MAX_MERCATOR_LATITUDE, min(MAX_MERCATOR_LATITUDE, value))

    @model_validator(mode="after")
    def _bbox_is_sane(self) -> AreaRequest:
        if self.west >= self.east:
            # A genuine antimeridian-crossing selection would need west > east;
            # v1 rejects it outright with a clear message, per the plan.
            raise ValueError("west must be less than east (crossing the antimeridian is not supported)")
        if self.south >= self.north:
            raise ValueError("south must be less than north")
        if not (self.include_basemap or self.include_terrain):
            raise ValueError("at least one of include_basemap or include_terrain must be true")
        return self


class RegionCreateRequest(AreaRequest):
    """POST /regions body — an AreaRequest plus an operator-chosen label."""

    label: str = Field(min_length=1, max_length=_LABEL_MAX_LEN)

    @field_validator("label", mode="before")
    @classmethod
    def _strip_label(cls, value: object) -> object:
        # Runs BEFORE Pydantic's own min_length/max_length check on the Field
        # above, so "1-60 characters" is enforced on the stripped value, not
        # the raw one — otherwise surrounding whitespace could wrongly reject
        # an in-range label, or wrongly admit a whitespace-only one.
        if isinstance(value, str):
            return value.strip()
        return value


class EstimateResponse(BaseModel):
    basemap_tiles: int
    basemap_bytes: int
    terrain_tiles: int
    terrain_bytes: int
    total_bytes: int
    free_bytes: int
    fits: bool


class RegionResponse(BaseModel):
    id: str
    label: str
    west: float
    south: float
    east: float
    north: float
    max_zoom: int
    include_basemap: bool
    include_terrain: bool
    status: str
    phase: str | None
    bytes_done: int
    bytes_estimated: int
    tiles_estimated: int
    size_bytes: int | None
    error: str | None
    created_at: int
    completed_at: int | None

    model_config = {"from_attributes": True}


class StatusResponse(BaseModel):
    basemap_available: bool
    terrain_available: bool
    basemap_max_zoom: int
    terrain_max_zoom: int
    free_bytes: int
    used_bytes: int
    sources_configured: bool
    pmtiles_available: bool
    tiers_version: str
    avg_tile_bytes: dict[str, dict[str, int]]


def _validate_tile_coords(zoom: int, tile_x: int, tile_y: int, *, max_zoom: int) -> None:
    if not (0 <= zoom <= max_zoom):
        raise HTTPException(status_code=422, detail="zoom out of range")
    grid_size = 2**zoom
    if not (0 <= tile_x < grid_size) or not (0 <= tile_y < grid_size):
        raise HTTPException(status_code=422, detail="tile x/y out of range for this zoom")


def _parse_region_id(region_id: str) -> str:
    """Validate a path parameter looks like a UUID before it's ever used for a
    database lookup or (via the returned, still-untrusted-looking string) a
    filesystem path. Region ids are always server-generated `str(uuid.uuid4())`
    (see region_repository.create_region), so anything else can never match a
    real row — reject it immediately with 422 rather than let it fall through
    to an ordinary 404."""
    try:
        return str(uuid.UUID(region_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="region id must be a UUID") from None


def _tile_cache_control(request: Request) -> str:
    """Versioned tile URLs (any `?v=...`, ignored by FastAPI's routing but
    still visible on `request.query_params`) are safe to cache for a long
    time — the version changes whenever the tier set does. Unversioned
    requests get no-cache so a browser can never pin a stale tile forever."""
    return _VERSIONED_TILE_CACHE_CONTROL if "v" in request.query_params else _UNVERSIONED_TILE_CACHE_CONTROL


@router.get("/basemap/{zoom}/{tile_x}/{tile_y}")
async def get_basemap_tile(zoom: int, tile_x: int, tile_y: int, request: Request) -> Response:
    """Resolved basemap tile: newest completed region archive first, then the
    bundled uk.pmtiles, else an empty 204 (MapLibre renders this as no data)."""
    _validate_tile_coords(zoom, tile_x, tile_y, max_zoom=14)
    resolved = tile_tier_resolver.resolver.resolve_basemap(zoom, tile_x, tile_y)
    if resolved is None:
        return Response(status_code=204)
    headers = {"Cache-Control": _tile_cache_control(request)}
    if resolved.content_encoding:
        headers["Content-Encoding"] = resolved.content_encoding
    return Response(content=resolved.data, media_type=resolved.content_type, headers=headers)


@router.get("/terrain/{zoom}/{tile_x}/{tile_y}")
async def get_terrain_tile(zoom: int, tile_x: int, tile_y: int, request: Request) -> Response:
    """Resolved terrain tile — same precedence as basemap, capped at z12."""
    _validate_tile_coords(zoom, tile_x, tile_y, max_zoom=12)
    resolved = tile_tier_resolver.resolver.resolve_terrain(zoom, tile_x, tile_y)
    if resolved is None:
        return Response(status_code=204)
    headers = {"Cache-Control": _tile_cache_control(request)}
    if resolved.content_encoding:
        headers["Content-Encoding"] = resolved.content_encoding
    return Response(content=resolved.data, media_type=resolved.content_type, headers=headers)


@router.get("/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    """Configured sources, current disk usage, and the calibration table the
    frontend's live estimate is built from — served verbatim so client and
    server numbers can never disagree."""
    basemap_available, basemap_max_zoom = tile_tier_resolver.resolver.basemap_status()
    terrain_available, terrain_max_zoom = tile_tier_resolver.resolver.terrain_status()
    tiles_dir = job_runner.runner.tiles_dir()
    tiles_dir.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(tiles_dir)
    # Only our own archives — a bare "*" glob would also count any unrelated
    # file an operator happened to drop in the tiles directory.
    used_bytes = sum(path.stat().st_size for path in tiles_dir.glob("*.pmtiles") if path.is_file())
    return StatusResponse(
        basemap_available=basemap_available,
        terrain_available=terrain_available,
        basemap_max_zoom=basemap_max_zoom,
        terrain_max_zoom=terrain_max_zoom,
        free_bytes=usage.free,
        used_bytes=used_bytes,
        sources_configured=bool(settings.offline_terrain_source_url),
        pmtiles_available=source_probe.pmtiles_binary_available(settings.pmtiles_bin),
        tiers_version=tile_tier_resolver.resolver.tiers_version,
        avg_tile_bytes={
            "basemap": {str(zoom): bytes_ for zoom, bytes_ in BASEMAP_AVG_TILE_BYTES.items()},
            "terrain": {str(zoom): bytes_ for zoom, bytes_ in TERRAIN_AVG_TILE_BYTES.items()},
        },
    )


@router.post("/estimate", response_model=EstimateResponse)
async def post_estimate(body: AreaRequest) -> EstimateResponse:
    """Authoritative pre-queue estimate — the UI computes the same numbers
    live from the calibration table in `/status`, but this is what the
    507 disk-space gate on POST /regions actually checks against."""
    estimate = estimate_area(
        body.west, body.south, body.east, body.north, body.max_zoom, body.include_basemap, body.include_terrain
    )
    tiles_dir = job_runner.runner.tiles_dir()
    tiles_dir.mkdir(parents=True, exist_ok=True)
    free_bytes = shutil.disk_usage(tiles_dir).free
    return EstimateResponse(
        basemap_tiles=estimate.basemap_tiles,
        basemap_bytes=estimate.basemap_bytes,
        terrain_tiles=estimate.terrain_tiles,
        terrain_bytes=estimate.terrain_bytes,
        total_bytes=estimate.total_bytes,
        free_bytes=free_bytes,
        fits=estimate.total_bytes * settings.offline_disk_margin_ratio <= free_bytes,
    )


@router.post("/regions", response_model=RegionResponse, status_code=202)
async def post_region(body: RegionCreateRequest, db: AsyncSession = Depends(get_db)) -> RegionResponse:
    """Queue a new region download. Validation (bbox/zoom/label) is enforced by
    the Pydantic model above; this handler enforces the gates that need live
    state: connectivity, an outstanding-jobs cap, source/tooling availability,
    and disk space (reserving space for jobs already ahead of this one)."""
    connectivity_mode = await get_setting(db, "app", "connectivityMode", "online")
    if connectivity_mode == "offgrid":
        raise HTTPException(status_code=409, detail="Offline map downloads require an internet connection.")

    outstanding_count = await region_repository.count_outstanding(db)
    if outstanding_count >= _MAX_OUTSTANDING_JOBS:
        raise HTTPException(
            status_code=409,
            detail=f"Too many downloads queued or running (max {_MAX_OUTSTANDING_JOBS}). "
            "Wait for one to finish, or cancel one first.",
        )

    if not source_probe.pmtiles_binary_available(settings.pmtiles_bin):
        raise HTTPException(status_code=503, detail="The map extraction tool is not available on the server.")
    if body.include_terrain and not settings.offline_terrain_source_url:
        raise HTTPException(status_code=503, detail="No terrain source is configured.")
    basemap_source_url: str | None = None
    if body.include_basemap:
        basemap_source_url = await basemap_source.resolve_basemap_source_url()
        if basemap_source_url is None:
            raise HTTPException(
                status_code=503,
                detail="Couldn't find a current map build to download from. Check the internet connection and try again.",
            )
        # An automatically found build was already probed while being chosen.
        if not basemap_source.is_automatic() and not await source_probe.probe_basemap_source(basemap_source_url):
            raise HTTPException(status_code=503, detail="The basemap source is unreachable or invalid.")

    estimate = estimate_area(
        body.west, body.south, body.east, body.north, body.max_zoom, body.include_basemap, body.include_terrain
    )
    tiles_dir = job_runner.runner.tiles_dir()
    tiles_dir.mkdir(parents=True, exist_ok=True)
    free_bytes = shutil.disk_usage(tiles_dir).free
    # Reserve space for what's already queued/running too — otherwise five
    # requests that each individually fit the free disk space could be queued
    # back to back and collectively run it dry.
    outstanding_remaining_bytes = await region_repository.sum_outstanding_remaining_bytes(db)
    required_bytes = (estimate.total_bytes + outstanding_remaining_bytes) * settings.offline_disk_margin_ratio
    if required_bytes > free_bytes:
        raise HTTPException(
            status_code=507,
            detail=(
                f"Not enough free disk space: need about {int(required_bytes)} bytes "
                f"(this request plus {outstanding_remaining_bytes} bytes already queued, "
                f"including a {int((settings.offline_disk_margin_ratio - 1) * 100)}% margin), "
                f"only {free_bytes} bytes free."
            ),
        )

    region = await region_repository.create_region(
        db,
        region_repository.NewRegionRequest(
            label=body.label,
            west=body.west,
            south=body.south,
            east=body.east,
            north=body.north,
            max_zoom=body.max_zoom,
            include_basemap=body.include_basemap,
            include_terrain=body.include_terrain,
            bytes_estimated=estimate.total_bytes,
            tiles_estimated=estimate.basemap_tiles + estimate.terrain_tiles,
            source_url=basemap_source_url or "",
        ),
    )
    await job_runner.runner.enqueue(region.id)
    return RegionResponse.model_validate(region)


@router.get("/regions", response_model=list[RegionResponse])
async def get_regions(db: AsyncSession = Depends(get_db)) -> list[RegionResponse]:
    regions = await region_repository.list_regions(db)
    return [RegionResponse.model_validate(region) for region in regions]


@router.get("/regions/{region_id}", response_model=RegionResponse)
async def get_region(region_id: str, db: AsyncSession = Depends(get_db)) -> RegionResponse:
    region = await region_repository.get_region(db, _parse_region_id(region_id))
    if region is None:
        raise HTTPException(status_code=404, detail="Region not found")
    return RegionResponse.model_validate(region)


@router.delete("/regions/{region_id}", status_code=204)
async def delete_region(region_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    """Cancel a queued/running job (subprocess terminated, every file for the
    region removed, row deleted), or delete a finished region's archives and
    row outright. Filesystem paths are always built from the fetched row's
    own `.id` (a database value), never straight from the path parameter,
    even though the two are validated to be equal here — see job_runner's
    per-region path helpers."""
    validated_region_id = _parse_region_id(region_id)
    region = await region_repository.get_region(db, validated_region_id)
    if region is None:
        raise HTTPException(status_code=404, detail="Region not found")

    if region.status in ("queued", "running"):
        job_runner.runner.cancel(region.id)
        # Best-effort: if the job actually raced to completion just before
        # this cancel took effect, remove whatever it wrote too. The job
        # runner's own completion path independently detects and unwinds the
        # same race (region_repository.update_region's rowcount check), so
        # this is redundant-but-harmless defence in depth, not the only guard.
        job_runner.runner.basemap_final_path(region.id).unlink(missing_ok=True)
        job_runner.runner.terrain_final_path(region.id).unlink(missing_ok=True)
        tile_tier_resolver.resolver.remove_region(region.id)
        await region_repository.delete_region(db, region.id)
    else:
        # Update the resolver BEFORE the row disappears, so a concurrent tile
        # request can never be served from an archive whose row already 404s.
        tile_tier_resolver.resolver.remove_region(region.id)
        job_runner.runner.basemap_final_path(region.id).unlink(missing_ok=True)
        job_runner.runner.terrain_final_path(region.id).unlink(missing_ok=True)
        await region_repository.delete_region(db, region.id)

    return Response(status_code=204)
