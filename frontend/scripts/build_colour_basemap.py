#!/usr/bin/env python3
"""Generate the COLOUR basemap styles from the light (`positron`) pair.

Sentinel ships three basemap palettes, each as an online build (planet vector
tiles) and an offline one (the local PMTiles archives). All six styles share
one geometry: the same sources, the same layers in the same order, the same
filters and the same widths. Only `paint` colours differ, which is what lets a
palette change be a repaint rather than a different map, and what lets every
layer-id-driven control (`RoadsToggleControl`, `NamesToggleControl`, terrain)
keep working untouched across all of them. The one exception is a handful of
low-zoom land-cover fills the colour build adds on top (see `EXTRA_LAYERS`);
they are tagged `sentinel:colour-only` in their metadata and no control keys
off them.

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

The palette is a saturated OSM-bright. `.maplibregl-canvas` dims every basemap
with `brightness(0.65) saturate(0.85)` — the map is ground for the overlays
drawn on it — so these values are pitched ABOVE where they should land: what
looks over-saturated in the raw JSON is what reads as colour on screen. Judge
them in the app, never in a colour picker.
"""

from __future__ import annotations

import json
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "assets"

# Layer id -> the colour paints it gets. Grouped the way the map reads, not the
# way the layer list is ordered.
COLOURS: dict[str, dict[str, str]] = {
    # ── Ground and water ───────────────────────────────────────────────────
    "background": {"background-color": "rgb(249, 243, 228)"},
    "earth": {"fill-color": "rgb(249, 243, 228)"},
    "surroundings_earth": {"fill-color": "rgb(249, 243, 228)"},
    "water": {"fill-color": "rgb(106, 176, 224)"},
    "surroundings_water": {"fill-color": "rgb(106, 176, 224)"},
    "waterway": {"line-color": "rgb(96, 168, 219)"},
    "coastline": {"line-color": "hsla(205, 62%, 45%, 0.55)"},
    "surroundings_coastline": {"line-color": "hsla(205, 62%, 45%, 0.55)"},
    "landcover_ice_shelf": {"fill-color": "rgb(238, 248, 252)"},
    # ── Land cover ─────────────────────────────────────────────────────────
    "landuse_residential": {"fill-color": "rgb(242, 231, 213)"},
    "landcover_wood": {"fill-color": "rgb(150, 205, 140)"},
    "park": {"fill-color": "rgb(166, 216, 152)"},
    "park_outline": {"line-color": "hsl(110, 42%, 55%)"},
    "building": {
        "fill-color": "rgb(226, 209, 186)",
        "fill-outline-color": "rgb(203, 181, 153)",
    },
    # ── Aeroways and piers ─────────────────────────────────────────────────
    "aeroway-area": {"fill-color": "rgb(226, 224, 232)"},
    "aeroway-runway": {"line-color": "rgb(250, 250, 253)"},
    "aeroway-runway-casing": {"line-color": "rgb(190, 188, 200)"},
    "aeroway-taxiway": {"line-color": "rgb(226, 224, 232)"},
    "road_area_pier": {"fill-color": "rgb(249, 243, 228)"},
    "road_pier": {"line-color": "rgb(249, 243, 228)"},
    # ── Roads: motorway orange, major gold, minor white ────────────────────
    "highway_motorway_casing": {"line-color": "rgb(214, 122, 32)"},
    "highway_motorway_inner": {"line-color": "rgb(251, 176, 72)"},
    "highway_motorway_subtle": {"line-color": "rgba(251, 176, 72, 0.8)"},
    "tunnel_motorway_casing": {"line-color": "rgb(214, 122, 32)"},
    "tunnel_motorway_inner": {"line-color": "rgb(253, 205, 143)"},
    "highway_major_casing": {"line-color": "rgb(220, 174, 70)"},
    "highway_major_inner": {"line-color": "rgb(255, 216, 122)"},
    "highway_major_subtle": {"line-color": "rgba(255, 216, 122, 0.8)"},
    "highway_minor": {"line-color": "rgb(255, 255, 253)"},
    "highway_path": {"line-color": "rgb(214, 190, 158)"},
    "surroundings_motorway": {"line-color": "hsla(30, 85%, 58%, 0.75)"},
    # ── Rail ───────────────────────────────────────────────────────────────
    "railway": {"line-color": "rgb(150, 142, 134)"},
    "railway_dashline": {"line-color": "rgb(226, 220, 212)"},
    "railway_service": {"line-color": "rgb(172, 164, 156)"},
    "railway_service_dashline": {"line-color": "rgb(232, 227, 220)"},
    "railway_transit": {"line-color": "rgb(172, 164, 156)"},
    "railway_transit_dashline": {"line-color": "rgb(232, 227, 220)"},
    # ── Boundaries ─────────────────────────────────────────────────────────
    "boundary_state": {"line-color": "rgb(176, 122, 180)"},
    "boundary_country_z0-4": {"line-color": "rgb(157, 96, 163)"},
    "boundary_country_z5-": {"line-color": "rgb(157, 96, 163)"},
    "surroundings_boundary": {"line-color": "rgb(176, 122, 180)"},
}

# Labels: one ink, one halo, at three weights. Place names carry the map's
# information, so they sit darker than anything they are drawn over.
LABEL_INK = "rgb(48, 44, 38)"
LABEL_INK_MINOR = "rgb(86, 80, 71)"
LABEL_HALO = "rgb(252, 248, 238)"
WATER_LABEL_INK = "rgb(21, 89, 143)"

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

# Low-zoom land cover — the one structural addition the colour map makes. Zoomed
# out, the light pair draws land as a single flat fill (wood only arrives at
# z10), which is right for a monochrome map but leaves a colour map with nothing
# to be colourful about. Both tile sources carry a coarse global land cover the
# other palettes ignore: the protomaps `landcover` layer (z0–7) offline, and the
# OpenMapTiles `landcover` layer online (ice from z0, vegetation/sand from ~z7).
# These layers exist ONLY in the colour build and are tagged so the palette
# geometry spec can tell them apart from the shared layers.
COLOUR_ONLY = "sentinel:colour-only"

PROTOMAPS_LANDCOVER = [
    "match",
    ["get", "kind"],
    "forest", "rgb(150, 205, 140)",
    "grassland", "rgb(200, 226, 160)",
    "scrub", "rgb(186, 212, 150)",
    "farmland", "rgb(236, 234, 190)",
    "barren", "rgb(240, 222, 182)",
    "glacier", "rgb(246, 251, 253)",
    "urban_area", "rgb(234, 220, 204)",
    "rgba(0, 0, 0, 0)",
]  # fmt: skip

OPENMAPTILES_LANDCOVER = [
    "match",
    ["get", "class"],
    "wood", "rgb(150, 205, 140)",
    "grass", "rgb(200, 226, 160)",
    "farmland", "rgb(236, 234, 190)",
    "wetland", "rgb(178, 214, 196)",
    "sand", "rgb(240, 222, 182)",
    "rock", "rgb(222, 214, 202)",
    "ice", "rgb(246, 251, 253)",
    "rgba(0, 0, 0, 0)",
]  # fmt: skip

# From z8 the UK archive's `landuse` layer carries detailed OSM cover (farmland,
# meadow, forest, scrub, wetland…) where its coarse `landcover` stops at z7, so
# this continues the cover over the UK at every zoom beyond that.
PROTOMAPS_LANDUSE_COVER = [
    "match",
    ["get", "kind"],
    ["forest", "wood"], "rgb(150, 205, 140)",
    ["grassland", "grass", "meadow", "recreation_ground", "village_green"], "rgb(200, 226, 160)",
    ["scrub", "heath"], "rgb(186, 212, 150)",
    ["farmland", "farmyard", "orchard", "vineyard", "allotments"], "rgb(236, 234, 190)",
    "wetland", "rgb(178, 214, 196)",
    ["bare_rock", "sand", "beach", "scree"], "rgb(240, 222, 182)",
    "glacier", "rgb(246, 251, 253)",
    "rgba(0, 0, 0, 0)",
]  # fmt: skip


def landcover_layer(
    layer_id: str,
    source: str,
    colour: list,
    source_layer: str = "landcover",
    **extra: object,
) -> dict:
    """A colour-only land-cover fill over `source`'s `source_layer`."""
    return {
        "id": layer_id,
        "type": "fill",
        "source": source,
        "source-layer": source_layer,
        "metadata": {COLOUR_ONLY: True},
        **extra,
        "filter": [
            "match",
            ["geometry-type"],
            ["MultiPolygon", "Polygon"],
            True,
            False,
        ],
        "paint": {"fill-antialias": False, "fill-color": colour, "fill-opacity": 0.9},
    }


# Build name -> [(insert after this layer id, layer)]. Each sits directly on the
# earth it belongs to, so water, parks and everything else still draw over it.
EXTRA_LAYERS: dict[str, list[tuple[str, dict]]] = {
    "positron": [
        (
            "surroundings_earth",
            landcover_layer(
                "surroundings_landcover", "surroundings", PROTOMAPS_LANDCOVER
            ),
        ),
        # Both go straight after `earth`, so list the detailed UK cover first:
        # the coarse layer inserted after it lands beneath it.
        (
            "earth",
            landcover_layer(
                "landuse_cover",
                "openmaptiles",
                PROTOMAPS_LANDUSE_COVER,
                "landuse",
                minzoom=8,
            ),
        ),
        (
            "earth",
            landcover_layer("landcover_lowzoom", "openmaptiles", PROTOMAPS_LANDCOVER),
        ),
    ],
    "positron-online": [
        # The planet tiles carry nothing but ice below ~z7, so the world view
        # borrows the bundled offline surroundings archive (local, so it loads
        # in online mode too), then hands over to the planet's own land cover
        # from z7 up (the shared `landcover_wood` draws over it from z10).
        (
            "background",
            landcover_layer(
                "landcover_lowzoom", "openmaptiles", OPENMAPTILES_LANDCOVER, minzoom=7
            ),
        ),
        (
            "background",
            landcover_layer(
                "surroundings_landcover", "surroundings", PROTOMAPS_LANDCOVER, maxzoom=7
            ),
        ),
    ],
}

# Build name -> sources the colour-only layers need that the light build lacks.
EXTRA_SOURCES: dict[str, dict[str, dict]] = {
    "positron-online": {
        "surroundings": {
            "type": "vector",
            "url": "pmtiles:///assets/tiles/surroundings.pmtiles",
        },
    },
}

PROVENANCE = (
    "Generated by frontend/scripts/build_colour_basemap.py from {source}.json — "
    "identical geometry plus colour-only land cover, palette substituted per layer id. "
    "Do not hand-edit: "
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


def add_layers(style: dict, additions: list[tuple[str, dict]]) -> None:
    """Insert each colour-only layer directly after its anchor layer id."""
    for anchor_id, layer in additions:
        ids = [existing["id"] for existing in style["layers"]]
        if anchor_id not in ids:
            raise SystemExit(
                f"Anchor layer {anchor_id!r} not found for {layer['id']!r}"
            )
        style["layers"].insert(ids.index(anchor_id) + 1, layer)


def build(source_name: str, target_name: str) -> None:
    source = ASSETS / f"{source_name}.json"
    target = ASSETS / f"{target_name}.json"
    style = recolour(json.loads(source.read_text()), source_name)
    style["sources"].update(EXTRA_SOURCES.get(source_name, {}))
    add_layers(style, EXTRA_LAYERS.get(source_name, []))
    target.write_text(json.dumps(style, indent=2) + "\n")
    print(f"wrote {target.relative_to(ASSETS.parents[1])}")


if __name__ == "__main__":
    build("positron", "cartographic")
    build("positron-online", "cartographic-online")
