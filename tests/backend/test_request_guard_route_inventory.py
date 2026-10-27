"""Every route an app answers, mounts flattened: what the guard's rules must cover.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_route_inventory.py
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket
from starlette.datastructures import URLPath
from starlette.routing import BaseRoute, Match, Mount, NoMatchFound, Route, WebSocketRoute
from starlette.staticfiles import StaticFiles
from starlette.types import Receive, Scope, Send

from backend.platform.security.route_inventory import (
    WEBSOCKET_METHOD,
    RouteEntry,
    iter_routes,
)


async def read_thing() -> dict[str, str]:
    return {}


async def change_thing() -> dict[str, str]:
    return {}


async def live_feed(websocket: WebSocket) -> None:
    await websocket.close()


def build_app(tmp_path: Path) -> FastAPI:
    api = FastAPI()
    api.add_api_route("/things/{thing_id}", read_thing, methods=["GET"])
    api.add_api_route("/things/{thing_id}", change_thing, methods=["PUT", "PATCH"])
    api.add_api_websocket_route("/live", live_feed)
    app = FastAPI()
    app.add_api_route("/health", read_thing, methods=["GET"])
    app.mount("/api", api)
    app.mount("/remotes/space", StaticFiles(directory=tmp_path))
    return app


class TestIterRoutes:
    def test_flattens_mounts_and_lists_each_method(self, tmp_path: Path) -> None:
        entries = [(entry.method, entry.path) for entry in iter_routes(build_app(tmp_path).routes)]

        assert ("GET", "/health") in entries
        assert ("GET", "/api/things/{thing_id}") in entries
        assert ("PATCH", "/api/things/{thing_id}") in entries
        assert ("PUT", "/api/things/{thing_id}") in entries
        assert (WEBSOCKET_METHOD, "/api/live") in entries

    def test_a_static_mount_is_one_entry_for_everything_under_it(self, tmp_path: Path) -> None:
        static = [entry for entry in iter_routes(build_app(tmp_path).routes) if entry.endpoint is None]

        assert static == [RouteEntry("GET", "/remotes/space/**", None)]

    def test_head_rides_along_with_get(self) -> None:
        entries = list(iter_routes([Route("/page", read_thing, methods=["GET", "HEAD"])]))

        assert [entry.method for entry in entries] == ["GET"]

    def test_a_route_answering_only_head_is_listed_as_get(self) -> None:
        entries = list(iter_routes([Route("/page", read_thing, methods=["HEAD"])]))

        assert [entry.method for entry in entries] == ["GET"]

    def test_a_plain_starlette_websocket_route(self) -> None:
        entries = list(iter_routes([WebSocketRoute("/ws", live_feed)]))

        assert entries == [RouteEntry(WEBSOCKET_METHOD, "/ws", live_feed)]

    def test_nested_mounts_prefix_every_level(self) -> None:
        inner = Mount("/v1", routes=[Route("/sdrs", read_thing, methods=["GET"])])
        entries = list(iter_routes([Mount("/api", routes=[inner])]))

        assert [(entry.method, entry.path) for entry in entries] == [("GET", "/api/v1/sdrs")]

    def test_serving_order_is_kept(self, tmp_path: Path) -> None:
        paths = [entry.path for entry in iter_routes(build_app(tmp_path).routes)]

        assert paths.index("/health") < paths.index("/api/things/{thing_id}") < paths.index("/remotes/space/**")


class TestEndpointName:
    def test_names_the_function(self) -> None:
        assert RouteEntry("GET", "/x", read_thing).endpoint_name == f"{__name__}.read_thing"

    def test_a_static_mount_has_no_function(self) -> None:
        assert RouteEntry("GET", "/x/**", None).endpoint_name == "static files"


class TestUnrecognisedRoutes:
    def test_a_route_type_with_no_methods_or_path_is_skipped(self) -> None:
        # Not a security gap: at request time a path no rule covers is refused.
        class OpaqueRoute(BaseRoute):
            async def handle(self, scope: Scope, receive: Receive, send: Send) -> None:
                return None

            def matches(self, scope: Scope) -> tuple[Match, Scope]:
                return Match.NONE, {}

            def url_path_for(self, name: str, /, **path_params: Any) -> URLPath:
                raise NoMatchFound(name, path_params)

        assert list(iter_routes([OpaqueRoute()])) == []
