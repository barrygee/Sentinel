"""The shared base-map layer defaults a fresh install gets (`app.mapLayers`).

The SPA's basemap store falls back to its own defaults for a missing key, but a
fresh install seeds `app.mapLayers` from `backend/default_config.json`, and the
store adopts whatever booleans that row holds. If the file dropped a layer, or
turned borders off, a new install would start with a different map from an
upgraded one.
"""

from __future__ import annotations

import json
from pathlib import Path

DEFAULT_CONFIG = Path(__file__).resolve().parents[2] / "backend" / "default_config.json"


def _map_layers() -> dict:
    return json.loads(DEFAULT_CONFIG.read_text())["app"]["mapLayers"]


def test_default_map_layers_cover_every_shared_toggle():
    assert set(_map_layers()) == {"roads", "names", "borders", "terrain"}


def test_default_map_layers_are_booleans():
    assert all(isinstance(value, bool) for value in _map_layers().values())


def test_borders_default_on_and_the_rest_off():
    # Borders were always drawn before the toggle existed; the others start
    # off so the maps open uncluttered.
    assert _map_layers() == {
        "roads": False,
        "names": False,
        "borders": True,
        "terrain": False,
    }
