"""The service manifest — how a service declares itself to the core registry.

Every Sentinel service (a section, the radio hub, a decoder) registers one of
these with core on start (plan §3.1, §3.2). Core then lists it to the shell,
routes its path prefixes through the gateway, and health-probes it. Today the
monolith registers a manifest per section in-process (`backend/modules/`); once
a section runs in its own container (P6) it sends the same manifest over HTTP.

The model lives in `platform` rather than `core` because both sides use it:
core validates what arrives, and each service builds its own.

Only the fields the registry acts on are checked strictly. The rest of the plan's
manifest (`settings`, `requires`, `consumes`, …) is accepted and kept, so a
service can declare it now and core can start acting on it later without a
contract change.
"""

from __future__ import annotations

import re
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# The id becomes part of a URL, a federation container name and a settings
# namespace — the same pattern the shell enforces before loading a remote.
SERVICE_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,31}$")

# The only contracts major this core speaks. A service built against another
# major is refused at registration rather than half-working (plan §7).
_CONTRACTS_V1 = re.compile(r"^\^?1(\.(\d+|x)){0,2}$")

# A route is a path prefix the gateway sends to the service: lowercase segments
# under /api/ or /ws/, at least two segments deep so no service can claim all
# of /api/. A trailing slash makes it a directory prefix (`/api/sea/`); without
# one it also matches that exact path (`/api/sdr/radios`).
_ROUTE_PATTERN = re.compile(r"^/(api|ws)(/[a-z0-9][a-z0-9_.-]*){1,4}/?$")

# Prefixes core keeps for itself whatever registers. `/api/air/messages` is the
# notifications API, core-owned despite the path (plan §4.4); a section may own
# `/api/air/` because the gateway sends the longer, core-owned prefix to core.
RESERVED_ROUTE_PREFIXES = (
    "/api/app",
    "/api/settings",
    "/api/offline-map",
    "/api/air/messages",
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
)

MAX_ROUTES = 32


def _segments(path: str) -> list[str]:
    return [segment for segment in path.split("/") if segment]


def route_is_reserved(route: str) -> bool:
    """True when `route` is, or falls under, a prefix core keeps for itself.

    Compared segment by segment, so `/api/apps/` is free while `/api/app/x` is not.
    """
    route_segments = _segments(route)
    for reserved in RESERVED_ROUTE_PREFIXES:
        reserved_segments = _segments(reserved)
        if route_segments[: len(reserved_segments)] == reserved_segments:
            return True
    return False


def remote_entry_path(service_id: str) -> str:
    """The one place a service's UI remote entry may live: under its own id."""
    return f"/remotes/{service_id}/remoteEntry.js"


class UiRemote(BaseModel):
    """A service's Module Federation remote (sections and the radio settings UI)."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    remote_entry: str = Field(alias="remoteEntry")
    exposes: list[str] = Field(default_factory=list, max_length=16)


class ServiceManifest(BaseModel):
    """One service's registration (plan §3.1).

    Raises `pydantic.ValidationError` on anything the registry cannot route or
    load safely: a bad id, a route outside /api/ and /ws/ or under a core prefix,
    a remote entry outside `/remotes/<id>/`, an internal URL that isn't http(s).
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str
    kind: Literal["section", "radio-hub", "decoder"]
    version: str = Field(min_length=1, max_length=64)
    contracts: str = Field(default="^1", max_length=16)
    display_name: str = Field(default="", alias="displayName", max_length=64)
    nav_order: int = Field(default=1000, alias="navOrder", ge=0, le=10_000)
    internal_url: str = Field(alias="internalUrl", max_length=512)
    routes: list[str] = Field(default_factory=list, max_length=MAX_ROUTES)
    ui: UiRemote | None = None
    health: str = Field(default="/health", max_length=128)

    @field_validator("id")
    @classmethod
    def _valid_id(cls, service_id: str) -> str:
        if not SERVICE_ID_PATTERN.match(service_id):
            raise ValueError("id must be lowercase letters, digits and dashes, starting with a letter")
        return service_id

    @field_validator("contracts")
    @classmethod
    def _contracts_v1(cls, contracts: str) -> str:
        if not _CONTRACTS_V1.match(contracts):
            raise ValueError("this core speaks contracts 1.x only")
        return contracts

    @field_validator("internal_url")
    @classmethod
    def _http_url(cls, internal_url: str) -> str:
        parts = urlsplit(internal_url)
        # A query or fragment would be silently dropped when the probe and the
        # gateway append paths to this, so refuse it rather than guess.
        if parts.scheme not in ("http", "https") or not parts.hostname or parts.query or parts.fragment:
            raise ValueError("internalUrl must be an http(s) URL with a host and no query")
        return internal_url.rstrip("/")

    @field_validator("routes")
    @classmethod
    def _valid_routes(cls, routes: list[str]) -> list[str]:
        for route in routes:
            if not _ROUTE_PATTERN.match(route):
                raise ValueError(f"route {route!r} must be a lowercase prefix under /api/<name> or /ws/<name>")
            if route_is_reserved(route):
                raise ValueError(f"route {route!r} is reserved for core")
        if len(set(routes)) != len(routes):
            raise ValueError("routes must not repeat")
        return routes

    @field_validator("health")
    @classmethod
    def _health_path(cls, health: str) -> str:
        if not health.startswith("/") or health.startswith("//"):
            raise ValueError("health must be a path on internalUrl")
        return health

    @model_validator(mode="after")
    def _remote_under_own_id(self) -> ServiceManifest:
        # The shell runs whatever a remote entry contains, so a service may only
        # point it at its own /remotes/<id>/ — never at another service's.
        if self.ui is not None and self.ui.remote_entry != remote_entry_path(self.id):
            raise ValueError(f"ui.remoteEntry must be {remote_entry_path(self.id)}")
        return self

    def to_wire(self) -> dict[str, Any]:
        """The manifest as JSON, in the plan's camelCase field names."""
        return self.model_dump(by_alias=True, exclude_none=True)
