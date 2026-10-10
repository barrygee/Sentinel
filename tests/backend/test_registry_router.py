"""POST /internal/registry/register (backend/core/registry_router.py).

The endpoint lets a service claim gateway routes and a remote the shell will
run, so the join-token gate and every refusal are pinned here.
"""

import pytest
from fastapi.testclient import TestClient

from backend.config import settings
from backend.core import registry_router
from backend.core.service_registry import ServiceRegistry
from backend.main import app
from backend.platform import join_token as join_token_module
from backend.platform.service_manifest import ServiceManifest

JOIN_TOKEN = "test-join-token"
REGISTER_URL = "/internal/registry/register"
AUTHORIZED = {"Authorization": f"Bearer {JOIN_TOKEN}"}


@pytest.fixture
def isolated_registry(monkeypatch: pytest.MonkeyPatch) -> ServiceRegistry:
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
    monkeypatch.setattr(settings, "sentinel_join_token", JOIN_TOKEN)
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


class TestJoinToken:
    def test_disabled_when_no_join_token_is_configured(self, isolated_registry, client, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_join_token", "")

        response = client.post(REGISTER_URL, json=registration(), headers={"Authorization": "Bearer "})

        assert response.status_code == 503
        assert isolated_registry.get("weather") is None

    @pytest.mark.parametrize(
        "headers",
        [
            {},
            {"Authorization": "Bearer wrong-token"},
            {"Authorization": JOIN_TOKEN},
            {"Authorization": f"Basic {JOIN_TOKEN}"},
            {"Authorization": f"bearer {JOIN_TOKEN}"},
            {"Authorization": f"Bearer {JOIN_TOKEN}x"},
            {"Authorization": "Bearer "},
        ],
    )
    def test_refuses_a_missing_or_wrong_token(self, isolated_registry, client, headers):
        response = client.post(REGISTER_URL, json=registration(), headers=headers)

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid join token"}
        assert isolated_registry.get("weather") is None

    def test_the_error_never_echoes_the_expected_token(self, isolated_registry, client):
        response = client.post(REGISTER_URL, json=registration(), headers={"Authorization": "Bearer x"})

        assert JOIN_TOKEN not in response.text


    def test_accepts_the_token_core_generated_into_the_shared_file(
        self, isolated_registry, client, monkeypatch, tmp_path
    ):
        monkeypatch.setattr(settings, "sentinel_join_token", "")
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(tmp_path / "join-token"))
        monkeypatch.setattr(join_token_module, "_generated_token", None)
        generated = join_token_module.core_join_token()

        accepted = client.post(REGISTER_URL, json=registration(), headers={"Authorization": f"Bearer {generated}"})
        refused = client.post(REGISTER_URL, json=registration(), headers=AUTHORIZED)

        assert accepted.status_code == 200
        assert refused.status_code == 401


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
