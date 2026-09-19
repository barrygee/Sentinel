"""The UK repeater-directory HTTP surface (`/api/land/repeaters**`).

    GET  /api/land/repeaters       — the directory + an X-Cache state header
    GET  /api/land/repeaters/file  — the same list as an editable JSON document
    POST /api/land/repeaters/file  — replace the directory from that document

The service layer is exercised directly in `test_repeaters_service.py`; these
tests are about the HTTP contract — status codes, headers, body shape, and the
validation gate on the write path refusing a bad document with the reason named
and without changing what is served.

Upstream is stubbed (`httpx.AsyncClient` replaced) and the bundled snapshot is
redirected to a temp file, so no test reaches ukrepeater.net or reads the
committed data file.
"""

from __future__ import annotations

import json

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.cache import now_ms
from backend.config import settings
from backend.models import RepeaterCache
from backend.services import repeaters

REPEATERS_URL = "/api/land/repeaters"
REPEATERS_FILE_URL = "/api/land/repeaters/file"


def _channel_document(**overrides: object) -> dict[str, object]:
    channel = {
        "id": 101,
        "band": "2M",
        "channel": "RV50",
        "txMhz": 145.6,
        "rxMhz": 145.0,
        "modes": ["A"],
        "ctcssHz": 94.8,
        "dmrColourCode": None,
        "heightMagl": 30,
        "erpDbw": 12.0,
        "status": "OPERATIONAL",
    }
    channel.update(overrides)
    return channel


def _station_document(**overrides: object) -> dict[str, object]:
    station = {
        "callsign": "GB3LO",
        "latitude": 51.5,
        "longitude": -0.12,
        "locator": "IO91WM",
        "location": "LONDON",
        "postcode": "SW1A",
        "region": "LON",
        "keeper": "G0ABC",
        "channels": [_channel_document()],
    }
    station.update(overrides)
    return station


@pytest.fixture()
def session_factory(test_engine, db_setup):
    """Short-lived sessions on the same in-memory engine the client uses."""
    return sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
def isolated_bundled_snapshot(tmp_path, monkeypatch):
    """Redirect the bundled snapshot to a temp file holding one known station."""
    path = tmp_path / "uk_repeaters.json"
    path.write_text(
        json.dumps({"stations": [_station_document(callsign="GB3BUNDLED")]}),
        encoding="utf-8",
    )
    monkeypatch.setattr(repeaters, "BUNDLED_JSON_PATH", path)
    return path


@pytest.fixture(autouse=True)
def offline_upstream(monkeypatch):
    """Default every test to an unreachable upstream — no accidental network."""

    class _UnreachableAsyncClient:
        def __init__(self, **kwargs: object) -> None:
            pass

        async def __aenter__(self) -> _UnreachableAsyncClient:
            return self

        async def __aexit__(self, *exc_info: object) -> bool:
            return False

        async def get(self, url: str) -> object:
            raise httpx.ConnectError("no route to host")

    monkeypatch.setattr(repeaters.httpx, "AsyncClient", _UnreachableAsyncClient)


async def _store_cache_row(
    session_factory, stations: list[dict[str, object]], *, expires_in_ms: int
) -> int:
    """Seed the cache with `stations`; returns the fetched_at stamp used."""
    fetched_at = now_ms()
    async with session_factory() as session:
        session.add(
            RepeaterCache(
                cache_key=repeaters.CACHE_KEY,
                payload=json.dumps(stations),
                fetched_at=fetched_at,
                expires_at=fetched_at + expires_in_ms,
            )
        )
        await session.commit()
    return fetched_at


async def _stored_stations(session_factory) -> list[dict[str, object]] | None:
    async with session_factory() as session:
        row = (
            await session.execute(
                select(RepeaterCache).where(
                    RepeaterCache.cache_key == repeaters.CACHE_KEY
                )
            )
        ).scalar_one_or_none()
        return None if row is None else json.loads(row.payload)


class TestGetRepeaters:
    async def test_fresh_cache_is_served_with_a_hit_header(
        self, client, session_factory
    ):
        fetched_at = await _store_cache_row(
            session_factory,
            [_station_document(callsign="GB3CACHED")],
            expires_in_ms=60_000,
        )
        response = client.get(REPEATERS_URL)
        assert response.status_code == 200
        assert response.headers["x-cache"] == "HIT"
        body = response.json()
        assert body["source"] == "online"
        assert body["fetchedAt"] == fetched_at
        assert [station["callsign"] for station in body["stations"]] == ["GB3CACHED"]

    async def test_expired_cache_with_a_dead_upstream_is_served_stale(
        self, client, session_factory
    ):
        await _store_cache_row(
            session_factory, [_station_document(callsign="GB3LAST")], expires_in_ms=-1
        )
        response = client.get(REPEATERS_URL)
        assert response.status_code == 200
        assert response.headers["x-cache"] == "STALE"
        assert response.json()["source"] == "cached"

    async def test_no_cache_and_a_dead_upstream_serves_the_bundled_snapshot(
        self, client
    ):
        response = client.get(REPEATERS_URL)
        assert response.status_code == 200
        assert response.headers["x-cache"] == "BUNDLED"
        body = response.json()
        assert body["source"] == "bundled"
        assert body["fetchedAt"] is None
        assert [station["callsign"] for station in body["stations"]] == ["GB3BUNDLED"]

    async def test_reachable_upstream_is_fetched_and_reported_as_a_miss(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(
            repeaters,
            "_fetch_upstream",
            _stub_fetch_upstream([_station_document(callsign="GB3FRESH")]),
        )
        response = client.get(REPEATERS_URL)
        assert response.headers["x-cache"] == "MISS"
        assert [station["callsign"] for station in response.json()["stations"]] == [
            "GB3FRESH"
        ]

    async def test_directory_is_never_browser_cached(self, client):
        # The X-Cache state is decided server-side; a browser cache would pin a
        # BUNDLED payload on an install that has since come online.
        assert client.get(REPEATERS_URL).headers["cache-control"] == "no-store"

    async def test_unavailable_directory_is_503_without_leaking_internals(
        self, client, monkeypatch, isolated_bundled_snapshot
    ):
        isolated_bundled_snapshot.unlink()
        response = client.get(REPEATERS_URL)
        assert response.status_code == 503
        assert response.json() == {"detail": "repeater directory unavailable"}
        assert "Traceback" not in response.text

    async def test_stations_carry_the_full_channel_shape(self, client, session_factory):
        await _store_cache_row(
            session_factory, [_station_document()], expires_in_ms=60_000
        )
        station = client.get(REPEATERS_URL).json()["stations"][0]
        assert set(station) == {
            "callsign",
            "latitude",
            "longitude",
            "locator",
            "location",
            "postcode",
            "region",
            "keeper",
            "channels",
        }
        assert set(station["channels"][0]) == {
            "id",
            "band",
            "channel",
            "txMhz",
            "rxMhz",
            "modes",
            "ctcssHz",
            "dmrColourCode",
            "heightMagl",
            "erpDbw",
            "status",
        }


class TestGetRepeatersFile:
    async def test_returns_the_editable_document_shape_only(
        self, client, session_factory
    ):
        await _store_cache_row(
            session_factory, [_station_document()], expires_in_ms=60_000
        )
        response = client.get(REPEATERS_FILE_URL)
        assert response.status_code == 200
        body = response.json()
        # The editable document is {stations: [...]} — no source/fetchedAt.
        assert list(body) == ["stations"]
        assert body["stations"][0]["callsign"] == "GB3LO"

    async def test_falls_back_to_the_bundled_snapshot(self, client):
        body = client.get(REPEATERS_FILE_URL).json()
        assert [station["callsign"] for station in body["stations"]] == ["GB3BUNDLED"]

    async def test_unavailable_directory_is_503(
        self, client, isolated_bundled_snapshot
    ):
        isolated_bundled_snapshot.unlink()
        response = client.get(REPEATERS_FILE_URL)
        assert response.status_code == 503
        assert response.json() == {"detail": "repeater directory unavailable"}

    async def test_document_round_trips_through_the_write_endpoint(self, client):
        # What GET hands the Settings editor must be accepted verbatim by POST.
        document = client.get(REPEATERS_FILE_URL).json()
        assert client.post(REPEATERS_FILE_URL, json=document).status_code == 200


class TestPostRepeatersFile:
    async def test_replaces_the_directory_and_reports_the_count(
        self, client, session_factory
    ):
        document = {
            "stations": [
                _station_document(callsign="GB3AA"),
                _station_document(callsign="GB3BB"),
            ]
        }
        response = client.post(REPEATERS_FILE_URL, json=document)
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "stations": 2}
        stored = await _stored_stations(session_factory)
        assert [station["callsign"] for station in stored] == ["GB3AA", "GB3BB"]

    async def test_uploaded_directory_is_then_served_as_a_hit(self, client):
        client.post(
            REPEATERS_FILE_URL,
            json={"stations": [_station_document(callsign="GB3MINE")]},
        )
        response = client.get(REPEATERS_URL)
        assert response.headers["x-cache"] == "HIT"
        assert [station["callsign"] for station in response.json()["stations"]] == [
            "GB3MINE"
        ]

    async def test_upload_is_held_for_the_manual_ttl(self, client, session_factory):
        client.post(REPEATERS_FILE_URL, json={"stations": [_station_document()]})
        async with session_factory() as session:
            row = (
                await session.execute(
                    select(RepeaterCache).where(
                        RepeaterCache.cache_key == repeaters.CACHE_KEY
                    )
                )
            ).scalar_one()
        assert row.expires_at - row.fetched_at == settings.repeaters_manual_ttl_ms

    async def test_empty_station_list_is_accepted(self, client):
        response = client.post(REPEATERS_FILE_URL, json={"stations": []})
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "stations": 0}

    async def test_upload_overwrites_a_previous_upload(self, client, session_factory):
        client.post(
            REPEATERS_FILE_URL,
            json={"stations": [_station_document(callsign="GB3OLD")]},
        )
        client.post(
            REPEATERS_FILE_URL,
            json={"stations": [_station_document(callsign="GB3NEW")]},
        )
        stored = await _stored_stations(session_factory)
        assert [station["callsign"] for station in stored] == ["GB3NEW"]

    @pytest.mark.parametrize(
        "body_without_stations",
        [
            pytest.param({}, id="no stations key"),
            pytest.param({"stations": None}, id="null stations"),
            pytest.param({"stations": {}}, id="stations is an object"),
            pytest.param({"stations": "GB3LO"}, id="stations is a string"),
            pytest.param({"repeaters": []}, id="wrong key"),
        ],
    )
    async def test_body_without_a_stations_array_is_400(
        self, client, body_without_stations
    ):
        response = client.post(REPEATERS_FILE_URL, json=body_without_stations)
        assert response.status_code == 400
        assert response.json() == {
            "detail": "Body must be a JSON object with a stations array"
        }

    @pytest.mark.parametrize(
        "non_object_body",
        [
            pytest.param([_station_document()], id="bare array"),
            pytest.param("stations", id="bare string"),
            pytest.param(7, id="bare number"),
        ],
    )
    async def test_body_that_is_not_a_json_object_is_rejected(
        self, client, non_object_body
    ):
        # FastAPI's `dict` body model refuses these before the handler runs; the
        # handler's own isinstance check is the belt-and-braces behind it.
        assert client.post(REPEATERS_FILE_URL, json=non_object_body).status_code in (
            400,
            422,
        )

    async def test_malformed_json_body_is_rejected(self, client):
        response = client.post(
            REPEATERS_FILE_URL,
            content=b"{not json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422

    @pytest.mark.parametrize(
        "invalid_station,expected_detail",
        [
            pytest.param(
                {"latitude": 0.0},
                "GB3LO: latitude out of range",
                id="position outside the uk",
            ),
            pytest.param(
                {"longitude": 100.0},
                "GB3LO: longitude out of range",
                id="longitude outside the uk",
            ),
            pytest.param(
                {"callsign": ""}, "station callsign is required", id="missing callsign"
            ),
            pytest.param(
                {"channels": []},
                "GB3LO: at least one channel is required",
                id="no channels",
            ),
            pytest.param(
                {"keeper": 7},
                "GB3LO: keeper must be a string or null",
                id="non-string keeper",
            ),
        ],
    )
    async def test_invalid_station_is_400_with_the_reason_named(
        self, client, invalid_station, expected_detail
    ):
        response = client.post(
            REPEATERS_FILE_URL,
            json={"stations": [_station_document(**invalid_station)]},
        )
        assert response.status_code == 400
        assert response.json() == {"detail": expected_detail}

    async def test_invalid_channel_is_400_with_the_station_named(self, client):
        document = {
            "stations": [_station_document(channels=[_channel_document(txMhz="145.6")])]
        }
        response = client.post(REPEATERS_FILE_URL, json=document)
        assert response.status_code == 400
        assert response.json() == {"detail": "GB3LO: txMhz must be a number"}

    async def test_rejected_upload_leaves_the_served_directory_untouched(
        self, client, session_factory
    ):
        client.post(
            REPEATERS_FILE_URL,
            json={"stations": [_station_document(callsign="GB3GOOD")]},
        )
        rejected = client.post(
            REPEATERS_FILE_URL,
            json={
                "stations": [
                    _station_document(callsign="GB3GOOD"),
                    _station_document(callsign="GB3BAD", latitude=0.0),
                ]
            },
        )
        assert rejected.status_code == 400
        stored = await _stored_stations(session_factory)
        assert [station["callsign"] for station in stored] == ["GB3GOOD"]

    async def test_duplicate_callsigns_are_400(self, client):
        document = {"stations": [_station_document(), _station_document()]}
        response = client.post(REPEATERS_FILE_URL, json=document)
        assert response.status_code == 400
        assert response.json() == {"detail": "GB3LO: listed twice"}


def _stub_fetch_upstream(stations: list[dict[str, object]]):
    """Replacement for `repeaters._fetch_upstream` returning a fixed station list."""

    async def _fetch() -> list[dict[str, object]]:
        return stations

    return _fetch
