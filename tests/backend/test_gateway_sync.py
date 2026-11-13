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
from backend.core.gateway_routes import (
    HTTPS_REGISTRY_ROUTES_ID,
    REGISTRY_ROUTES_ID,
    REGISTRY_ROUTES_IDS,
)
from backend.core.gateway_sync import GatewaySync, desired_registry_subroute
from backend.core.service_registry import REGISTRY_CHANGED_SUBJECT, ServiceRegistry
from backend.platform.bus import bus
from backend.platform.service_manifest import ServiceManifest

ADMIN_URL = "http://gateway:2019"
SUBROUTE_URL = f"{ADMIN_URL}/id/{REGISTRY_ROUTES_ID}"
HTTPS_SUBROUTE_URL = f"{ADMIN_URL}/id/{HTTPS_REGISTRY_ROUTES_ID}"


@pytest.fixture(autouse=True)
def fresh_registry(monkeypatch) -> ServiceRegistry:
    registry = ServiceRegistry()
    monkeypatch.setattr(gateway_sync_module, "registry", registry)
    monkeypatch.setattr(settings, "gateway_admin_url", ADMIN_URL)
    monkeypatch.setattr(settings, "core_internal_url", "http://app:8000")
    return registry


def weather_manifest() -> ServiceManifest:
    return ServiceManifest.model_validate(
        {
            "id": "weather",
            "kind": "section",
            "version": "1",
            "internalUrl": "http://weather:8000",
            "routes": ["/api/weather/"],
        }
    )


class FakeCaddyAdmin:
    """Holds each registry subroute by id like Caddy's admin API; can be told to fail.

    Caddy holds two: the plain HTTP page's and the HTTPS page's. `fail_ids`
    makes only those ids fail, to show one copy failing leaves the other alone.
    """

    def __init__(
        self, held: dict | None = None, held_by_id: dict[str, dict] | None = None
    ) -> None:
        # What Caddy starts with: the static config's empty subroutes, which it
        # returns without the empty `routes` array.
        if held_by_id is not None:
            self.held = held_by_id
        elif held is not None:
            self.held = {
                subroute_id: {**held, "@id": subroute_id}
                for subroute_id in REGISTRY_ROUTES_IDS
            }
        else:
            self.held = {
                subroute_id: {"@id": subroute_id, "handler": "subroute"}
                for subroute_id in REGISTRY_ROUTES_IDS
            }
        self.requests: list[tuple[str, str]] = []
        self.fail_with: int | Exception | None = None
        self.fail_patch_with: int | None = None
        self.fail_ids: set[str] | None = None

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append((request.method, str(request.url)))
        subroute_id = str(request.url).rsplit("/id/", 1)[1]
        failing = self.fail_ids is None or subroute_id in self.fail_ids
        if failing and isinstance(self.fail_with, Exception):
            raise self.fail_with
        if failing and self.fail_with is not None:
            return httpx.Response(self.fail_with)
        if subroute_id not in self.held:
            return httpx.Response(404)
        if request.method == "GET":
            return httpx.Response(200, json=self.held[subroute_id])
        if failing and self.fail_patch_with is not None:
            return httpx.Response(self.fail_patch_with)
        self.held[subroute_id] = httpx.Response(200, content=request.content).json()
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

    def test_the_https_copy_is_the_same_table_under_its_own_id(self, fresh_registry):
        fresh_registry.register_in_process([weather_manifest()], instance_id="core")

        plain, encrypted = (
            desired_registry_subroute(),
            desired_registry_subroute(HTTPS_REGISTRY_ROUTES_ID),
        )

        assert encrypted["@id"] == HTTPS_REGISTRY_ROUTES_ID
        assert encrypted["routes"] == plain["routes"]
        assert REGISTRY_ROUTES_IDS == (REGISTRY_ROUTES_ID, HTTPS_REGISTRY_ROUTES_ID)


class TestReconcileOnce:
    async def test_pushes_the_desired_routes_into_both_copies_of_a_fresh_gateway(self):
        admin = FakeCaddyAdmin()
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is True

        assert admin.requests == [
            ("GET", SUBROUTE_URL),
            ("PATCH", SUBROUTE_URL),
            ("GET", HTTPS_SUBROUTE_URL),
            ("PATCH", HTTPS_SUBROUTE_URL),
        ]
        assert admin.held[REGISTRY_ROUTES_ID] == desired_registry_subroute()
        assert admin.held[HTTPS_REGISTRY_ROUTES_ID] == desired_registry_subroute(
            HTTPS_REGISTRY_ROUTES_ID
        )

    async def test_leaves_a_gateway_that_already_holds_them_alone(self):
        admin = FakeCaddyAdmin(held=desired_registry_subroute())
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is True

        assert admin.methods() == ["GET", "GET"]

    async def test_fills_in_only_the_copy_that_differs(self):
        admin = FakeCaddyAdmin(
            held_by_id={
                REGISTRY_ROUTES_ID: desired_registry_subroute(),
                HTTPS_REGISTRY_ROUTES_ID: {
                    "@id": HTTPS_REGISTRY_ROUTES_ID,
                    "handler": "subroute",
                },
            }
        )
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is True

        assert admin.requests[-1] == ("PATCH", HTTPS_SUBROUTE_URL)
        assert admin.methods().count("PATCH") == 1

    async def test_treats_caddy_omitting_an_empty_routes_array_as_empty(
        self, monkeypatch
    ):
        def empty(subroute_id=REGISTRY_ROUTES_ID):
            return {"@id": subroute_id, "handler": "subroute", "routes": []}

        monkeypatch.setattr(gateway_sync_module, "desired_registry_subroute", empty)
        admin = FakeCaddyAdmin()  # held has no `routes` key
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is True

        assert admin.methods() == ["GET", "GET"]

    async def test_replaces_routes_a_service_no_longer_claims(self, fresh_registry):
        admin = FakeCaddyAdmin()
        sync = GatewaySync()
        fresh_registry.register_in_process([weather_manifest()], instance_id="core")
        async with admin.client() as client:
            await sync.reconcile_once(client)
            fresh_registry._services.pop("weather")
            await sync.reconcile_once(client)

        for subroute_id in REGISTRY_ROUTES_IDS:
            held_prefixes = [
                route["match"][0]["path"][0]
                for route in admin.held[subroute_id]["routes"]
            ]
            assert "/api/weather/*" not in held_prefixes
            assert admin.held[subroute_id] == desired_registry_subroute(subroute_id)

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

        # Both copies are tried, each once.
        assert admin.methods() == ["GET", "GET"]

    async def test_reports_failure_when_the_gateway_refuses_the_routes(self):
        admin = FakeCaddyAdmin()
        admin.fail_patch_with = 400
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is False

        assert admin.methods() == ["GET", "PATCH", "GET", "PATCH"]

    @pytest.mark.parametrize(
        "failing_id", [REGISTRY_ROUTES_ID, HTTPS_REGISTRY_ROUTES_ID]
    )
    async def test_one_copy_failing_still_syncs_the_other(self, failing_id):
        """The plain page keeps its routes whatever happens to the HTTPS one, and the other way round."""
        admin = FakeCaddyAdmin()
        admin.fail_with = 500
        admin.fail_ids = {failing_id}
        (healthy_id,) = [
            subroute_id
            for subroute_id in REGISTRY_ROUTES_IDS
            if subroute_id != failing_id
        ]
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is False

        assert admin.held[healthy_id] == desired_registry_subroute(healthy_id)

    async def test_a_gateway_from_before_https_still_gets_its_plain_routes(self):
        """A gateway still on the old static config has no HTTPS copy: its 404 fails the pass, not the plain page."""
        admin = FakeCaddyAdmin(
            held_by_id={
                REGISTRY_ROUTES_ID: {"@id": REGISTRY_ROUTES_ID, "handler": "subroute"}
            }
        )
        async with admin.client() as client:
            assert await GatewaySync().reconcile_once(client) is False

        assert admin.held[REGISTRY_ROUTES_ID] == desired_registry_subroute()


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
        assert (
            len([message for message in messages if "could not sync" in message]) == 1
        )
        assert len([message for message in messages if "routes synced" in message]) == 1

    async def test_the_warning_names_each_copy_that_failed(self, caplog):
        admin = FakeCaddyAdmin()
        admin.fail_with = 503
        admin.fail_ids = {HTTPS_REGISTRY_ROUTES_ID}
        caplog.set_level(logging.INFO, logger=gateway_sync_module.__name__)
        async with admin.client() as client:
            await GatewaySync().reconcile_once(client)

        [warning] = [
            record.getMessage()
            for record in caplog.records
            if "could not sync" in record.getMessage()
        ]
        assert f"{HTTPS_REGISTRY_ROUTES_ID}:" in warning
        assert f"{REGISTRY_ROUTES_ID}:" not in warning.replace(
            HTTPS_REGISTRY_ROUTES_ID, ""
        )

    async def test_a_recovery_with_nothing_to_push_still_re_arms_the_warning(
        self, caplog
    ):
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
        assert (
            len([message for message in messages if "could not sync" in message]) == 2
        )
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

    async def test_syncs_at_start_then_on_every_registry_change(
        self, monkeypatch, counted_passes
    ):
        monkeypatch.setattr(settings, "gateway_sync_interval_s", 60.0)
        sync = GatewaySync()
        sync.start()
        try:
            await self.wait_for(lambda: len(counted_passes) == 1)

            await bus.publish(
                REGISTRY_CHANGED_SUBJECT, {"id": "weather", "change": "registered"}
            )
            await self.wait_for(lambda: len(counted_passes) == 2)
        finally:
            await sync.stop()

    async def test_re_checks_on_the_interval_with_no_registry_change(
        self, monkeypatch, counted_passes
    ):
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

    async def test_stop_ends_the_loop_and_stops_listening(
        self, monkeypatch, counted_passes
    ):
        monkeypatch.setattr(settings, "gateway_sync_interval_s", 60.0)
        sync = GatewaySync()
        sync.start()
        await self.wait_for(lambda: len(counted_passes) == 1)
        task = sync._task

        await sync.stop()
        await bus.publish(
            REGISTRY_CHANGED_SUBJECT, {"id": "weather", "change": "registered"}
        )
        await asyncio.sleep(0.05)

        assert task is not None and task.done()
        assert sync._task is None
        assert counted_passes == [0]
        # Its registry.changed handler is gone from the bus, not just idle —
        # otherwise every start/stop cycle would leak one (and a NATS watch).
        assert not any(
            subscription.handler == sync._on_registry_changed
            for subscription in bus._subscriptions
        )

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
