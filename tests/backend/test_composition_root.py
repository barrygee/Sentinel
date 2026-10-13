"""Core's app factory (backend/composition_root.py, P8).

`create_core_app()` is the composition root every deployment runs: core's own
routers always, plus each section and the radio hub that
SENTINEL_EXTERNAL_SERVICES doesn't list. The route-order golden
(tests/backend/parity/) pins the default build; these pin what changes as
services move out, and the factory's own wiring. That an external service's
code is never even *imported* needs a fresh interpreter, so it is covered by
tests/backend/test_external_services.py instead.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import backend.modules
from backend import composition_root
from backend.composition_root import api_routers, create_core_app
from backend.config import settings
from backend.core import app_sections, notifications, registry_router, settings_secrets
from backend.core.service_registry import ServiceRegistry
from backend.platform.lifecycle import ModuleLifecycle
from backend.radio_hub.routers import (
    decode,
    decoders,
    iq_captures,
    radio_control,
    radios,
    sentry,
)
from backend.routers import adsb_source, air, land, offline_map, sdr, sea, space
from backend.routers import settings as settings_router

# Everything in route-matching order when every service is hosted here.
ALL_ROUTERS = [
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
    registry_router.router,
    settings_secrets.router,
]

# Each extractable service's routers: what the app must leave out when it runs elsewhere.
ROUTERS_OF_SERVICE = {
    "air": [air.router, adsb_source.router],
    "space": [space.router],
    "land": [land.router],
    "sea": [sea.router],
    "sdr": [sdr.router],
    "radio-hub": [
        radios.router,
        radio_control.router,
        decode.router,
        decoders.router,
        sentry.router,
        iq_captures.router,
    ],
}


def paths_of(router) -> list[str]:
    return [route.path for route in router.routes]


@pytest.fixture()
def external(monkeypatch):
    """Sets SENTINEL_EXTERNAL_SERVICES for one test."""

    def set_external(service_ids: str) -> None:
        monkeypatch.setattr(settings, "sentinel_external_services", service_ids)

    set_external("")
    return set_external


@pytest.fixture()
def fresh_registry(monkeypatch):
    """A registry of the factory's own, so building an app doesn't re-register into the suite's."""
    registry = ServiceRegistry()
    monkeypatch.setattr(composition_root, "registry", registry)
    return registry


class TestApiRouters:
    def test_hosting_everything_keeps_the_original_route_order(self, external):
        assert api_routers() == ALL_ROUTERS

    @pytest.mark.parametrize("service_id", sorted(ROUTERS_OF_SERVICE))
    def test_leaves_out_exactly_an_external_services_routers(
        self, external, service_id
    ):
        external(service_id)

        expected = [
            router
            for router in ALL_ROUTERS
            if router not in ROUTERS_OF_SERVICE[service_id]
        ]
        assert api_routers() == expected

    def test_with_every_service_external_only_cores_own_routers_remain(self, external):
        external(",".join(ROUTERS_OF_SERVICE))

        assert api_routers() == [
            notifications.router,
            settings_router.router,
            offline_map.router,
            app_sections.router,
            registry_router.router,
            settings_secrets.router,
        ]


class TestCreateCoreApp:
    def test_serves_every_api_route_before_the_spa_catch_all(
        self, external, fresh_registry
    ):
        app = create_core_app()

        paths = [route.path for route in app.routes]
        assert paths[-1] == "/{full_path:path}"
        assert set(paths_of(space.router)) <= set(paths)

    def test_registers_the_hosted_manifests_as_core(self, external, fresh_registry):
        create_core_app()

        registered = fresh_registry.services()
        assert [service.manifest.id for service in registered] == [
            manifest.id for manifest in backend.modules.MANIFESTS
        ]
        assert {service.instance_id for service in registered} == {"core"}

    def test_withholds_the_remotes_of_external_services(self, external, fresh_registry):
        external("space,sea")

        app = create_core_app()

        remotes = next(
            route for route in app.routes if getattr(route, "path", "") == "/remotes"
        )
        assert remotes.app.withheld == frozenset({"space", "sea"})
        assert not set(paths_of(space.router)) & {route.path for route in app.routes}

    def test_refuses_a_service_that_cannot_run_on_its_own(
        self, external, fresh_registry
    ):
        external("core")

        with pytest.raises(ValueError, match="core"):
            create_core_app()

    def test_health_reports_ok_with_a_millisecond_timestamp(
        self, external, fresh_registry
    ):
        response = TestClient(create_core_app()).get("/health")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        # Milliseconds since the epoch: 13 digits until the year 2286.
        assert isinstance(body["timestamp"], int) and len(str(body["timestamp"])) == 13

    def test_keeps_the_api_docs_under_api(self, external, fresh_registry):
        app = create_core_app()

        assert (app.docs_url, app.redoc_url, app.openapi_url) == (
            "/api/docs",
            "/api/redoc",
            "/api/openapi.json",
        )


class TestLifespan:
    async def test_runs_every_hosted_module_lifecycle_for_the_life_of_the_app(
        self, external, fresh_registry, monkeypatch
    ):
        calls: list[str] = []

        def recording(name: str) -> ModuleLifecycle:
            async def prepare() -> None:
                calls.append(f"{name}.prepare")

            async def start() -> None:
                calls.append(f"{name}.start")

            async def stop() -> None:
                calls.append(f"{name}.stop")

            return ModuleLifecycle(name=name, prepare=prepare, start=start, stop=stop)

        monkeypatch.setattr(
            backend.modules, "MODULES", (recording("first"), recording("second"))
        )
        app = create_core_app()

        async with app.router.lifespan_context(app):
            assert calls == [
                "first.prepare",
                "second.prepare",
                "first.start",
                "second.start",
            ]

        assert calls[4:] == ["second.stop", "first.stop"]
