"""
Tests for backend/platform/history/queries.py and router.py — the bounded
reads replay uses (samples, coverage, status) and the per-section endpoints
built on them.
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import get_db
from backend.platform.history import queries
from backend.platform.history import router as router_module
from backend.platform.history.queries import (
    COVERAGE_BUCKET_MS,
    COVERAGE_MAX_BUCKETS,
    BoundingBox,
    HistoryQueryError,
    clamp_window,
    coverage_bucket_ms,
    parse_bbox,
)
from backend.platform.history.retention import DAY_MS
from backend.platform.history.router import build_history_router
from backend.platform.history.schema import PositionHistoryMixin


class _TestBase(DeclarativeBase):
    pass


class QueryTestHistory(PositionHistoryMixin, _TestBase):
    __tablename__ = "query_test_history"


NOW_MS = 1_800_000_000_000  # 2027-01-15, inside the router's accepted range


@pytest.fixture()
async def session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(_TestBase.metadata.create_all)
    yield sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


async def add_rows(session_factory, rows):
    async with session_factory() as db:
        for row in rows:
            db.add(QueryTestHistory(source_mode="online", **row))
        await db.commit()


def row(entity_id="a", t_ms=NOW_MS, lat=51.0, lon=-1.0, **fields):
    return {"entity_id": entity_id, "t_ms": t_ms, "lat": lat, "lon": lon, **fields}


# ── parse_bbox ───────────────────────────────────────────────────────────────


class TestParseBbox:
    @pytest.mark.parametrize("raw", [None, "", "   "])
    def test_blank_means_everywhere(self, raw):
        assert parse_bbox(raw) is None

    def test_parses_south_west_north_east(self):
        assert parse_bbox("50,-2,52,1.5") == BoundingBox(50, -2, 52, 1.5)

    def test_a_west_east_of_east_crosses_the_antimeridian(self):
        assert parse_bbox("-10,170,10,-170") == BoundingBox(-10, 170, 10, -170)

    @pytest.mark.parametrize(
        ("raw", "message"),
        [
            ("1,2,3", "south,west,north,east"),
            ("1,2,3,4,5", "south,west,north,east"),
            ("a,b,c,d", "numbers"),
            ("nan,0,1,1", "finite"),
            ("0,inf,1,1", "finite"),
            ("52,0,50,1", "latitudes"),
            ("-91,0,0,1", "latitudes"),
            ("0,0,91,1", "latitudes"),
            ("0,-181,1,1", "longitudes"),
            ("0,0,1,181", "longitudes"),
        ],
    )
    def test_refuses_malformed_boxes(self, raw, message):
        with pytest.raises(HistoryQueryError, match=message):
            parse_bbox(raw)


# ── clamp_window ─────────────────────────────────────────────────────────────


class TestClampWindow:
    def test_a_window_inside_retention_is_unchanged(self):
        assert clamp_window(NOW_MS - 1000, NOW_MS - 500, NOW_MS, 7, 60_000) == (
            NOW_MS - 1000,
            NOW_MS - 500,
        )

    def test_to_before_from_is_refused(self):
        with pytest.raises(HistoryQueryError, match="before"):
            clamp_window(NOW_MS, NOW_MS - 1, NOW_MS, 7, 60_000)

    def test_a_window_over_the_cap_is_refused(self):
        with pytest.raises(HistoryQueryError, match="at most 60 s"):
            clamp_window(NOW_MS - 60_001, NOW_MS, NOW_MS, 7, 60_000)

    def test_the_window_is_clamped_to_retention_and_now(self):
        cutoff = NOW_MS - 1 * DAY_MS
        assert clamp_window(cutoff - 10, NOW_MS + 10, NOW_MS, 1, 10 * DAY_MS) == (
            cutoff,
            NOW_MS,
        )


# ── fetch_samples ────────────────────────────────────────────────────────────


class TestFetchSamples:
    async def test_groups_by_entity_in_time_order_with_every_field(
        self, session_factory
    ):
        await add_rows(
            session_factory,
            [
                row("b", NOW_MS - 10),
                row(
                    "a",
                    NOW_MS - 30,
                    alt=1000.0,
                    heading=90.0,
                    speed=200.0,
                    extra=json.dumps({"flight": "X"}),
                ),
                row("a", NOW_MS - 20),
                row("a", NOW_MS - 5000),  # before the window
            ],
        )
        async with session_factory() as db:
            result = await queries.fetch_samples(
                db, QueryTestHistory, NOW_MS - 100, NOW_MS
            )
        assert result["truncated"] is False
        assert (result["from"], result["to"]) == (NOW_MS - 100, NOW_MS)
        assert list(result["entities"]) == ["a", "b"]
        first = result["entities"]["a"][0]
        assert first == {
            "t": NOW_MS - 30,
            "lat": 51.0,
            "lon": -1.0,
            "alt": 1000.0,
            "heading": 90.0,
            "speed": 200.0,
            "source": "online",
            "extra": {"flight": "X"},
        }
        assert [sample["t"] for sample in result["entities"]["a"]] == [
            NOW_MS - 30,
            NOW_MS - 20,
        ]
        assert result["entities"]["b"][0]["extra"] is None

    async def test_a_bbox_keeps_only_positions_inside_it(self, session_factory):
        await add_rows(
            session_factory,
            [row("in", lat=51, lon=0), row("out", t_ms=NOW_MS - 1, lat=40, lon=0)],
        )
        async with session_factory() as db:
            result = await queries.fetch_samples(
                db, QueryTestHistory, NOW_MS - 10, NOW_MS, BoundingBox(50, -1, 52, 1)
            )
        assert list(result["entities"]) == ["in"]

    async def test_an_antimeridian_bbox_keeps_both_sides(self, session_factory):
        await add_rows(
            session_factory,
            [
                row("east", lat=0, lon=175),
                row("west", t_ms=NOW_MS - 1, lat=0, lon=-175),
                row("middle", t_ms=NOW_MS - 2, lat=0, lon=0),
            ],
        )
        async with session_factory() as db:
            result = await queries.fetch_samples(
                db, QueryTestHistory, NOW_MS - 10, NOW_MS, BoundingBox(-5, 170, 5, -170)
            )
        assert set(result["entities"]) == {"east", "west"}

    async def test_the_row_cap_keeps_the_oldest_and_reports_where_it_stopped(
        self, session_factory
    ):
        await add_rows(
            session_factory, [row("a", NOW_MS - offset) for offset in (40, 30, 20, 10)]
        )
        async with session_factory() as db:
            result = await queries.fetch_samples(
                db, QueryTestHistory, NOW_MS - 100, NOW_MS, max_rows=2
            )
        assert result["truncated"] is True
        assert [sample["t"] for sample in result["entities"]["a"]] == [
            NOW_MS - 40,
            NOW_MS - 30,
        ]
        assert result["to"] == NOW_MS - 30


# ── coverage ─────────────────────────────────────────────────────────────────


class TestCoverage:
    def test_short_spans_use_one_minute_buckets(self):
        assert coverage_bucket_ms(60 * 60 * 1000) == COVERAGE_BUCKET_MS

    def test_long_spans_widen_the_bucket_to_stay_under_the_cap(self):
        week = 7 * DAY_MS
        bucket = coverage_bucket_ms(week)
        assert bucket % COVERAGE_BUCKET_MS == 0
        assert week / bucket <= COVERAGE_MAX_BUCKETS
        assert week / (bucket - COVERAGE_BUCKET_MS) > COVERAGE_MAX_BUCKETS

    def test_an_empty_span_is_one_minute(self):
        assert coverage_bucket_ms(0) == COVERAGE_BUCKET_MS

    async def test_buckets_count_samples_per_source(self, session_factory):
        minute = COVERAGE_BUCKET_MS
        base = (NOW_MS // minute) * minute - 10 * minute
        async with session_factory() as db:
            db.add_all(
                [
                    QueryTestHistory(
                        entity_id="a", t_ms=base + 1, lat=0, lon=0, source_mode="online"
                    ),
                    QueryTestHistory(
                        entity_id="b", t_ms=base + 2, lat=0, lon=0, source_mode="online"
                    ),
                    QueryTestHistory(
                        entity_id="c",
                        t_ms=base + 3,
                        lat=0,
                        lon=0,
                        source_mode="offgrid",
                    ),
                    QueryTestHistory(
                        entity_id="a",
                        t_ms=base + minute + 5,
                        lat=0,
                        lon=0,
                        source_mode="offgrid",
                    ),
                ]
            )
            await db.commit()
            result = await queries.fetch_coverage(
                db, QueryTestHistory, base, base + 30 * minute
            )
        assert result["bucketMs"] == minute
        assert sorted(result["buckets"]) == [
            [base, 1, "offgrid"],
            [base, 2, "online"],
            [base + minute, 1, "offgrid"],
        ]


# ── status ───────────────────────────────────────────────────────────────────


async def test_status_reports_range_count_and_size(session_factory):
    await add_rows(session_factory, [row("a", 100), row("b", 300)])
    async with session_factory() as db:
        status = await queries.fetch_status(db, QueryTestHistory)
    assert (status["oldestMs"], status["newestMs"], status["samples"]) == (100, 300, 2)
    assert status["databaseBytes"] > 0


async def test_status_of_an_empty_table(session_factory):
    async with session_factory() as db:
        status = await queries.fetch_status(db, QueryTestHistory)
    assert (status["oldestMs"], status["newestMs"], status["samples"]) == (
        None,
        None,
        0,
    )


# ── router ───────────────────────────────────────────────────────────────────


@pytest.fixture()
def settings_values(monkeypatch):
    """The section's settings as the router reads them."""
    values = {"historyEnabled": True, "historyRetentionDays": 7}

    async def fake_read_setting(db, namespace, key, default=None):
        assert namespace == "air"
        return values.get(key, default)

    monkeypatch.setattr(router_module, "read_setting", fake_read_setting)
    monkeypatch.setattr(
        "backend.platform.history.retention.read_setting", fake_read_setting
    )
    monkeypatch.setattr(router_module, "_now_ms", lambda: NOW_MS)
    return values


@pytest.fixture()
def client(session_factory, settings_values):
    app = FastAPI()
    app.include_router(
        build_history_router("/api/air", "air", QueryTestHistory, lookback_ms=60_000)
    )

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


class TestRouter:
    def test_lookback_must_be_within_an_hour(self):
        with pytest.raises(ValueError, match="lookback_ms"):
            build_history_router("/api/x", "x", QueryTestHistory, lookback_ms=-1)
        with pytest.raises(ValueError, match="lookback_ms"):
            build_history_router(
                "/api/x", "x", QueryTestHistory, lookback_ms=queries.MAX_LOOKBACK_MS + 1
            )

    def test_routes_sit_under_the_section_prefix(self):
        router = build_history_router(
            "/api/sea", "sea", QueryTestHistory, lookback_ms=0
        )
        assert [route.path for route in router.routes] == [
            "/api/sea/history/status",
            "/api/sea/history/coverage",
            "/api/sea/history/samples",
        ]
        assert router.tags == ["sea"]

    async def test_status(self, client, session_factory, settings_values):
        await add_rows(session_factory, [row("a", NOW_MS - 5)])
        settings_values["historyEnabled"] = False
        settings_values["historyRetentionDays"] = 3
        body = client.get("/api/air/history/status").json()
        assert body["enabled"] is False
        assert body["retentionDays"] == 3
        assert body["lookbackMs"] == 60_000
        assert body["samples"] == 1

    async def test_samples_include_the_lookback_before_from(
        self, client, session_factory
    ):
        await add_rows(
            session_factory,
            [
                row("early", NOW_MS - 1000 - 50_000),
                row("too-early", NOW_MS - 1000 - 70_000),
            ],
        )
        body = client.get(
            "/api/air/history/samples", params={"from": NOW_MS - 1000, "to": NOW_MS}
        ).json()
        assert list(body["entities"]) == ["early"]

    async def test_samples_pass_the_bbox_through(self, client, session_factory):
        await add_rows(
            session_factory,
            [row("in", lat=51, lon=0), row("out", t_ms=NOW_MS - 1, lat=10, lon=0)],
        )
        body = client.get(
            "/api/air/history/samples",
            params={"from": NOW_MS - 100, "to": NOW_MS, "bbox": "50,-1,52,1"},
        ).json()
        assert list(body["entities"]) == ["in"]

    @pytest.mark.parametrize(
        "params",
        [
            {"from": NOW_MS - 31 * 60 * 1000, "to": NOW_MS},  # wider than 30 min
            {"from": NOW_MS, "to": NOW_MS - 1},  # backwards
            {"from": NOW_MS - 10, "to": NOW_MS, "bbox": "91,0,0,0"},  # bad box
        ],
    )
    def test_samples_refuse_out_of_bounds_requests_with_422(self, client, params):
        response = client.get("/api/air/history/samples", params=params)
        assert response.status_code == 422
        assert "detail" in response.json()

    @pytest.mark.parametrize(
        "params",
        [
            {"to": NOW_MS},  # from missing
            {"from": 5, "to": NOW_MS},  # not a plausible time
            {"from": NOW_MS, "to": 9_999_999_999_999},
            {"from": NOW_MS - 10, "to": NOW_MS, "bbox": "1" * 101},
        ],
    )
    def test_samples_validate_parameters(self, client, params):
        assert client.get("/api/air/history/samples", params=params).status_code == 422

    def test_samples_entirely_before_retention_are_an_empty_reply(
        self, client, settings_values
    ):
        settings_values["historyRetentionDays"] = 1
        old = NOW_MS - 3 * DAY_MS
        body = client.get(
            "/api/air/history/samples", params={"from": old, "to": old + 1000}
        ).json()
        assert body == {
            "from": old,
            "to": old + 1000,
            "truncated": False,
            "entities": {},
        }

    async def test_coverage_defaults_to_the_whole_retention_window(
        self, client, session_factory, settings_values
    ):
        settings_values["historyRetentionDays"] = 2
        await add_rows(session_factory, [row("a", NOW_MS - DAY_MS)])
        body = client.get("/api/air/history/coverage").json()
        assert body["from"] == NOW_MS - 2 * DAY_MS
        assert body["to"] == NOW_MS
        assert sum(bucket[1] for bucket in body["buckets"]) == 1

    async def test_coverage_with_an_explicit_window(self, client, session_factory):
        await add_rows(
            session_factory,
            [row("a", NOW_MS - 1000), row("b", NOW_MS - 10 * 60 * 1000)],
        )
        body = client.get(
            "/api/air/history/coverage", params={"from": NOW_MS - 5000, "to": NOW_MS}
        ).json()
        assert sum(bucket[1] for bucket in body["buckets"]) == 1

    def test_coverage_refuses_a_backwards_window(self, client):
        response = client.get(
            "/api/air/history/coverage", params={"from": NOW_MS, "to": NOW_MS - 1}
        )
        assert response.status_code == 422

    def test_coverage_refuses_a_span_over_eight_days(self, client):
        response = client.get(
            "/api/air/history/coverage",
            params={"from": NOW_MS - 9 * DAY_MS, "to": NOW_MS},
        )
        assert response.status_code == 422


def test_now_ms_is_the_wall_clock_in_milliseconds(monkeypatch):
    monkeypatch.setattr(router_module.time, "time", lambda: 1_700_000_000.123)
    assert router_module._now_ms() == 1_700_000_000_123
