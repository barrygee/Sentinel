"""A service finding another by kind through core's registry (backend/platform/sdk/discovery.py)."""

import httpx
import pytest

from backend.config import settings
from backend.platform.sdk import discovery as discovery_module
from backend.platform.sdk.discovery import (
    DiscoveredService,
    RegistryUnavailable,
    list_registered_services,
)
from tests.backend.service_credentials_test_helpers import bearer, present_credential

CORE_URL = "https://core.test:8443"


@pytest.fixture(autouse=True)
def service_settings(monkeypatch, tmp_path):
    # A trailing slash, as an operator might write it: the path must still join cleanly.
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL + "/")
    present_credential(monkeypatch, tmp_path, "sdr-manager-remote")


def answer_with(monkeypatch, answer) -> list[httpx.Request]:
    """Route the module's httpx client through `answer`; returns the requests it saw."""
    received: list[httpx.Request] = []

    def recording(request: httpx.Request) -> httpx.Response:
        received.append(request)
        return answer(request)

    real_client = httpx.AsyncClient

    class MockedAsyncClient(real_client):
        def __init__(self, *args, **kwargs) -> None:
            kwargs["transport"] = httpx.MockTransport(recording)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(discovery_module.httpx, "AsyncClient", MockedAsyncClient)
    return received


def listing(*services: dict) -> httpx.Response:
    return httpx.Response(200, json={"services": list(services)})


LOCAL_SERVICE = {
    "id": "sdr-manager-local",
    "kind": "sdr-manager-local",
    "internalUrl": "http://host.docker.internal:8000",
    "available": True,
}


class TestNoCoreToAsk:
    async def test_core_itself_gets_none_rather_than_an_empty_list(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_core_url", "")
        received = answer_with(monkeypatch, lambda request: listing())

        assert await list_registered_services("sdr-manager-local") is None
        assert received == []

    async def test_without_a_credential_it_raises_without_calling_core(
        self, monkeypatch
    ):
        monkeypatch.setattr(settings, "service_http_credentials_file", "")
        received = answer_with(monkeypatch, lambda request: listing())

        with pytest.raises(RegistryUnavailable, match="no HTTP credential"):
            await list_registered_services("sdr-manager-local")
        assert received == []


class TestListing:
    async def test_asks_for_the_kind_with_its_own_credential(self, monkeypatch):
        received = answer_with(monkeypatch, lambda request: listing(LOCAL_SERVICE))

        await list_registered_services("sdr-manager-local")

        (request,) = received
        assert request.method == "GET"
        assert (
            str(request.url)
            == f"{CORE_URL}/internal/registry/services?kind=sdr-manager-local"
        )
        assert (
            request.headers["Authorization"]
            == bearer("sdr-manager-remote")["Authorization"]
        )

    async def test_returns_each_listed_service(self, monkeypatch):
        unavailable = {**LOCAL_SERVICE, "id": "sdr-manager-local-2", "available": False}
        answer_with(monkeypatch, lambda request: listing(LOCAL_SERVICE, unavailable))

        services = await list_registered_services("sdr-manager-local")

        assert services == [
            DiscoveredService(
                id="sdr-manager-local",
                kind="sdr-manager-local",
                internal_url="http://host.docker.internal:8000",
                available=True,
            ),
            DiscoveredService(
                id="sdr-manager-local-2",
                kind="sdr-manager-local",
                internal_url="http://host.docker.internal:8000",
                available=False,
            ),
        ]

    async def test_nothing_registered_is_an_empty_list_not_an_error(self, monkeypatch):
        answer_with(monkeypatch, lambda request: listing())

        assert await list_registered_services("sdr-manager-local") == []


class TestCoreCannotSay:
    async def test_an_unreachable_core_raises(self, monkeypatch):
        def refuse(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        answer_with(monkeypatch, refuse)

        with pytest.raises(RegistryUnavailable, match="core unreachable"):
            await list_registered_services("sdr-manager-local")

    @pytest.mark.parametrize("status_code", [401, 403, 503])
    async def test_a_refusal_raises_with_its_status(self, monkeypatch, status_code):
        answer_with(monkeypatch, lambda request: httpx.Response(status_code))

        with pytest.raises(RegistryUnavailable, match=f"core answered {status_code}"):
            await list_registered_services("sdr-manager-local")

    @pytest.mark.parametrize(
        "response",
        [
            pytest.param(
                httpx.Response(200, text="<html>proxy page</html>"), id="not-json"
            ),
            pytest.param(
                httpx.Response(200, json={"registered": []}), id="no-services-key"
            ),
            pytest.param(
                httpx.Response(200, json={"services": 5}), id="services-not-a-list"
            ),
            pytest.param(
                httpx.Response(200, json={"services": [{"id": "x"}]}),
                id="entry-missing-fields",
            ),
            pytest.param(
                httpx.Response(200, json=["not", "an", "object"]),
                id="body-not-an-object",
            ),
        ],
    )
    async def test_a_malformed_listing_raises_rather_than_reading_as_empty(
        self, monkeypatch, response
    ):
        answer_with(monkeypatch, lambda request: response)

        with pytest.raises(RegistryUnavailable, match="malformed"):
            await list_registered_services("sdr-manager-local")
