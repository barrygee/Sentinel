"""POST /internal/registry/register (backend/core/registry_router.py).

The endpoint lets a service claim gateway routes and a remote the shell will
run, so the credential gate and every refusal are pinned here.
"""

import pytest
from fastapi.testclient import TestClient

from backend.config import settings
from backend.core import registry_router
from backend.core.service_registry import ServiceRegistry
from tests.in_process_app import app
from backend.platform.service_manifest import ServiceManifest
from tests.backend.service_credentials_test_helpers import (
    TOKENS,
    accept_callers,
    bearer,
)

REGISTER_URL = "/internal/registry/register"
# Core may register any id, so the registry's own behaviour is tested with its credential.
AUTHORIZED = bearer("core")


@pytest.fixture
def isolated_registry(monkeypatch: pytest.MonkeyPatch, tmp_path) -> ServiceRegistry:
    """A fresh registry holding one in-process section, swapped in for the app's."""
    registry = ServiceRegistry()
    registry.register_in_process(
        [
            ServiceManifest.model_validate(
                {
                    "id": "sea",
                    "kind": "section",
                    "version": "1.0.0",
                    "internalUrl": "http://app:8000",
                    "routes": ["/api/sea/"],
                }
            )
        ],
        instance_id="core",
    )
    monkeypatch.setattr(registry_router, "registry", registry)
    accept_callers(monkeypatch, tmp_path)
    return registry


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def registration(instance_id: str = "weather-1", **manifest_overrides) -> dict:
    manifest = {
        "id": "weather",
        "kind": "section",
        "version": "0.1.0",
        "navOrder": 60,
        "internalUrl": "http://weather:8000",
        "routes": ["/api/weather/"],
        "ui": {"remoteEntry": "/remotes/weather/remoteEntry.js"},
    }
    manifest.update(manifest_overrides)
    return {"instanceId": instance_id, "manifest": manifest}


class TestCredential:
    def test_disabled_when_core_accepts_no_callers(
        self, isolated_registry, client, monkeypatch
    ):
        monkeypatch.setattr(settings, "accepted_callers_file", "")

        response = client.post(REGISTER_URL, json=registration(), headers=AUTHORIZED)

        assert response.status_code == 503
        assert isolated_registry.get("weather") is None

    @pytest.mark.parametrize(
        "headers",
        [
            {},
            {"Authorization": "Bearer wrong-token"},
            {"Authorization": TOKENS["core"]},
            {"Authorization": f"Basic {TOKENS['core']}"},
            {"Authorization": f"bearer {TOKENS['core']}"},
            {"Authorization": f"Bearer {TOKENS['core']}x"},
            {"Authorization": "Bearer "},
        ],
    )
    def test_refuses_a_missing_or_wrong_credential(
        self, isolated_registry, client, headers
    ):
        response = client.post(REGISTER_URL, json=registration(), headers=headers)

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid service credential"}
        assert isolated_registry.get("weather") is None

    def test_the_error_never_echoes_a_credential(self, isolated_registry, client):
        response = client.post(
            REGISTER_URL, json=registration(), headers={"Authorization": "Bearer x"}
        )

        assert all(token not in response.text for token in TOKENS.values())

    def test_a_service_registers_its_own_id(self, isolated_registry, client):
        response = client.post(
            REGISTER_URL,
            json=registration(
                "space-1",
                id="space",
                routes=["/api/space/"],
                internalUrl="http://space:8000",
                ui=None,
            ),
            headers=bearer("space"),
        )

        assert response.status_code == 200
        assert isolated_registry.get("space").instance_id == "space-1"

    @pytest.mark.parametrize("caller", ["space", "sdr", "radio", "stub-decoder"])
    def test_a_credential_cannot_register_another_services_id(
        self, isolated_registry, client, caller
    ):
        response = client.post(
            REGISTER_URL, json=registration(), headers=bearer(caller)
        )

        assert response.status_code == 403
        assert isolated_registry.get("weather") is None

    def test_another_service_cannot_take_over_a_live_section(
        self, isolated_registry, client
    ):
        response = client.post(
            REGISTER_URL,
            json=registration(
                "evil-1",
                id="sea",
                routes=["/api/sea/"],
                internalUrl="http://evil:8000",
                ui=None,
            ),
            headers=bearer("air"),
        )

        assert response.status_code == 403
        assert isolated_registry.get("sea").instance_id == "core"


class TestRegister:
    def test_registers_a_service_and_returns_what_was_recorded(self, isolated_registry, client):
        response = client.post(REGISTER_URL, json=registration(), headers=AUTHORIZED)

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == "weather"
        assert body["available"] is True
        assert isinstance(body["registeredAt"], int) and body["registeredAt"] > 0
        recorded = isolated_registry.get("weather")
        assert recorded.instance_id == "weather-1"
        assert recorded.in_process is False
        assert recorded.manifest.internal_url == "http://weather:8000"

    def test_the_same_instance_may_register_again(self, isolated_registry, client):
        client.post(REGISTER_URL, json=registration(version="1.0.0"), headers=AUTHORIZED)

        response = client.post(REGISTER_URL, json=registration(version="1.1.0"), headers=AUTHORIZED)

        assert response.status_code == 200
        assert isolated_registry.get("weather").manifest.version == "1.1.0"

    def test_a_live_id_from_another_instance_is_a_conflict(self, isolated_registry, client):
        client.post(REGISTER_URL, json=registration("weather-1"), headers=AUTHORIZED)

        response = client.post(REGISTER_URL, json=registration("weather-2"), headers=AUTHORIZED)

        assert response.status_code == 409
        assert "already registered by a live instance" in response.json()["detail"]
        assert isolated_registry.get("weather").instance_id == "weather-1"

    def test_a_service_takes_its_section_over_from_the_monolith(self, isolated_registry, client):
        response = client.post(
            REGISTER_URL,
            json=registration("sea-1", id="sea", routes=["/api/sea/"], internalUrl="http://sea:8000", ui=None),
            headers=AUTHORIZED,
        )

        assert response.status_code == 200
        taken_over = isolated_registry.get("sea")
        assert taken_over.in_process is False
        assert taken_over.manifest.internal_url == "http://sea:8000"

    def test_a_route_another_service_holds_is_a_conflict(self, isolated_registry, client):
        response = client.post(
            REGISTER_URL, json=registration(routes=["/api/weather/", "/api/sea/"]), headers=AUTHORIZED
        )

        assert response.status_code == 409
        assert response.json()["detail"] == "route '/api/sea/' is already registered by service 'sea'"
        assert isolated_registry.get("weather") is None

    @pytest.mark.parametrize(
        "body",
        [
            registration(routes=["/api/app/"]),
            registration(id="Bad"),
            registration(internalUrl="file:///etc/passwd"),
            registration(ui={"remoteEntry": "https://evil.example/remoteEntry.js"}),
            registration(contracts="^2"),
            {"instanceId": "", "manifest": registration()["manifest"]},
            {"instanceId": "x" * 129, "manifest": registration()["manifest"]},
            {"manifest": registration()["manifest"]},
            {"instanceId": "weather-1"},
        ],
    )
    def test_an_invalid_request_is_unprocessable(self, isolated_registry, client, body):
        response = client.post(REGISTER_URL, json=body, headers=AUTHORIZED)

        assert response.status_code == 422
        assert isolated_registry.get("weather") is None


def test_the_endpoint_is_not_in_the_public_api_schema(client):
    assert REGISTER_URL not in client.get("/api/openapi.json").json()["paths"]



# ── GET /internal/registry/services ───────────────────────────────────────────

LIST_URL = "/internal/registry/services"


def register_sdr_manager_local(client: TestClient, **manifest_overrides) -> None:
    """Register an sdr-manager-local through the endpoint, as core may for any id."""
    body = registration(
        "sdr-manager-local-1",
        id="sdr-manager-local",
        kind="sdr-manager-local",
        internalUrl="http://host.docker.internal:8000",
        routes=["/api/sdr-manager/local/"],
        ui={"remoteEntry": "/remotes/sdr-manager-local/remoteEntry.js"},
        **manifest_overrides,
    )
    assert client.post(REGISTER_URL, json=body, headers=AUTHORIZED).status_code == 200


class TestListServicesCredential:
    def test_disabled_when_core_accepts_no_callers(self, isolated_registry, client, monkeypatch):
        monkeypatch.setattr(settings, "accepted_callers_file", "")

        response = client.get(LIST_URL, params={"kind": "sdr-manager-local"}, headers=bearer("sdr-manager-remote"))

        assert response.status_code == 503

    @pytest.mark.parametrize(
        "headers",
        [
            {},
            {"Authorization": "Bearer wrong-token"},
            {"Authorization": TOKENS["sdr-manager-remote"]},
            {"Authorization": f"Bearer {TOKENS['sdr-manager-remote']}x"},
        ],
    )
    def test_refuses_a_missing_or_wrong_credential(self, isolated_registry, client, headers):
        register_sdr_manager_local(client)

        response = client.get(LIST_URL, params={"kind": "sdr-manager-local"}, headers=headers)

        assert response.status_code == 401
        assert "host.docker.internal" not in response.text

    @pytest.mark.parametrize("caller", ["air", "sdr", "radio", "sdr-manager-local", "docs", "stub-decoder"])
    def test_a_caller_without_the_grant_is_forbidden(self, isolated_registry, client, caller):
        register_sdr_manager_local(client)

        response = client.get(LIST_URL, params={"kind": "sdr-manager-local"}, headers=bearer(caller))

        assert response.status_code == 403
        assert "host.docker.internal" not in response.text

    @pytest.mark.parametrize("kind", ["section", "radio", "sdr-manager-remote", "no-such-kind"])
    def test_sdr_manager_remote_may_list_no_other_kind(self, isolated_registry, client, kind):
        response = client.get(LIST_URL, params={"kind": kind}, headers=bearer("sdr-manager-remote"))

        # A known and an unknown kind answer alike, so nothing is learned from the refusal.
        assert response.status_code == 403
        assert response.json() == {"detail": "This service may not do that"}

    @pytest.mark.parametrize("params", [{}, {"kind": ""}, {"kind": "x" * 33}])
    def test_a_missing_or_unbounded_kind_is_unprocessable(self, isolated_registry, client, params):
        response = client.get(LIST_URL, params=params, headers=bearer("sdr-manager-remote"))

        assert response.status_code == 422


class TestListServices:
    def test_lists_the_registered_services_of_the_kind(self, isolated_registry, client):
        register_sdr_manager_local(client)

        response = client.get(LIST_URL, params={"kind": "sdr-manager-local"}, headers=bearer("sdr-manager-remote"))

        assert response.status_code == 200
        assert response.json() == {
            "services": [
                {
                    "id": "sdr-manager-local",
                    "kind": "sdr-manager-local",
                    "internalUrl": "http://host.docker.internal:8000",
                    "available": True,
                }
            ]
        }

    def test_an_empty_list_when_none_is_registered(self, isolated_registry, client):
        response = client.get(LIST_URL, params={"kind": "sdr-manager-local"}, headers=bearer("sdr-manager-remote"))

        assert response.status_code == 200
        assert response.json() == {"services": []}

    def test_leaves_out_other_kinds(self, isolated_registry, client):
        # The fixture's in-process `sea` section must not appear.
        register_sdr_manager_local(client)

        response = client.get(LIST_URL, params={"kind": "section"}, headers=AUTHORIZED)

        assert [service["id"] for service in response.json()["services"]] == ["sea"]

    def test_follows_the_probes_availability(self, isolated_registry, client):
        register_sdr_manager_local(client)
        isolated_registry.get("sdr-manager-local").available = False

        response = client.get(LIST_URL, params={"kind": "sdr-manager-local"}, headers=bearer("sdr-manager-remote"))

        assert response.json()["services"][0]["available"] is False


def test_the_listing_is_not_in_the_public_api_schema(client):
    assert LIST_URL not in client.get("/api/openapi.json").json()["paths"]
