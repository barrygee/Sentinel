"""
tests/backend/test_aprs_store.py

Tests for backend/services/aprs_store.py — the APRS station store the Land map
plots: event→station extraction, upsert-by-callsign (insert + update), the
TTL-filtered snapshot, and the expiry sweep. Both the injected-session and
self-opened-session code paths are exercised (AsyncSessionLocal is redirected to
a per-test in-memory database).
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.config import settings
from backend.database import Base
from backend.models import AprsStation  # noqa: F401 — register the ORM model with Base
from backend.services import aprs_store


@pytest.fixture()
async def session_factory(monkeypatch):
    """Per-test in-memory DB; redirect the store's AsyncSessionLocal at it."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(aprs_store, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


def _event(**overrides) -> dict:
    """A fully-populated position event, with per-test overrides."""
    base = {
        "type": "aprs",
        "from": "M0ABC-9",
        "latitude": 51.5,
        "longitude": -0.1,
        "symbol": "/>",
        "comment": "on the road",
        "course": 90,
        "speed": 30,
        "altitude": 120,
        "path": "WIDE1-1,WIDE2-1",
        "raw": "M0ABC-9>APRS:!5130.00N/00006.00W>",
    }
    base.update(overrides)
    return base


# ── _coerce_float ─────────────────────────────────────────────────────────────


class TestCoerceFloat:
    def test_none_is_none(self):
        assert aprs_store._coerce_float(None) is None

    def test_numeric_string(self):
        assert aprs_store._coerce_float("12.5") == 12.5

    def test_int_becomes_float(self):
        result = aprs_store._coerce_float(5)
        assert result == 5.0
        assert isinstance(result, float)

    def test_non_numeric_string_is_none(self):
        assert aprs_store._coerce_float("abc") is None

    def test_wrong_type_is_none(self):
        assert aprs_store._coerce_float([1, 2]) is None


# ── station_from_event ────────────────────────────────────────────────────────


class TestStationFromEvent:
    def test_full_event_maps_all_fields(self):
        station = aprs_store.station_from_event(_event())
        assert station == {
            "callsign": "M0ABC-9",
            "latitude": 51.5,
            "longitude": -0.1,
            "symbol": "/>",
            "comment": "on the road",
            "course": 90.0,
            "speed": 30.0,
            "altitude": 120.0,
            "path": "WIDE1-1,WIDE2-1",
            "raw": "M0ABC-9>APRS:!5130.00N/00006.00W>",
        }

    def test_callsign_fallback_key(self):
        # Some payloads may carry "callsign" instead of aprslib's "from".
        event = {"callsign": "G0XYZ", "latitude": 1.0, "longitude": 2.0}
        station = aprs_store.station_from_event(event)
        assert station is not None
        assert station["callsign"] == "G0XYZ"

    def test_missing_callsign_returns_none(self):
        assert aprs_store.station_from_event(_event(**{"from": None})) is None

    def test_missing_latitude_returns_none(self):
        event = _event()
        del event["latitude"]
        assert aprs_store.station_from_event(event) is None

    def test_missing_longitude_returns_none(self):
        event = _event()
        del event["longitude"]
        assert aprs_store.station_from_event(event) is None

    def test_non_numeric_position_returns_none(self):
        assert aprs_store.station_from_event(_event(latitude="north")) is None

    def test_optional_fields_default_to_none(self):
        event = {"from": "M0ABC", "latitude": 1.0, "longitude": 2.0}
        station = aprs_store.station_from_event(event)
        assert station is not None
        assert station["symbol"] is None
        assert station["course"] is None
        assert station["comment"] is None


# ── upsert + snapshot + cleanup ───────────────────────────────────────────────


class TestUpsertAndSnapshot:
    async def test_insert_then_read_back(self, session_factory):
        await aprs_store.upsert_station(aprs_store.station_from_event(_event()), 1000)
        stations = await aprs_store.get_stations(2000)
        assert len(stations) == 1
        assert stations[0]["callsign"] == "M0ABC-9"
        assert stations[0]["last_heard_ms"] == 1000
        assert stations[0]["latitude"] == 51.5

    async def test_upsert_updates_existing_row(self, session_factory):
        await aprs_store.upsert_station(aprs_store.station_from_event(_event()), 1000)
        # Same callsign, new position + comment + timestamp → updates in place.
        await aprs_store.upsert_station(
            aprs_store.station_from_event(_event(latitude=52.0, comment="moved")),
            5000,
        )
        stations = await aprs_store.get_stations(6000)
        assert len(stations) == 1  # not duplicated
        assert stations[0]["latitude"] == 52.0
        assert stations[0]["comment"] == "moved"
        assert stations[0]["last_heard_ms"] == 5000

    async def test_injected_session_path(self, session_factory):
        # Passing a session commits are the caller's responsibility.
        async with session_factory() as session:
            await aprs_store.upsert_station(
                aprs_store.station_from_event(_event(**{"from": "G7AAA"})),
                1000,
                db=session,
            )
            stations = await aprs_store.get_stations(2000, db=session)
        assert [s["callsign"] for s in stations] == ["G7AAA"]

    async def test_snapshot_newest_first(self, session_factory):
        await aprs_store.upsert_station(
            aprs_store.station_from_event(_event(**{"from": "OLD"})), 1000
        )
        await aprs_store.upsert_station(
            aprs_store.station_from_event(_event(**{"from": "NEW"})), 9000
        )
        stations = await aprs_store.get_stations(10000)
        assert [s["callsign"] for s in stations] == ["NEW", "OLD"]

    async def test_snapshot_excludes_expired(self, session_factory):
        ttl = settings.aprs_station_ttl_ms
        now = ttl + 10_000
        # Heard long ago (before the TTL window) → excluded from the snapshot.
        await aprs_store.upsert_station(
            aprs_store.station_from_event(_event(**{"from": "STALE"})), 100
        )
        await aprs_store.upsert_station(
            aprs_store.station_from_event(_event(**{"from": "FRESH"})), now - 1
        )
        stations = await aprs_store.get_stations(now)
        assert [s["callsign"] for s in stations] == ["FRESH"]

    async def test_cleanup_deletes_expired_only(self, session_factory):
        ttl = settings.aprs_station_ttl_ms
        now = ttl + 10_000
        await aprs_store.upsert_station(
            aprs_store.station_from_event(_event(**{"from": "STALE"})), 100
        )
        await aprs_store.upsert_station(
            aprs_store.station_from_event(_event(**{"from": "FRESH"})), now - 1
        )
        removed = await aprs_store.cleanup_expired(now)
        assert removed == 1
        # The fresh station survives; querying without a TTL cutoff confirms it.
        remaining = await aprs_store.get_stations(now)
        assert [s["callsign"] for s in remaining] == ["FRESH"]

    async def test_cleanup_injected_session(self, session_factory):
        async with session_factory() as session:
            await aprs_store.upsert_station(
                aprs_store.station_from_event(_event()), 100, db=session
            )
            removed = await aprs_store.cleanup_expired(
                settings.aprs_station_ttl_ms + 10_000, db=session
            )
        assert removed == 1

    async def test_cleanup_nothing_to_remove(self, session_factory):
        removed = await aprs_store.cleanup_expired(1000)
        assert removed == 0
