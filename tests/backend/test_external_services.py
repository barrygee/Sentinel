"""Sections the monolith leaves to their own containers (SENTINEL_EXTERNAL_SERVICES, P6).

`backend/modules/__init__.py` decides which services this process hosts, and
`backend/main.py` builds the app from that at import — so the end-to-end cases
import it in a fresh interpreter with the variable set.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from backend.config import settings
from backend.modules import EXTRACTABLE_SERVICES, external_services, hosts_in_process

REPO_ROOT = Path(__file__).resolve().parents[2]


class TestExternalServices:
    def test_none_by_default(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_external_services", "")

        assert external_services() == frozenset()
        assert hosts_in_process("space") is True

    def test_parses_a_comma_separated_list_ignoring_blanks_and_spaces(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_external_services", " space , ,space")

        assert external_services() == frozenset({"space"})
        assert hosts_in_process("space") is False
        assert hosts_in_process("air") is True

    def test_refuses_a_section_that_cannot_run_on_its_own_yet(self, monkeypatch):
        # Leaving SDR out would silently drop the section, not move it.
        monkeypatch.setattr(settings, "sentinel_external_services", "space,sdr")

        with pytest.raises(ValueError, match="sdr"):
            external_services()

    def test_space_land_air_and_sea_are_extractable(self):
        assert {"space", "land", "air", "sea"} <= EXTRACTABLE_SERVICES

    def test_the_radio_hub_and_sdr_are_not_extractable_yet(self):
        assert not {"radio-hub", "sdr"} & EXTRACTABLE_SERVICES

    def test_land_can_be_external_alongside_space(self, monkeypatch):
        monkeypatch.setattr(settings, "sentinel_external_services", "space,land")

        assert external_services() == frozenset({"space", "land"})
        assert hosts_in_process("land") is False


def import_main(external: str) -> dict:
    """What `backend.main` builds with SENTINEL_EXTERNAL_SERVICES=`external`."""
    probe = (
        "import json, sys\n"
        "from backend.main import app\n"
        "from backend.modules import MANIFESTS, MODULES\n"
        "from backend.core.service_registry import registry\n"
        "print(json.dumps({\n"
        "  'routes': [route.path for route in app.routes],\n"
        "  'modules': [module.name for module in MODULES],\n"
        "  'manifests': [manifest.id for manifest in MANIFESTS],\n"
        "  'registered': [registration.manifest.id for registration in registry.services()],\n"
        "  'withheld_remotes': sorted(next(r.app.withheld for r in app.routes if getattr(r, 'path', '') == '/remotes')),\n"
        "  'imported': sorted(name for name in sys.modules if name.startswith('backend.')),\n"
        "}))\n"
    )
    environment = {**os.environ, "SENTINEL_EXTERNAL_SERVICES": external, "PYTHONPATH": str(REPO_ROOT)}
    result = subprocess.run(
        [sys.executable, "-c", probe],
        cwd=REPO_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


# The code that is each extracted section's own: an external section's must
# never be imported by the app, since importing it subscribes it to bus events.
SECTION_CODE = {
    "space": {
        "backend.routers.space",
        "backend.modules.space",
        "backend.services.tle",
        "backend.services.satellite",
        "backend.services.daynight",
        "backend.services.sat_radio",
    },
    "land": {
        "backend.routers.land",
        "backend.modules.land",
        "backend.services.aprs_store",
        "backend.services.repeaters",
    },
    "air": {
        "backend.routers.air",
        "backend.routers.adsb_source",
        "backend.modules.air",
        "backend.services.adsb",
        "backend.services.adsb_source",
        "backend.services.adsb_squawk",
    },
    "sea": {
        "backend.routers.sea",
        "backend.modules.sea",
        "backend.services.ais_stream",
        "backend.services.ais_store",
        "backend.services.ais_decode",
        "backend.services.sea_ais_receiver",
    },
}
# Paths each section serves. Exact paths, not prefixes: core keeps
# /api/air/messages inside Air's /api/air/.
SECTION_PATHS = {
    "space": {"/api/space/iss", "/api/space/tle/status"},
    "land": {"/api/land/repeaters", "/api/land/aprs/stations"},
    "air": {"/api/air/tracking", "/api/sdr/adsb/source", "/api/sdr/adsb/config"},
    "sea": {"/api/sea/vessels", "/api/sea/status", "/api/sea/ais-key"},
}
# Core's routes for every section's secret settings (the AISStream key is
# Sea's), whatever happens to Sea.
CORE_SECRET_SETTINGS = "/internal/settings/secrets/{namespace}/{key}"
# Core's notifications, whatever happens to Air.
CORE_AIR_MESSAGES = {"/api/air/messages", "/api/air/messages/stream"}


@pytest.fixture(scope="module")
def monolith() -> dict:
    return import_main("")


@pytest.fixture(scope="module")
def deployments(monolith) -> dict[str, dict]:
    return {
        "": monolith,
        "space": import_main("space"),
        "land": import_main("land"),
        "space,land": import_main("space,land"),
        "air": import_main("air"),
        "space,land,air": import_main("space,land,air"),
        "sea": import_main("sea"),
        "space,land,air,sea": import_main("space,land,air,sea"),
    }


class TestTheMonolithHostsEverythingByDefault:
    def test_hosts_every_section_in_lifecycle_order(self, monolith):
        assert monolith["modules"] == ["bus", "core", "sdr", "space", "radio-hub", "land", "sea", "air"]
        assert monolith["manifests"] == ["air", "space", "sea", "land", "sdr", "radio-hub"]
        assert monolith["withheld_remotes"] == []

    @pytest.mark.parametrize("section", ["space", "land", "air", "sea"])
    def test_hosts_and_imports_each_extractable_section(self, monolith, section):
        assert SECTION_PATHS[section] <= set(monolith["routes"])
        assert section in monolith["registered"]
        assert SECTION_CODE[section] <= set(monolith["imported"])


@pytest.mark.parametrize("external", ["space", "land", "space,land", "air", "space,land,air", "sea", "space,land,air,sea"])
class TestTheMonolithWithoutASection:
    def test_leaves_out_their_routes(self, deployments, external):
        for section in external.split(","):
            assert not SECTION_PATHS[section] & set(deployments[external]["routes"])

    def test_keeps_cores_notifications_under_air(self, deployments, external):
        assert CORE_AIR_MESSAGES <= set(deployments[external]["routes"])

    def test_keeps_cores_secret_settings_route(self, deployments, external):
        # An external Sea reads its AISStream key through it.
        assert CORE_SECRET_SETTINGS in deployments[external]["routes"]

    def test_leaves_out_their_lifecycle_and_registration(self, deployments, external):
        for section in external.split(","):
            assert section not in deployments[external]["modules"]
            assert section not in deployments[external]["manifests"]
            assert section not in deployments[external]["registered"]

    def test_never_imports_their_code(self, deployments, external):
        imported = set(deployments[external]["imported"])
        for section in external.split(","):
            assert not SECTION_CODE[section] & imported

    def test_withholds_their_remote_builds(self, deployments, external):
        assert deployments[external]["withheld_remotes"] == sorted(external.split(","))

    def test_keeps_every_other_section_and_the_core(self, monolith, deployments, external):
        gone = set(external.split(","))
        kept = deployments[external]
        assert kept["modules"] == [name for name in monolith["modules"] if name not in gone]
        assert kept["registered"] == [service for service in monolith["registered"] if service not in gone]
        for section in set(SECTION_PATHS) - gone:
            assert SECTION_PATHS[section] <= set(kept["routes"])
        assert any(path.startswith("/api/sdr/") for path in kept["routes"])
        assert "/api/settings/{namespace}" in kept["routes"]
