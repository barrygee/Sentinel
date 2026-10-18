"""The docs as their own service (sentinel_docs.service): the app it serves and how it registers."""

import importlib
import sys

import pytest
from backend.config import settings


@pytest.fixture
def docs_service(monkeypatch):
    """`sentinel_docs.service`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
    monkeypatch.setattr(settings, "service_internal_url", "http://docs:8000")
    monkeypatch.delitem(sys.modules, "sentinel_docs.service", raising=False)
    module = importlib.import_module("sentinel_docs.service")
    yield module
    sys.modules.pop("sentinel_docs.service", None)


class TestDocsServiceApp:
    def test_cannot_start_without_cores_address(self, monkeypatch):
        from backend.platform.sdk import ServiceMisconfigured

        monkeypatch.setattr(settings, "sentinel_core_url", "")
        monkeypatch.delitem(sys.modules, "sentinel_docs.service", raising=False)

        with pytest.raises(ServiceMisconfigured):
            importlib.import_module("sentinel_docs.service")
        sys.modules.pop("sentinel_docs.service", None)

    def test_serves_the_documentation_api(self, docs_service):
        paths = {getattr(route, "path", "") for route in docs_service.app.routes}

        assert "/api/documentation/library" in paths
        assert "/api/documentation/images/{image_path:path}" in paths
        assert "/health" in paths

    def test_serves_nothing_but_docs(self, docs_service):
        paths = [getattr(route, "path", "") for route in docs_service.app.routes]

        assert not any(
            path.startswith(("/api/air", "/api/sea", "/api/sdr", "/api/space", "/api/settings", "/remotes"))
            for path in paths
        )

    def test_registers_as_docs_at_its_own_address(self, docs_service):
        manifest = docs_service.app.state.registrar.manifest

        assert manifest.id == "docs"
        assert manifest.kind == "docs"
        assert manifest.internal_url == "http://docs:8000"
        assert manifest.routes == ["/api/documentation/"]
        assert manifest.ui is None
