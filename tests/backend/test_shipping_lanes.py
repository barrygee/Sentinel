"""
tests/backend/test_shipping_lanes.py

Charted shipping routes from Overpass: grid cells, the Overpass QL, the
Overpass → GeoJSON conversion, the rate-limited cell fetch, and the cell
cache (served at once, missing cells fetched in the background, failures
left for next time, stale rows still served).
"""

import asyncio
import json

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.models import SeaLaneCache
from backend.services import shipping_lanes
from backend.services.shipping_lanes import (
    build_query,
    cell_bbox,
    cell_key,
    grid_cells,
    lanes_for_bbox,
    overpass_to_features,
)


async def settled():
    """Wait for every background cell fetch to finish."""
    for _ in range(200):
        if not shipping_lanes._in_flight:
            return
        await asyncio.sleep(0.005)
    raise AssertionError("background fetch never finished")


@pytest.fixture(autouse=True)
def _db(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(shipping_lanes, "AsyncSessionLocal", factory)
    # A fresh, unspaced limiter so tests never sleep out the Overpass interval.
    monkeypatch.setattr(
        shipping_lanes,
        "_overpass_limiter",
        shipping_lanes.MinimumIntervalRateLimiter(0),
    )
    shipping_lanes._in_flight.clear()
    return factory


def test_grid_cells_and_cell_bbox():
    assert grid_cells(50.5, 0.5, 51.5, 1.5) == [(25, 0)]
    assert grid_cells(49.9, -0.1, 52.1, 2.1) == [
        (24, -1),
        (24, 0),
        (24, 1),
        (25, -1),
        (25, 0),
        (25, 1),
        (26, -1),
        (26, 0),
        (26, 1),
    ]
    assert grid_cells(88, 178, 90, 180) == [
        (44, 89)
    ]  # the poles / antimeridian edge stay in range
    assert cell_bbox((25, 0)) == (50.0, 0.0, 52.0, 2.0)
    assert cell_key((25, -1)) == "25_-1"


def test_build_query_targets_route_types_only():
    query = build_query(50.0, 0.0, 52.0, 2.0)
    assert query.startswith("[out:json]")
    assert "(50.0000,0.0000,52.0000,2.0000)" in query
    assert "separation_lane" in query and "two-way_route" in query
    assert "light" not in query and "buoy" not in query
    assert query.endswith("out geom;")


def test_overpass_to_features_converts_ways_and_relations():
    payload = {
        "elements": [
            {
                "type": "way",
                "id": 1,
                "tags": {"seamark:type": "separation_zone", "seamark:name": "Dover"},
                "geometry": [
                    {"lat": 0, "lon": 0},
                    {"lat": 0, "lon": 1},
                    {"lat": 1, "lon": 1},
                    {"lat": 0, "lon": 0},
                ],
            },
            {
                "type": "way",
                "id": 2,
                "tags": {"seamark:type": "separation_boundary"},
                "geometry": [
                    {"lat": 0, "lon": 0},
                    {"lat": 0, "lon": 1},
                    {"lat": 1, "lon": 1},
                    {"lat": 0, "lon": 0},
                ],
            },
            {
                "type": "way",
                "id": 3,
                "tags": {"seamark:type": "separation_lane"},
                "geometry": [{"lat": 0, "lon": 0}, {"lat": 0, "lon": 1}],
            },  # open way, area type
            {
                "type": "way",
                "id": 4,
                "tags": {"seamark:type": "light"},
                "geometry": [{"lat": 0, "lon": 0}],
            },
            {
                "type": "way",
                "id": 5,
                "tags": {"seamark:type": "fairway"},
                "geometry": [{"lat": 0, "lon": 0}],
            },  # too short
            {"type": "way", "id": 6, "tags": {"seamark:type": "fairway"}},
            {"type": "node", "id": 7, "tags": {"seamark:type": "fairway"}},
            {"type": "way", "id": 8},
            {
                "type": "relation",
                "id": 9,
                "tags": {"seamark:type": "precautionary_area", "name": "Sunk"},
                "members": [
                    {
                        "type": "way",
                        "role": "outer",
                        "geometry": [
                            {"lat": 0, "lon": 0},
                            {"lat": 0, "lon": 1},
                            {"lat": 1, "lon": 1},
                            {"lat": 0, "lon": 0},
                        ],
                    },
                    {
                        "type": "way",
                        "role": "inner",
                        "geometry": [{"lat": 5, "lon": 5}],
                    },
                    {"type": "node", "role": "label"},
                ],
            },
        ]
    }
    features = overpass_to_features(payload)
    kinds = [
        (feature["properties"]["kind"], feature["geometry"]["type"])
        for feature in features
    ]
    assert kinds == [
        ("separation_zone", "Polygon"),
        ("separation_boundary", "LineString"),  # never an area, even when closed
        ("separation_lane", "LineString"),  # open way
        ("precautionary_area", "Polygon"),
    ]
    assert (
        features[0]["properties"]["name"] == "Dover"
        and features[0]["properties"]["osmId"] == "way/1"
    )
    assert features[3]["properties"] == {
        "kind": "precautionary_area",
        "area": True,
        "name": "Sunk",
        "osmId": "relation/9",
        "role": "outer",
    }
    assert features[0]["geometry"]["coordinates"] == [[[0, 0], [1, 0], [1, 1], [0, 0]]]
    assert overpass_to_features({}) == []


async def test_fetch_cell_posts_the_query_and_converts(monkeypatch):
    seen = {}

    async def fake_post(self, url, data=None, headers=None):
        seen["url"] = url
        seen["query"] = data["data"]
        seen["ua"] = headers["User-Agent"]
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "way",
                        "id": 1,
                        "tags": {"seamark:type": "fairway"},
                        "geometry": [{"lat": 0, "lon": 0}, {"lat": 1, "lon": 1}],
                    }
                ]
            },
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    features = await shipping_lanes.fetch_cell((25, 0))
    assert [feature["properties"]["kind"] for feature in features] == ["fairway"]
    assert seen["url"] == settings.sea_lanes_overpass_url
    assert "(50.0000,0.0000,52.0000,2.0000)" in seen["query"]
    assert "Sentinel" in seen["ua"]


async def test_fetch_cell_raises_on_http_errors(monkeypatch):
    async def fake_post(self, url, data=None, headers=None):
        return httpx.Response(429, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    with pytest.raises(httpx.HTTPStatusError):
        await shipping_lanes.fetch_cell((25, 0))


class TestLanesForBbox:
    async def test_too_wide(self, monkeypatch):
        monkeypatch.setattr(settings, "sea_lanes_max_cells", 1)
        result = await lanes_for_bbox(49.9, -0.1, 52.1, 2.1)
        assert result["tooWide"] is True and result["features"] == []

    async def test_missing_cells_are_fetched_in_the_background_then_served(
        self, _db, monkeypatch
    ):
        feature = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
            "properties": {"kind": "separation_lane"},
        }
        calls = []

        async def fake_fetch(cell):
            calls.append(cell)
            return [feature]

        monkeypatch.setattr(shipping_lanes, "fetch_cell", fake_fetch)
        first = await lanes_for_bbox(50.5, 0.5, 51.5, 1.5)
        assert first["partial"] is True and first["features"] == []
        # The cell is marked in flight the moment it is queued, so a request
        # landing mid-fetch queues nothing new. (Not exercised with a second
        # concurrent call here: the test DB is one shared in-memory connection,
        # which two overlapping sessions would fight over.)
        assert shipping_lanes._in_flight == {"25_0"}
        await settled()
        assert calls == [(25, 0)]
        second = await lanes_for_bbox(50.5, 0.5, 51.5, 1.5)
        assert second["partial"] is False and second["features"] == [feature]
        async with _db() as db:
            rows = (await db.execute(select(SeaLaneCache))).scalars().all()
        assert [row.cell for row in rows] == ["25_0"]

    async def test_failed_fetch_is_left_for_next_time(self, _db, monkeypatch):
        async def boom(cell):
            raise RuntimeError("overpass down")

        monkeypatch.setattr(shipping_lanes, "fetch_cell", boom)
        await lanes_for_bbox(50.5, 0.5, 51.5, 1.5)
        await settled()
        assert shipping_lanes._in_flight == set()
        async with _db() as db:
            assert (await db.execute(select(SeaLaneCache))).scalars().all() == []

    async def test_stale_rows_are_served_while_refreshing(self, _db, monkeypatch):
        old_feature = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
            "properties": {"kind": "fairway"},
        }
        new_feature = {**old_feature, "properties": {"kind": "separation_lane"}}
        async with _db() as db:
            db.add(
                SeaLaneCache(
                    cell="25_0", payload=json.dumps([old_feature]), fetched_at=1
                )
            )
            await db.commit()

        async def fake_fetch(cell):
            return [new_feature]

        monkeypatch.setattr(shipping_lanes, "fetch_cell", fake_fetch)
        stale = await lanes_for_bbox(50.5, 0.5, 51.5, 1.5)
        assert stale["partial"] is True and stale["features"] == [old_feature]
        await settled()
        fresh = await lanes_for_bbox(50.5, 0.5, 51.5, 1.5)
        assert fresh["partial"] is False and fresh["features"] == [new_feature]
