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

The palette is light grey land and grey-scale roads, with saturated water and
green areas carrying the colour. `.maplibregl-canvas` dims every basemap
so the map stays ground for the overlays drawn on it — the colour map gets a
lighter, saturation-boosting filter than dark/light (see `MapLibreMap.vue`), but
it is still dimmed, so these values are pitched ABOVE where they should land:
what looks over-saturated in the raw JSON is what reads as colour on screen.
Judge them in the app, never in a colour picker.
"""

from __future__ import annotations

import json
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "assets"

# Land is a neutral light grey: slightly deeper when zoomed out, so a map with
# little but water and borders on it still has body, and lighter by the zoom
# where roads, buildings and land cover take over. Grey rather than the old
# warm sand so the colour map reads as a clean, modern base under the
# saturated roads, water and green, not as parchment.
LAND: list = [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    "rgb(229, 231, 234)",
    7,
    "rgb(236, 238, 240)",
    10,
    "rgb(243, 244, 246)",
]

WATER = "rgb(136, 194, 232)"

# Layer id -> the colour paints it gets. Grouped the way the map reads, not the
# way the layer list is ordered.
COLOURS: dict[str, dict[str, str | list]] = {
    # ── Ground and water ───────────────────────────────────────────────────
    "background": {"background-color": LAND},
    "earth": {"fill-color": LAND},
    "surroundings_earth": {"fill-color": LAND},
    "water": {"fill-color": WATER},
    "surroundings_water": {"fill-color": WATER},
    "waterway": {"line-color": "rgb(120, 184, 226)"},
    "coastline": {"line-color": "hsla(205, 66%, 42%, 0.55)"},
    "surroundings_coastline": {"line-color": "hsla(205, 66%, 42%, 0.55)"},
    "landcover_ice_shelf": {"fill-color": "rgb(238, 248, 252)"},
    # ── Land cover ─────────────────────────────────────────────────────────
    "landuse_residential": {"fill-color": "rgb(230, 231, 235)"},
    "landcover_wood": {"fill-color": "rgb(128, 196, 120)"},
    "park": {"fill-color": "rgb(148, 212, 132)"},
    "park_outline": {"line-color": "hsl(112, 45%, 50%)"},
    # National parks come from a bundled ONS file (offline only) and read as parks.
    "national_park": {"fill-color": "rgb(148, 212, 132)"},
    "national_park_outline": {"line-color": "hsl(112, 45%, 50%)"},
    "building": {
        "fill-color": "rgb(217, 219, 224)",
        "fill-outline-color": "rgb(195, 198, 205)",
    },
    # ── Aeroways and piers ─────────────────────────────────────────────────
    "aeroway-area": {"fill-color": "rgb(226, 224, 232)"},
    "aeroway-runway": {"line-color": "rgb(250, 250, 253)"},
    "aeroway-runway-casing": {"line-color": "rgb(190, 188, 200)"},
    "aeroway-taxiway": {"line-color": "rgb(226, 224, 232)"},
    "road_area_pier": {"fill-color": "rgb(243, 244, 246)"},
    "road_pier": {"line-color": "rgb(243, 244, 246)"},
    # ── Roads: a grey scale, darkest for motorways ─────────────────────────
    # Grey roads on the light grey land read like a modern street map and keep
    # the hierarchy by depth of grey rather than by hue, leaving colour to the
    # water, green areas and the overlays drawn on top.
    "highway_motorway_casing": {"line-color": "rgb(104, 109, 118)"},
    "highway_motorway_inner": {"line-color": "rgb(132, 137, 146)"},
    "highway_motorway_subtle": {"line-color": "rgba(132, 137, 146, 0.8)"},
    "tunnel_motorway_casing": {"line-color": "rgb(150, 155, 163)"},
    "tunnel_motorway_inner": {"line-color": "rgb(196, 200, 206)"},
    "highway_major_casing": {"line-color": "rgb(146, 151, 160)"},
    "highway_major_inner": {"line-color": "rgb(172, 177, 185)"},
    "highway_major_subtle": {"line-color": "rgba(172, 177, 185, 0.8)"},
    "highway_minor": {"line-color": "rgb(231, 233, 237)"},
    "highway_path": {"line-color": "rgb(224, 226, 231)"},
    "surroundings_motorway": {"line-color": "rgba(132, 137, 146, 0.75)"},
    # ── Rail ───────────────────────────────────────────────────────────────
    "railway": {"line-color": "rgb(150, 142, 134)"},
    "railway_dashline": {"line-color": "rgb(226, 220, 212)"},
    "railway_service": {"line-color": "rgb(172, 164, 156)"},
    "railway_service_dashline": {"line-color": "rgb(232, 227, 220)"},
    "railway_transit": {"line-color": "rgb(172, 164, 156)"},
    "railway_transit_dashline": {"line-color": "rgb(232, 227, 220)"},
    # ── Boundaries ─────────────────────────────────────────────────────────
    "boundary_state": {"line-color": "rgb(176, 110, 186)"},
    "boundary_country_z0-4": {"line-color": "rgb(158, 82, 168)"},
    "boundary_country_z5-": {"line-color": "rgb(158, 82, 168)"},
    "surroundings_boundary": {"line-color": "rgb(176, 110, 186)"},
}

# Labels: one ink, one halo, at three weights. Place names carry the map's
# information, so they sit darker than anything they are drawn over.
LABEL_INK = "rgb(42, 45, 52)"
LABEL_INK_MINOR = "rgb(82, 87, 97)"
LABEL_HALO = "rgb(249, 250, 251)"
WATER_LABEL_INK = "rgb(21, 89, 143)"

LABELS: dict[str, str] = {
    "water_name": WATER_LABEL_INK,
    "highway_name_other": LABEL_INK_MINOR,
    "poi": LABEL_INK_MINOR,
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


def colour_paints(layer_id: str) -> dict[str, str | list] | None:
    """The colour paints for a layer id, or None when it is not in the table."""
    if layer_id in COLOURS:
        return COLOURS[layer_id]
    if layer_id in LABELS:
        return {"text-color": LABELS[layer_id], "text-halo-color": LABEL_HALO}
    return None


def source_background_is_water(style: dict) -> bool:
    """Whether the source paints its background in its own water colour.

    The offline builds draw land as an `earth` fill, so their background only
    shows where no polygon covers the canvas — and the water polygons do not
    quite meet at the 180° antimeridian. Painting the background as water hides
    that seam; painting it as land draws a pale line down the ocean at 180°.
    The online builds have no `earth` layer, so their background IS the land.
    Follow whichever choice the source made.
    """
    paints = {layer["id"]: layer.get("paint", {}) for layer in style["layers"]}
    background = paints.get("background", {}).get("background-color")
    water = paints.get("water", {}).get("fill-color")
    return background is not None and background == water


def recolour(style: dict, source_name: str) -> dict:
    """Return `style` with every colour paint replaced from the table."""
    background_is_water = source_background_is_water(style)
    missing: list[str] = []
    for layer in style["layers"]:
        paint = layer.get("paint")
        if not paint:
            continue
        colour_keys = [key for key in paint if "color" in key]
        if not colour_keys:
            continue

        replacements = colour_paints(layer["id"])
        if layer["id"] == "background" and background_is_water:
            replacements = {"background-color": WATER}
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
