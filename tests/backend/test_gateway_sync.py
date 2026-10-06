"""Keeping the gateway's routes in step with the registry (backend/core/gateway_sync.py).

The admin API is faked with an httpx MockTransport that holds the subroute the
way Caddy does, so each test sees exactly which reads and writes core made.
"""

import asyncio
import logging

import httpx
import pytest

from backend.config import settings
from backend.core import gateway_sync as gateway_sync_module
from backend.core.gateway_routes import REGISTRY_ROUTES_ID
from backend.core.gateway_sync import GatewaySync, desired_registry_subroute
from backend.core.service_registry import REGISTRY_CHANGED_SUBJECT, ServiceRegistry
from backend.platform.bus import bus
from backend.platform.service_manifest import ServiceManifest

ADMIN_URL = "http://gateway:2019"
SUBROUTE_URL = f"{ADMIN_URL}/id/{REGISTRY_ROUTES_ID}"


@pytest.fixture(autouse=True)
def fresh_registry(monkeypatch) -> ServiceRegistry:
    registry = ServiceRegistry()
    monkeypatch.setattr(gateway_sync_module, "registry", registry)
    monkeypatch.setattr(settings, "gateway_admin_url", ADMIN_URL)
    monkeypatch.setattr(settings, "core_internal_url", "http://app:8000")
    return registry


def weather_manifest() -> ServiceManifest:
    return ServiceManifest.model_validate(
        {"id": "weather", "kind": "section", "version": "1", "internalUrl": "http://weather:8000", "routes": ["/api/weather/"]}
    )


class FakeCaddyAdmin:
    """Holds the registry subroute like Caddy's admin API; can be told to fail."""

    def __init__(self, held: dict | None = None) -> None:
        # What Caddy starts with: the static config's empty subroute, which it
        # returns without the empty `routes` array.
        self.held = held if held is not None else {"@id": REGISTRY_ROUTES_ID, "handler": "subroute"}
        self.requests: list[tuple[str, str]] = []
        self.fail_with: int | Exception | None = None
        self.fail_patch_with: int | None = None

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append((request.method, str(request.url)))
        if isinstance(self.fail_with, Exception):
            raise self.fail_with
        if self.fail_with is not None:
            return httpx.Response(self.fail_with)
        if request.method == "GET":
            return httpx.Response(200, json=self.held)
        if self.fail_patch_with is not None:
            return httpx.Response(self.fail_patch_with)
        self.held = httpx.Response(200, content=request.content).json()
        return httpx.Response(200)

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handle))

    def methods(self) -> list[str]:
        return [method for method, _url in self.requests]


class TestDesiredSubroute:
    def test_is_the_registry_table_under_the_static_config_s_id(self, fresh_registry):
        fresh_registry.register_in_process([weather_manifest()], instance_id="core")

        desired = desired_registry_subroute()

        assert desired["@id"] == REGISTRY_ROUTES_ID
        assert desired["handler"] == "subroute"
        dials = [route["handle"][-1].get("upstreams") for route in desired["routes"]]
        assert [{"dial": "weather:8000"}] in dials
        assert [{"dial": "app:8000"}] in dials  # core's reserved prefixes


class TestReconcileOnce:
    async def test_pushes_the_desired_routes_into_a_fresh_gateway(self):
        admin = FakeCaddyAdmin()
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is True

        assert admin.requests == [("GET", SUBROUTE_URL), ("PATCH", SUBROUTE_URL)]
        assert admin.held == desired_registry_subroute()

    async def test_leaves_a_gateway_that_already_holds_them_alone(self):
        admin = FakeCaddyAdmin(held=desired_registry_subroute())
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is True

        assert admin.methods() == ["GET"]

    async def test_treats_caddy_omitting_an_empty_routes_array_as_empty(self, monkeypatch):
        empty = {"@id": REGISTRY_ROUTES_ID, "handler": "subroute", "routes": []}
        monkeypatch.setattr(gateway_sync_module, "desired_registry_subroute", lambda: empty)
        admin = FakeCaddyAdmin()  # held has no `routes` key
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is True

        assert admin.methods() == ["GET"]

    async def test_replaces_routes_a_service_no_longer_claims(self, fresh_registry):
        admin = FakeCaddyAdmin()
        sync = GatewaySync()
        fresh_registry.register_in_process([weather_manifest()], instance_id="core")
        async with admin.client() as client:
            await sync.reconcile_once(client)
            fresh_registry._services.pop("weather")
            await sync.reconcile_once(client)

        held_prefixes = [route["match"][0]["path"][0] for route in admin.held["routes"]]
        assert "/api/weather/*" not in held_prefixes
        assert admin.held == desired_registry_subroute()

    async def test_trims_a_trailing_slash_off_the_admin_url(self, monkeypatch):
        monkeypatch.setattr(settings, "gateway_admin_url", ADMIN_URL + "/")
        admin = FakeCaddyAdmin()
        async with admin.client() as client:
            await GatewaySync().reconcile_once(client)

        assert admin.requests[0] == ("GET", SUBROUTE_URL)

    @pytest.mark.parametrize("failure", [500, 404, httpx.ConnectError("refused")])
    async def test_reports_failure_when_the_admin_api_cannot_be_read(self, failure):
        admin = FakeCaddyAdmin()
        admin.fail_with = failure
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is False

        assert admin.methods() == ["GET"]

    async def test_reports_failure_when_the_gateway_refuses_the_routes(self):
        admin = FakeCaddyAdmin()
        admin.fail_patch_with = 400
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is False

        assert admin.methods() == ["GET", "PATCH"]


class TestReconcileLogging:
    async def test_warns_once_while_down_and_logs_the_recovery(self, caplog):
        admin = FakeCaddyAdmin()
        sync = GatewaySync()
        caplog.set_level(logging.INFO, logger=gateway_sync_module.__name__)
        async with admin.client() as client:
            admin.fail_with = 503
            await sync.reconcile_once(client)
            await sync.reconcile_once(client)
            admin.fail_with = None
            await sync.reconcile_once(client)
            await sync.reconcile_once(client)

        messages = [record.getMessage() for record in caplog.records]
        assert len([message for message in messages if "could not sync" in message]) == 1
        assert len([message for message in messages if "routes synced" in message]) == 1

    async def test_a_recovery_with_nothing_to_push_still_re_arms_the_warning(self, caplog):
        # A gateway that comes back already holding the routes (it was only
        # unreachable, not restarted) must count as recovered, or its next
        # outage would go unreported.
        admin = FakeCaddyAdmin(held=desired_registry_subroute())
        sync = GatewaySync()
        caplog.set_level(logging.INFO, logger=gateway_sync_module.__name__)
        async with admin.client() as client:
            admin.fail_with = 503
            await sync.reconcile_once(client)
            admin.fail_with = None
            await sync.reconcile_once(client)
            admin.fail_with = 503
            await sync.reconcile_once(client)

        messages = [record.getMessage() for record in caplog.records]
        assert len([message for message in messages if "could not sync" in message]) == 2
        assert len([message for message in messages if "routes synced" in message]) == 1
        assert "PATCH" not in admin.methods()


class TestLoop:
    @pytest.fixture
    def counted_passes(self, monkeypatch):
        """Replace the admin round-trip with a counter, so the loop runs offline."""
        passes: list[int] = []

        async def count_pass(self, _client):
            passes.append(len(passes))
            return True

        monkeypatch.setattr(GatewaySync, "reconcile_once", count_pass)
        return passes

    async def wait_for(self, condition, timeout: float = 2.0) -> None:
        async with asyncio.timeout(timeout):
            while not condition():
                await asyncio.sleep(0.01)

    async def test_does_nothing_without_a_gateway(self, monkeypatch, counted_passes):
        monkeypatch.setattr(settings, "gateway_admin_url", "")
        sync = GatewaySync()

        sync.start()
        await asyncio.sleep(0.05)

        assert sync._task is None
        assert counted_passes == []
        await sync.stop()  # stopping what never started is fine

    async def test_syncs_at_start_then_on_every_registry_change(self, monkeypatch, counted_passes):
        monkeypatch.setattr(settings, "gateway_sync_interval_s", 60.0)
        sync = GatewaySync()
        sync.start()
        try:
            await self.wait_for(lambda: len(counted_passes) == 1)

            await bus.publish(REGISTRY_CHANGED_SUBJECT, {"id": "weather", "change": "registered"})
            await self.wait_for(lambda: len(counted_passes) == 2)
        finally:
            await sync.stop()

    async def test_re_checks_on_the_interval_with_no_registry_change(self, monkeypatch, counted_passes):
        monkeypatch.setattr(settings, "gateway_sync_interval_s", 0.02)
        sync = GatewaySync()
        sync.start()
        try:
            await self.wait_for(lambda: len(counted_passes) >= 3)
        finally:
            await sync.stop()

    async def test_starting_twice_runs_one_loop(self, monkeypatch, counted_passes):
        monkeypatch.setattr(settings, "gateway_sync_interval_s", 60.0)
        sync = GatewaySync()
        sync.start()
        first_task = sync._task
        sync.start()
        try:
            assert sync._task is first_task
        finally:
            await sync.stop()

    async def test_stop_ends_the_loop_and_stops_listening(self, monkeypatch, counted_passes):
        monkeypatch.setattr(settings, "gateway_sync_interval_s", 60.0)
        sync = GatewaySync()
        sync.start()
        await self.wait_for(lambda: len(counted_passes) == 1)
        task = sync._task

        await sync.stop()
        await bus.publish(REGISTRY_CHANGED_SUBJECT, {"id": "weather", "change": "registered"})
        await asyncio.sleep(0.05)

        assert task is not None and task.done()
        assert sync._task is None
        assert counted_passes == [0]
        # Its registry.changed handler is gone from the bus, not just idle —
        # otherwise every start/stop cycle would leak one (and a NATS watch).
        assert not any(subscription.handler == sync._on_registry_changed for subscription in bus._subscriptions)

    async def test_a_failing_pass_does_not_end_the_loop(self, monkeypatch, caplog):
        monkeypatch.setattr(settings, "gateway_sync_interval_s", 0.02)
        passes: list[int] = []

        async def crash_first(self, _client):
            passes.append(len(passes))
            if len(passes) == 1:
                raise RuntimeError("bug")
            return True

        monkeypatch.setattr(GatewaySync, "reconcile_once", crash_first)
        sync = GatewaySync()
        sync.start()
        try:
            await self.wait_for(lambda: len(passes) >= 2)
        finally:
            await sync.stop()

        assert "route sync pass failed" in caplog.text
