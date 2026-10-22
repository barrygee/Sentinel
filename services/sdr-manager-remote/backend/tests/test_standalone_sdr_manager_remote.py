"""sdr-manager-remote as its own service (sentinel_sdr_manager_remote/service.py, ADR 0007):
the app it serves, how it registers, what it imports and answers on the bus,
and the order its lifecycle runs in.

Its schema is pinned in test_sdr_manager_remote_database.py.

Run with:  uv run --project backend pytest services/sdr-manager-remote/backend/tests/test_standalone_sdr_manager_remote.py
"""

import importlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from backend.config import settings

REPO_ROOT = Path(__file__).resolve().parents[4]
CORE_URL = "http://app:8000"
SERVICE_URL = "http://sdr-manager-remote:8000"
HOSTS_PREFIX = "/api/sdr-manager/remote/hosts"


@pytest.fixture
def remote_service(monkeypatch):
    """`sentinel_sdr_manager_remote.service`, imported fresh with a service's environment."""
    monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
    monkeypatch.setattr(settings, "service_internal_url", SERVICE_URL)
    monkeypatch.delitem(sys.modules, "sentinel_sdr_manager_remote.service", raising=False)
    module = importlib.import_module("sentinel_sdr_manager_remote.service")
    yield module
    sys.modules.pop("sentinel_sdr_manager_remote.service", None)


def route_paths(app) -> set[str]:
    return {getattr(route, "path", "") for route in app.routes}


class TestTheServiceApp:
    def test_serves_the_hosts_api_and_its_health(self, remote_service):
        paths = route_paths(remote_service.app)

        assert {
            "/health",
            HOSTS_PREFIX,
            f"{HOSTS_PREFIX}/locations",
            f"{HOSTS_PREFIX}/{{host_id}}",
            f"{HOSTS_PREFIX}/{{host_id}}/info",
            f"{HOSTS_PREFIX}/{{host_id}}/devices",
        } <= paths

    def test_every_route_sits_under_the_prefix_it_registers(self, remote_service):
        prefixes = tuple(remote_service.app.state.registrar.manifest.routes)
        paths = route_paths(remote_service.app) - {"/health"}

        assert prefixes == ("/api/sdr-manager/remote/",)
        assert paths and all(path.startswith(prefixes) for path in paths)

    def test_serves_nothing_of_the_radio_hub_the_sections_or_core(self, remote_service):
        paths = route_paths(remote_service.app)

        assert not any(
            path.startswith(("/api/sdr", "/api/air", "/api/settings", "/internal", "/remotes"))
            and not path.startswith("/api/sdr-manager/remote/")
            for path in paths
        )

    def test_registers_as_sdr_manager_remote_at_its_own_address_without_a_remote(self, remote_service):
        manifest = remote_service.app.state.registrar.manifest

        assert (manifest.id, manifest.kind) == ("sdr-manager-remote", "sdr-manager-remote")
        assert manifest.internal_url == SERVICE_URL
        assert manifest.ui is None


def probe_fresh_interpreter(probe: str) -> list:
    """Run `probe` in a new interpreter configured as the service container; return its last line as JSON."""
    environment = {
        **os.environ,
        "PYTHONPATH": str(REPO_ROOT),
        "SENTINEL_CORE_URL": CORE_URL,
        "SERVICE_INTERNAL_URL": SERVICE_URL,
    }
    result = subprocess.run(
        [sys.executable, "-c", probe], cwd=REPO_ROOT, env=environment, capture_output=True, text=True, check=True
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


BUS_PATTERNS_PROBE = (
    "import json\n"
    "from backend.platform.bus import bus\n"
    "import sentinel_sdr_manager_remote.service\n"
    "print(json.dumps(sorted({s.pattern for s in bus._subscriptions})))\n"
)


class TestWhatTheServiceLoads:
    """Checked in a fresh interpreter, where nothing else has imported anything."""

    def test_loads_neither_the_radio_hub_nor_any_section(self):
        loaded = probe_fresh_interpreter(
            "import json, sys\n"
            "import sentinel_sdr_manager_remote.service\n"
            "print(json.dumps(sorted(m for m in sys.modules if m.startswith(('backend.modules.', 'backend.routers.',"
            " 'sentinel_')))))\n"
        )

        assert "sentinel_sdr_manager_remote.services.reservations" in loaded
        assert [module for module in loaded if module.startswith("backend.modules.")] == ["backend.modules.manifest"]
        assert not [module for module in loaded if module.startswith("backend.routers.")]
        assert not [
            module
            for module in loaded
            if module.startswith("sentinel_") and not module.startswith("sentinel_sdr_manager_remote")
        ]

    def test_answers_every_sdr_manager_remote_request_and_nothing_else(self):
        patterns = set(probe_fresh_interpreter(BUS_PATTERNS_PROBE))

        assert patterns == {
            "sdr-manager.remote.reservation.acquire",
            "sdr-manager.remote.reservation.release",
            "sdr-manager.remote.device.address",
            "sdr-manager.remote.host.location",
            "sdr-manager.remote.hosts.snapshot",
        }


class TestTheServiceLifecycle:
    async def test_builds_its_table_starts_the_poller_then_registers(self, monkeypatch):
        from backend.platform.sdk.registration import ServiceRegistrar

        from sentinel_sdr_manager_remote import module as remote_module

        calls: list[str] = []

        async def create_tables():
            calls.append("tables")

        async def start_all():
            calls.append("poller.start")

        async def stop_all():
            calls.append("poller.stop")

        async def registrar_stop(self):
            calls.append("registration.stop")

        monkeypatch.setattr(settings, "sentinel_core_url", CORE_URL)
        monkeypatch.setattr(settings, "service_internal_url", SERVICE_URL)
        monkeypatch.setattr(settings, "nats_url", "")
        monkeypatch.setattr(remote_module, "create_sdr_manager_remote_tables", create_tables)
        monkeypatch.setattr(remote_module.host_poller, "start_all", start_all)
        monkeypatch.setattr(remote_module.host_poller, "stop_all", stop_all)
        monkeypatch.setattr(ServiceRegistrar, "start", lambda self: calls.append("registration.start"))
        monkeypatch.setattr(ServiceRegistrar, "stop", registrar_stop)
        monkeypatch.delitem(sys.modules, "sentinel_sdr_manager_remote.service", raising=False)
        service = importlib.import_module("sentinel_sdr_manager_remote.service")

        try:
            async with service.app.router.lifespan_context(service.app):
                pass
        finally:
            sys.modules.pop("sentinel_sdr_manager_remote.service", None)

        assert calls == ["tables", "poller.start", "registration.start", "registration.stop", "poller.stop"]
