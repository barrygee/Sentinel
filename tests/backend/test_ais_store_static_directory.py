"""
tests/backend/test_ais_store_static_directory.py

The AIS store's durable static-data directory (backend/services/ais_store.py +
the sea_vessel_static table): what a vessel has been heard to call itself — name,
callsign, IMO, ship type — kept long after the vessel leaves the live picture.

The point of it: off grid, often only a ship's position reports get through (they
carry no name), so without the directory every vessel shows as "MMSI …". Pinned:
  * the directory survives prune, clear (a source switch) and a restart, so a
    name learned online labels the same ship off grid;
  * AISStream's per-message ShipName and static reports both feed it;
  * it is capped (oldest dropped) and rows past their retention are deleted;
  * destination, which changes every voyage, is never persisted.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.models import SeaVesselCache, SeaVesselStatic
from backend.services import ais_store
from backend.services.ais_store import AisVesselStore

T0 = 1_000_000_000_000
MMSI = "235040261"


def online_position(mmsi: str = MMSI, name: str = "TYNE PILOT") -> dict:
    """An AISStream position report: it names the ship in its metadata."""
    return {
        "MessageType": "PositionReport",
        "MetaData": {
            "MMSI": mmsi,
            "ShipName": name,
            "latitude": 55.0,
            "longitude": -1.45,
        },
        "Message": {
            "PositionReport": {"UserID": mmsi, "Latitude": 55.0, "Longitude": -1.45}
        },
    }


def offgrid_position(mmsi: str = MMSI) -> dict:
    """What the SDR decoder produces for a type 1–3 report: no name anywhere."""
    return {
        "MessageType": "PositionReport",
        "MetaData": {"MMSI": mmsi, "latitude": 55.01, "longitude": -1.44},
        "Message": {
            "PositionReport": {"UserID": mmsi, "Latitude": 55.01, "Longitude": -1.44}
        },
    }


def static_report(mmsi: str = MMSI, **fields) -> dict:
    body = {
        "Name": "TYNE PILOT",
        "Type": 50,
        "Destination": "NORTH SHIELDS",
        "ImoNumber": 9123456,
        "CallSign": "MXYZ7",
    }
    body.update(fields)
    return {
        "MessageType": "ShipStaticData",
        "MetaData": {"MMSI": mmsi},
        "Message": {"ShipStaticData": body},
    }


# ── in memory ────────────────────────────────────────────────────────────────


class TestDirectoryInMemory:
    def test_a_position_only_report_is_named_from_an_earlier_static_report(self):
        store = AisVesselStore()
        store.ingest_envelope(static_report(), T0)
        store.ingest_envelope(offgrid_position(), T0 + 1)
        vessel = store.get(MMSI)
        assert (
            vessel["name"],
            vessel["callsign"],
            vessel["imo"],
            vessel["typeLabel"],
        ) == (
            "TYNE PILOT",
            "MXYZ7",
            "9123456",
            "PILOT",
        )

    def test_names_outlive_the_live_pictures_retention(self):
        store = AisVesselStore()
        store.ingest_envelope(online_position(), T0)
        assert store.prune(T0 + settings.sea_ais_stale_ms + 1) == 1
        assert store.get(MMSI) is None
        store.ingest_envelope(offgrid_position(), T0 + settings.sea_ais_stale_ms + 2)
        assert store.get(MMSI)["name"] == "TYNE PILOT"

    def test_names_learned_online_label_the_ship_after_a_source_switch(self):
        store = AisVesselStore()
        store.ingest_envelope(online_position(), T0)
        store.clear()
        store.ingest_envelope(offgrid_position(), T0 + 1)
        assert store.get(MMSI)["name"] == "TYNE PILOT"

    def test_a_ship_never_named_still_falls_back_to_its_mmsi(self):
        store = AisVesselStore()
        store.ingest_envelope(offgrid_position(), T0)
        assert store.get(MMSI)["name"] == f"MMSI {MMSI}"
        assert store._static == {}

    def test_aisstream_metadata_renames_the_directory_entry(self):
        store = AisVesselStore()
        store.ingest_envelope(static_report(), T0)
        store.ingest_envelope(online_position(name="TYNE PILOT II"), T0 + 1)
        assert store._static[MMSI]["name"] == "TYNE PILOT II"
        assert store._static[MMSI]["callsign"] == "MXYZ7"  # the rest is kept
        assert store._static_heard_ms[MMSI] == T0 + 1

    def test_an_unchanged_metadata_name_does_not_rewrite_the_entry(self):
        store = AisVesselStore()
        store.ingest_envelope(online_position(), T0)
        store._dirty_static.clear()
        store.ingest_envelope(online_position(), T0 + 5)
        assert store._dirty_static == set()
        assert store._static_heard_ms[MMSI] == T0

    def test_a_metadata_name_for_an_unknown_ship_starts_a_full_entry(self):
        store = AisVesselStore()
        store.ingest_envelope(online_position(), T0)
        assert store._static[MMSI] == {
            "name": "TYNE PILOT",
            "type": "",
            "destination": "",
            "imo": "",
            "callsign": "",
        }

    def test_the_cap_drops_the_least_recently_heard_ships(self, monkeypatch):
        monkeypatch.setattr(settings, "sea_vessel_static_max", 2)
        store = AisVesselStore()
        for offset, mmsi in enumerate(("111111111", "222222222", "333333333")):
            store.ingest_envelope(static_report(mmsi=mmsi), T0 + offset)
        assert set(store._static) == {"222222222", "333333333"}
        assert set(store._static_heard_ms) == {"222222222", "333333333"}
        assert "111111111" not in store._dirty_static


# ── persisted ────────────────────────────────────────────────────────────────


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(ais_store, "AsyncSessionLocal", factory)
    return factory


async def _directory_rows(factory) -> dict[str, SeaVesselStatic]:
    async with factory() as db:
        return {
            row.mmsi: row
            for row in (await db.execute(select(SeaVesselStatic))).scalars().all()
        }


class TestDirectoryPersisted:
    async def test_survives_a_restart_and_names_the_ship_off_grid(
        self, session_factory
    ):
        now = ais_store.now_ms()
        store = AisVesselStore()
        store.ingest_envelope(static_report(), now)
        await store.persist_snapshot()

        restarted = AisVesselStore()
        await restarted.load_snapshot(now)
        restarted.ingest_envelope(offgrid_position(), now)
        vessel = restarted.get(MMSI)
        assert (vessel["name"], vessel["callsign"], vessel["typeLabel"]) == (
            "TYNE PILOT",
            "MXYZ7",
            "PILOT",
        )

    async def test_persists_name_callsign_imo_and_type_but_never_destination(
        self, session_factory
    ):
        now = ais_store.now_ms()
        store = AisVesselStore()
        store.ingest_envelope(static_report(), now)
        await store.persist_snapshot()
        row = (await _directory_rows(session_factory))[MMSI]
        assert (row.name, row.callsign, row.imo, row.ship_type, row.updated_at) == (
            "TYNE PILOT",
            "MXYZ7",
            "9123456",
            "50",
            now,
        )
        assert not hasattr(row, "destination")

        restarted = AisVesselStore()
        await restarted.load_snapshot(now)
        assert restarted._static[MMSI]["destination"] == ""

    async def test_writes_only_entries_heard_since_the_last_snapshot(
        self, session_factory
    ):
        now = ais_store.now_ms()
        store = AisVesselStore()
        store.ingest_envelope(static_report(), now)
        await store.persist_snapshot()
        async with session_factory() as db:
            await db.execute(
                SeaVesselStatic.__table__.update().values(name="EDITED ELSEWHERE")
            )
            await db.commit()
        store.ingest_envelope(
            static_report(mmsi="352003880", Name="PANAMA STAR"), now + 1
        )
        await store.persist_snapshot()
        rows = await _directory_rows(session_factory)
        assert rows[MMSI].name == "EDITED ELSEWHERE"  # not rewritten
        assert rows["352003880"].name == "PANAMA STAR"

    async def test_an_update_overwrites_the_stored_row(self, session_factory):
        now = ais_store.now_ms()
        store = AisVesselStore()
        store.ingest_envelope(static_report(), now)
        await store.persist_snapshot()
        store.ingest_envelope(static_report(Name="RENAMED", CallSign="NEW1"), now + 10)
        await store.persist_snapshot()
        row = (await _directory_rows(session_factory))[MMSI]
        assert (row.name, row.callsign, row.updated_at) == ("RENAMED", "NEW1", now + 10)

    async def test_a_source_switch_wipes_the_vessel_cache_but_not_the_directory(
        self, session_factory
    ):
        store = AisVesselStore()
        store.ingest_envelope(online_position(), ais_store.now_ms())
        await store.persist_snapshot()
        await store.switch_source("online")
        assert await store.switch_source("offgrid") is True
        async with session_factory() as db:
            assert (await db.execute(select(SeaVesselCache))).scalars().all() == []
        assert MMSI in await _directory_rows(session_factory)

    async def test_rows_past_retention_are_deleted_on_persist(self, session_factory):
        now = ais_store.now_ms()
        async with session_factory() as db:
            db.add(
                SeaVesselStatic(
                    mmsi="999999999",
                    name="LONG GONE",
                    updated_at=now - settings.sea_vessel_static_retention_ms - 1,
                )
            )
            db.add(
                SeaVesselStatic(
                    mmsi="888888888",
                    name="STILL KNOWN",
                    updated_at=now - settings.sea_vessel_static_retention_ms + 60_000,
                )
            )
            await db.commit()
        store = AisVesselStore()
        store.ingest_envelope(static_report(), now)
        await store.persist_snapshot()
        assert set(await _directory_rows(session_factory)) == {MMSI, "888888888"}

    async def test_load_skips_rows_past_retention_and_keeps_the_newest_up_to_the_cap(
        self, session_factory, monkeypatch
    ):
        now = ais_store.now_ms()
        async with session_factory() as db:
            db.add(
                SeaVesselStatic(
                    mmsi="999999999",
                    name="LONG GONE",
                    updated_at=now - settings.sea_vessel_static_retention_ms - 1,
                )
            )
            for offset, mmsi in enumerate(("111111111", "222222222", "333333333")):
                db.add(
                    SeaVesselStatic(
                        mmsi=mmsi,
                        name=f"SHIP {offset}",
                        updated_at=now - 1_000 + offset,
                    )
                )
            await db.commit()
        monkeypatch.setattr(settings, "sea_vessel_static_max", 2)
        store = AisVesselStore()
        await store.load_snapshot(now)
        assert set(store._static) == {"222222222", "333333333"}
        assert store._static_heard_ms["333333333"] == now - 998
        assert (
            await store.persist_snapshot() == 0
        )  # loaded clean: nothing to write back

    async def test_a_restored_vessel_snapshotted_unnamed_is_named_at_load(
        self, session_factory
    ):
        now = ais_store.now_ms()
        store = AisVesselStore()
        store.ingest_envelope(offgrid_position(), now)
        await store.persist_snapshot()  # cached as "MMSI 235040261"
        async with session_factory() as db:
            db.add(
                SeaVesselStatic(
                    mmsi=MMSI,
                    name="TYNE PILOT",
                    callsign="MXYZ7",
                    ship_type="50",
                    updated_at=now,
                )
            )
            await db.commit()

        restarted = AisVesselStore()
        assert await restarted.load_snapshot(now) == 1
        vessel = restarted.get(MMSI)
        assert (vessel["name"], vessel["callsign"], vessel["typeLabel"]) == (
            "TYNE PILOT",
            "MXYZ7",
            "PILOT",
        )
