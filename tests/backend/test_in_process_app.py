"""The test suite's all-in-one app (tests/in_process_app.py).

Every router test, parity golden and lifecycle test runs against it, so it
must build exactly what core plus every section and the radio hub would serve
— through core's own factory — and list them as a deployment's registry would.
"""

from __future__ import annotations

import pytest
from sentinel_air import module as air_module
from sentinel_radio import module as radio_module
from sentinel_sdr import module as sdr_module

from backend.core.app import CORE_LIFECYCLES
from backend.core.service_registry import ServiceRegistry
from tests import in_process_app
from tests.in_process_app import (
    IN_PROCESS_LIFECYCLES,
    IN_PROCESS_MANIFESTS,
    create_in_process_app,
    in_process_routers,
)


@pytest.fixture()
def fresh_registry(monkeypatch) -> ServiceRegistry:
    """A registry of the test's own, so building an app doesn't re-register into the suite's."""
    registry = ServiceRegistry()
    monkeypatch.setattr(in_process_app, "registry", registry)
    return registry


def test_registers_every_hosted_service_as_core_in_manifest_order(fresh_registry):
    create_in_process_app()

    registered = fresh_registry.services()
    assert [service.manifest.id for service in registered] == [
        "air",
        "space",
        "sea",
        "land",
        "sdr",
        "docs",
        "radio",
        "sdr-manager-remote",
    ]
    assert {service.instance_id for service in registered} == {"core"}
    assert all(service.in_process for service in registered)


def test_builds_core_with_every_router_lifecycle_and_the_section_remotes(fresh_registry, monkeypatch):
    built_with: dict = {}

    def spy(**options):
        built_with.update(options)
        return object()

    monkeypatch.setattr(in_process_app, "create_core_app", spy)

    create_in_process_app()

    assert built_with == {
        "routers": in_process_routers(),
        "lifecycles": IN_PROCESS_LIFECYCLES,
        "serve_section_remotes": True,
    }


def test_serves_every_hosted_route_and_the_section_remotes(fresh_registry):
    app = create_in_process_app()

    paths = {getattr(route, "path", "") for route in app.routes}
    assert {route.path for router in in_process_routers() for route in router.routes} <= paths
    assert "/remotes" in paths


def test_runs_core_first_then_every_section_and_the_hub():
    assert IN_PROCESS_LIFECYCLES[: len(CORE_LIFECYCLES)] == CORE_LIFECYCLES
    assert sdr_module.lifecycle in IN_PROCESS_LIFECYCLES
    assert radio_module.lifecycle in IN_PROCESS_LIFECYCLES
    # Air asks the hub where the receiver is, so the hub starts first.
    assert IN_PROCESS_LIFECYCLES.index(radio_module.lifecycle) < IN_PROCESS_LIFECYCLES.index(air_module.lifecycle)


def test_hosts_one_manifest_per_service():
    ids = [manifest.id for manifest in IN_PROCESS_MANIFESTS]
    assert len(ids) == len(set(ids)) == 8
