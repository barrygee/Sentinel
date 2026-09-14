"""
tests/backend/test_ais_store.py

The in-memory AIS vessel store behind the Sea map: ship-type classification,
envelope ingest (position + static merge, liveness rules, bad input), expiry
and cap pruning, bbox queries (incl. the antimeridian), track thinning, and
the incremental SQLite snapshot round trip.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.services import ais_store
from backend.services.ais_store import (
    AisVesselStore,
    classify_ship_type,
    parse_ais_timestamp_ms,
)

T0 = 1_000_000_000_000  # an arbitrary "now" in Unix ms


def position(
    mmsi=232012345,
    lat=51.07,
    lon=1.42,
    time_utc="2026-09-12 08:41:03.123 +0000 UTC",
    **msg,
):
    message = {
        "UserID": mmsi,
        "Sog": 18.4,
        "Cog": 122.0,
        "TrueHeading": 121,
        "NavigationalStatus": 0,
    }
    message.update(msg)
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


def static(mmsi=232012345, **fields):
    body = {
        "Type": 60,
        "Destination": "DOVER",
        "ImoNumber": 9015266,
        "CallSign": "GBPK",
    }
    body.update(fields)
    return {
        "MessageType": "ShipStaticData",
        "MetaData": {"MMSI": mmsi},
        "Message": {"ShipStaticData": body},
    }


# ── classify_ship_type ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (71, ("CARGO", "cargo")),
        ("80", ("TANKER", "tanker")),
        ("60", ("PASSENGER", "passenger")),
        ("30", ("FISHING", "fishing")),
        ("35", ("MILITARY", "military")),
        ("51", ("SAR", "sar")),
        ("52", ("TUG", "service")),
        ("37", ("PLEASURE", "pleasure")),
        ("99", ("OTHER", "other")),
        ("15", ("OTHER", "other")),  # family 1 is not mapped
        ("0", ("", "other")),
        ("", ("", "other")),
        (None, ("", "other")),
        ("Tanker", ("TANKER", "tanker")),
        ("Container ship", ("CONTAINER SHIP", "cargo")),
        ("Ferry", ("FERRY", "passenger")),
        ("Research", ("RESEARCH", "other")),
    ],
)
def test_classify_ship_type(raw, expected):
    assert classify_ship_type(raw) == expected


# ── timestamps ────────────────────────────────────────────────────────────────


def test_parse_ais_timestamp_handles_aisstream_format_and_fallbacks():
    assert (
        parse_ais_timestamp_ms("2026-09-12 08:41:03.123456789 +0000 UTC")
        == 1789202463123
    )
    assert parse_ais_timestamp_ms("2026-09-12 08:41:03 UTC") == 1789202463000
    assert parse_ais_timestamp_ms("2026-09-12T08:41:03") == 1789202463000  # naive → UTC
    now_ish = parse_ais_timestamp_ms("not a date")
    assert abs(now_ish - ais_store.now_ms()) < 5_000
    assert abs(parse_ais_timestamp_ms(None) - ais_store.now_ms()) < 5_000


# ── ingest ────────────────────────────────────────────────────────────────────


class TestIngest:
    def test_position_report_creates_vessel_record(self):
        store = AisVesselStore()
        assert store.ingest_envelope(position(), T0) is True
        [row] = store.vessels(10)
        assert row["mmsi"] == "232012345"
        assert row["name"] == "PRIDE OF KENT"
        assert row["lat"] == 51.07 and row["lon"] == 1.42
        assert row["sog"] == 18.4 and row["cog"] == 122.0 and row["heading"] == 121
        assert row["navStatus"] == 0
        assert row["lastPositionMs"] == 1789202463123
        assert row["lastPositionUtc"] == "2026-09-12T08:41:03Z"
        assert row["family"] == "other" and row["typeLabel"] == ""
        assert "_updatedAt" not in row
        assert store.newest_position_ms == 1789202463123
        assert len(store) == 1

    def test_static_data_merges_into_live_record_and_later_positions(self):
        store = AisVesselStore()
        store.ingest_envelope(position(), T0)
        assert store.ingest_envelope(static(), T0 + 1) is True
        row = store.get("232012345")
        assert row["typeLabel"] == "PASSENGER" and row["family"] == "passenger"
        assert (
            row["destination"] == "DOVER"
            and row["imo"] == "9015266"
            and row["callsign"] == "GBPK"
        )
        # A subsequent position report keeps the static fields.
        store.ingest_envelope(position(lat=51.1), T0 + 2)
        row = store.get("232012345")
        assert (
            row["destination"] == "DOVER" and row["type"] == "60" and row["lat"] == 51.1
        )

    def test_static_data_before_any_position_is_liveness_but_no_vessel(self):
        store = AisVesselStore()
        assert store.ingest_envelope(static(), T0) is True
        assert len(store) == 0
        store.ingest_envelope(position(), T0 + 1)
        assert store.get("232012345")["typeLabel"] == "PASSENGER"

    def test_static_merge_only_fills_gaps_and_names_unnamed_vessels(self):
        store = AisVesselStore()
        unnamed = position()
        unnamed["MetaData"]["ShipName"] = ""
        store.ingest_envelope(unnamed, T0)
        assert store.get("232012345")["name"] == "MMSI 232012345"
        store.ingest_envelope(static(Destination="CALAIS"), T0 + 1)
        # ShipStaticData without a Name keeps the placeholder; a Name replaces it.
        assert store.get("232012345")["name"] == "MMSI 232012345"
        store.ingest_envelope(static(Name="NEW NAME", Destination="X"), T0 + 2)
        row = store.get("232012345")
        assert row["name"] == "NEW NAME"
        assert row["destination"] == "CALAIS"  # first non-empty wins

    def test_static_data_report_uses_report_a_and_b(self):
        store = AisVesselStore()
        store.ingest_envelope(position(), T0)
        envelope = {
            "MessageType": "StaticDataReport",
            "MetaData": {"MMSI": 232012345},
            "Message": {
                "StaticDataReport": {
                    "ReportA": {"Name": "IGNORED"},
                    "ReportB": {"ShipType": 30, "CallSign": "XY"},
                }
            },
        }
        assert store.ingest_envelope(envelope, T0 + 1) is True
        row = store.get("232012345")
        assert row["typeLabel"] == "FISHING" and row["callsign"] == "XY"

    @pytest.mark.parametrize(
        "envelope",
        [
            "not a dict",
            {},
            {"MessageType": "PositionReport"},
            {"MessageType": "PositionReport", "MetaData": {"MMSI": "abc"}},
            {"MessageType": "PositionReport", "MetaData": {"MMSI": 1234}},  # too short
            {
                "MessageType": "PositionReport",
                "MetaData": {"MMSI": 12345678901},
            },  # too long
            {"MessageType": "PositionReport", "MetaData": "junk", "Message": "junk"},
        ],
    )
    def test_unrecognised_envelopes_are_not_liveness(self, envelope):
        store = AisVesselStore()
        assert store.ingest_envelope(envelope, T0) is False
        assert len(store) == 0

    def test_message_block_of_wrong_shape_is_tolerated(self):
        store = AisVesselStore()
        envelope = {
            "MessageType": "PositionReport",
            "MetaData": {"MMSI": 232012345, "latitude": 1, "longitude": 2},
            "Message": {"PositionReport": "junk"},
        }
        assert store.ingest_envelope(envelope, T0) is True
        assert store.get("232012345")["sog"] is None

    @pytest.mark.parametrize("lat,lon", [(91, 0), (0, 181), (None, 0), ("x", 0)])
    def test_unavailable_position_is_liveness_but_not_stored(self, lat, lon):
        store = AisVesselStore()
        assert store.ingest_envelope(position(lat=lat, lon=lon), T0) is True
        assert len(store) == 0

    def test_not_available_sentinels_become_none(self):
        store = AisVesselStore()
        store.ingest_envelope(
            position(Sog=102.3, Cog=360, TrueHeading=511, NavigationalStatus=None), T0
        )
        row = store.get("232012345")
        assert (
            row["sog"] is None
            and row["cog"] is None
            and row["heading"] is None
            and row["navStatus"] is None
        )

    def test_falls_back_to_message_coordinates_and_userid(self):
        store = AisVesselStore()
        envelope = {
            "MessageType": "PositionReport",
            "Metadata": {},
            "Message": {
                "PositionReport": {
                    "UserId": 235099999,
                    "Latitude": 50.9,
                    "Longitude": -1.2,
                }
            },
        }
        assert store.ingest_envelope(envelope, T0) is True
        row = store.get("235099999")
        assert (row["lat"], row["lon"]) == (50.9, -1.2)

    def test_cap_is_enforced_inline_once_exceeded(self, monkeypatch):
        monkeypatch.setattr(settings, "sea_ais_cache_max", 3)
        store = AisVesselStore()
        for index in range(5):
            store.ingest_envelope(position(mmsi=232000000 + index), T0 + index)
        assert len(store) == 3
        assert store.get("232000000") is None and store.get("232000004") is not None


# ── prune / clear ─────────────────────────────────────────────────────────────


class TestPrune:
    def test_expired_vessels_are_dropped_with_their_tracks(self):
        store = AisVesselStore()
        store.ingest_envelope(position(mmsi=232000001), T0)
        store.ingest_envelope(position(mmsi=232000002), T0 + settings.sea_ais_stale_ms)
        removed = store.prune(T0 + settings.sea_ais_stale_ms + 1)
        assert removed == 1
        assert store.get("232000001") is None and store.track("232000001") == []
        assert store.get("232000002") is not None

    def test_prune_without_now_uses_wall_clock(self):
        store = AisVesselStore()
        store.ingest_envelope(position(), ais_store.now_ms())
        assert store.prune() == 0

    def test_clear_forgets_everything(self):
        store = AisVesselStore()
        store.ingest_envelope(position(), T0)
        store.ingest_envelope(static(), T0)
        store.clear()
        assert len(store) == 0 and store.newest_position_ms is None
        store.ingest_envelope(position(), T0)
        assert store.get("232012345")["typeLabel"] == ""  # static data gone too


# ── queries ───────────────────────────────────────────────────────────────────


class TestQueries:
    def test_vessels_sorted_newest_first_and_capped(self):
        store = AisVesselStore()
        for index in range(3):
            store.ingest_envelope(position(mmsi=232000000 + index), T0 + index)
        rows = store.vessels(2)
        assert [row["mmsi"] for row in rows] == ["232000002", "232000001"]

    def test_bbox_filters_and_crosses_the_antimeridian(self):
        store = AisVesselStore()
        store.ingest_envelope(position(mmsi=232000001, lat=51, lon=1), T0)
        store.ingest_envelope(position(mmsi=232000002, lat=-10, lon=179), T0)
        store.ingest_envelope(position(mmsi=232000003, lat=-10, lon=-179), T0)
        assert [row["mmsi"] for row in store.vessels(10, (50, 0, 52, 2))] == [
            "232000001"
        ]
        crossing = {row["mmsi"] for row in store.vessels(10, (-20, 170, 0, -170))}
        assert crossing == {"232000002", "232000003"}
        assert store.vessels(10, (-20, 170, 0, -170))  # sanity: non-empty
        assert store.vessels(10, (60, 0, 70, 2)) == []

    def test_get_and_track_for_unknown_vessel(self):
        store = AisVesselStore()
        assert store.get("1") is None
        assert store.track("1") == []


# ── tracks ────────────────────────────────────────────────────────────────────


class TestTracks:
    def test_track_thins_by_time_and_distance(self):
        store = AisVesselStore()
        base = "2026-09-12 08:00:%02d +0000 UTC"
        store.ingest_envelope(position(lat=51.0, lon=1.0, time_utc=base % 0), T0)
        # Too soon (10 s) even though it moved: skipped.
        store.ingest_envelope(position(lat=51.5, lon=1.0, time_utc=base % 10), T0)
        # Long enough but too close (< 25 m): skipped.
        store.ingest_envelope(position(lat=51.00001, lon=1.0, time_utc=base % 40), T0)
        # Long enough and far enough: kept.
        store.ingest_envelope(position(lat=51.01, lon=1.0, time_utc=base % 50), T0)
        samples = store.track("232012345")
        assert [sample["lat"] for sample in samples] == [51.0, 51.01]
        assert samples[0]["t"] == 1789200000

    def test_track_ring_buffer_is_bounded(self, monkeypatch):
        monkeypatch.setattr(settings, "sea_ais_track_samples", 3)
        store = AisVesselStore()
        for index in range(6):
            store.ingest_envelope(
                position(
                    lat=51 + index * 0.01,
                    lon=1,
                    time_utc=f"2026-09-12 08:{index:02d}:00 +0000 UTC",
                ),
                T0,
            )
        samples = store.track("232012345")
        assert len(samples) == 3
        assert samples[-1]["lat"] == pytest.approx(51.05)


# ── persistence ───────────────────────────────────────────────────────────────


@pytest.fixture()
def _patch_store_db(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(ais_store, "AsyncSessionLocal", factory)


@pytest.mark.usefixtures("_patch_store_db")
class TestPersistence:
    async def test_snapshot_round_trip_is_incremental(self):
        store = AisVesselStore()
        now = ais_store.now_ms()
        store.ingest_envelope(position(mmsi=232000001, lat=51.0, lon=1.0), now)
        store.ingest_envelope(position(mmsi=232000002, lat=52.0, lon=1.0), now)
        assert await store.persist_snapshot() == 2
        assert await store.persist_snapshot() == 0  # nothing dirty
        store.ingest_envelope(
            position(
                mmsi=232000001,
                lat=51.5,
                lon=1.0,
                time_utc="2026-09-12 09:00:00 +0000 UTC",
            ),
            now,
        )
        assert await store.persist_snapshot() == 1  # only the changed vessel
        assert await store.persist_snapshot(force=True) == 2

        restored = AisVesselStore()
        assert await restored.load_snapshot(now) == 2
        assert restored.get("232000001")["lat"] == 51.5
        assert restored.newest_position_ms == store.newest_position_ms
        assert len(restored.track("232000001")) >= 1
        assert await restored.persist_snapshot() == 0  # loaded clean

    async def test_load_skips_expired_and_corrupt_rows(self, test_engine):
        from backend.models import SeaVesselCache

        factory = sessionmaker(
            bind=test_engine, class_=AsyncSession, expire_on_commit=False
        )
        now = ais_store.now_ms()
        async with factory() as db:
            db.add(
                SeaVesselCache(mmsi="1", payload="not json", track="[]", updated_at=now)
            )
            db.add(
                SeaVesselCache(
                    mmsi="2", payload='{"mmsi": "other"}', track="[]", updated_at=now
                )
            )
            db.add(
                SeaVesselCache(
                    mmsi="3",
                    payload='{"mmsi": "3", "lat": 1, "lon": 2, "lastPositionMs": 5}',
                    track="junk",
                    updated_at=now,
                )
            )
            db.add(
                SeaVesselCache(
                    mmsi="4",
                    payload='{"mmsi": "4", "lat": 1, "lon": 2}',
                    track='[[1, 2, 3], ["bad"]]',
                    updated_at=now - settings.sea_ais_stale_ms - 1,
                )
            )
            await db.commit()
        store = AisVesselStore()
        assert await store.load_snapshot(now) == 1
        assert store.get("3") is not None and store.newest_position_ms == 5

    async def test_persist_prunes_expired_rows_from_the_table(self, test_engine):
        from sqlalchemy import select

        from backend.models import SeaVesselCache

        factory = sessionmaker(
            bind=test_engine, class_=AsyncSession, expire_on_commit=False
        )
        now = ais_store.now_ms()
        async with factory() as db:
            db.add(
                SeaVesselCache(
                    mmsi="old",
                    payload="{}",
                    track="[]",
                    updated_at=now - settings.sea_ais_stale_ms - 1,
                )
            )
            await db.commit()
        store = AisVesselStore()
        store.ingest_envelope(position(), now)
        await store.persist_snapshot()
        async with factory() as db:
            rows = (await db.execute(select(SeaVesselCache.mmsi))).scalars().all()
        assert rows == ["232012345"]

    async def test_persist_skips_vessels_pruned_between_dirty_and_write(self):
        store = AisVesselStore()
        now = ais_store.now_ms()
        store.ingest_envelope(position(), now)
        store._dirty_mmsis.add("ghost")  # dirty but no longer held
        assert await store.persist_snapshot() == 1
