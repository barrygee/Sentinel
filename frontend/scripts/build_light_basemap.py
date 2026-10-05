#!/usr/bin/env python3
"""Generate the LIGHT basemap styles from the dark (`fiord`) pair, in OpenStreetMap's default colours.

Sentinel ships two basemap palettes, DARK and LIGHT, each as an online build
(planet vector tiles) and an offline one (the local PMTiles archives). All four
styles share one geometry: the same sources, the same layers in the same order,
the same filters and the same widths. Only `paint` differs, which is what lets
a palette change be a repaint rather than a different map, and what lets every
layer-id-driven control (`RoadsToggleControl`, `NamesToggleControl`, terrain)
keep working untouched across both.

So this script does not author a style: it copies `fiord{,-online}.json` and
substitutes a paint per layer id from the tables below. Every pair draws
`park`/`park_outline` BENEATH `water`, since marine protected areas reach far
offshore and any park fill bright enough to read on land is a visible slab on
the sea. Run this after any change to the pair's geometry so LIGHT keeps up:

    python3 frontend/scripts/build_light_basemap.py

Every layer in the source that carries a colour paint must appear in the
tables — the script fails rather than silently leaving a dark-palette layer in
the light map. A table entry may also set non-colour paints (an opacity).
`designTokens.spec.ts` guards the generated files.

The palette is OpenStreetMap's default style (openstreetmap-carto): cream land,
pale blue water, green woodland, roads coloured by class — pink motorways, red
trunk roads, orange primary, yellow secondary, white tertiary and minor roads —
grey rail and purple administrative boundaries. The light map is shown
undimmed (see `MapLibreMap.vue`) so these values are what is seen on screen.

The road classes are told apart with one paint expression that works for both
tile schemas: the offline Protomaps tiles carry the class as `kind_detail`, the
online OpenMapTiles ones as `class`, with the same values (`trunk`, `primary`,
`secondary`, `tertiary`).
"""

from __future__ import annotations

import json
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "assets"

# openstreetmap-carto colours.
LAND = "#f2efe9"
WATER = "#aad3df"
FOREST = "#add19e"
RESIDENTIAL = "#e0dfdf"
PROTECTED_AREA_GREEN = "rgba(0, 128, 0, 0.35)"
ADMIN_PURPLE = "#8d618b"

ROAD_CLASS = ["coalesce", ["get", "kind_detail"], ["get", "class"]]


def by_road_class(trunk: str, primary: str, secondary: str, tertiary: str) -> list:
    """A colour per major-road class; anything unclassified draws as primary."""
    return [
        "match",
        ROAD_CLASS,
        "trunk",
        trunk,
        "primary",
        primary,
        "secondary",
        secondary,
        "tertiary",
        tertiary,
        primary,
    ]


MAJOR_ROAD_FILL = by_road_class("#f9b29c", "#fcd6a4", "#f7fabf", "#ffffff")
MAJOR_ROAD_CASING = by_road_class("#c84e2f", "#a06b00", "#707d05", "#8f8f8f")

# Layer id -> the paints it gets. Grouped the way the map reads, not the way
# the layer list is ordered.
COLOURS: dict[str, dict[str, str | list]] = {
    # ── Ground and water ───────────────────────────────────────────────────
    "background": {"background-color": LAND},
    "earth": {"fill-color": LAND},
    "surroundings_earth": {"fill-color": LAND},
    "water": {"fill-color": WATER},
    "surroundings_water": {"fill-color": WATER},
    "waterway": {"line-color": WATER},
    # Carto draws no coastline stroke; a faint one keeps the shore crisp where
    # land and water meet at low zoom.
    "coastline": {"line-color": "rgba(122, 170, 189, 0.6)"},
    "surroundings_coastline": {"line-color": "rgba(122, 170, 189, 0.6)"},
    "landcover_ice_shelf": {"fill-color": "#ddecec"},
    # ── Land cover ─────────────────────────────────────────────────────────
    "landuse_residential": {"fill-color": RESIDENTIAL},
    "landcover_wood": {"fill-color": FOREST},
    # The park layer is every OSM park AND every protected area — legal
    # boundaries, not vegetation (Northeast Greenland National Park is 970,000
    # km² of ice cap cut by ruler-straight lines). Carto marks protected areas
    # with a green outline, not a fill, so only the outline is drawn (see
    # HIDDEN), faded in once a boundary means something.
    "park": {"fill-color": "#c8facc"},
    "park_outline": {
        "line-color": PROTECTED_AREA_GREEN,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0, 8, 1],
    },
    # National parks come from a bundled ONS file (offline only). A light green
    # wash marks them, the way the moorland and heath inside them read on the
    # OSM map.
    "national_park": {"fill-color": "rgba(173, 209, 158, 0.45)"},
    "national_park_outline": {"line-color": PROTECTED_AREA_GREEN},
    "building": {"fill-color": "#d9d0c9", "fill-outline-color": "#c4b6ab"},
    # ── Aeroways and piers ─────────────────────────────────────────────────
    "aeroway-area": {"fill-color": "#e9e7e2"},
    "aeroway-runway": {"line-color": "#bbbbcc"},
    "aeroway-runway-casing": {"line-color": "#a3a3b5"},
    "aeroway-taxiway": {"line-color": "#bbbbcc"},
    "road_area_pier": {"fill-color": LAND},
    "road_pier": {"line-color": LAND},
    # ── Roads, coloured by class ───────────────────────────────────────────
    "highway_motorway_casing": {"line-color": "#dc2a67"},
    "highway_motorway_inner": {"line-color": "#e892a2"},
    "highway_motorway_subtle": {"line-color": "#e892a2"},
    "tunnel_motorway_casing": {"line-color": "rgba(220, 42, 103, 0.5)"},
    "tunnel_motorway_inner": {"line-color": "#f1c4cd"},
    "highway_major_casing": {"line-color": MAJOR_ROAD_CASING},
    "highway_major_inner": {"line-color": MAJOR_ROAD_FILL},
    "highway_major_subtle": {"line-color": MAJOR_ROAD_FILL},
    "highway_minor": {"line-color": "#ffffff"},
    "highway_path": {"line-color": "#fa8072"},
    "surroundings_motorway": {"line-color": "#e892a2"},
    # ── Rail: grey with white dashes ───────────────────────────────────────
    "railway": {"line-color": "#707070"},
    "railway_dashline": {"line-color": "#ffffff"},
    "railway_service": {"line-color": "#a6a6a6"},
    "railway_service_dashline": {"line-color": "#ffffff"},
    "railway_transit": {"line-color": "#a6a6a6"},
    "railway_transit_dashline": {"line-color": "#ffffff"},
    # ── Boundaries ─────────────────────────────────────────────────────────
    "boundary_state": {"line-color": "rgba(141, 97, 139, 0.55)"},
    "boundary_country_z0-4": {"line-color": ADMIN_PURPLE},
    "boundary_country_z5-": {"line-color": ADMIN_PURPLE},
    "surroundings_boundary": {"line-color": ADMIN_PURPLE},
}

# Labels, in Carto's inks: black places, purple regions and countries, blue
# water, grey roads and points of interest — all on a white halo.
PLACE_INK = "#000000"
MINOR_INK = "#333333"
REGION_INK = "#9e6a9e"
WATER_LABEL_INK = "#4d80b3"
LABEL_HALO = "rgba(255, 255, 255, 0.85)"

LABELS: dict[str, str] = {
    "water_name": WATER_LABEL_INK,
    "highway_name_other": MINOR_INK,
    "poi": MINOR_INK,
    "highway_ref": MINOR_INK,
    "place_other": MINOR_INK,
    "place_suburb": MINOR_INK,
    "place_village": PLACE_INK,
    "place_town": PLACE_INK,
    "place_city": PLACE_INK,
    "place_city_large": PLACE_INK,
    "surroundings_place_city": PLACE_INK,
    "place_state": REGION_INK,
    "place_country_other": REGION_INK,
    "place_country_minor": REGION_INK,
    "place_country_major": REGION_INK,
    "place_continent": REGION_INK,
}

# Layers the light map does not draw: the park fill, which would paint every
# protected area (moorland, farmland, towns and offshore waters) as one green
# slab. Its outline stays.
HIDDEN: frozenset[str] = frozenset({"park"})

PROVENANCE = (
    "Generated by frontend/scripts/build_light_basemap.py from {source}.json — "
    "identical geometry, OpenStreetMap default (openstreetmap-carto) palette substituted "
    "per layer id. Do not hand-edit: re-run the script instead, or the palettes drift apart."
)


def colour_paints(layer_id: str) -> dict[str, str | list] | None:
    """The paints for a layer id, or None when it is not in the tables."""
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
    """Return `style` with every colour paint replaced from the tables."""
    background_is_water = source_background_is_water(style)
    missing: list[str] = []
    for layer in style["layers"]:
        if layer["id"] in HIDDEN:
            layer.setdefault("layout", {})["visibility"] = "none"
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
        for key, value in replacements.items():
            # Only paints the layer already has, or non-colour extras the
            # table adds on purpose (an opacity) — never a colour key the
            # source layer does not use.
            if key in paint or "color" not in key:
                paint[key] = value

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
    build("fiord", "osm-light")
    build("fiord-online", "osm-light-online")
