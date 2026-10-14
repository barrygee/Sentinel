"""Core's entry point (`uvicorn backend.main:app`) hosts core and nothing else (P8).

Each section and the radio hub run as services of their own. Core must never
even *import* their code: a section subscribes to bus events at import (Land's
`decode.aprs.*` store) and the hub registers its `hub.*` responders, so a copy
inside core would handle events and requests meant for the real service. That
needs a fresh interpreter — the suite itself imports every section.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# Paths each section and the hub serve. Exact paths, not prefixes: core keeps
# /api/air/messages inside Air's /api/air/.
SECTION_PATHS = {
    "/api/space/iss",
    "/api/space/tle/status",
    "/api/land/repeaters",
    "/api/land/aprs/stations",
    "/api/air/tracking",
    "/api/sdr/adsb/source",
    "/api/sdr/adsb/config",
    "/api/sea/vessels",
    "/api/sea/status",
    "/api/sea/ais-key",
    "/api/sdr/groups",
    "/api/sdr/frequencies",
    "/api/sdr/recordings/start",
    "/api/sdr/data/bandplan",
    "/api/sdr/radios",
    "/api/sdr/connect",
    "/api/sdr/status/{radio_id}",
    "/api/sdr/decoders/register",
    "/api/sdr/sentry-hosts",
    "/ws/sdr/{radio_id}",
}


@pytest.fixture(scope="module")
def core_entry_point() -> dict:
    """What a fresh interpreter's `backend.main` builds, imports and registers."""
    probe = (
        "import json, sys\n"
        "from backend.main import app\n"
        "from backend.core.app import CORE_LIFECYCLES\n"
        "from backend.core.service_registry import registry\n"
        "print(json.dumps({\n"
        "  'routes': [route.path for route in app.routes],\n"
        "  'modules': [module.name for module in CORE_LIFECYCLES],\n"
        "  'registered': [registration.manifest.id for registration in registry.services()],\n"
        "  'imported': sorted(name for name in sys.modules if name.startswith('sentinel_')),\n"
        "}))\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", probe],
        cwd=REPO_ROOT,
        env={**os.environ, "PYTHONPATH": str(REPO_ROOT)},
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_imports_no_section_or_radio_hub_code(core_entry_point):
    assert core_entry_point["imported"] == []


def test_runs_only_the_bus_and_core_lifecycles(core_entry_point):
    assert core_entry_point["modules"] == ["bus", "core"]


def test_registers_nothing_itself(core_entry_point):
    # Every service registers over /internal/registry/register from its own container.
    assert core_entry_point["registered"] == []


def test_serves_no_section_route(core_entry_point):
    assert not SECTION_PATHS & set(core_entry_point["routes"])


def test_keeps_cores_notifications_under_air_and_its_secret_settings(core_entry_point):
    assert {
        "/api/air/messages",
        "/api/air/messages/stream",
        "/internal/settings/secrets/{namespace}/{key}",
        "/internal/registry/register",
    } <= set(core_entry_point["routes"])
