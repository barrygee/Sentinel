"""A service keeping itself registered with core (backend/platform/sdk/registration.py)."""

import asyncio
import json
import socket

import httpx
import pytest

from backend.config import settings
from backend.platform.sdk import registration as registration_module
from backend.platform.sdk.registration import ServiceRegistrar, instance_id
from backend.platform.service_manifest import ServiceManifest

CORE_URL = "http://core.test:8000"


def make_manifest() -> ServiceManifest:
    return ServiceManifest.model_validate(
        {
            "id": "space",
            "kind": "section",
            "version": "1.0.0",
            "internalUrl": "http://space:8000",
            "routes": ["/api/space/"],
        }
    )


@pytest.fixture(autouse=True)
def service_settings(monkeypatch):
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL + "/")
    monkeypatch.setattr(settings, "sentinel_join_token", "the-token")
    monkeypatch.setattr(settings, "sentinel_join_token_file", "")
    monkeypatch.setattr(settings, "service_instance_id", "space-1")


def core_client(answer) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(answer))


class TestInstanceId:
    def test_uses_the_configured_id(self):
        assert instance_id() == "space-1"

    def test_defaults_to_the_host_name(self, monkeypatch):
        monkeypatch.setattr(settings, "service_instance_id", "")

        assert instance_id() == socket.gethostname()


class TestRegisterOnce:
    async def test_posts_the_manifest_with_the_join_token(self):
        received: list[httpx.Request] = []

        def answer(request: httpx.Request) -> httpx.Response:
            received.append(request)
            return httpx.Response(200, json={"id": "space", "available": True, "registeredAt": 1})

        registrar = ServiceRegistrar(make_manifest())
        async with core_client(answer) as client:
            assert await registrar.register_once(client) is True

        (request,) = received
        assert request.method == "POST"
        assert str(request.url) == f"{CORE_URL}/internal/registry/register"
        assert request.headers["Authorization"] == "Bearer the-token"
        assert json.loads(request.content) == {"instanceId": "space-1", "manifest": make_manifest().to_wire()}

    async def test_does_not_call_core_without_a_join_token(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_join_token", "")
        calls: list[httpx.Request] = []

        registrar = ServiceRegistrar(make_manifest())
        async with core_client(lambda request: calls.append(request) or httpx.Response(200)) as client:
            assert await registrar.register_once(client) is False

        assert calls == []

    @pytest.mark.parametrize("status", [401, 409, 422, 503])
    async def test_a_refusal_is_not_a_registration(self, status):
        registrar = ServiceRegistrar(make_manifest())
        async with core_client(lambda request: httpx.Response(status, json={"detail": "no"})) as client:
            assert await registrar.register_once(client) is False

    async def test_an_unreachable_core_is_not_a_registration(self):
        def refuse(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        registrar = ServiceRegistrar(make_manifest())
        async with core_client(refuse) as client:
            assert await registrar.register_once(client) is False


class TestRegistrationLoop:
    async def run_until(self, registrar: ServiceRegistrar, condition) -> None:
        registrar.start()
        try:
            for _ in range(200):
                if condition():
                    return
                await asyncio.sleep(0.005)
            raise AssertionError("condition never met")
        finally:
            await registrar.stop()

    @pytest.fixture
    def fast_intervals(self, monkeypatch):
        monkeypatch.setattr(registration_module, "FIRST_ATTEMPT_RETRY_S", 0.001)
        monkeypatch.setattr(settings, "service_register_interval_s", 0.002)

    @pytest.fixture
    def scripted_core(self, monkeypatch):
        """Core answers with the next scripted outcome on each attempt (the last repeats)."""
        outcomes: list = []
        attempts: list[int] = []
        real_client = httpx.AsyncClient

        def answer(request: httpx.Request) -> httpx.Response:
            outcome = outcomes[min(len(attempts), len(outcomes) - 1)]
            attempts.append(1)
            if isinstance(outcome, Exception):
                raise outcome
            return httpx.Response(outcome, json={"id": "space", "available": True, "registeredAt": 1})

        monkeypatch.setattr(
            registration_module.httpx,
            "AsyncClient",
            lambda **options: real_client(transport=httpx.MockTransport(answer), **options),
        )
        return outcomes, attempts

    async def test_retries_until_core_accepts(self, fast_intervals, scripted_core):
        outcomes, attempts = scripted_core
        outcomes.extend([503, 409, 200])
        registrar = ServiceRegistrar(make_manifest())

        await self.run_until(registrar, lambda: registrar.registered)

        assert len(attempts) >= 3

    async def test_keeps_re_registering_after_success(self, fast_intervals, scripted_core):
        """Core's registry is in memory: the repeat is how a restarted core relearns us."""
        outcomes, attempts = scripted_core
        outcomes.append(200)
        registrar = ServiceRegistrar(make_manifest())

        await self.run_until(registrar, lambda: len(attempts) >= 3)

        assert registrar.registered is True

    async def test_a_lost_registration_is_reported(self, fast_intervals, scripted_core):
        outcomes, attempts = scripted_core
        outcomes.extend([200, 503])
        registrar = ServiceRegistrar(make_manifest())

        await self.run_until(registrar, lambda: len(attempts) >= 2 and not registrar.registered)

    async def test_a_crashing_attempt_does_not_end_the_loop(self, fast_intervals, monkeypatch):
        attempts: list[int] = []

        async def flaky(self, client):
            attempts.append(1)
            if len(attempts) == 1:
                raise RuntimeError("bug in one attempt")
            return True

        monkeypatch.setattr(ServiceRegistrar, "register_once", flaky)
        registrar = ServiceRegistrar(make_manifest())

        await self.run_until(registrar, lambda: registrar.registered)

        assert len(attempts) >= 2

    async def test_start_is_idempotent_and_stop_ends_the_task(self, fast_intervals, scripted_core):
        outcomes, _ = scripted_core
        outcomes.append(200)
        registrar = ServiceRegistrar(make_manifest())

        registrar.start()
        task = registrar._task
        registrar.start()
        assert registrar._task is task

        await registrar.stop()
        assert task is not None and task.done()
        assert registrar._task is None

    async def test_stop_without_start_is_a_no_op(self):
        await ServiceRegistrar(make_manifest()).stop()
