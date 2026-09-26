#!/usr/bin/env python3
"""Generate the COLOUR basemap styles from the light (`positron`) pair.

Sentinel ships three basemap palettes, each as an online build (planet vector
tiles) and an offline one (the local PMTiles archives). All six styles share
one geometry: the same sources, the same layers in the same order, the same
filters and the same widths. Only `paint` colours differ, which is what lets a
palette change be a repaint rather than a different map, and what lets every
layer-id-driven control (`RoadsToggleControl`, `NamesToggleControl`, terrain)
keep working untouched across all of them.

So this script does not author a style: it copies `positron{,-online}.json`
and substitutes a colour per layer id from the table below. The LIGHT pair is
the source rather than the dark one because it carries one structural fix the
colour map needs too — `park`/`park_outline` are drawn BENEATH `water`, since
marine protected areas reach far offshore and any park fill bright enough to
read on land is a visible slab on the sea. Run this after any change to the
pair's geometry so the colour build keeps up:

    python3 frontend/scripts/build_colour_basemap.py

Every layer in the source that carries a colour paint must appear in the table
— the script fails rather than silently leaving a dark-palette layer in the
colour map. `designTokens.spec.ts` guards the generated files the same way it
guards the two logo variants.

The palette is a muted OSM-bright: the map is ground for the overlays drawn on
it, and `.maplibregl-canvas` dims it with `brightness(0.65) saturate(0.85)`, so
these values are picked to land right AFTER that filter rather than to look
correct in isolation.
"""

from __future__ import annotations

import json
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "assets"

# Layer id -> the colour paints it gets. Grouped the way the map reads, not the
# way the layer list is ordered.
COLOURS: dict[str, dict[str, str]] = {
    # ── Ground and water ───────────────────────────────────────────────────
    "background": {"background-color": "rgb(246, 243, 236)"},
    "earth": {"fill-color": "rgb(246, 243, 236)"},
    "surroundings_earth": {"fill-color": "rgb(246, 243, 236)"},
    "water": {"fill-color": "rgb(158, 197, 223)"},
    "surroundings_water": {"fill-color": "rgb(158, 197, 223)"},
    "waterway": {"line-color": "rgb(158, 197, 223)"},
    "coastline": {"line-color": "hsla(205, 40%, 55%, 0.45)"},
    "surroundings_coastline": {"line-color": "hsla(205, 40%, 55%, 0.45)"},
    "landcover_ice_shelf": {"fill-color": "rgb(240, 246, 248)"},
    # ── Land cover ─────────────────────────────────────────────────────────
    "landuse_residential": {"fill-color": "rgb(238, 233, 224)"},
    "landcover_wood": {"fill-color": "rgb(197, 219, 190)"},
    "park": {"fill-color": "rgb(205, 227, 197)"},
    "park_outline": {"line-color": "hsl(110, 28%, 68%)"},
    "building": {
        "fill-color": "rgb(226, 219, 209)",
        "fill-outline-color": "rgb(210, 202, 190)",
    },
    # ── Aeroways and piers ─────────────────────────────────────────────────
    "aeroway-area": {"fill-color": "rgb(233, 231, 233)"},
    "aeroway-runway": {"line-color": "rgb(248, 248, 250)"},
    "aeroway-runway-casing": {"line-color": "rgb(206, 204, 208)"},
    "aeroway-taxiway": {"line-color": "rgb(233, 231, 233)"},
    "road_area_pier": {"fill-color": "rgb(246, 243, 236)"},
    "road_pier": {"line-color": "rgb(246, 243, 236)"},
    # ── Roads: motorway amber, major cream, minor white ────────────────────
    "highway_motorway_casing": {"line-color": "rgb(226, 166, 106)"},
    "highway_motorway_inner": {"line-color": "rgb(250, 202, 146)"},
    "highway_motorway_subtle": {"line-color": "rgba(250, 202, 146, 0.7)"},
    "tunnel_motorway_casing": {"line-color": "rgb(226, 166, 106)"},
    "tunnel_motorway_inner": {"line-color": "rgb(252, 221, 184)"},
    "highway_major_casing": {"line-color": "rgb(223, 200, 150)"},
    "highway_major_inner": {"line-color": "rgb(252, 233, 186)"},
    "highway_major_subtle": {"line-color": "rgba(252, 233, 186, 0.7)"},
    "highway_minor": {"line-color": "rgb(252, 251, 248)"},
    "highway_path": {"line-color": "rgb(226, 214, 197)"},
    "surroundings_motorway": {"line-color": "hsla(30, 60%, 66%, 0.65)"},
    # ── Rail ───────────────────────────────────────────────────────────────
    "railway": {"line-color": "rgb(184, 178, 172)"},
    "railway_dashline": {"line-color": "rgb(232, 229, 224)"},
    "railway_service": {"line-color": "rgb(196, 191, 185)"},
    "railway_service_dashline": {"line-color": "rgb(236, 233, 229)"},
    "railway_transit": {"line-color": "rgb(196, 191, 185)"},
    "railway_transit_dashline": {"line-color": "rgb(236, 233, 229)"},
    # ── Boundaries ─────────────────────────────────────────────────────────
    "boundary_state": {"line-color": "rgb(190, 164, 190)"},
    "boundary_country_z0-4": {"line-color": "rgb(176, 148, 176)"},
    "boundary_country_z5-": {"line-color": "rgb(176, 148, 176)"},
    "surroundings_boundary": {"line-color": "rgb(190, 164, 190)"},
}

# Labels: one ink, one halo, at three weights. Place names carry the map's
# information, so they sit darker than anything they are drawn over.
LABEL_INK = "rgb(58, 62, 68)"
LABEL_INK_MINOR = "rgb(92, 97, 104)"
LABEL_HALO = "rgb(246, 243, 236)"
WATER_LABEL_INK = "rgb(62, 108, 145)"

LABELS: dict[str, str] = {
    "water_name": WATER_LABEL_INK,
    "highway_name_other": LABEL_INK_MINOR,
    "highway_ref": LABEL_INK_MINOR,
    "place_other": LABEL_INK_MINOR,
    "place_suburb": LABEL_INK_MINOR,
    "place_village": LABEL_INK_MINOR,
    "place_town": LABEL_INK,
    "place_city": LABEL_INK,
    "place_city_large": LABEL_INK,
    "place_state": LABEL_INK_MINOR,
    "place_country_other": LABEL_INK,
    "place_country_minor": LABEL_INK,
    "place_country_major": LABEL_INK,
    "place_continent": LABEL_INK,
    "surroundings_place_city": LABEL_INK,
}

PROVENANCE = (
    "Generated by frontend/scripts/build_colour_basemap.py from {source}.json — "
    "identical geometry, colour palette substituted per layer id. Do not hand-edit: "
    "re-run the script instead, or the three palettes drift apart."
)


def colour_paints(layer_id: str) -> dict[str, str] | None:
    """The colour paints for a layer id, or None when it is not in the table."""
    if layer_id in COLOURS:
        return COLOURS[layer_id]
    if layer_id in LABELS:
        return {"text-color": LABELS[layer_id], "text-halo-color": LABEL_HALO}
    return None


def recolour(style: dict, source_name: str) -> dict:
    """Return `style` with every colour paint replaced from the table."""
    missing: list[str] = []
    for layer in style["layers"]:
        paint = layer.get("paint")
        if not paint:
            continue
        colour_keys = [key for key in paint if "color" in key]
        if not colour_keys:
            continue

        replacements = colour_paints(layer["id"])
        if replacements is None:
            missing.append(layer["id"])
            continue
        for key in colour_keys:
            if key in replacements:
                paint[key] = replacements[key]

    if missing:
        raise SystemExit(
            "No colour defined for: "
            + ", ".join(sorted(missing))
            + "\nAdd them to COLOURS/LABELS — an unlisted layer would keep the dark palette."
        )

    style.setdefault("metadata", {})["sentinel:provenance"] = PROVENANCE.format(
        source=source_name
    )
    return style


def build(source_name: str, target_name: str) -> None:
    source = ASSETS / f"{source_name}.json"
    target = ASSETS / f"{target_name}.json"
    style = json.loads(source.read_text())
    target.write_text(json.dumps(recolour(style, source_name), indent=2) + "\n")
    print(f"wrote {target.relative_to(ASSETS.parents[1])}")


if __name__ == "__main__":
    build("positron", "cartographic")
    build("positron-online", "cartographic-online")
