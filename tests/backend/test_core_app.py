"""Core's app factory (backend/core/app.py, P8).

`create_core_app()` builds the app every deployment runs as `app`: core's own
routers, lifecycles and the SPA, never a section's — each section and the radio
hub run as services of their own. The test suite's in-process app
(tests/in_process_app.py) adds them all through the same factory; the
route-order golden (tests/backend/parity/) pins that build.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sentinel_air import adsb_source_router as adsb_source
from sentinel_air import router as air
from sentinel_docs import router as docs
from sentinel_land import router as land
from sentinel_radio.routers import (
    decode,
    decoders,
    iq_captures,
    radio_control,
    radios,
    sentry,
)
from sentinel_sdr import router as sdr
from sentinel_sea import router as sea
from sentinel_space import router as space

from backend.core import app_docs, app_mode, app_sections, notifications, registry_router, settings_secrets
from backend.core.app import CORE_LIFECYCLES, core_routers, create_core_app
from backend.modules import bus as bus_module
from backend.modules import core as core_module
from backend.platform.lifecycle import ModuleLifecycle
from backend.routers import offline_map
from backend.routers import settings as settings_router
from tests.in_process_app import in_process_routers

CORE_ROUTERS = [
    notifications.router,
    settings_router.router,
    offline_map.router,
    app_sections.router,
    app_docs.router,
    app_mode.router,
    registry_router.router,
    settings_secrets.router,
]

SECTION_AND_HUB_ROUTERS = [
    air.router,
    adsb_source.router,
    space.router,
    land.router,
    sea.router,
    sdr.router,
    radios.router,
    radio_control.router,
    decode.router,
    decoders.router,
    sentry.router,
    iq_captures.router,
    docs.router,
]


def paths_of(router) -> list[str]:
    return [route.path for route in router.routes]


class TestCoreRouters:
    def test_are_cores_own_in_route_matching_order(self):
        assert core_routers() == CORE_ROUTERS

    def test_the_in_process_app_keeps_the_original_route_order(self):
        assert in_process_routers() == [
            air.router,
            notifications.router,
            space.router,
            land.router,
            sea.router,
            settings_router.router,
            radios.router,
            sdr.router,
            radio_control.router,
            decode.router,
            decoders.router,
            sentry.router,
            iq_captures.router,
            adsb_source.router,
            offline_map.router,
            app_sections.router,
            app_docs.router,
            app_mode.router,
            registry_router.router,
            settings_secrets.router,
            docs.router,
        ]


class TestCreateCoreApp:
    def test_serves_only_cores_routes_before_the_spa_catch_all(self):
        app = create_core_app()

        paths = [route.path for route in app.routes]
        assert paths[-1] == "/{full_path:path}"
        assert set(paths_of(settings_router.router)) <= set(paths)
        section_paths = {path for router in SECTION_AND_HUB_ROUTERS for path in paths_of(router)}
        assert not section_paths & set(paths)

    def test_runs_the_bus_then_core(self):
        assert CORE_LIFECYCLES == (bus_module.lifecycle, core_module.lifecycle)

    def test_a_section_remote_is_a_404_not_the_spa(self):
        response = TestClient(create_core_app()).get("/remotes/space/remoteEntry.js")

        assert response.status_code == 404
        assert "text/html" not in response.headers["content-type"]

    def test_a_head_request_for_a_section_remote_is_a_404_too(self):
        response = TestClient(create_core_app()).head("/remotes/sea/remoteEntry.js")

        assert response.status_code == 404

    def test_refuses_remotes_before_the_spa_catch_all_and_keeps_it_out_of_the_api_schema(self):
        app = create_core_app()

        paths = [route.path for route in app.routes]
        assert paths.index("/remotes/{remote_path:path}") < paths.index("/{full_path:path}")
        assert not any(path.startswith("/remotes") for path in app.openapi()["paths"])

    def test_serves_no_section_remotes_by_default(self):
        app = create_core_app()

        assert not any(getattr(route, "path", "") == "/remotes" for route in app.routes)

    def test_serves_section_remotes_only_when_asked(self):
        app = create_core_app(serve_section_remotes=True)

        paths = [getattr(route, "path", "") for route in app.routes]
        assert "/remotes" in paths
        assert "/remotes/{remote_path:path}" not in paths

    def test_given_routers_replace_cores_own(self):
        app = create_core_app(routers=[settings_router.router])

        paths = {route.path for route in app.routes}
        assert set(paths_of(settings_router.router)) <= paths
        assert not set(paths_of(notifications.router)) & paths

    def test_health_reports_ok_with_a_millisecond_timestamp(self):
        response = TestClient(create_core_app()).get("/health")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        # Milliseconds since the epoch: 13 digits until the year 2286.
        assert isinstance(body["timestamp"], int) and len(str(body["timestamp"])) == 13

    def test_keeps_the_api_docs_under_api(self):
        app = create_core_app()

        assert (app.docs_url, app.redoc_url, app.openapi_url) == (
            "/api/docs",
            "/api/redoc",
            "/api/openapi.json",
        )


class TestLifespan:
    @pytest.mark.asyncio
    async def test_runs_every_given_module_lifecycle_for_the_life_of_the_app(self):
        calls: list[str] = []

        def recording(name: str) -> ModuleLifecycle:
            async def prepare() -> None:
                calls.append(f"{name}.prepare")

            async def start() -> None:
                calls.append(f"{name}.start")

            async def stop() -> None:
                calls.append(f"{name}.stop")

            return ModuleLifecycle(name=name, prepare=prepare, start=start, stop=stop)

        app = create_core_app(lifecycles=(recording("first"), recording("second")))

        async with app.router.lifespan_context(app):
            assert calls == [
                "first.prepare",
                "second.prepare",
                "first.start",
                "second.start",
            ]

        assert calls[4:] == ["second.stop", "first.stop"]
