"""
tests/backend/test_adsb_receiver_centre.py

Where the ADS-B query is centred (owner's rule, 2026-10-05):

  * online — the map centre the browser sends: the area being looked at;
  * off grid — the selected receiver's location: aircraft come from the
    operator's own receiver, which only hears what is around it, so a
    map-centred area hid its aircraft once the map was panned away.

Covers the hub's ``hub.sentry.host.location`` reply (backend/radio_hub/services/
sentry_reservations.py), Air's ``adsb_source.receiver_location`` and the swap in
``GET /api/air/adsb/point/{lat}/{lon}/{radius}`` (backend/routers/air.py). The
upstream fetch is replaced by a recorder, and the Sentry fleet snapshot by a stub.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.db_helpers import upsert_setting
from backend.platform.bus import bus
from backend.radio_hub.services import sentry_reservations
from backend.services import adsb as adsb_service
from backend.services import adsb_source

RECEIVER = (54.951186, -1.532995)  # the Sentry host's reported position
SOURCE = {"sentry_host_id": 1, "sentry_device_id": "usb:1-1.1"}


def _snapshot_with(location):
    return SimpleNamespace(status_payload={"location": location, "sdrs": []})


@pytest.fixture()
def snapshots(monkeypatch) -> dict:
    """host id → snapshot the fake fleet poller returns (absent = never polled)."""
    by_host: dict = {
        1: _snapshot_with({"latitude": RECEIVER[0], "longitude": RECEIVER[1]})
    }
    monkeypatch.setattr(sentry_reservations.fleet_poller, "get_snapshot", by_host.get)
    return by_host


# ── the hub's reply ──────────────────────────────────────────────────────────


class TestHostLocationReply:
    async def test_reports_the_hosts_position(self, snapshots):
        reply = await bus.request(
            sentry_reservations.HOST_LOCATION_SUBJECT, {"db": None, "host_id": 1}
        )
        assert reply == {
            "ok": True,
            "found": True,
            "latitude": RECEIVER[0],
            "longitude": RECEIVER[1],
        }

    async def test_integer_coordinates_are_returned_as_floats(self, snapshots):
        snapshots[1] = _snapshot_with({"latitude": 55, "longitude": -2})
        reply = await bus.request(
            sentry_reservations.HOST_LOCATION_SUBJECT, {"db": None, "host_id": 1}
        )
        assert (reply["latitude"], reply["longitude"]) == (55.0, -2.0)
        assert isinstance(reply["latitude"], float)

    @pytest.mark.parametrize(
        "snapshot",
        [
            None,  # host never polled
            SimpleNamespace(status_payload=None),  # polled, but unreachable so far
            _snapshot_with(None),  # host reports no location
            _snapshot_with({"latitude": 54.9}),  # half a position
            _snapshot_with({"latitude": "54.9", "longitude": "-1.5"}),  # strings
            _snapshot_with(
                {"latitude": True, "longitude": False}
            ),  # bools are ints in Python
            _snapshot_with({"latitude": 91.0, "longitude": 0.0}),
            _snapshot_with({"latitude": 0.0, "longitude": -180.5}),
        ],
    )
    async def test_anything_but_a_valid_position_is_not_found(
        self, snapshots, snapshot
    ):
        snapshots[1] = snapshot
        reply = await bus.request(
            sentry_reservations.HOST_LOCATION_SUBJECT, {"db": None, "host_id": 1}
        )
        assert reply == {"ok": True, "found": False}

    async def test_the_extreme_valid_positions_are_found(self, snapshots):
        snapshots[1] = _snapshot_with({"latitude": -90, "longitude": 180})
        reply = await bus.request(
            sentry_reservations.HOST_LOCATION_SUBJECT, {"db": None, "host_id": 1}
        )
        assert reply["found"] is True


# ── Air's lookup ─────────────────────────────────────────────────────────────


@pytest.fixture()
async def db(test_engine, db_setup):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with factory() as session:
        yield session


class TestReceiverLocation:
    async def test_the_selected_sources_host_position(self, db, snapshots):
        await upsert_setting(db, "air", "offgridSdrSource", SOURCE)
        assert await adsb_source.receiver_location(db) == RECEIVER

    async def test_none_without_a_selected_source(self, db, snapshots):
        assert await adsb_source.receiver_location(db) is None

    async def test_none_when_the_hub_has_no_position_for_the_host(self, db, snapshots):
        await upsert_setting(
            db, "air", "offgridSdrSource", {**SOURCE, "sentry_host_id": 2}
        )
        assert await adsb_source.receiver_location(db) is None


# ── the endpoint ─────────────────────────────────────────────────────────────


@pytest.fixture()
def fetched(monkeypatch) -> list:
    """Centre and upstream host of every fetch the endpoint makes."""
    calls: list = []

    async def _fetch(lat, lon, radius, base_url):
        calls.append(((round(lat, 6), round(lon, 6)), base_url.split("/")[2]))
        return {"ac": []}

    monkeypatch.setattr(adsb_service, "fetch_aircraft", _fetch)
    return calls


def _put(client, namespace, key, value):
    assert (
        client.put(
            f"/api/settings/{namespace}/{key}", json={"value": value}
        ).status_code
        == 200
    )


class TestQueryCentre:
    def test_online_uses_the_map_centre(self, client, snapshots, fetched):
        _put(client, "air", "sourceOverride", "online")
        _put(client, "air", "offgridSdrSource", SOURCE)  # picked, but not used online
        assert client.get("/api/air/adsb/point/51.5/-0.12/250").status_code == 200
        assert fetched == [((51.5, -0.12), "api.adsb.lol")]

    def test_off_grid_uses_the_selected_receivers_location(
        self, client, snapshots, fetched
    ):
        _put(client, "air", "sourceOverride", "offgrid")
        _put(client, "air", "offgridSdrSource", SOURCE)
        client.get("/api/air/adsb/point/51.5/-0.12/250")
        assert fetched == [(RECEIVER, "adsb-decoder:8080")]

    def test_off_grid_pans_share_one_receiver_centred_cache_entry(
        self, client, snapshots, fetched
    ):
        _put(client, "air", "sourceOverride", "offgrid")
        _put(client, "air", "offgridSdrSource", SOURCE)
        first = client.get("/api/air/adsb/point/51.5/-0.12/250")
        panned = client.get("/api/air/adsb/point/40.0/-70.0/250")
        assert (first.headers["X-Cache"], panned.headers["X-Cache"]) == ("MISS", "HIT")
        assert len(fetched) == 1

    def test_off_grid_without_a_receiver_falls_back_to_the_map_centre(
        self, client, snapshots, fetched
    ):
        _put(client, "air", "sourceOverride", "offgrid")
        client.get("/api/air/adsb/point/48.85/2.35/250")
        assert fetched == [((48.85, 2.35), "adsb-decoder:8080")]

    def test_off_grid_with_no_known_position_falls_back_to_the_map_centre(
        self, client, snapshots, fetched
    ):
        snapshots[1] = _snapshot_with(None)
        _put(client, "air", "sourceOverride", "offgrid")
        _put(client, "air", "offgridSdrSource", SOURCE)
        client.get("/api/air/adsb/point/48.85/2.35/250")
        assert fetched == [((48.85, 2.35), "adsb-decoder:8080")]

    def test_the_global_mode_counts_when_air_has_no_override(
        self, client, snapshots, fetched
    ):
        _put(client, "app", "connectivityMode", "offgrid")
        _put(client, "air", "offgridSdrSource", SOURCE)
        client.get("/api/air/adsb/point/51.5/-0.12/250")
        assert fetched[0][0] == RECEIVER
