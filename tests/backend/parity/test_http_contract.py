"""P0 parity baseline: the HTTP/WebSocket route contract.

`app.openapi()` fully describes every `APIRoute` (path, methods, params,
request/response schemas) but says nothing about WebSocket routes or the
static/catch-all mounts — a container split could silently drop `/ws/sdr/...`
or reorder the SPA catch-all ahead of `/api/**` and this file would never
notice. The route inventory golden below covers the whole `app.routes` list
(REST, WebSocket, and static mounts) precisely so that gap doesn't exist.

Route *order* matters here (see backend/main.py's module docstring: `/api/**`
must be matched before the SPA catch-all), so the inventory is compared in
`app.routes` iteration order rather than sorted — a reordering is a real
regression this test must catch.
"""

from __future__ import annotations

import json

import pytest
from starlette.routing import Mount, Route, WebSocketRoute

from backend.main import app
from tests.backend.parity.conftest import assert_golden, render_json


def _route_methods(route) -> list[str] | None:
    methods = getattr(route, "methods", None)
    if methods is None:
        return None
    return sorted(methods)


def _route_type(route) -> str:
    if isinstance(route, WebSocketRoute):
        return "WebSocketRoute"
    if isinstance(route, Mount):
        return "Mount"
    if isinstance(route, Route):
        return "Route"
    return type(route).__name__


def _route_entry(route) -> dict:
    return {
        "path": getattr(route, "path", None),
        "type": _route_type(route),
        "name": getattr(route, "name", None),
        "methods": _route_methods(route),
    }


def build_route_inventory() -> list[dict]:
    """Every route FastAPI/Starlette registered, in registration order."""
    return [_route_entry(route) for route in app.routes]


class TestOpenApiSchema:
    def test_openapi_schema_matches_golden(self):
        """`app.openapi()` — every REST path's methods, params, and request/
        response schemas — must stay byte-identical across a refactor."""
        schema = app.openapi()
        assert_golden("openapi_schema", render_json(schema, sort_keys=True))

    def test_can_actually_fail_on_a_removed_path(self):
        """Validity check: deleting a real path from the live schema must turn
        the golden comparison red, proving the assertion is load-bearing."""
        schema = app.openapi()
        mutated = json.loads(render_json(schema))
        removed_path = next(iter(mutated["paths"]))
        del mutated["paths"][removed_path]
        with pytest.raises(AssertionError):
            assert_golden(
                "openapi_schema",
                render_json(mutated, sort_keys=True),
                allow_update=False,
            )


class TestRouteInventory:
    def test_route_inventory_matches_golden(self):
        """Covers what `app.openapi()` cannot: WebSocket routes and the
        static/SPA mounts, in their real registration order."""
        inventory = build_route_inventory()
        assert_golden("route_inventory", render_json(inventory, sort_keys=False))

    def test_route_inventory_is_non_empty_and_covers_known_surfaces(self):
        """Sanity assertions independent of the golden file, so a golden that
        was accidentally generated empty can't slip through unnoticed."""
        inventory = build_route_inventory()
        assert len(inventory) > 20

        paths = {entry["path"] for entry in inventory}
        assert "/ws/sdr/{radio_id}" in paths
        assert "/ws/sdr/{radio_id}/iq" in paths
        assert "/ws/sdr/{radio_id}/decode" in paths
        assert "/ws/sdr/{radio_id}/decode/audio" in paths
        assert "/health" in paths
        assert "/{full_path:path}" in paths

        websocket_paths = {
            entry["path"] for entry in inventory if entry["type"] == "WebSocketRoute"
        }
        assert websocket_paths == {
            "/ws/sdr/{radio_id}/iq",
            "/ws/sdr/{radio_id}",
            "/ws/sdr/{radio_id}/decode",
            "/ws/sdr/{radio_id}/decode/audio",
        }

    def test_catch_all_spa_route_is_registered_last(self):
        """The SPA catch-all must stay after every `/api/**` route and static
        mount, or vue-router's client routes would swallow the API — see
        backend/main.py's Serving model docstring. This is exactly the kind of
        ordering regression sorted comparisons would hide."""
        inventory = build_route_inventory()
        assert inventory[-1]["path"] == "/{full_path:path}"

    def test_can_actually_fail_on_a_reordered_route(self):
        """Validity check: swapping two entries must turn the golden
        comparison red."""
        inventory = build_route_inventory()
        assert len(inventory) >= 2
        mutated = list(inventory)
        mutated[0], mutated[1] = mutated[1], mutated[0]
        with pytest.raises(AssertionError):
            assert_golden(
                "route_inventory",
                render_json(mutated, sort_keys=False),
                allow_update=False,
            )
