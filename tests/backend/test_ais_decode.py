"""
tests/backend/test_ais_decode.py

Tests for backend/services/ais_decode.py — the adapter that maps a decoded
off-grid AIS sidecar event onto the AISStream-shaped envelope the shared vessel
store already understands.

This mapping is the whole reason off-grid and online AIS produce one picture, so
what matters here is that a real decoded event lands as a real vessel, and that
everything unusable is rejected *before* it can reach the store — a bad fix
would otherwise plot a ship at the north pole.
"""

import pytest

from backend.services import ais_decode, ais_store


@pytest.fixture(autouse=True)
def _clear_store():
    """The vessel store is process-wide; keep tests from seeing each other."""
    ais_store.store.clear()
    yield
    ais_store.store.clear()


def position_event(**overrides) -> dict:
    """A decoded Class-A position report, as the sidecar POSTs it."""
    return {
        "type": "ais",
        "mmsi": "227006760",
        "msgType": 1,
        "channel": "A",
        "lat": 49.475577,
        "lon": 0.13138,
        "sog": 7.4,
        "cog": 36.7,
        "heading": 35,
        "navStatus": 0,
        "ts": 1_700_000_000_000,
        **overrides,
    }


def static_event(**overrides) -> dict:
    """A decoded type-5 static/voyage report, as the sidecar POSTs it."""
    return {
        "type": "ais",
        "mmsi": "351759000",
        "msgType": 5,
        "channel": "B",
        "name": "EVER DIADEM",
        "shipType": 70,
        "callsign": "3FOF8",
        "destination": "NEW YORK",
        "imo": 9134270,
        "ts": 1_700_000_000_000,
        **overrides,
    }


# ── envelope_from_event ───────────────────────────────────────────────────────


class TestPositionMapping:
    def test_builds_a_position_envelope(self):
        envelope = ais_decode.envelope_from_event(position_event())
        assert envelope is not None
        assert envelope["MessageType"] == "PositionReport"
        report = envelope["Message"]["PositionReport"]
        assert report["UserID"] == "227006760"
        assert report["Latitude"] == pytest.approx(49.475577)
        assert report["Longitude"] == pytest.approx(0.13138)
        assert report["Sog"] == pytest.approx(7.4)
        assert report["Cog"] == pytest.approx(36.7)
        assert report["TrueHeading"] == pytest.approx(35)
        assert report["NavigationalStatus"] == pytest.approx(0)

    def test_metadata_carries_the_fix_the_store_reads_first(self):
        # ingest_envelope prefers MetaData's lat/lon, so an envelope that only
        # filled Message would silently drop every position.
        metadata = ais_decode.envelope_from_event(position_event())["MetaData"]
        assert metadata["MMSI"] == "227006760"
        assert metadata["latitude"] == pytest.approx(49.475577)
        assert metadata["longitude"] == pytest.approx(0.13138)
        assert metadata["time_utc"].startswith("2023-11-14 22:13:20")

    @pytest.mark.parametrize("message_type", [1, 2, 3, 18, 19, 27])
    def test_accepts_every_position_bearing_message_type(self, message_type):
        envelope = ais_decode.envelope_from_event(position_event(msgType=message_type))
        assert envelope is not None
        assert envelope["MessageType"] == "PositionReport"

    def test_ship_name_is_forwarded_when_present(self):
        envelope = ais_decode.envelope_from_event(position_event(name="SEA WOLF"))
        assert envelope["MetaData"]["ShipName"] == "SEA WOLF"
        assert envelope["Message"]["PositionReport"]["Name"] == "SEA WOLF"

    def test_ship_name_is_omitted_when_absent(self):
        envelope = ais_decode.envelope_from_event(position_event())
        assert "ShipName" not in envelope["MetaData"]
        assert "Name" not in envelope["Message"]["PositionReport"]

    def test_missing_optional_fields_become_none(self):
        event = position_event()
        for field in ("sog", "cog", "heading", "navStatus"):
            event.pop(field)
        report = ais_decode.envelope_from_event(event)["Message"]["PositionReport"]
        assert report["Sog"] is None
        assert report["Cog"] is None
        assert report["TrueHeading"] is None
        assert report["NavigationalStatus"] is None

    def test_non_numeric_optional_fields_become_none(self):
        report = ais_decode.envelope_from_event(position_event(sog="fast"))["Message"][
            "PositionReport"
        ]
        assert report["Sog"] is None

    def test_missing_timestamp_falls_back_to_now(self):
        envelope = ais_decode.envelope_from_event(position_event(ts=None))
        assert envelope["MetaData"]["time_utc"]


class TestRejectedEvents:
    """Everything that must not reach the store."""

    def test_rejects_a_non_dict(self):
        assert ais_decode.envelope_from_event("not an event") is None

    def test_rejects_a_missing_mmsi(self):
        event = position_event()
        event.pop("mmsi")
        assert ais_decode.envelope_from_event(event) is None

    @pytest.mark.parametrize("mmsi", ["", "abc", "1234", "12345678901", "227 006 760"])
    def test_rejects_a_malformed_mmsi(self, mmsi):
        assert ais_decode.envelope_from_event(position_event(mmsi=mmsi)) is None

    def test_rejects_a_missing_message_type(self):
        event = position_event()
        event.pop("msgType")
        assert ais_decode.envelope_from_event(event) is None

    def test_rejects_a_non_numeric_message_type(self):
        assert ais_decode.envelope_from_event(position_event(msgType="one")) is None

    @pytest.mark.parametrize("message_type", [4, 6, 8, 9, 21])
    def test_rejects_message_types_carrying_neither_position_nor_static_data(
        self, message_type
    ):
        # Base stations, binary messages and aids-to-navigation are not vessels.
        assert (
            ais_decode.envelope_from_event(position_event(msgType=message_type)) is None
        )

    def test_rejects_a_position_report_with_no_fix(self):
        event = position_event()
        event.pop("lat")
        event.pop("lon")
        assert ais_decode.envelope_from_event(event) is None

    @pytest.mark.parametrize(
        ("latitude", "longitude"),
        [(91.0, 0.0), (0.0, 181.0), (-91.0, 0.0), (0.0, -181.0)],
    )
    def test_rejects_the_position_not_available_sentinels(self, latitude, longitude):
        # AIS uses 91/181 for "no position"; taking them literally would drop a
        # vessel at the pole or on the date line.
        assert (
            ais_decode.envelope_from_event(position_event(lat=latitude, lon=longitude))
            is None
        )

    def test_rejects_a_non_numeric_position(self):
        assert ais_decode.envelope_from_event(position_event(lat="north")) is None


class TestStaticMapping:
    @pytest.mark.parametrize("message_type", [5, 24])
    def test_builds_a_static_envelope(self, message_type):
        envelope = ais_decode.envelope_from_event(static_event(msgType=message_type))
        assert envelope["MessageType"] == "ShipStaticData"
        message = envelope["Message"]["ShipStaticData"]
        assert message["Name"] == "EVER DIADEM"
        assert message["Type"] == 70
        assert message["Destination"] == "NEW YORK"
        assert message["ImoNumber"] == "9134270"
        assert message["CallSign"] == "3FOF8"

    def test_static_data_needs_no_position(self):
        # Type 5 carries no fix at all; requiring one would discard every name.
        envelope = ais_decode.envelope_from_event(static_event())
        assert envelope is not None
        assert "latitude" not in envelope["MetaData"]

    def test_strips_the_at_padding_ais_uses_for_unused_text(self):
        envelope = ais_decode.envelope_from_event(static_event(name="ARGO@@@@@@"))
        assert envelope["Message"]["ShipStaticData"]["Name"] == "ARGO"


# ── ingest_event ──────────────────────────────────────────────────────────────


class TestIngestEvent:
    def test_a_position_becomes_a_vessel_in_the_store(self):
        assert ais_decode.ingest_event(position_event()) is True
        vessel = ais_store.store.get("227006760")
        assert vessel is not None
        assert vessel["lat"] == pytest.approx(49.475577)
        assert vessel["sog"] == pytest.approx(7.4)

    def test_static_data_merges_into_a_later_position(self):
        # The reason static messages are mapped at all: a position report alone
        # has no name, type or destination.
        ais_decode.ingest_event(static_event())
        ais_decode.ingest_event(position_event(mmsi="351759000"))
        vessel = ais_store.store.get("351759000")
        assert vessel["name"] == "EVER DIADEM"
        assert vessel["typeLabel"] == "CARGO"
        assert vessel["family"] == "cargo"
        assert vessel["destination"] == "NEW YORK"
        assert vessel["callsign"] == "3FOF8"
        assert vessel["imo"] == "9134270"

    def test_an_unusable_event_is_ignored_without_raising(self):
        assert ais_decode.ingest_event({"type": "log", "line": "noise"}) is False
        assert len(ais_store.store) == 0

    def test_a_rejected_position_never_reaches_the_store(self):
        assert ais_decode.ingest_event(position_event(lat=91.0, lon=181.0)) is False
        assert len(ais_store.store) == 0

    def test_the_heading_not_available_sentinel_is_normalised_away(self):
        # 511 means "no heading"; the store drops it rather than pointing every
        # hull due north-ish.
        ais_decode.ingest_event(position_event(heading=511))
        assert ais_store.store.get("227006760")["heading"] is None
