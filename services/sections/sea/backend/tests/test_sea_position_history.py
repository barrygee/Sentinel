"""
Tests for Sea's replay history (sentinel_sea.services.sea_history) and where it
hooks in: the store's single ingest seam (fed by AISStream and by the off-grid
decoder, each naming its source), the module lifecycle and the routes.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sea import module as sea_module
from sentinel_sea.models import SeaPositionHistory
from sentinel_sea.services import ais_decode, ais_store, ais_stream, sea_history
from sentinel_sea.services.ais_store import AisVesselStore

TIME_UTC = "2026-09-12 08:41:03.000 +0000 UTC"
TIME_MS = 1_789_202_463_000


def position(mmsi=232012345, lat=51.07, lon=1.42, time_utc=TIME_UTC, **message_fields):
    message = {"UserID": mmsi, "Sog": 18.4, "Cog": 122.0, "TrueHeading": 121, "NavigationalStatus": 0}
    message.update(message_fields)
    return {
        "MessageType": "PositionReport",
        "MetaData": {
            "MMSI": mmsi,
            "ShipName": "PRIDE OF KENT",
            "latitude": lat,
            "longitude": lon,
            "time_utc": time_utc,
        },
        "Message": {"PositionReport": message},
    }


@pytest.fixture
def recording(monkeypatch):
    monkeypatch.setattr(sea_history.recorder, "enabled", True)
    monkeypatch.setattr(sea_history.recorder, "_buffer", type(sea_history.recorder._buffer)(maxlen=1000))
    monkeypatch.setattr(sea_history.recorder, "_last_stored", {})
    return sea_history.recorder


def record(**overrides) -> dict:
    base = {
        "mmsi": "232012345",
        "name": "PRIDE OF KENT",
        "type": "60",
        "typeLabel": "PASSENGER",
        "family": "passenger",
        "navStatus": 0,
        "cog": 122.0,
        "destination": "CALAIS",
        "callsign": "GBRX",
        "lat": 51.07,
        "lon": 1.42,
        "sog": 18.4,
        "heading": 121,
        "lastPositionMs": TIME_MS,
    }
    base.update(overrides)
    return base


class TestRecordVessel:
    def test_does_nothing_while_recording_is_off(self, monkeypatch):
        monkeypatch.setattr(sea_history.recorder, "enabled", False)
        assert sea_history.record_vessel(record(), "online") is False

    def test_maps_the_live_record(self, recording):
        assert sea_history.record_vessel(record(), "offgrid") is True
        (sample,) = recording._buffer
        assert (sample.entity_id, sample.t_ms, sample.lat, sample.lon) == ("232012345", TIME_MS, 51.07, 1.42)
        assert (sample.heading, sample.speed, sample.alt, sample.source_mode) == (121, 18.4, None, "offgrid")
        assert sample.extra == {
            "name": "PRIDE OF KENT",
            "type": "60",
            "typeLabel": "PASSENGER",
            "family": "passenger",
            "navStatus": 0,
            "cog": 122.0,
            "destination": "CALAIS",
            "callsign": "GBRX",
        }

    def test_heading_falls_back_to_course_over_ground(self, recording):
        sea_history.record_vessel(record(heading=None), "online")
        assert recording._buffer[0].heading == 122.0

    def test_blank_text_fields_are_left_out(self, recording):
        sea_history.record_vessel(record(type="", destination="", callsign="", navStatus=None), "online")
        assert set(recording._buffer[0].extra) == {"name", "typeLabel", "family", "cog"}

    def test_a_vessel_reporting_every_few_seconds_is_thinned(self, recording):
        """Under 30 s apart is never stored, however far it moved."""
        sea_history.record_vessel(record(), "online")
        assert sea_history.record_vessel(record(lastPositionMs=TIME_MS + 10_000, lat=51.08), "online") is False
        assert sea_history.record_vessel(record(lastPositionMs=TIME_MS + 31_000, lat=51.08), "online") is True

    def test_a_moored_vessel_is_kept_every_five_minutes(self, recording):
        sea_history.record_vessel(record(), "online")
        assert sea_history.record_vessel(record(lastPositionMs=TIME_MS + 200_000), "online") is False
        assert sea_history.record_vessel(record(lastPositionMs=TIME_MS + 300_000), "online") is True


class TestIngestSeam:
    def test_the_store_offers_each_position_with_the_callers_source(self, recording):
        store = AisVesselStore()
        assert store.ingest_envelope(position(), 1, source_mode="offgrid") is True
        (sample,) = recording._buffer
        assert (sample.entity_id, sample.t_ms, sample.source_mode) == ("232012345", TIME_MS, "offgrid")

    def test_without_a_named_source_it_uses_the_stores_current_one(self, recording):
        store = AisVesselStore()
        store.source_mode = "offgrid"
        store.ingest_envelope(position(), 1)
        assert recording._buffer[0].source_mode == "offgrid"

    def test_with_no_source_known_at_all_it_is_online(self, recording):
        AisVesselStore().ingest_envelope(position(), 1)
        assert recording._buffer[0].source_mode == "online"

    def test_static_data_alone_records_nothing(self, recording):
        static = {
            "MessageType": "ShipStaticData",
            "MetaData": {"MMSI": 232012345, "ShipName": "PRIDE OF KENT"},
            "Message": {"ShipStaticData": {"UserID": 232012345, "Name": "PRIDE OF KENT", "Type": 60}},
        }
        AisVesselStore().ingest_envelope(static, 1, source_mode="online")
        assert len(recording._buffer) == 0

    def test_one_track_continues_across_a_source_switch(self, recording):
        """The live store is cleared on a switch; history keeps both sides, one entity."""
        store = AisVesselStore()
        store.ingest_envelope(position(), 1, source_mode="online")
        store.ingest_envelope(
            position(lat=51.2, time_utc="2026-09-12 08:42:03.000 +0000 UTC"), 2, source_mode="offgrid"
        )
        assert [(sample.entity_id, sample.source_mode) for sample in recording._buffer] == [
            ("232012345", "online"),
            ("232012345", "offgrid"),
        ]

    def test_the_aisstream_reader_names_its_source_online(self, monkeypatch):
        calls = []

        class SpyStore:
            def ingest_envelope(self, envelope, received_ms=None, source_mode=None):
                calls.append(source_mode)
                return True

        reader = ais_stream.AisStreamReader.__new__(ais_stream.AisStreamReader)
        reader.store = SpyStore()
        reader.status = "connecting"
        reader._now = lambda: 5
        reader._handle_frame(json.dumps(position()))
        assert calls == ["online"]
        assert reader.status == "live"

    def test_the_off_grid_decoder_names_its_source_offgrid(self, monkeypatch):
        calls = []

        def spy(envelope, received_ms=None, source_mode=None):
            calls.append(source_mode)
            return True

        monkeypatch.setattr(ais_store.store, "ingest_envelope", spy)
        event = {
            "type": "ais",
            "mmsi": "227006760",
            "msgType": 1,
            "lat": 49.4,
            "lon": 0.1,
            "sog": 7.4,
            "cog": 36.7,
            "heading": 35,
            "navStatus": 0,
            "ts": 1_700_000_000_000,
        }
        assert ais_decode.ingest_event(event) is True
        assert calls == ["offgrid"]


async def test_recorded_vessels_land_in_sea_position_history(test_engine, db_setup, recording, monkeypatch):
    factory = lambda: AsyncSession(test_engine, expire_on_commit=False)  # noqa: E731
    monkeypatch.setattr(sea_history.recorder, "session_factory", factory)
    AisVesselStore().ingest_envelope(position(), 1, source_mode="offgrid")
    async with factory() as db:
        await sea_history.recorder.flush(db)
        rows = (await db.execute(select(SeaPositionHistory))).scalars().all()
    assert [(row.entity_id, row.t_ms, row.source_mode) for row in rows] == [("232012345", TIME_MS, "offgrid")]


async def test_the_module_runs_history_beside_the_reader_in_every_mode(monkeypatch):
    events: list[str] = []

    def recorder_of(name):
        async def record_event(*_args, **_kwargs):
            events.append(name)
            return True

        return record_event

    monkeypatch.setattr(sea_module.ais_reader, "start", recorder_of("reader.start"))
    monkeypatch.setattr(sea_module.ais_reader, "stop", recorder_of("reader.stop"))
    monkeypatch.setattr(sea_module.sea_ais_receiver, "reconcile_now", recorder_of("receiver.reconcile"))
    monkeypatch.setattr(sea_history.recorder, "start", recorder_of("recorder.start"))
    monkeypatch.setattr(sea_history.recorder, "stop", recorder_of("recorder.stop"))
    monkeypatch.setattr(sea_history.retention, "start", recorder_of("retention.start"))
    monkeypatch.setattr(sea_history.retention, "stop", recorder_of("retention.stop"))

    await sea_module._start()
    await sea_module._stop()
    assert events == [
        "reader.start",
        "recorder.start",
        "retention.start",
        "receiver.reconcile",
        "reader.stop",
        "retention.stop",
        "recorder.stop",
    ]


def test_the_history_routes_answer(client):
    status = client.get("/api/sea/history/status")
    assert status.status_code == 200
    assert status.json()["lookbackMs"] == sea_history.REPLAY_LOOKBACK_MS
    assert client.get("/api/sea/history/coverage").status_code == 200
    assert client.get("/api/sea/history/samples").status_code == 422
