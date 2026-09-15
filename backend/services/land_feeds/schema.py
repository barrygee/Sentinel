"""Pydantic models for Land live feeds — config, credentials and the
normalised output every adapter must produce.

Every field here is trusted only after validation: ``land.feeds`` is
user-editable (Settings UI, and the raw ``PUT /api/settings/land/feeds`` /
config-upload paths), so this is the single place that decides what a "valid"
feed looks like. Nothing downstream (the poller, the adapters, the router)
should re-derive these rules — it should refuse to run on a config that failed
here.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Feed id: a stable slug used as a DB key, a URL path segment and a
# credential-row key. Deliberately stricter than a general slug (lowercase,
# short) so it is always safe to interpolate into a path or log line.
FEED_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")

# Opaque per-feature reference used in /image/{ref} and /clip/{ref}. Provider
# adapters mint these (never the upstream URL itself); this is the outer bound
# every router path parameter is checked against before it ever reaches an
# adapter.
FEED_REF_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,80}$")

_AUTH_HEADER_OR_PARAM_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

FeedCategory = Literal["traffic-cameras", "traffic-data", "webcams"]
FeedProvider = Literal["snapshot", "durham", "tfl-jamcams", "utmc", "twni"]
FeedAuthType = Literal["none", "basic", "apiKey"]
FeedFeatureState = Literal["live", "stale", "offline"]

REFRESH_SECONDS_MIN = 15
REFRESH_SECONDS_MAX = 3600


class FeedAuth(BaseModel):
    """How a feed authenticates upstream. Never carries the secret itself —
    only the shape of it (which header/query param it goes in, and whether it
    is required)."""

    type: FeedAuthType = "none"
    header_name: str | None = Field(default=None, alias="headerName")
    query_param: str | None = Field(default=None, alias="queryParam")
    optional: bool = False

    model_config = {"populate_by_name": True}

    @field_validator("header_name", "query_param")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not _AUTH_HEADER_OR_PARAM_NAME_PATTERN.match(value):
            raise ValueError("header/query parameter names must be 1-64 letters, digits, '-' or '_'")
        return value


class FeedLocation(BaseModel):
    """A fixed camera/webcam location — required for the ``snapshot`` provider,
    which has no upstream feature list to derive coordinates from."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class FeedConfig(BaseModel):
    """One entry in ``land.feeds`` — the shape stored via the generic settings
    router and the shape adapters/the poller consume.

    Validation here is the SSRF/config-integrity boundary: ``provider`` is an
    allow-list (never an arbitrary import path), ``url`` must be https, and a
    ``snapshot`` feed must carry the fixed location it plots at (it has no
    upstream feature list to derive one from).
    """

    id: str
    name: str = Field(min_length=1, max_length=60)
    category: FeedCategory
    provider: FeedProvider
    url: str
    enabled: bool = False
    refresh_seconds: int = Field(default=60, ge=REFRESH_SECONDS_MIN, le=REFRESH_SECONDS_MAX, alias="refreshSeconds")
    datasets: list[str] = Field(default_factory=list)
    bbox: list[list[float]] | None = None
    location: FeedLocation | None = None
    auth: FeedAuth = Field(default_factory=FeedAuth)

    model_config = {"populate_by_name": True}

    @field_validator("id")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        if not FEED_ID_PATTERN.match(value):
            raise ValueError("id must match ^[a-z0-9][a-z0-9-]{1,39}$")
        return value

    @field_validator("datasets")
    @classmethod
    def _validate_datasets(cls, value: list[str]) -> list[str]:
        if len(value) > 20:
            raise ValueError("datasets list is too long")
        for entry in value:
            if not isinstance(entry, str) or not (1 <= len(entry) <= 40):
                raise ValueError("each dataset name must be a 1-40 character string")
        return value

    @field_validator("url")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        # https-only, always — this URL is a base a trusted adapter appends
        # known upstream paths to, so even one non-https feed would let a
        # config edit send credentials in the clear.
        if not isinstance(value, str) or not value.startswith("https://") or len(value) > 2048:
            raise ValueError("url must be an https:// URL")
        return value.rstrip("/")

    @field_validator("bbox")
    @classmethod
    def _validate_bbox(cls, value: list[list[float]] | None) -> list[list[float]] | None:
        if value is None:
            return None
        if len(value) != 2 or any(len(corner) != 2 for corner in value):
            raise ValueError("bbox must be [[minLon, minLat], [maxLon, maxLat]]")
        (min_lon, min_lat), (max_lon, max_lat) = value
        for lon in (min_lon, max_lon):
            if not (-180 <= lon <= 180):
                raise ValueError("bbox longitude out of range")
        for lat in (min_lat, max_lat):
            if not (-90 <= lat <= 90):
                raise ValueError("bbox latitude out of range")
        if min_lon >= max_lon or min_lat >= max_lat:
            raise ValueError("bbox min must be less than max on both axes")
        return [[min_lon, min_lat], [max_lon, max_lat]]

    @model_validator(mode="after")
    def _validate_location_required_for_snapshot(self) -> FeedConfig:
        if self.provider == "snapshot" and self.location is None:
            raise ValueError("location is required for the snapshot provider")
        if self.provider != "snapshot" and self.location is not None:
            raise ValueError("location is only valid for the snapshot provider")
        return self


class FeedCredentialIn(BaseModel):
    """Body for PUT /api/land/feeds/{id}/credentials.

    Shape must match the feed's configured ``auth.type`` (checked by the
    router, which knows the feed's config) — this model only constrains the
    individual fields so an oversized or malformed value can't be stored.
    """

    username: str | None = Field(default=None, min_length=1, max_length=128)
    password: str | None = Field(default=None, min_length=1, max_length=256)
    api_key: str | None = Field(default=None, min_length=1, max_length=256, alias="apiKey")

    model_config = {"populate_by_name": True}


class FeedFeatureProperties(BaseModel):
    """The ``properties`` object of one normalised GeoJSON feature."""

    kind: Literal["camera"] = "camera"
    id: str
    name: str
    description: str = ""
    view: str | None = None
    updated_at: str | None = Field(default=None, alias="updatedAt")
    state: FeedFeatureState
    image_url: str | None = Field(default=None, alias="imageUrl")
    clip_url: str | None = Field(default=None, alias="clipUrl")
    external_url: str | None = Field(default=None, alias="externalUrl")
    source_id: str = Field(alias="sourceId")
    source_name: str = Field(alias="sourceName")
    attribution: str = ""

    model_config = {"populate_by_name": True}


class FeedFeature(BaseModel):
    """One GeoJSON Point Feature — a camera or webcam."""

    type: Literal["Feature"] = "Feature"
    geometry: dict = Field(default_factory=dict)
    properties: FeedFeatureProperties

    @classmethod
    def point(cls, *, longitude: float, latitude: float, properties: FeedFeatureProperties) -> FeedFeature:
        """Build a Feature from lon/lat, the shape every adapter actually has."""
        return cls(geometry={"type": "Point", "coordinates": [longitude, latitude]}, properties=properties)


class FeedSnapshot(BaseModel):
    """The normalised result of one adapter fetch — a GeoJSON FeatureCollection
    plus fetch metadata. What the poller stores and the router serves."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[FeedFeature] = Field(default_factory=list)

    @classmethod
    def empty(cls) -> FeedSnapshot:
        return cls(features=[])


class ProbeResult(BaseModel):
    """Result of POST /api/land/feeds/{id}/test."""

    ok: bool
    message: str
    feature_count: int = Field(default=0, alias="featureCount")

    model_config = {"populate_by_name": True}
