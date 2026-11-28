"""`service_access.py`'s kind and route grants match every service's real manifest.

Core can't import section code (import-linter), so each service's allowed kind
and route prefixes are written out in the access table. These tests import the
manifests themselves and fail if the two ever disagree — a service whose new
route isn't granted would be refused at registration, so this catches it first.
"""

from __future__ import annotations

import pytest
from sentinel_air.module import manifest as air_manifest
from sentinel_docs.module import manifest as docs_manifest
from sentinel_land.module import manifest as land_manifest
from sentinel_radio.module import manifest as radio_manifest
from sentinel_sdr.module import manifest as sdr_manifest
from sentinel_sdr_manager_local.manifest import manifest as sdr_manager_local_manifest
from sentinel_sdr_manager_remote.module import manifest as sdr_manager_remote_manifest
from sentinel_sea.module import manifest as sea_manifest
from sentinel_space.module import manifest as space_manifest

from backend.platform.nats_permissions import CORE_USER
from backend.platform.service_access import SERVICE_ACCESS, registration_refusal

MANIFESTS = {
    manifest.id: manifest
    for manifest in (
        air_manifest,
        docs_manifest,
        land_manifest,
        radio_manifest,
        sdr_manifest,
        sdr_manager_local_manifest,
        sdr_manager_remote_manifest,
        sea_manifest,
        space_manifest,
    )
}


def test_every_registering_service_has_a_manifest_here():
    registering = {
        caller
        for caller, access in SERVICE_ACCESS.items()
        if access.registers_as is not None
    }

    assert registering == set(MANIFESTS)


@pytest.mark.parametrize("service_id", sorted(MANIFESTS))
def test_the_grant_is_exactly_the_manifest(service_id):
    manifest, access = MANIFESTS[service_id], SERVICE_ACCESS[service_id]

    assert access.registers_as == manifest.id
    assert access.registers_kind == manifest.kind
    assert access.route_prefixes == frozenset(manifest.routes)


@pytest.mark.parametrize("service_id", sorted(MANIFESTS))
def test_each_service_may_register_its_real_manifest(service_id):
    manifest = MANIFESTS[service_id]

    assert (
        registration_refusal(service_id, manifest.kind, list(manifest.routes)) is None
    )


def test_no_two_services_are_granted_the_same_route():
    granted = [
        route for access in SERVICE_ACCESS.values() for route in access.route_prefixes
    ]

    assert len(granted) == len(set(granted))


class TestRegistrationRefusal:
    def test_core_is_let_through(self):
        assert registration_refusal(CORE_USER, "anything", ["/api/anything/"]) is None

    @pytest.mark.parametrize("caller", ["voice-decoder", "nobody"])
    def test_a_caller_that_registers_nothing_is_refused(self, caller):
        assert (
            registration_refusal(caller, "section", [])
            == "this credential registers no service"
        )

    def test_another_kind_is_named(self):
        assert registration_refusal("docs", "section", ["/api/documentation/"]) == (
            "docs registers as kind 'docs', not 'section'"
        )

    def test_foreign_routes_are_listed_sorted(self):
        assert registration_refusal(
            "land", "section", ["/api/space/", "/api/land/", "/api/air/"]
        ) == ("land may not claim the route(s) /api/air/, /api/space/")

    def test_no_routes_at_all_is_fine(self):
        assert registration_refusal("land", "section", []) is None
