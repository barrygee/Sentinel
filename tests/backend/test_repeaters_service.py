"""Tests for the UK repeater directory service — backend/services/repeaters.py.

Four things are under test, each with its own class:

* ``parse_repeater_csv`` — turning the RSGB ETCC CSV export (one row per
  licensed channel) into one station per callsign, dropping rows that could not
  be plotted and refusing a body that is not the export at all.
* ``validate_station_list`` — the gate every uploaded or bundled document goes
  through before it is stored or served.
* ``replace_repeaters`` — the Settings › LAND › REPEATERS write path.
* ``get_repeaters`` — the fallback ladder and the ``X-Cache`` state it reports
  (HIT → MISS → STALE → BUNDLED → ``RepeaterDataUnavailable``).

No test touches the network: ``httpx.AsyncClient`` is replaced with a recorder
so the upstream body, the failure mode and the request headers are all chosen by
the test. The bundled-snapshot path is pointed at a temp file except in the one
test that deliberately validates the committed ``backend/data/uk_repeaters.json``.
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

# ── CSV fixtures ─────────────────────────────────────────────────────────────

# The export's headings, in the order `csvcreate8.php` emits them.
CSV_COLUMNS = [
    "id",
    "callsign",
    "band",
    "channel",
    "TX MHz",
    "RX MHz",
    "magl",
    "ERP[dBW]",
    "modes",
    "QTHR",
    "where",
    "postcode",
    "ETCC region",
    "ctcss",
    "dmrcc",
    "keeper",
    "lat",
    "lon",
    "status",
]


def _csv_row_values(**overrides: str) -> dict[str, str]:
    """One export row as strings — a plausible 2m analogue/DMR repeater in London."""
    values = {
        "id": "101",
        "callsign": "GB3LO",
        "band": "2M",
        "channel": "RV50",
        "TX MHz": "145.6000",
        "RX MHz": "145.0000",
        "magl": "30",
        "ERP[dBW]": "12.0",
        "modes": "AM",
        "QTHR": "IO91WM",
        "where": "LONDON",
        "postcode": "SW1A",
        "ETCC region": "LON",
        "ctcss": "94.8",
        "dmrcc": "3",
        "keeper": "G0ABC",
        "lat": "51.5",
        "lon": "-0.12",
        "status": "OPERATIONAL",
    }
    values.update(overrides)
    return values


def _build_csv(rows: list[dict[str, str]], columns: list[str] | None = None) -> str:
    """Render rows as the export does — comma separated, with its trailing comma."""
    headings = CSV_COLUMNS if columns is None else columns
    lines = [",".join(headings) + ","]
    for row in rows:
        lines.append(",".join(row.get(name.strip(), "") for name in headings) + ",")
    return "\n".join(lines) + "\n"


# ── station-document fixtures ────────────────────────────────────────────────


def _channel_document(**overrides: object) -> dict[str, object]:
    channel = {
        "id": 101,
        "band": "2m",
        "channel": "RV50",
        "txMhz": 145.6,
        "rxMhz": 145.0,
        "modes": ["A", "M"],
        "ctcssHz": 94.8,
        "dmrColourCode": 3,
        "heightMagl": 30,
        "erpDbw": 12.0,
        "status": "operational",
    }
    channel.update(overrides)
    return channel


def _station_document(**overrides: object) -> dict[str, object]:
    station = {
        "callsign": "gb3lo",
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


# ── stubbed upstream ─────────────────────────────────────────────────────────


class _StubResponse:
    """Minimal stand-in for httpx.Response covering what _fetch_upstream touches."""

    def __init__(self, text: str, status_code: int = 200) -> None:
        self.text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://ukrepeater.net/csvcreate8.php")
            raise httpx.HTTPStatusError(
                f"upstream returned {self.status_code}",
                request=request,
                response=httpx.Response(self.status_code, request=request),
            )


class _UpstreamRecorder:
    """Records the URL and client kwargs of every stubbed upstream request."""

    def __init__(self) -> None:
        self.requested_urls: list[str] = []
        self.client_kwargs: list[dict[str, object]] = []


def _install_stub_upstream(
    monkeypatch,
    *,
    text: str = "",
    status_code: int = 200,
    error: BaseException | None = None,
) -> _UpstreamRecorder:
    recorder = _UpstreamRecorder()

    class _StubAsyncClient:
        def __init__(self, **kwargs: object) -> None:
            recorder.client_kwargs.append(kwargs)

        async def __aenter__(self) -> _StubAsyncClient:
            return self

        async def __aexit__(self, *exc_info: object) -> bool:
            return False

        async def get(self, url: str) -> _StubResponse:
            recorder.requested_urls.append(url)
            if error is not None:
                raise error
            return _StubResponse(text, status_code)

    monkeypatch.setattr(repeaters.httpx, "AsyncClient", _StubAsyncClient)
    return recorder


# ── fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
async def db(test_engine, db_setup) -> AsyncSession:
    """Async session on the shared in-memory test engine."""
    session_factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest.fixture()
def bundled_snapshot(tmp_path, monkeypatch):
    """Point the bundled-snapshot path at a temp file the test controls.

    Returns a writer taking the document to place there; not calling it leaves
    the path missing, which is the never-been-online-and-no-file case.
    """
    path = tmp_path / "uk_repeaters.json"
    monkeypatch.setattr(repeaters, "BUNDLED_JSON_PATH", path)

    def _write(document: object) -> None:
        path.write_text(json.dumps(document), encoding="utf-8")

    return _write


async def _stored_row(db: AsyncSession) -> RepeaterCache | None:
    result = await db.execute(
        select(RepeaterCache).where(RepeaterCache.cache_key == repeaters.CACHE_KEY)
    )
    return result.scalar_one_or_none()


async def _store_cache_row(
    db: AsyncSession,
    stations: list[dict[str, object]],
    *,
    fetched_at: int,
    expires_at: int,
) -> None:
    db.add(
        RepeaterCache(
            cache_key=repeaters.CACHE_KEY,
            payload=json.dumps(stations),
            fetched_at=fetched_at,
            expires_at=expires_at,
        )
    )
    await db.commit()


# ── parse_repeater_csv ───────────────────────────────────────────────────────


class TestParseRepeaterCsv:
    def test_one_row_becomes_one_station_with_one_channel(self):
        stations = repeaters.parse_repeater_csv(_build_csv([_csv_row_values()]))
        assert stations == [
            {
                "callsign": "GB3LO",
                "latitude": 51.5,
                "longitude": -0.12,
                "locator": "IO91WM",
                "location": "LONDON",
                "postcode": "SW1A",
                "region": "LON",
                "keeper": "G0ABC",
                "channels": [
                    {
                        "id": 101,
                        "band": "2M",
                        "channel": "RV50",
                        "txMhz": 145.6,
                        "rxMhz": 145.0,
                        "modes": ["A", "M"],
                        "ctcssHz": 94.8,
                        "dmrColourCode": 3,
                        "heightMagl": 30,
                        "erpDbw": 12.0,
                        "status": "OPERATIONAL",
                    }
                ],
            }
        ]

    def test_dual_band_site_becomes_one_station_with_two_channels(self):
        # The export lists a dual-band site twice; the map plots one marker.
        rows = [
            _csv_row_values(),
            _csv_row_values(
                id="102",
                band="70CM",
                channel="RU70",
                **{"TX MHz": "433.3", "RX MHz": "434.9"},
            ),
        ]
        stations = repeaters.parse_repeater_csv(_build_csv(rows))
        assert len(stations) == 1
        assert [channel["band"] for channel in stations[0]["channels"]] == [
            "2M",
            "70CM",
        ]

    def test_station_site_fields_come_from_its_first_row(self):
        rows = [
            _csv_row_values(),
            _csv_row_values(id="102", band="70CM", where="ELSEWHERE", keeper="G9ZZZ"),
        ]
        stations = repeaters.parse_repeater_csv(_build_csv(rows))
        assert stations[0]["location"] == "LONDON"
        assert stations[0]["keeper"] == "G0ABC"

    def test_stations_are_sorted_by_callsign(self):
        rows = [
            _csv_row_values(callsign="GB3ZZ"),
            _csv_row_values(callsign="GB3AA", id="102"),
        ]
        stations = repeaters.parse_repeater_csv(_build_csv(rows))
        assert [station["callsign"] for station in stations] == ["GB3AA", "GB3ZZ"]

    def test_callsign_is_upper_cased_and_trimmed(self):
        stations = repeaters.parse_repeater_csv(
            _build_csv([_csv_row_values(callsign=" gb3lo ")])
        )
        assert stations[0]["callsign"] == "GB3LO"

    def test_headings_with_surrounding_whitespace_are_still_recognised(self):
        # The export has been seen to pad a heading; stripping happens for both
        # the heading check and the per-row key lookup.
        padded_columns = [f" {name} " for name in CSV_COLUMNS]
        stations = repeaters.parse_repeater_csv(
            _build_csv([_csv_row_values()], padded_columns)
        )
        assert stations[0]["callsign"] == "GB3LO"

    def test_extra_unnamed_values_on_a_row_are_ignored(self):
        # More values than headings puts them under DictReader's None restkey.
        text = _build_csv([_csv_row_values()]) + ""
        lines = text.strip("\n").split("\n")
        lines[1] = lines[1] + "junk,extra"
        stations = repeaters.parse_repeater_csv("\n".join(lines) + "\n")
        assert stations[0]["callsign"] == "GB3LO"

    @pytest.mark.parametrize(
        "unplottable",
        [
            pytest.param({"callsign": ""}, id="no callsign"),
            pytest.param({"band": " "}, id="no band"),
            pytest.param({"TX MHz": ""}, id="no tx frequency"),
            pytest.param({"RX MHz": "not-a-number"}, id="unparseable rx frequency"),
            pytest.param({"lat": ""}, id="no latitude"),
            pytest.param({"lon": ""}, id="no longitude"),
            pytest.param({"lat": "48.9"}, id="latitude south of the box"),
            pytest.param({"lat": "61.6"}, id="latitude north of the box"),
            pytest.param({"lon": "-11.1"}, id="longitude west of the box"),
            pytest.param({"lon": "3.1"}, id="longitude east of the box"),
        ],
    )
    def test_unplottable_row_is_dropped(self, unplottable):
        assert (
            repeaters.parse_repeater_csv(_build_csv([_csv_row_values(**unplottable)]))
            == []
        )

    @pytest.mark.parametrize(
        "boundary",
        [
            pytest.param({"lat": "49.0"}, id="southern edge"),
            pytest.param({"lat": "61.5"}, id="northern edge"),
            pytest.param({"lon": "-11.0"}, id="western edge"),
            pytest.param({"lon": "3.0"}, id="eastern edge"),
        ],
    )
    def test_row_exactly_on_the_bounding_box_edge_is_kept(self, boundary):
        # The box is inclusive — an island station must not be rounded away.
        assert (
            len(repeaters.parse_repeater_csv(_build_csv([_csv_row_values(**boundary)])))
            == 1
        )

    def test_truncated_row_is_dropped(self):
        # A row cut short (a truncated final line) leaves later columns absent
        # rather than blank — every field reader must cope with a missing value.
        text = _build_csv([_csv_row_values()]) + "103,GB3SH,2M,RV52\n"
        stations = repeaters.parse_repeater_csv(text)
        assert [station["callsign"] for station in stations] == ["GB3LO"]

    def test_dropped_row_does_not_stop_later_rows(self):
        rows = [
            _csv_row_values(callsign="", id="1"),
            _csv_row_values(callsign="GB3OK", id="2"),
        ]
        stations = repeaters.parse_repeater_csv(_build_csv(rows))
        assert [station["callsign"] for station in stations] == ["GB3OK"]

    def test_unknown_mode_letters_are_dropped_and_duplicates_collapsed(self):
        stations = repeaters.parse_repeater_csv(
            _build_csv([_csv_row_values(modes="aaZM?")])
        )
        assert stations[0]["channels"][0]["modes"] == ["A", "M"]

    def test_blank_modes_field_gives_an_empty_list(self):
        stations = repeaters.parse_repeater_csv(_build_csv([_csv_row_values(modes="")]))
        assert stations[0]["channels"][0]["modes"] == []

    @pytest.mark.parametrize(
        "raw_status,expected",
        [
            ("OPERATIONAL", "OPERATIONAL"),
            ("not operational", "NOT OPERATIONAL"),
            ("REDUCED OUTPUT", "REDUCED OUTPUT"),
            ("", "UNKNOWN"),
            ("PENDING", "UNKNOWN"),
        ],
    )
    def test_status_is_normalised_and_unknown_values_are_flattened(
        self, raw_status, expected
    ):
        stations = repeaters.parse_repeater_csv(
            _build_csv([_csv_row_values(status=raw_status)])
        )
        assert stations[0]["channels"][0]["status"] == expected

    def test_blank_optional_text_fields_become_null(self):
        row = _csv_row_values(channel="", QTHR=" ", where="", postcode="", keeper="")
        row["ETCC region"] = ""
        stations = repeaters.parse_repeater_csv(_build_csv([row]))
        station = stations[0]
        assert station["locator"] is None
        assert station["location"] is None
        assert station["postcode"] is None
        assert station["region"] is None
        assert station["keeper"] is None
        assert station["channels"][0]["channel"] is None

    def test_blank_and_unparseable_numbers_become_null(self):
        row = _csv_row_values(id="", ctcss="", dmrcc="n/a", magl="")
        row["ERP[dBW]"] = ""
        stations = repeaters.parse_repeater_csv(_build_csv([row]))
        channel = stations[0]["channels"][0]
        assert channel["id"] is None
        assert channel["ctcssHz"] is None
        assert channel["dmrColourCode"] is None
        assert channel["heightMagl"] is None
        assert channel["erpDbw"] is None

    def test_non_finite_erp_becomes_null(self):
        # The export carries "-inf" for an unset ERP; float() accepts it but JSON
        # cannot serialise it, so it must not survive the parse.
        row = _csv_row_values()
        row["ERP[dBW]"] = "-inf"
        stations = repeaters.parse_repeater_csv(_build_csv([row]))
        assert stations[0]["channels"][0]["erpDbw"] is None

    def test_fractional_integer_fields_are_truncated(self):
        stations = repeaters.parse_repeater_csv(
            _build_csv([_csv_row_values(magl="30.7", dmrcc="3.0")])
        )
        channel = stations[0]["channels"][0]
        assert channel["heightMagl"] == 30
        assert channel["dmrColourCode"] == 3

    def test_body_without_the_export_headings_is_rejected(self):
        # A captive-portal or error page must never be cached as repeater data.
        with pytest.raises(ValueError) as excinfo:
            repeaters.parse_repeater_csv("<html><body>Forbidden</body></html>")
        assert "missing columns" in str(excinfo.value)

    def test_error_names_every_missing_column(self):
        with pytest.raises(ValueError) as excinfo:
            repeaters.parse_repeater_csv("callsign,band,lat,lon\n")
        message = str(excinfo.value)
        assert "TX MHz" in message and "RX MHz" in message and "modes" in message

    def test_empty_body_is_rejected(self):
        with pytest.raises(ValueError):
            repeaters.parse_repeater_csv("")

    def test_headings_only_parses_to_an_empty_list(self):
        assert repeaters.parse_repeater_csv(_build_csv([])) == []


# ── validate_station_list ────────────────────────────────────────────────────


class TestValidateStationList:
    def test_normalises_a_good_document(self):
        stations = repeaters.validate_station_list([_station_document()])
        assert stations == [
            {
                "callsign": "GB3LO",
                "latitude": 51.5,
                "longitude": -0.12,
                "locator": "IO91WM",
                "location": "LONDON",
                "postcode": "SW1A",
                "region": "LON",
                "keeper": "G0ABC",
                "channels": [
                    {
                        "id": 101,
                        "band": "2M",
                        "channel": "RV50",
                        "txMhz": 145.6,
                        "rxMhz": 145.0,
                        "modes": ["A", "M"],
                        "ctcssHz": 94.8,
                        "dmrColourCode": 3,
                        "heightMagl": 30,
                        "erpDbw": 12.0,
                        "status": "OPERATIONAL",
                    }
                ],
            }
        ]

    def test_empty_list_is_accepted(self):
        assert repeaters.validate_station_list([]) == []

    def test_stations_are_sorted_by_callsign(self):
        document = [
            _station_document(callsign="GB3ZZ"),
            _station_document(callsign="GB3AA"),
        ]
        stations = repeaters.validate_station_list(document)
        assert [station["callsign"] for station in stations] == ["GB3AA", "GB3ZZ"]

    def test_integer_coordinates_are_converted_to_floats(self):
        stations = repeaters.validate_station_list(
            [_station_document(latitude=52, longitude=0)]
        )
        assert isinstance(stations[0]["latitude"], float)
        assert isinstance(stations[0]["longitude"], float)

    def test_unknown_keys_are_dropped(self):
        document = [_station_document(unexpectedKey="ignored")]
        assert "unexpectedKey" not in repeaters.validate_station_list(document)[0]

    def test_unknown_channel_keys_are_dropped(self):
        document = [
            _station_document(channels=[_channel_document(unexpectedKey="ignored")])
        ]
        assert (
            "unexpectedKey"
            not in repeaters.validate_station_list(document)[0]["channels"][0]
        )

    @pytest.mark.parametrize(
        "omitted_field",
        ["locator", "location", "postcode", "region", "keeper"],
    )
    def test_missing_optional_station_text_defaults_to_null(self, omitted_field):
        document = [_station_document(**{omitted_field: None})]
        assert repeaters.validate_station_list(document)[0][omitted_field] is None

    def test_empty_optional_text_becomes_null(self):
        document = [_station_document(location="")]
        assert repeaters.validate_station_list(document)[0]["location"] is None

    def test_missing_optional_channel_numbers_default_to_null(self):
        bare_channel = {"band": "2m", "txMhz": 145.6, "rxMhz": 145.0}
        channel = repeaters.validate_station_list(
            [_station_document(channels=[bare_channel])]
        )[0]["channels"][0]
        assert channel["id"] is None
        assert channel["ctcssHz"] is None
        assert channel["dmrColourCode"] is None
        assert channel["heightMagl"] is None
        assert channel["erpDbw"] is None
        assert channel["modes"] == []
        assert channel["status"] == "UNKNOWN"

    def test_float_valued_integer_channel_fields_are_truncated(self):
        channel_document = _channel_document(heightMagl=30.9, dmrColourCode=3.9)
        channel = repeaters.validate_station_list(
            [_station_document(channels=[channel_document])]
        )[0]["channels"][0]
        assert channel["heightMagl"] == 30
        assert channel["dmrColourCode"] == 3

    def test_unknown_mode_codes_are_dropped(self):
        channel_document = _channel_document(modes=["A", "Z", 7, "M", "A"])
        channel = repeaters.validate_station_list(
            [_station_document(channels=[channel_document])]
        )[0]["channels"][0]
        assert channel["modes"] == ["A", "M"]

    def test_unknown_channel_status_becomes_unknown(self):
        channel_document = _channel_document(status="BROKEN")
        channel = repeaters.validate_station_list(
            [_station_document(channels=[channel_document])]
        )[0]["channels"][0]
        assert channel["status"] == "UNKNOWN"

    @pytest.mark.parametrize(
        "boundary_position",
        [
            pytest.param({"latitude": 49.0}, id="southern edge"),
            pytest.param({"latitude": 61.5}, id="northern edge"),
            pytest.param({"longitude": -11.0}, id="western edge"),
            pytest.param({"longitude": 3.0}, id="eastern edge"),
        ],
    )
    def test_position_on_the_bounding_box_edge_is_accepted(self, boundary_position):
        assert (
            len(
                repeaters.validate_station_list(
                    [_station_document(**boundary_position)]
                )
            )
            == 1
        )

    @pytest.mark.parametrize(
        "bad_document,expected_message",
        [
            pytest.param(
                {"stations": []}, "stations must be a list", id="document is not a list"
            ),
            pytest.param(None, "stations must be a list", id="document is null"),
            pytest.param("[]", "stations must be a list", id="document is a string"),
        ],
    )
    def test_non_list_document_is_refused(self, bad_document, expected_message):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(bad_document)
        assert expected_message in str(excinfo.value)

    def test_non_object_station_is_refused(self):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(["GB3LO"])
        assert "each station must be an object" in str(excinfo.value)

    @pytest.mark.parametrize("missing_callsign", [None, "", "   "])
    def test_station_without_a_callsign_is_refused(self, missing_callsign):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(
                [_station_document(callsign=missing_callsign)]
            )
        assert "station callsign is required" in str(excinfo.value)

    def test_duplicate_callsign_is_refused(self):
        document = [_station_document(), _station_document(callsign="GB3LO")]
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(document)
        assert "GB3LO: listed twice" in str(excinfo.value)

    @pytest.mark.parametrize(
        "bad_latitude",
        [48.9, 61.6, None, "51.5", float("nan")],
    )
    def test_latitude_outside_the_uk_box_is_refused(self, bad_latitude):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list([_station_document(latitude=bad_latitude)])
        assert "GB3LO: latitude out of range" in str(excinfo.value)

    @pytest.mark.parametrize("bad_longitude", [-11.1, 3.1, None, "-0.12"])
    def test_longitude_outside_the_uk_box_is_refused(self, bad_longitude):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(
                [_station_document(longitude=bad_longitude)]
            )
        assert "GB3LO: longitude out of range" in str(excinfo.value)

    @pytest.mark.parametrize(
        "bad_channels",
        [
            pytest.param([], id="empty list"),
            pytest.param(None, id="missing"),
            pytest.param({"band": "2m"}, id="single object instead of a list"),
        ],
    )
    def test_station_without_at_least_one_channel_is_refused(self, bad_channels):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list([_station_document(channels=bad_channels)])
        assert "GB3LO: at least one channel is required" in str(excinfo.value)

    def test_non_object_channel_is_refused(self):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list([_station_document(channels=["2m"])])
        assert "GB3LO: each channel must be an object" in str(excinfo.value)

    @pytest.mark.parametrize("bad_band", [None, "", "  ", 2])
    def test_channel_without_a_band_is_refused(self, bad_band):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(
                [_station_document(channels=[_channel_document(band=bad_band)])]
            )
        assert "GB3LO: channel band is required" in str(excinfo.value)

    @pytest.mark.parametrize("frequency_field", ["txMhz", "rxMhz"])
    @pytest.mark.parametrize("bad_frequency", [None, "145.6", float("inf")])
    def test_channel_without_a_usable_frequency_is_refused(
        self, frequency_field, bad_frequency
    ):
        channel_document = _channel_document(**{frequency_field: bad_frequency})
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(
                [_station_document(channels=[channel_document])]
            )
        assert f"GB3LO: {frequency_field} must be a number" in str(excinfo.value)

    def test_non_list_modes_is_refused(self):
        channel_document = _channel_document(modes="AM")
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(
                [_station_document(channels=[channel_document])]
            )
        assert "GB3LO: modes must be a list" in str(excinfo.value)

    def test_non_integer_channel_id_is_refused(self):
        channel_document = _channel_document(id="101")
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(
                [_station_document(channels=[channel_document])]
            )
        assert "GB3LO: channel id must be an integer or null" in str(excinfo.value)

    @pytest.mark.parametrize(
        "numeric_field",
        ["ctcssHz", "erpDbw", "heightMagl", "dmrColourCode"],
    )
    @pytest.mark.parametrize("bad_number", ["94.8", float("nan"), []])
    def test_non_numeric_optional_channel_number_is_refused(
        self, numeric_field, bad_number
    ):
        channel_document = _channel_document(**{numeric_field: bad_number})
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(
                [_station_document(channels=[channel_document])]
            )
        assert f"GB3LO: {numeric_field} must be a number or null" in str(excinfo.value)

    @pytest.mark.parametrize(
        "text_field",
        ["locator", "location", "postcode", "region", "keeper"],
    )
    def test_non_string_optional_station_text_is_refused(self, text_field):
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list([_station_document(**{text_field: 42})])
        assert f"GB3LO: {text_field} must be a string or null" in str(excinfo.value)

    def test_non_string_channel_name_is_refused(self):
        channel_document = _channel_document(channel=50)
        with pytest.raises(repeaters.RepeaterDataInvalid) as excinfo:
            repeaters.validate_station_list(
                [_station_document(channels=[channel_document])]
            )
        assert "GB3LO: channel must be a string or null" in str(excinfo.value)

    def test_nothing_is_returned_when_a_later_station_is_bad(self):
        # Refused whole rather than half-applied: the good first station must not
        # come back alongside an error.
        document = [
            _station_document(callsign="GB3AA"),
            _station_document(callsign="GB3BB", latitude=0.0),
        ]
        with pytest.raises(repeaters.RepeaterDataInvalid):
            repeaters.validate_station_list(document)

    def test_invalid_data_error_is_a_value_error(self):
        # The router catches RepeaterDataInvalid; the CSV path raises plain
        # ValueError. Both must be catchable as ValueError by _load_bundled.
        assert issubclass(repeaters.RepeaterDataInvalid, ValueError)

    def test_unavailable_error_is_a_runtime_error(self):
        assert issubclass(repeaters.RepeaterDataUnavailable, RuntimeError)


# ── the committed bundled snapshot ───────────────────────────────────────────


class TestBundledSnapshot:
    def test_committed_snapshot_is_valid_and_non_empty(self):
        # The offline fallback is a committed data file; if it ever stops
        # validating, an offline install silently 503s instead of plotting.
        stations = repeaters._load_bundled()
        assert len(stations) > 100
        assert all(station["channels"] for station in stations)

    def test_committed_snapshot_path_points_at_the_backend_data_file(self):
        assert repeaters.BUNDLED_JSON_PATH.name == "uk_repeaters.json"
        assert repeaters.BUNDLED_JSON_PATH.parent.name == "data"
        assert repeaters.BUNDLED_JSON_PATH.exists()

    def test_snapshot_without_a_stations_key_is_refused(self, bundled_snapshot):
        bundled_snapshot({"repeaters": []})
        with pytest.raises(repeaters.RepeaterDataInvalid):
            repeaters._load_bundled()

    def test_missing_snapshot_file_raises_os_error(self, bundled_snapshot):
        with pytest.raises(OSError):
            repeaters._load_bundled()


# ── replace_repeaters ────────────────────────────────────────────────────────


class TestReplaceRepeaters:
    async def test_inserts_the_directory_when_no_cache_row_exists(self, db):
        count = await repeaters.replace_repeaters(db, [_station_document()])
        assert count == 1
        row = await _stored_row(db)
        assert row is not None
        assert json.loads(row.payload)[0]["callsign"] == "GB3LO"

    async def test_stored_payload_is_the_normalised_list(self, db):
        await repeaters.replace_repeaters(db, [_station_document(callsign="gb3lo")])
        row = await _stored_row(db)
        stored = json.loads(row.payload)
        assert stored[0]["callsign"] == "GB3LO"
        assert stored[0]["channels"][0]["band"] == "2M"

    async def test_uses_the_manual_ttl_so_the_daily_refresh_leaves_it_alone(self, db):
        before = now_ms()
        await repeaters.replace_repeaters(db, [_station_document()])
        row = await _stored_row(db)
        assert row.expires_at - row.fetched_at == settings.repeaters_manual_ttl_ms
        assert row.fetched_at >= before
        # Distinguishes the manual TTL from the daily one.
        assert settings.repeaters_manual_ttl_ms > settings.repeaters_ttl_ms

    async def test_overwrites_an_existing_cache_row_in_place(self, db):
        await _store_cache_row(
            db, [_station_document(callsign="GB3OLD")], fetched_at=1, expires_at=2
        )
        count = await repeaters.replace_repeaters(
            db, [_station_document(callsign="GB3NEW")]
        )
        assert count == 1
        rows = (await db.execute(select(RepeaterCache))).scalars().all()
        assert len(rows) == 1
        assert json.loads(rows[0].payload)[0]["callsign"] == "GB3NEW"
        assert rows[0].fetched_at > 1

    async def test_accepts_an_empty_directory(self, db):
        assert await repeaters.replace_repeaters(db, []) == 0

    async def test_counts_every_stored_station(self, db):
        document = [
            _station_document(callsign="GB3AA"),
            _station_document(callsign="GB3BB"),
        ]
        assert await repeaters.replace_repeaters(db, document) == 2

    async def test_invalid_upload_is_refused_without_writing(self, db):
        with pytest.raises(repeaters.RepeaterDataInvalid):
            await repeaters.replace_repeaters(db, [_station_document(latitude=0.0)])
        assert await _stored_row(db) is None

    async def test_invalid_upload_leaves_an_existing_row_untouched(self, db):
        await _store_cache_row(
            db, [_station_document(callsign="GB3OLD")], fetched_at=7, expires_at=8
        )
        with pytest.raises(repeaters.RepeaterDataInvalid):
            await repeaters.replace_repeaters(db, "not a list")
        row = await _stored_row(db)
        assert json.loads(row.payload)[0]["callsign"] == "GB3OLD"
        assert row.fetched_at == 7


# ── get_repeaters ────────────────────────────────────────────────────────────


class TestGetRepeatersCacheHit:
    async def test_fresh_cache_is_served_as_a_hit_without_touching_upstream(
        self, db, monkeypatch
    ):
        recorder = _install_stub_upstream(
            monkeypatch, text=_build_csv([_csv_row_values()])
        )
        fetched_at = now_ms()
        await _store_cache_row(
            db,
            [_station_document(callsign="GB3CACHED")],
            fetched_at=fetched_at,
            expires_at=fetched_at + 60_000,
        )
        payload, cache_state = await repeaters.get_repeaters(db)
        assert cache_state == "HIT"
        assert payload == {
            "source": "online",
            "fetchedAt": fetched_at,
            "stations": [_station_document(callsign="GB3CACHED")],
        }
        assert recorder.requested_urls == []


class TestGetRepeatersCacheMiss:
    async def test_expired_cache_is_refetched_and_updated_in_place(
        self, db, monkeypatch
    ):
        _install_stub_upstream(
            monkeypatch, text=_build_csv([_csv_row_values(callsign="GB3FRESH")])
        )
        await _store_cache_row(
            db, [_station_document(callsign="GB3STALE")], fetched_at=1, expires_at=2
        )
        payload, cache_state = await repeaters.get_repeaters(db)
        assert cache_state == "MISS"
        assert payload["source"] == "online"
        assert [station["callsign"] for station in payload["stations"]] == ["GB3FRESH"]
        rows = (await db.execute(select(RepeaterCache))).scalars().all()
        assert len(rows) == 1
        assert json.loads(rows[0].payload)[0]["callsign"] == "GB3FRESH"
        assert rows[0].expires_at - rows[0].fetched_at == settings.repeaters_ttl_ms

    async def test_empty_cache_is_fetched_and_inserted(self, db, monkeypatch):
        _install_stub_upstream(monkeypatch, text=_build_csv([_csv_row_values()]))
        payload, cache_state = await repeaters.get_repeaters(db)
        assert cache_state == "MISS"
        assert payload["fetchedAt"] is not None
        row = await _stored_row(db)
        assert row is not None
        assert json.loads(row.payload)[0]["callsign"] == "GB3LO"

    async def test_a_second_call_after_a_miss_is_a_hit(self, db, monkeypatch):
        recorder = _install_stub_upstream(
            monkeypatch, text=_build_csv([_csv_row_values()])
        )
        assert (await repeaters.get_repeaters(db))[1] == "MISS"
        assert (await repeaters.get_repeaters(db))[1] == "HIT"
        assert len(recorder.requested_urls) == 1

    async def test_fetch_uses_the_configured_url_timeout_and_identifying_user_agent(
        self, db, monkeypatch
    ):
        # ukrepeater.net answers 403 to the default httpx agent, so the header is
        # load-bearing, not cosmetic.
        recorder = _install_stub_upstream(
            monkeypatch, text=_build_csv([_csv_row_values()])
        )
        await repeaters.get_repeaters(db)
        assert recorder.requested_urls == [settings.repeaters_upstream_url]
        kwargs = recorder.client_kwargs[0]
        assert kwargs["headers"]["User-Agent"] == repeaters.USER_AGENT
        assert kwargs["timeout"] == settings.repeaters_fetch_timeout_s
        assert kwargs["follow_redirects"] is True


class TestGetRepeatersStale:
    async def test_upstream_failure_serves_the_last_good_copy(
        self, db, monkeypatch, bundled_snapshot
    ):
        bundled_snapshot({"stations": [_station_document(callsign="GB3BUNDLED")]})
        _install_stub_upstream(monkeypatch, error=httpx.ConnectTimeout("timed out"))
        fetched_at = now_ms() - 1000
        await _store_cache_row(
            db,
            [_station_document(callsign="GB3LAST")],
            fetched_at=fetched_at,
            expires_at=fetched_at + 1,
        )
        payload, cache_state = await repeaters.get_repeaters(db)
        assert cache_state == "STALE"
        assert payload["source"] == "cached"
        assert payload["fetchedAt"] == fetched_at
        assert [station["callsign"] for station in payload["stations"]] == ["GB3LAST"]

    async def test_http_error_status_also_falls_back_to_the_cache(
        self, db, monkeypatch
    ):
        _install_stub_upstream(monkeypatch, text="Forbidden", status_code=403)
        fetched_at = now_ms() - 1000
        await _store_cache_row(
            db, [_station_document()], fetched_at=fetched_at, expires_at=fetched_at + 1
        )
        assert (await repeaters.get_repeaters(db))[1] == "STALE"

    async def test_a_page_that_is_not_the_csv_also_falls_back_to_the_cache(
        self, db, monkeypatch
    ):
        # A captive portal answering 200 with HTML must not overwrite good data.
        _install_stub_upstream(monkeypatch, text="<html>login</html>")
        fetched_at = now_ms() - 1000
        await _store_cache_row(
            db, [_station_document()], fetched_at=fetched_at, expires_at=fetched_at + 1
        )
        payload, cache_state = await repeaters.get_repeaters(db)
        assert cache_state == "STALE"
        assert payload["stations"][0]["callsign"] == "gb3lo"

    async def test_an_empty_upstream_list_does_not_replace_the_cache(
        self, db, monkeypatch
    ):
        # The export answering with headings only would otherwise wipe the map.
        _install_stub_upstream(monkeypatch, text=_build_csv([]))
        fetched_at = now_ms() - 1000
        await _store_cache_row(
            db,
            [_station_document(callsign="GB3KEPT")],
            fetched_at=fetched_at,
            expires_at=fetched_at + 1,
        )
        payload, cache_state = await repeaters.get_repeaters(db)
        assert cache_state == "STALE"
        assert payload["stations"][0]["callsign"] == "GB3KEPT"

    async def test_upstream_failure_is_logged_with_the_reason(
        self, db, monkeypatch, caplog
    ):
        _install_stub_upstream(monkeypatch, error=httpx.ConnectTimeout("timed out"))
        fetched_at = now_ms() - 1000
        await _store_cache_row(
            db, [_station_document()], fetched_at=fetched_at, expires_at=fetched_at + 1
        )
        with caplog.at_level("WARNING", logger=repeaters.logger.name):
            await repeaters.get_repeaters(db)
        assert "UK repeater list refresh failed" in caplog.text
        assert "timed out" in caplog.text


class TestGetRepeatersBundled:
    async def test_bundled_snapshot_is_served_when_there_is_no_cache(
        self, db, monkeypatch, bundled_snapshot
    ):
        bundled_snapshot({"stations": [_station_document(callsign="GB3BUNDLED")]})
        _install_stub_upstream(
            monkeypatch, error=httpx.ConnectError("no route to host")
        )
        payload, cache_state = await repeaters.get_repeaters(db)
        assert cache_state == "BUNDLED"
        assert payload["source"] == "bundled"
        assert payload["fetchedAt"] is None
        assert [station["callsign"] for station in payload["stations"]] == [
            "GB3BUNDLED"
        ]

    async def test_cache_older_than_the_stale_window_falls_through_to_bundled(
        self, db, monkeypatch, bundled_snapshot
    ):
        bundled_snapshot({"stations": [_station_document(callsign="GB3BUNDLED")]})
        _install_stub_upstream(
            monkeypatch, error=httpx.ConnectError("no route to host")
        )
        fetched_at = now_ms() - settings.repeaters_stale_ms - 1
        await _store_cache_row(
            db,
            [_station_document(callsign="GB3ANCIENT")],
            fetched_at=fetched_at,
            expires_at=1,
        )
        payload, cache_state = await repeaters.get_repeaters(db)
        assert cache_state == "BUNDLED"
        assert [station["callsign"] for station in payload["stations"]] == [
            "GB3BUNDLED"
        ]

    async def test_missing_bundled_file_raises_repeater_data_unavailable(
        self, db, monkeypatch, bundled_snapshot
    ):
        _install_stub_upstream(
            monkeypatch, error=httpx.ConnectError("no route to host")
        )
        with pytest.raises(repeaters.RepeaterDataUnavailable) as excinfo:
            await repeaters.get_repeaters(db)
        assert "no cached or bundled copy" in str(excinfo.value)
        assert isinstance(excinfo.value.__cause__, OSError)

    async def test_unparseable_bundled_file_raises_repeater_data_unavailable(
        self, db, monkeypatch, tmp_path
    ):
        broken_path = tmp_path / "uk_repeaters.json"
        broken_path.write_text("{not json", encoding="utf-8")
        monkeypatch.setattr(repeaters, "BUNDLED_JSON_PATH", broken_path)
        _install_stub_upstream(
            monkeypatch, error=httpx.ConnectError("no route to host")
        )
        with pytest.raises(repeaters.RepeaterDataUnavailable):
            await repeaters.get_repeaters(db)

    async def test_invalid_bundled_document_raises_repeater_data_unavailable(
        self, db, monkeypatch, bundled_snapshot
    ):
        bundled_snapshot({"stations": [_station_document(latitude=0.0)]})
        _install_stub_upstream(
            monkeypatch, error=httpx.ConnectError("no route to host")
        )
        with pytest.raises(repeaters.RepeaterDataUnavailable) as excinfo:
            await repeaters.get_repeaters(db)
        assert isinstance(excinfo.value.__cause__, repeaters.RepeaterDataInvalid)

    async def test_bundled_fallback_does_not_write_a_cache_row(
        self, db, monkeypatch, bundled_snapshot
    ):
        # Caching the bundled copy would make the next call a HIT and stop the
        # daily refresh from ever reaching a now-reachable upstream.
        bundled_snapshot({"stations": [_station_document()]})
        _install_stub_upstream(
            monkeypatch, error=httpx.ConnectError("no route to host")
        )
        await repeaters.get_repeaters(db)
        assert await _stored_row(db) is None
