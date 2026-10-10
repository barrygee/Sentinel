"""Every font stack a map layer names must ship with the app.

Map glyphs are served from `frontend/assets/fonts/<stack>/<range>.pbf` (the
basemap styles' `glyphs` URL), and the maps run offline, so a stack named in a
layer's `text-font` but missing from the bundle silently drops every label set
in it. Only the ASCII range is required: map-layer labels are digits and Latin
text (Noto Sans Bold ships only that range for the range-ring distances).
"""

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FONTS_DIR = REPO_ROOT / "frontend" / "assets" / "fonts"
MAP_SOURCE_DIRS = [REPO_ROOT / "platform" / "web", REPO_ROOT / "services" / "sections"]
TEXT_FONT = re.compile(r"""['"]text-font['"]\s*:\s*\[([^\]]*)\]""")
QUOTED = re.compile(r"""['"]([^'"]+)['"]""")


def font_stacks_used_by_map_layers() -> set[str]:
    stacks: set[str] = set()
    for source_dir in MAP_SOURCE_DIRS:
        for source_file in source_dir.rglob("*.ts"):
            if "node_modules" in source_file.parts or source_file.name.endswith(".spec.ts"):
                continue
            for match in TEXT_FONT.finditer(source_file.read_text(encoding="utf-8")):
                stacks.update(QUOTED.findall(match.group(1)))
    return stacks


def test_finds_the_font_stacks_map_layers_use():
    # Guards the scan itself: a broken pattern would find nothing and pass below.
    assert {"Noto Sans Regular", "Noto Sans Bold"} <= font_stacks_used_by_map_layers()


@pytest.mark.parametrize("stack", sorted(font_stacks_used_by_map_layers()))
def test_every_map_font_stack_ships_its_ascii_glyphs(stack):
    glyphs = FONTS_DIR / stack / "0-255.pbf"

    assert glyphs.is_file(), f"{stack!r} is used by a map layer but {glyphs} is not bundled"
    assert glyphs.stat().st_size > 0
