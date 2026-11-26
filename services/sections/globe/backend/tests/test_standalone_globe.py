"""The optional 3D globe as its own service (sentinel_globe.service): the app it serves and how it registers."""

import importlib
import sys

import httpx
import pytest
from backend.config import settings

SERVICE_MODULE = "sentinel_globe.service"


@pytest.fixture
def globe_service(monkeypatch):
    """`sentinel_globe.service`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
    monkeypatch.setattr(settings, "service_internal_url", "http://globe:8000")
    monkeypatch.delitem(sys.modules, SERVICE_MODULE, raising=False)
    module = importlib.import_module(SERVICE_MODULE)
    yield module
    sys.modules.pop(SERVICE_MODULE, None)


class TestGlobeServiceApp:
    def test_cannot_start_without_cores_address(self, monkeypatch):
        from backend.platform.sdk import ServiceMisconfigured

        monkeypatch.setattr(settings, "sentinel_core_url", "")
        monkeypatch.setattr(settings, "service_internal_url", "http://globe:8000")
        monkeypatch.delitem(sys.modules, SERVICE_MODULE, raising=False)

        with pytest.raises(ServiceMisconfigured):
            importlib.import_module(SERVICE_MODULE)
        sys.modules.pop(SERVICE_MODULE, None)

    def test_cannot_start_without_its_own_address(self, monkeypatch):
        from backend.platform.sdk import ServiceMisconfigured

        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "service_internal_url", "")
        monkeypatch.delitem(sys.modules, SERVICE_MODULE, raising=False)

        with pytest.raises(ServiceMisconfigured):
            importlib.import_module(SERVICE_MODULE)
        sys.modules.pop(SERVICE_MODULE, None)

    def test_serves_its_remote_and_health(self, globe_service):
        paths = {getattr(route, "path", "") for route in globe_service.app.routes}

        assert {"/remotes/globe", "/health"} <= paths

    def test_serves_only_its_combined_feed_and_nothing_of_another_section(self, globe_service):
        """Under /api/ it answers only its own combined feed."""
        paths = [getattr(route, "path", "") for route in globe_service.app.routes]

        assert [path for path in paths if path.startswith("/api/")] == ["/api/globe/objects"]
        assert not any(path.startswith("/remotes/") and path != "/remotes/globe" for path in paths)

    def test_registers_as_the_globe_section_at_its_own_address(self, globe_service):
        manifest = globe_service.app.state.registrar.manifest

        assert manifest.id == "globe"
        assert manifest.kind == "section"
        assert manifest.display_name == "GLOBE"
        assert manifest.nav_order == 60
        assert manifest.internal_url == "http://globe:8000"
        assert manifest.routes == ["/api/globe/"]
        assert manifest.ui is not None and manifest.ui.remote_entry == "/remotes/globe/remoteEntry.js"

    async def test_has_no_lifecycle_of_its_own_only_registration(self, monkeypatch):
        """No database or loops: starting only registers with core, and stopping only stops that."""
        from backend.platform.sdk.registration import ServiceRegistrar

        calls: list[str] = []

        async def registrar_stop(self):
            calls.append("registration.stop")

        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "service_internal_url", "http://globe:8000")
        monkeypatch.setattr(settings, "nats_url", "")
        monkeypatch.setattr(ServiceRegistrar, "start", lambda self: calls.append("registration.start"))
        monkeypatch.setattr(ServiceRegistrar, "stop", registrar_stop)
        monkeypatch.delitem(sys.modules, SERVICE_MODULE, raising=False)
        service = importlib.import_module(SERVICE_MODULE)

        try:
            async with service.app.router.lifespan_context(service.app):
                pass
        finally:
            sys.modules.pop(SERVICE_MODULE, None)

        assert calls == ["registration.start", "registration.stop"]


class TestGlobeServiceRemote:
    @pytest.fixture
    def built_remotes(self, monkeypatch, tmp_path):
        """A remotes folder holding the globe's build and another section's."""
        from backend.platform import remote_files

        for section_id in ("globe", "land"):
            (tmp_path / section_id).mkdir()
            (tmp_path / section_id / "remoteEntry.js").write_text(f"export const section = '{section_id}'")
        monkeypatch.setattr(remote_files, "remotes_dir", lambda: tmp_path)
        monkeypatch.setattr(settings, "sentinel_core_url", "http://app:8000")
        monkeypatch.setattr(settings, "service_internal_url", "http://globe:8000")
        monkeypatch.delitem(sys.modules, SERVICE_MODULE, raising=False)
        service = importlib.import_module(SERVICE_MODULE)
        yield service
        sys.modules.pop(SERVICE_MODULE, None)

    async def _get(self, service, path: str) -> httpx.Response:
        transport = httpx.ASGITransport(app=service.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://globe:8000") as client:
            return await client.get(path)

    async def test_serves_its_own_remote_build(self, built_remotes):
        response = await self._get(built_remotes, "/remotes/globe/remoteEntry.js")

        assert response.status_code == 200
        assert response.text == "export const section = 'globe'"

    async def test_does_not_serve_another_sections_remote(self, built_remotes):
        response = await self._get(built_remotes, "/remotes/land/remoteEntry.js")

        assert response.status_code == 404


class TestGlobeAccess:
    def test_may_register_only_as_itself(self):
        from backend.platform.service_access import may_register

        assert may_register("globe", "globe") is True
        assert may_register("globe", "land") is False
        assert may_register("land", "globe") is False

    def test_may_claim_only_its_own_kind_and_routes(self):
        from backend.platform.service_access import registration_refusal

        from sentinel_globe.module import manifest

        assert registration_refusal("globe", manifest.kind, manifest.routes) is None
        assert registration_refusal("globe", "section", ["/api/land/"]) is not None
        assert registration_refusal("globe", "docs", ["/api/globe/"]) is not None

    def test_joins_the_bus_only_to_request_the_sections_snapshots(self):
        from backend.platform.nats_permissions import SERVICE_PERMISSIONS, server_permissions

        snapshot_subjects = ["air.globe.snapshot", "sea.globe.snapshot", "land.globe.snapshot", "space.globe.snapshot"]
        assert SERVICE_PERMISSIONS["globe"].publish == ()
        assert SERVICE_PERMISSIONS["globe"].subscribe == ()
        assert SERVICE_PERMISSIONS["globe"].answers_requests is False
        assert list(SERVICE_PERMISSIONS["globe"].requests) == snapshot_subjects
        assert server_permissions("globe")["publish"] == {"allow": snapshot_subjects}
        assert server_permissions("globe")["subscribe"] == {"allow": ["_INBOX.globe.>"]}
