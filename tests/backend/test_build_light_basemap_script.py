"""
tests/backend/test_build_light_basemap_script.py

Tests for frontend/scripts/build_light_basemap.py — the generator of the LIGHT
basemap (OpenStreetMap's default colours) from the dark `fiord` pair. It lives
outside the backend package, so it is loaded by path.

Pinned here:
  * the committed `osm-light{,-online}.json` are exactly what the script
    produces from the committed dark pair — a hand edit, or a dark-pair change
    without a re-run, fails;
  * a coloured layer missing from the tables stops the build rather than
    leaking a dark-palette colour into the light map;
  * the rules the recolour follows: hidden layers, paints the source lacks are
    never added (non-colour extras are), the background follows the source's
    land-or-water choice.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path

import pytest

_SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "scripts"
    / "build_light_basemap.py"
)


def _load():
    spec = importlib.util.spec_from_file_location("build_light_basemap", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


light = _load()


def _style(*layers: dict) -> dict:
    return {"version": 8, "sources": {}, "layers": list(layers)}


class TestCommittedFilesAreGenerated:
    @pytest.mark.parametrize(
        ("source", "target"),
        [("fiord", "osm-light"), ("fiord-online", "osm-light-online")],
    )
    def test_regenerating_reproduces_the_committed_style(
        self, tmp_path, monkeypatch, source, target
    ):
        assets = _SCRIPT.parents[1] / "assets"
        (tmp_path / "assets").mkdir()
        (tmp_path / "assets" / f"{source}.json").write_text(
            (assets / f"{source}.json").read_text()
        )
        monkeypatch.setattr(light, "ASSETS", tmp_path / "assets")
        light.build(source, target)
        assert (tmp_path / "assets" / f"{target}.json").read_text() == (
            assets / f"{target}.json"
        ).read_text()


class TestRecolour:
    def test_replaces_colours_from_the_table_and_stamps_provenance(self):
        style = light.recolour(
            _style({"id": "water", "paint": {"fill-color": "#000000"}}), "fiord"
        )
        assert style["layers"][0]["paint"]["fill-color"] == light.WATER
        assert "build_light_basemap.py" in style["metadata"]["sentinel:provenance"]
        assert "fiord.json" in style["metadata"]["sentinel:provenance"]

    def test_labels_get_ink_and_a_white_halo(self):
        layer = {
            "id": "place_city",
            "paint": {"text-color": "#fff", "text-halo-color": "#000"},
        }
        paint = light.recolour(_style(layer), "fiord")["layers"][0]["paint"]
        assert paint == {
            "text-color": light.PLACE_INK,
            "text-halo-color": light.LABEL_HALO,
        }

    def test_an_unlisted_coloured_layer_stops_the_build(self):
        with pytest.raises(SystemExit, match="No colour defined for: brand_new_layer"):
            light.recolour(
                _style({"id": "brand_new_layer", "paint": {"line-color": "#123456"}}),
                "fiord",
            )

    def test_layers_without_colour_paints_are_left_alone(self):
        layers = (
            {"id": "symbols_only", "paint": {"icon-opacity": 0.5}},
            {"id": "no_paint", "type": "symbol"},
        )
        style = light.recolour(_style(*copy.deepcopy(layers)), "fiord")
        assert [{k: v for k, v in layer.items()} for layer in style["layers"]] == list(
            layers
        )

    def test_hides_the_park_fill_and_nothing_else(self):
        style = light.recolour(
            _style(
                {"id": "park", "paint": {"fill-color": "#000"}},
                {"id": "landcover_wood", "paint": {"fill-color": "#000"}},
            ),
            "fiord",
        )
        park, wood = style["layers"]
        assert park["layout"]["visibility"] == "none"
        assert "layout" not in wood

    def test_never_adds_a_colour_paint_the_source_layer_does_not_use(self):
        # The table gives `building` a fill-outline-color; a source without one stays without.
        layer = {"id": "building", "paint": {"fill-color": "#000"}}
        paint = light.recolour(_style(layer), "fiord")["layers"][0]["paint"]
        assert paint == {"fill-color": "#d9d0c9"}

    def test_adds_the_non_colour_extras_the_table_asks_for(self):
        layer = {"id": "park_outline", "paint": {"line-color": "#000"}}
        paint = light.recolour(_style(layer), "fiord")["layers"][0]["paint"]
        assert paint["line-opacity"] == [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            0,
            8,
            1,
        ]

    def test_a_water_coloured_source_background_stays_water(self):
        # The offline builds paint the background as water to hide the 180° seam.
        style = _style(
            {"id": "background", "paint": {"background-color": "#123"}},
            {"id": "water", "paint": {"fill-color": "#123"}},
        )
        paints = [layer["paint"] for layer in light.recolour(style, "fiord")["layers"]]
        assert paints[0]["background-color"] == light.WATER

    def test_a_land_coloured_source_background_becomes_land(self):
        style = _style(
            {"id": "background", "paint": {"background-color": "#456"}},
            {"id": "water", "paint": {"fill-color": "#123"}},
        )
        paints = [layer["paint"] for layer in light.recolour(style, "fiord")["layers"]]
        assert paints[0]["background-color"] == light.LAND

    def test_major_roads_are_coloured_by_class_on_either_schema(self):
        expression = light.by_road_class("T", "P", "S", "R")
        assert expression[:2] == [
            "match",
            ["coalesce", ["get", "kind_detail"], ["get", "class"]],
        ]
        assert expression[2:] == [
            "trunk",
            "T",
            "primary",
            "P",
            "secondary",
            "S",
            "tertiary",
            "R",
            "P",
        ]


class TestBuild:
    def test_writes_the_target_beside_the_source(self, tmp_path, monkeypatch, capsys):
        (tmp_path / "assets").mkdir()
        (tmp_path / "assets" / "src.json").write_text(
            json.dumps(_style({"id": "water", "paint": {"fill-color": "#000"}}))
        )
        monkeypatch.setattr(light, "ASSETS", tmp_path / "assets")
        light.build("src", "out")
        written = json.loads((tmp_path / "assets" / "out.json").read_text())
        assert written["layers"][0]["paint"]["fill-color"] == light.WATER
        assert "wrote" in capsys.readouterr().out
