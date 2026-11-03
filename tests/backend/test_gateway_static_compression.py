"""The gateway's compression of static build output (`gateway/caddy.json`).

Caddy reads this file as it is, so these pin what the route must do: compress
the shell bundle, section remotes, map assets and fonts; leave the API (SSE and
WebSockets included) and range-read PMTiles archives alone; and sit before the
routes it wraps, because a Caddy middleware only wraps the handlers after it.
"""

from __future__ import annotations

import json
from fnmatch import fnmatchcase
from pathlib import Path

import pytest

CADDY_CONFIG = Path(__file__).resolve().parents[2] / "gateway" / "caddy.json"


def browser_routes() -> list[dict]:
    config = json.loads(CADDY_CONFIG.read_text())
    return config["apps"]["http"]["servers"]["sentinel"]["routes"]


def compression_route() -> dict:
    (route,) = [route for route in browser_routes() if route.get("@id") == "static_compression"]
    return route


def is_compressed(request_path: str) -> bool:
    """Whether a request path matches the route's matcher set, the way Caddy's path matcher does."""
    (matcher,) = compression_route()["match"]
    included = any(fnmatchcase(request_path, pattern) for pattern in matcher["path"])
    excluded = any(
        fnmatchcase(request_path, pattern) for negated in matcher.get("not", []) for pattern in negated["path"]
    )
    return included and not excluded


@pytest.mark.parametrize(
    "request_path",
    [
        "/spa-assets/index-Ab12Cd34.js",
        "/remotes/air/remoteEntry.js",
        "/remotes/air/spa-assets/section-Ab12Cd34.js",
        "/assets/fiord.json",
        "/assets/fonts/Noto Sans Regular/0-255.pbf",
        "/fonts/Barlow-400.woff2",
    ],
)
def test_compresses_static_build_output(request_path):
    assert is_compressed(request_path)


@pytest.mark.parametrize(
    "request_path",
    [
        "/api/settings/app",
        "/api/air/messages/stream",
        "/ws/sdr/spectrum",
        "/api/offline-map/basemap/9/250/160",
        "/assets/tiles/surroundings.pmtiles",
        "/assets/uk.pmtiles",
        "/",
        "/air",
    ],
)
def test_leaves_the_api_streams_and_pmtiles_archives_alone(request_path):
    assert not is_compressed(request_path)


def test_is_compression_only_and_does_not_end_the_route_chain():
    route = compression_route()

    assert [handler["handler"] for handler in route["handle"]] == ["encode"]
    assert set(route["handle"][0]["encodings"]) == {"zstd", "gzip"}
    assert not route.get("terminal", False)


def test_wraps_the_section_routes_and_the_app_by_coming_before_them():
    route_ids = [route.get("@id") or route["handle"][0].get("@id") for route in browser_routes()]

    compression_index = route_ids.index("static_compression")
    assert compression_index < route_ids.index("registry_routes")
    assert compression_index < len(route_ids) - 1
