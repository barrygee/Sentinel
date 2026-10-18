"""GET /api/app/docs (backend/core/app_docs.py).

The shell offers Docs only when this says a docs service is deployed, so these
pin what counts as one (a registered service of kind `docs`, not merely an id)
and that `available` follows the registry's health probes.
"""

import pytest
from fastapi.testclient import TestClient

from backend.core import app_docs
from backend.core.app_docs import DocsDeployment, docs_deployment
from backend.core.service_registry import ServiceRegistry
from backend.platform.service_manifest import ServiceManifest
from tests.in_process_app import app


def make_manifest(service_id: str, kind: str) -> ServiceManifest:
    return ServiceManifest.model_validate(
        {
            "id": service_id,
            "kind": kind,
            "version": "1.0.0",
            "internalUrl": f"http://{service_id}:8000",
            # Not /api/docs/: the manifest reserves it for core's OpenAPI page.
            "routes": [
                "/api/documentation/" if kind == "docs" else f"/api/{service_id}/"
            ],
        }
    )


class TestDocsDeployment:
    def test_an_empty_registry_has_no_docs(self):
        assert docs_deployment(ServiceRegistry()) == DocsDeployment(
            deployed=False, available=False
        )

    def test_other_kinds_are_not_docs(self):
        service_registry = ServiceRegistry()
        service_registry.register_in_process(
            [make_manifest("space", "section")], "core"
        )

        assert docs_deployment(service_registry) == DocsDeployment(
            deployed=False, available=False
        )

    def test_a_registered_docs_service_is_deployed_and_available(self):
        service_registry = ServiceRegistry()
        service_registry.register_in_process(
            [make_manifest("space", "section"), make_manifest("docs", "docs")], "core"
        )

        assert docs_deployment(service_registry) == DocsDeployment(
            deployed=True, available=True
        )

    def test_the_kind_decides_not_the_id(self):
        service_registry = ServiceRegistry()
        service_registry.register_in_process(
            [make_manifest("handbook", "docs")], "core"
        )

        assert docs_deployment(service_registry).deployed is True

    def test_available_follows_the_health_probes(self):
        service_registry = ServiceRegistry()
        service_registry.register_in_process([make_manifest("docs", "docs")], "core")
        registration = service_registry.get("docs")
        assert registration is not None
        registration.available = False

        assert docs_deployment(service_registry) == DocsDeployment(
            deployed=True, available=False
        )


class TestGetDocsDeploymentRoute:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_answers_with_the_global_registrys_view(self, client, monkeypatch):
        service_registry = ServiceRegistry()
        service_registry.register_in_process([make_manifest("docs", "docs")], "core")
        monkeypatch.setattr(app_docs, "registry", service_registry)

        response = client.get("/api/app/docs")

        assert response.status_code == 200
        assert response.json() == {"deployed": True, "available": True}

    def test_says_not_deployed_without_a_docs_service(self, client, monkeypatch):
        monkeypatch.setattr(app_docs, "registry", ServiceRegistry())

        response = client.get("/api/app/docs")

        assert response.status_code == 200
        assert response.json() == {"deployed": False, "available": False}
