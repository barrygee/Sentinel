"""The globe's combined feed, `GET /api/globe/objects`, as Pydantic models.

One compact item type per layer, defined once here; the globe frontend mirrors
them as TypeScript types. Items are built from the compact rows each owning
section answers with (`backend.platform.globe_snapshots`), so the field names
here are the browser's, not the sections'.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

LayerId = Literal["air", "space", "sea", "aprs"]
LayerStatus = Literal["ok", "unavailable"]


class _Item(BaseModel):
    """Items are read from section replies: unknown extra fields are ignored, not errors."""

    model_config = ConfigDict(extra="ignore")


class AircraftItem(_Item):
    """One aircraft from Air's snapshot around home."""

    hex: str
    callsign: str | None = None
    registration: str | None = None
    typeCode: str | None = None
    lat: float
    lon: float
    altitudeFt: float | None = None
    """Barometric altitude in feet; 0 on the ground, None when not reported."""
    onGround: bool = False
    groundSpeedKt: float | None = None
    trackDeg: float | None = None
    squawk: str | None = None
    category: str | None = None
    emergency: str | None = None
    military: bool = False
    """From the feed's aircraft-database flags (bit 1) only."""
    seenPosSeconds: float | None = None


class VesselItem(_Item):
    """One vessel's latest position from Sea's store."""

    mmsi: str
    name: str | None = None
    typeLabel: str | None = None
    family: str | None = None
    lat: float
    lon: float
    speedKt: float | None = None
    courseDeg: float | None = None
    headingDeg: float | None = None
    lastPositionMs: int | None = None


class AprsStationItem(_Item):
    """One APRS station's latest fix from Land's store."""

    callsign: str
    lat: float
    lon: float
    altitudeM: float | None = None
    courseDeg: float | None = None
    speedKmh: float | None = None
    symbol: str | None = None
    comment: str | None = None
    lastHeardMs: int | None = None


class SatellitePosition(_Item):
    """A satellite's sub-point now, with look angles when an observer was given."""

    lat: float
    lon: float
    altKm: float
    velocityKms: float | None = None
    trackDeg: float | None = None
    azimuthDeg: float | None = None
    elevationDeg: float | None = None


class SatelliteItem(_Item):
    """One chosen satellite: position, ground track and footprint, as Space's map draws them."""

    noradId: str
    name: str
    position: SatellitePosition
    groundTrack: dict[str, Any]
    """GeoJSON FeatureCollection: previous, current and next two orbits (unwrapped longitudes)."""
    footprint: dict[str, Any]
    """GeoJSON Polygon or MultiPolygon of the visibility footprint."""


class LayerResult(BaseModel):
    """One layer of the feed: its items, or why there are none.

    `status` is `unavailable` when the owning section is down, slow, refused
    the request or has nothing to serve; `reason` then names why in a fixed
    vocabulary (never an internal message): `section-unavailable`, `timeout`,
    `error`, `no-location`, `no-tle-data`, or Air's own `daily-limit`,
    `no-source`, `upstream` and `settings`. `meta` carries the layer's own facts
    (cache state, feed status, unknown satellites, ...).
    """

    status: LayerStatus
    reason: str | None = None
    items: list[AircraftItem] | list[VesselItem] | list[AprsStationItem] | list[SatelliteItem] = Field(
        default_factory=list
    )
    meta: dict[str, Any] = Field(default_factory=dict)


class GlobeObjectsResponse(BaseModel):
    """`GET /api/globe/objects`: one entry per requested layer, never an error for one layer's failure."""

    generatedAtMs: int
    layers: dict[LayerId, LayerResult]
