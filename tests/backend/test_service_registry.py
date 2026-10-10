"""The live service registry (backend/core/service_registry.py): registration
rules, ordering, health probes and their announcements."""

import asyncio

import httpx
import pytest

from backend.config import settings
from backend.core import service_registry as service_registry_module
from backend.core.service_registry import (
    REGISTRY_CHANGED_SUBJECT,
    RegistrationConflict,
    ServiceRegistry,
)
from backend.platform.bus import bus
from backend.platform.service_manifest import ServiceManifest


def make_manifest(service_id: str = "weather", **overrides) -> ServiceManifest:
    body = {
        "id": service_id,
        "kind": "section",
        "version": "0.1.0",
        "internalUrl": f"http://{service_id}:8000",
        "routes": [f"/api/{service_id}/"],
    }
    body.update(overrides)
    return ServiceManifest.model_validate(body)


@pytest.fixture
def announced():
    changes: list[dict] = []
    unsubscribe = bus.subscribe(REGISTRY_CHANGED_SUBJECT, changes.append)
    yield changes
    unsubscribe()


def health_client(status_by_host: dict[str, int | Exception]) -> httpx.AsyncClient:
    """A client whose health probes answer per host: a status code, or raise."""
    probed_urls: list[str] = []

    def answer(request: httpx.Request) -> httpx.Response:
        probed_urls.append(str(request.url))
        outcome = status_by_host[request.url.host]
        if isinstance(outcome, Exception):
            raise outcome
        return httpx.Response(outcome)

    client = httpx.AsyncClient(transport=httpx.MockTransport(answer))
    client.probed_urls = probed_urls  # type: ignore[attr-defined]  # test-only record
    return client


class TestRegisterInProcess:
    def test_registers_each_manifest_as_in_process_and_available(self):
        registry = ServiceRegistry()

        registry.register_in_process([make_manifest("air"), make_manifest("sea")], instance_id="core")

        air = registry.get("air")
        assert air is not None and air.in_process and air.available
        assert air.instance_id == "core"
        assert [registration.manifest.id for registration in registry.services()] == ["air", "sea"]

    def test_publishes_nothing(self, announced):
        ServiceRegistry().register_in_process([make_manifest()], instance_id="core")

        assert announced == []

    def test_two_manifests_sharing_a_route_fail_loudly(self):
        registry = ServiceRegistry()

        with pytest.raises(RegistrationConflict, match="already registered by service 'air'"):
            registry.register_in_process(
                [make_manifest("air"), make_manifest("sea", routes=["/api/air/"])],
                instance_id="core",
            )


class TestRegister:
    async def test_registers_an_out_of_process_service_and_announces_it(self, announced):
        registry = ServiceRegistry()

        registration = await registry.register(make_manifest(), "instance-1")

        assert registration.in_process is False
        assert registration.available is True
        assert registration.registered_at_ms > 0
        assert registry.get("weather") is registration
        assert announced == [{"id": "weather", "change": "registered"}]

    async def test_the_same_instance_may_replace_its_registration(self):
        registry = ServiceRegistry()
        await registry.register(make_manifest(version="1.0.0"), "instance-1")

        await registry.register(make_manifest(version="2.0.0"), "instance-1")

        assert registry.get("weather").manifest.version == "2.0.0"

    async def test_another_instance_cannot_take_a_live_id(self):
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")

        with pytest.raises(RegistrationConflict, match="already registered by a live instance"):
            await registry.register(make_manifest(), "instance-2")
        assert registry.get("weather").instance_id == "instance-1"

    async def test_a_service_takes_its_id_over_from_the_monoliths_in_process_copy(self, announced):
        """P6: starting a section's own container is the whole switch — the
        monolith's in-process copy yields rather than refusing it."""
        registry = ServiceRegistry()
        registry.register_in_process([make_manifest("air")], instance_id="core")
        announced.clear()

        registration = await registry.register(make_manifest("air", internalUrl="http://air-svc:8000"), "air-1")

        assert registry.get("air") is registration
        assert registration.in_process is False
        assert registration.instance_id == "air-1"
        assert registration.manifest.internal_url == "http://air-svc:8000"
        assert announced == [{"id": "air", "change": "registered"}]

    async def test_another_live_out_of_process_instance_cannot_take_an_id(self):
        registry = ServiceRegistry()
        registry.register_in_process([make_manifest("air")], instance_id="core")
        await registry.register(make_manifest("air"), "air-1")

        with pytest.raises(RegistrationConflict):
            await registry.register(make_manifest("air"), "air-2")

    async def test_an_unchanged_re_registration_is_a_quiet_no_op(self, announced):
        """Services re-register on an interval; that must not churn the gateway."""
        registry = ServiceRegistry()
        first = await registry.register(make_manifest(), "instance-1")
        first.consecutive_probe_failures = 2
        announced.clear()

        again = await registry.register(make_manifest(), "instance-1")

        assert again is first
        assert again.consecutive_probe_failures == 2
        assert announced == []

    async def test_a_re_registration_with_a_changed_manifest_replaces_and_announces(self, announced):
        registry = ServiceRegistry()
        first = await registry.register(make_manifest(), "instance-1")
        announced.clear()

        again = await registry.register(make_manifest(version="0.2.0"), "instance-1")

        assert again is not first
        assert again.manifest.version == "0.2.0"
        assert announced == [{"id": "weather", "change": "registered"}]

    async def test_a_re_registration_of_an_unavailable_service_revives_and_announces(self, announced):
        registry = ServiceRegistry()
        first = await registry.register(make_manifest(), "instance-1")
        first.available = False
        announced.clear()

        again = await registry.register(make_manifest(), "instance-1")

        assert again is not first
        assert again.available is True
        assert announced == [{"id": "weather", "change": "registered"}]

    async def test_another_instance_may_take_an_id_whose_holder_is_down(self):
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")
        registry.get("weather").available = False

        registration = await registry.register(make_manifest(), "instance-2")

        assert registration.instance_id == "instance-2"
        assert registration.available is True

    async def test_a_route_held_by_another_service_is_refused(self):
        registry = ServiceRegistry()
        registry.register_in_process([make_manifest("sea")], instance_id="core")

        with pytest.raises(RegistrationConflict, match="route '/api/sea/' is already registered by service 'sea'"):
            await registry.register(make_manifest("weather", routes=["/api/weather/", "/api/sea/"]), "instance-1")
        assert registry.get("weather") is None

    async def test_a_longer_prefix_inside_another_services_route_is_allowed(self):
        """The radio hub's /api/sdr/radios sits inside the SDR section's /api/sdr/."""
        registry = ServiceRegistry()
        registry.register_in_process([make_manifest("sdr")], instance_id="core")

        await registry.register(make_manifest("radio-hub", kind="radio-hub", routes=["/api/sdr/radios"]), "hub-1")

        assert registry.get("radio-hub") is not None

    async def test_a_service_may_keep_its_own_routes_when_re_registering(self):
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")

        await registry.register(make_manifest(), "instance-1")

        assert registry.get("weather").manifest.routes == ["/api/weather/"]


class TestReads:
    async def test_services_are_in_nav_order_then_id(self):
        registry = ServiceRegistry()
        registry.register_in_process(
            [
                make_manifest("sdr", navOrder=50),
                make_manifest("zulu", navOrder=10),
                make_manifest("air", navOrder=10),
            ],
            instance_id="core",
        )

        assert [registration.manifest.id for registration in registry.services()] == ["air", "zulu", "sdr"]

    def test_get_of_an_unknown_id_is_none(self):
        assert ServiceRegistry().get("nope") is None


class TestProbes:
    async def test_probes_only_out_of_process_services_at_their_health_url(self):
        registry = ServiceRegistry()
        registry.register_in_process([make_manifest("air")], instance_id="core")
        await registry.register(make_manifest("weather", health="/healthz"), "instance-1")

        async with health_client({"weather": 200}) as client:
            await registry.probe_once(client)

            assert client.probed_urls == ["http://weather:8000/healthz"]

    async def test_with_nothing_out_of_process_probes_nothing(self):
        registry = ServiceRegistry()
        registry.register_in_process([make_manifest("air")], instance_id="core")

        async with health_client({}) as client:
            await registry.probe_once(client)

            assert client.probed_urls == []

    @pytest.mark.parametrize(
        "failure",
        [500, 404, httpx.ConnectError("refused"), httpx.ReadTimeout("slow")],
    )
    async def test_marks_unavailable_only_after_the_configured_failures_in_a_row(self, failure, announced):
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")
        announced.clear()

        async with health_client({"weather": failure}) as client:
            for _ in range(settings.registry_probe_failures - 1):
                await registry.probe_once(client)
            assert registry.get("weather").available is True

            await registry.probe_once(client)

        assert registry.get("weather").available is False
        assert announced == [{"id": "weather", "change": "unavailable"}]

    async def test_keeps_counting_while_down_but_announces_once(self, announced):
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")
        announced.clear()

        async with health_client({"weather": 503}) as client:
            for _ in range(settings.registry_probe_failures + 2):
                await registry.probe_once(client)

        assert registry.get("weather").consecutive_probe_failures == settings.registry_probe_failures + 2
        assert announced == [{"id": "weather", "change": "unavailable"}]

    async def test_a_good_probe_resets_the_failure_count(self):
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")
        status = {"weather": 500}

        async with health_client(status) as client:
            for _ in range(settings.registry_probe_failures - 1):
                await registry.probe_once(client)
            status["weather"] = 200
            await registry.probe_once(client)
            status["weather"] = 500
            for _ in range(settings.registry_probe_failures - 1):
                await registry.probe_once(client)

        assert registry.get("weather").available is True

    async def test_comes_back_available_on_its_next_good_probe(self, announced):
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")
        registration = registry.get("weather")
        registration.available = False
        registration.consecutive_probe_failures = 7
        announced.clear()

        async with health_client({"weather": 204}) as client:
            await registry.probe_once(client)

        assert registration.available is True
        assert registration.consecutive_probe_failures == 0
        assert announced == [{"id": "weather", "change": "available"}]

    async def test_a_healthy_service_that_stays_up_is_not_re_announced(self, announced):
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")
        announced.clear()

        async with health_client({"weather": 200}) as client:
            await registry.probe_once(client)

        assert announced == []

    async def test_a_result_for_a_replaced_registration_is_discarded(self, announced):
        """A service that re-registers while its probe is in flight must not be
        marked down by the probe of the registration it replaced."""
        registry = ServiceRegistry()
        await registry.register(make_manifest(), "instance-1")
        original = registry.get("weather")
        original.consecutive_probe_failures = settings.registry_probe_failures - 1
        announced.clear()

        async def answer_after_re_registration(request: httpx.Request) -> httpx.Response:
            # A changed manifest (a restart with a new version), so the
            # registration really is replaced rather than refreshed in place.
            await registry.register(make_manifest(version="0.2.0"), "instance-1")
            return httpx.Response(500)

        transport = httpx.MockTransport(answer_after_re_registration)
        async with httpx.AsyncClient(transport=transport) as client:
            await registry.probe_once(client)

        replacement = registry.get("weather")
        assert replacement is not original
        assert replacement.available is True
        assert replacement.consecutive_probe_failures == 0
        assert original.consecutive_probe_failures == settings.registry_probe_failures - 1
        assert original.available is True
        assert announced == [{"id": "weather", "change": "registered"}]

    async def test_one_failing_service_does_not_affect_another(self):
        registry = ServiceRegistry()
        await registry.register(make_manifest("weather"), "instance-1")
        await registry.register(make_manifest("tides"), "instance-2")

        async with health_client({"weather": 500, "tides": 200}) as client:
            for _ in range(settings.registry_probe_failures):
                await registry.probe_once(client)

        assert registry.get("weather").available is False
        assert registry.get("tides").available is True


class TestProbeLoop:
    async def test_start_probes_on_the_interval_until_stopped(self, monkeypatch):
        registry = ServiceRegistry()
        rounds: list[int] = []

        async def count_round(client: httpx.AsyncClient) -> None:
            rounds.append(1)

        monkeypatch.setattr(registry, "probe_once", count_round)
        monkeypatch.setattr(settings, "registry_probe_interval_s", 0.01)

        registry.start()
        await asyncio.sleep(0.1)
        await registry.stop()
        rounds_when_stopped = len(rounds)
        await asyncio.sleep(0.05)

        assert rounds_when_stopped >= 2
        assert len(rounds) == rounds_when_stopped

    async def test_a_failing_round_does_not_end_probing(self, monkeypatch):
        registry = ServiceRegistry()
        rounds: list[int] = []

        async def fail_round(client: httpx.AsyncClient) -> None:
            rounds.append(1)
            raise RuntimeError("boom")

        monkeypatch.setattr(registry, "probe_once", fail_round)
        monkeypatch.setattr(settings, "registry_probe_interval_s", 0.01)

        registry.start()
        await asyncio.sleep(0.1)
        await registry.stop()

        assert len(rounds) >= 2

    async def test_start_twice_runs_one_loop(self, monkeypatch):
        registry = ServiceRegistry()
        monkeypatch.setattr(settings, "registry_probe_interval_s", 10)

        registry.start()
        first_task = registry._probe_task
        registry.start()

        assert registry._probe_task is first_task
        await registry.stop()
        assert first_task.cancelled()

    async def test_start_after_the_loop_ended_starts_a_new_one(self, monkeypatch):
        registry = ServiceRegistry()
        monkeypatch.setattr(settings, "registry_probe_interval_s", 10)
        registry.start()
        first_task = registry._probe_task
        first_task.cancel()
        await asyncio.gather(first_task, return_exceptions=True)

        registry.start()

        assert registry._probe_task is not first_task
        await registry.stop()

    async def test_stop_without_start_is_a_no_op(self):
        await ServiceRegistry().stop()


def test_the_module_exposes_one_process_wide_registry():
    assert isinstance(service_registry_module.registry, ServiceRegistry)
