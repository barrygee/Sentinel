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
        # Leaving Air out would silently drop the section, not move it.
        monkeypatch.setattr(settings, "sentinel_external_services", "space,air")

        with pytest.raises(ValueError, match="air"):
            external_services()

    def test_space_is_extractable(self):
        assert "space" in EXTRACTABLE_SERVICES


def import_main(external: str) -> dict:
    """What `backend.main` builds with SENTINEL_EXTERNAL_SERVICES=`external`."""
    probe = (
        "import json\n"
        "from backend.main import app\n"
        "from backend.modules import MANIFESTS, MODULES\n"
        "from backend.core.service_registry import registry\n"
        "print(json.dumps({\n"
        "  'routes': [route.path for route in app.routes],\n"
        "  'modules': [module.name for module in MODULES],\n"
        "  'manifests': [manifest.id for manifest in MANIFESTS],\n"
        "  'registered': [registration.manifest.id for registration in registry.services()],\n"
        "  'withheld_remotes': sorted(next(r.app.withheld for r in app.routes if getattr(r, 'path', '') == '/remotes')),\n"
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


@pytest.fixture(scope="module")
def monolith() -> dict:
    return import_main("")


@pytest.fixture(scope="module")
def without_space() -> dict:
    return import_main("space")


class TestTheMonolithWithoutSpace:
    def test_the_monolith_hosts_space_by_default(self, monolith):
        assert any(path.startswith("/api/space/") for path in monolith["routes"])
        assert "space" in monolith["modules"]
        assert "space" in monolith["manifests"]
        assert "space" in monolith["registered"]

    def test_leaves_out_spaces_routes(self, without_space):
        assert not any(path.startswith("/api/space/") for path in without_space["routes"])

    def test_leaves_out_spaces_lifecycle_and_registration(self, without_space):
        assert "space" not in without_space["modules"]
        assert "space" not in without_space["manifests"]
        assert "space" not in without_space["registered"]

    def test_withholds_spaces_remote_build(self, monolith, without_space):
        assert monolith["withheld_remotes"] == []
        assert without_space["withheld_remotes"] == ["space"]

    def test_keeps_every_other_section_and_the_core(self, monolith, without_space):
        assert without_space["modules"] == [name for name in monolith["modules"] if name != "space"]
        assert without_space["registered"] == [service for service in monolith["registered"] if service != "space"]
        assert any(path.startswith("/api/air/") for path in without_space["routes"])
        assert "/api/settings/{namespace}" in without_space["routes"]
