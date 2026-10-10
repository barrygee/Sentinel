"""The service factory (backend/platform/sdk/__init__.py): what a standalone
section serves, the address it advertises, and the order its lifecycle runs in."""

import asyncio

import httpx
import pytest
from fastapi import APIRouter, Query

from backend.config import settings
from backend.platform import sdk as sdk_module
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.sdk import ServiceMisconfigured, advertised_manifest, create_service
from backend.platform.sdk.registration import ServiceRegistrar
from backend.platform.service_manifest import ServiceManifest


def make_manifest(**overrides) -> ServiceManifest:
    body = {
        "id": "space",
        "kind": "section",
        "version": "2.0.0",
        "displayName": "SPACE",
        "internalUrl": "http://app:8000",
        "routes": ["/api/space/"],
        "ui": {"remoteEntry": "/remotes/space/remoteEntry.js", "exposes": ["./register"]},
    }
    body.update(overrides)
    return ServiceManifest.model_validate(body)


def make_router() -> APIRouter:
    router = APIRouter(prefix="/api/space")

    @router.get("/echo")
    async def echo(count: int = Query(...)):
        return {"count": count}

    return router


@pytest.fixture(autouse=True)
def service_settings(monkeypatch):
    monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
    monkeypatch.setattr(settings, "service_internal_url", "http://space:8000/")
    monkeypatch.setattr(settings, "nats_url", "")


def client_for(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://space:8000")


class TestAdvertisedManifest:
    def test_advertises_this_containers_address(self):
        advertised = advertised_manifest(make_manifest())

        assert advertised.internal_url == "http://space:8000"
        assert advertised.routes == ["/api/space/"]
        assert advertised.version == "2.0.0"

    def test_needs_cores_address(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_core_url", "")

        with pytest.raises(ServiceMisconfigured, match="SENTINEL_CORE_URL"):
            advertised_manifest(make_manifest())

    def test_needs_its_own_address(self, monkeypatch):
        monkeypatch.setattr(settings, "service_internal_url", "")

        with pytest.raises(ServiceMisconfigured, match="SERVICE_INTERNAL_URL"):
            advertised_manifest(make_manifest())

    def test_a_bad_address_fails_at_startup(self, monkeypatch):
        monkeypatch.setattr(settings, "service_internal_url", "ftp://space")

        with pytest.raises(ValueError, match="internalUrl"):
            advertised_manifest(make_manifest())


class TestServedRoutes:
    async def test_serves_the_sections_routers(self):
        app = create_service(manifest=make_manifest(), routers=[make_router()], lifecycles=[])

        async with client_for(app) as client:
            response = await client.get("/api/space/echo", params={"count": 3})

        assert response.json() == {"count": 3}

    async def test_validation_errors_use_the_apps_error_shape(self):
        app = create_service(manifest=make_manifest(), routers=[make_router()], lifecycles=[])

        async with client_for(app) as client:
            response = await client.get("/api/space/echo", params={"count": "many"})

        assert response.status_code == 422
        assert "detail" in response.json()

    async def test_health_reports_the_service_and_its_registration(self):
        app = create_service(manifest=make_manifest(), routers=[], lifecycles=[])

        async with client_for(app) as client:
            before = (await client.get("/health")).json()
            app.state.registrar.registered = True
            after = (await client.get("/health")).json()

        assert before["status"] == "ok"
        assert before["service"] == "space"
        assert before["registered"] is False
        assert isinstance(before["timestamp"], int)
        assert after["registered"] is True

    async def test_health_is_served_on_the_manifests_path(self):
        app = create_service(manifest=make_manifest(health="/healthz"), routers=[], lifecycles=[])

        async with client_for(app) as client:
            assert (await client.get("/healthz")).status_code == 200

    async def test_no_api_docs_are_served(self):
        app = create_service(manifest=make_manifest(), routers=[], lifecycles=[])

        async with client_for(app) as client:
            for path in ("/docs", "/redoc", "/openapi.json", "/api/docs"):
                assert (await client.get(path)).status_code == 404

    async def test_serves_its_own_remote_uncached(self, tmp_path):
        (tmp_path / "remoteEntry.js").write_text("export const entry = 1")
        (tmp_path / "chunk-abc.js").write_text("export const chunk = 1")
        app = create_service(manifest=make_manifest(), routers=[], lifecycles=[], remote_dir=tmp_path)

        async with client_for(app) as client:
            entry = await client.get("/remotes/space/remoteEntry.js")
            chunk = await client.get("/remotes/space/chunk-abc.js")

        assert entry.status_code == 200
        assert entry.headers["cache-control"] == "no-cache, no-store, must-revalidate"
        assert chunk.status_code == 200
        assert "no-store" not in chunk.headers.get("cache-control", "")

    async def test_a_remote_that_is_not_built_yet_is_a_404(self, tmp_path):
        app = create_service(manifest=make_manifest(), routers=[], lifecycles=[], remote_dir=tmp_path / "missing")

        async with client_for(app) as client:
            assert (await client.get("/remotes/space/remoteEntry.js")).status_code == 404

    async def test_a_service_without_ui_serves_no_remote(self, tmp_path):
        (tmp_path / "remoteEntry.js").write_text("export const entry = 1")
        manifest = make_manifest(id="radio-hub", kind="radio-hub", ui=None, routes=["/api/sdr/radios"])
        app = create_service(manifest=manifest, routers=[], lifecycles=[], remote_dir=tmp_path)

        async with client_for(app) as client:
            assert (await client.get("/remotes/radio-hub/remoteEntry.js")).status_code == 404

    def test_registers_the_advertised_manifest(self):
        app = create_service(manifest=make_manifest(), routers=[], lifecycles=[])

        assert app.state.registrar.manifest.internal_url == "http://space:8000"


class TestLifespan:
    @pytest.fixture
    def calls(self, monkeypatch) -> list[str]:
        calls: list[str] = []

        async def stop(self):
            calls.append("registration.stop")

        monkeypatch.setattr(ServiceRegistrar, "start", lambda self: calls.append("registration.start"))
        monkeypatch.setattr(ServiceRegistrar, "stop", stop)
        return calls

    def section_lifecycle(self, calls: list[str]) -> ModuleLifecycle:
        async def prepare():
            calls.append("section.prepare")

        async def start():
            calls.append("section.start")

        async def stop():
            calls.append("section.stop")

        return ModuleLifecycle(name="space", prepare=prepare, start=start, stop=stop)

    async def test_the_section_runs_before_registration_and_stops_after_it(self, calls):
        app = create_service(manifest=make_manifest(), routers=[], lifecycles=[self.section_lifecycle(calls)])

        async with app.router.lifespan_context(app):
            assert calls == ["section.prepare", "section.start", "registration.start"]

        assert calls[3:] == ["registration.stop", "section.stop"]

    async def test_waits_for_core_before_any_section_work(self, calls, monkeypatch):
        async def wait_for_core(waiting_for):
            calls.append(f"core-ready: {waiting_for}")

        monkeypatch.setattr(sdk_module, "wait_for_core", wait_for_core)
        app = create_service(
            manifest=make_manifest(),
            routers=[],
            lifecycles=[self.section_lifecycle(calls)],
        )

        async with app.router.lifespan_context(app):
            assert calls == [
                "core-ready: space service startup",
                "section.prepare",
                "section.start",
                "registration.start",
            ]

    async def test_nothing_starts_while_core_does_not_answer(self, calls, monkeypatch):
        core_answered = asyncio.Event()
        waiting = asyncio.Event()

        async def wait_for_core(waiting_for):
            waiting.set()
            await core_answered.wait()

        monkeypatch.setattr(sdk_module, "wait_for_core", wait_for_core)
        app = create_service(
            manifest=make_manifest(),
            routers=[],
            lifecycles=[self.section_lifecycle(calls)],
        )
        started = asyncio.Event()

        async def run_service():
            async with app.router.lifespan_context(app):
                started.set()

        service = asyncio.create_task(run_service())
        await asyncio.wait_for(waiting.wait(), timeout=5)  # fails, not hangs, if it never waits
        await asyncio.sleep(0.05)
        assert calls == []  # no prepare, no start, no registration
        assert not started.is_set()

        core_answered.set()
        await asyncio.wait_for(service, timeout=5)
        assert calls[:3] == ["section.prepare", "section.start", "registration.start"]

    async def test_connects_the_bus_to_nats_when_configured(self, calls, monkeypatch):
        transports: list = []

        class FakeTransport:
            def __init__(self, bus, url, *, client_name, open_session):
                self.url, self.client_name = url, client_name
                transports.append(self)

            async def start(self):
                calls.append("bus.start")

            async def stop(self):
                calls.append("bus.stop")

        monkeypatch.setattr(settings, "nats_url", "nats://nats:4222")
        monkeypatch.setattr(sdk_module, "NatsTransport", FakeTransport)
        app = create_service(manifest=make_manifest(), routers=[], lifecycles=[self.section_lifecycle(calls)])

        async with app.router.lifespan_context(app):
            pass

        (transport,) = transports
        assert transport.url == "nats://nats:4222"
        assert transport.client_name == "sentinel-space"
        # Every prepare runs first; then the bus is the first thing started and
        # the last stopped, so the section only ever publishes onto a connected bus.
        assert calls == [
            "section.prepare",
            "bus.start",
            "section.start",
            "registration.start",
            "registration.stop",
            "section.stop",
            "bus.stop",
        ]

    async def test_without_nats_the_bus_stays_in_process(self, calls, monkeypatch):
        def must_not_connect(*args, **kwargs):
            raise AssertionError("NATS must not be used without NATS_URL")

        monkeypatch.setattr(sdk_module, "NatsTransport", must_not_connect)
        app = create_service(manifest=make_manifest(), routers=[], lifecycles=[])

        async with app.router.lifespan_context(app):
            pass

        assert calls == ["registration.start", "registration.stop"]
