"""Tests for the bundled-snapshot refresh script — backend/scripts/refresh_repeaters.py.

The script is the maintenance path that regenerates the committed offline
fallback (`backend/data/uk_repeaters.json`). What matters is that it never
replaces a good snapshot with a bad one: an unreachable site, an error status or
a body that is not the CSV must all fail loudly, and an export that parses to
nothing must be refused rather than written.

`httpx.get` is replaced, and the snapshot path is redirected into tmp, so the
committed data file is never touched by a test run.
"""

from __future__ import annotations

import json
import runpy

import httpx
import pytest

from backend.config import settings
from backend.scripts import refresh_repeaters
from backend.services import repeaters

MODULE_NAME = "backend.scripts.refresh_repeaters"

CSV_HEADER = (
    "id,callsign,band,channel,TX MHz,RX MHz,magl,ERP[dBW],modes,QTHR,where,"
    "postcode,ETCC region,ctcss,dmrcc,keeper,lat,lon,status,"
)
CSV_ROW_LONDON = "101,GB3LO,2M,RV50,145.6,145.0,30,12.0,AM,IO91WM,LONDON,SW1A,LON,94.8,3,G0ABC,51.5,-0.12,OPERATIONAL,"
CSV_ROW_UNPLOTTABLE = "102,GB3NO,2M,RV51,145.7,145.1,30,12.0,AM,IO91WM,NOWHERE,SW1A,LON,,,G0ABC,,,OPERATIONAL,"

GOOD_EXPORT = f"{CSV_HEADER}\n{CSV_ROW_LONDON}\n"
EXPORT_WITH_NO_PLOTTABLE_ROWS = f"{CSV_HEADER}\n{CSV_ROW_UNPLOTTABLE}\n"


class _StubResponse:
    def __init__(self, text: str, status_code: int = 200) -> None:
        self.text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", settings.repeaters_upstream_url)
            raise httpx.HTTPStatusError(
                f"upstream returned {self.status_code}",
                request=request,
                response=httpx.Response(self.status_code, request=request),
            )


class _RequestRecorder:
    def __init__(self) -> None:
        self.urls: list[str] = []
        self.kwargs: list[dict[str, object]] = []


@pytest.fixture()
def snapshot_path(tmp_path, monkeypatch):
    """Redirect the script's output path into tmp so the committed file is safe."""
    path = tmp_path / "uk_repeaters.json"
    monkeypatch.setattr(refresh_repeaters, "BUNDLED_JSON_PATH", path)
    return path


@pytest.fixture()
def stub_upstream(monkeypatch):
    """Returns an installer taking the body/status/error the script should see."""

    def _install(
        *,
        text: str = GOOD_EXPORT,
        status_code: int = 200,
        error: BaseException | None = None,
    ) -> _RequestRecorder:
        recorder = _RequestRecorder()

        def _stub_get(url: str, **kwargs: object) -> _StubResponse:
            recorder.urls.append(url)
            recorder.kwargs.append(kwargs)
            if error is not None:
                raise error
            return _StubResponse(text, status_code)

        monkeypatch.setattr(refresh_repeaters.httpx, "get", _stub_get)
        return recorder

    return _install


class TestRefreshRepeatersMain:
    def test_writes_the_parsed_snapshot_and_returns_success(
        self, snapshot_path, stub_upstream, capsys
    ):
        stub_upstream()
        assert refresh_repeaters.main() == 0
        document = json.loads(snapshot_path.read_text(encoding="utf-8"))
        assert [station["callsign"] for station in document["stations"]] == ["GB3LO"]
        assert document["stations"][0]["channels"][0]["band"] == "2M"
        assert "wrote 1 stations / 1 channels" in capsys.readouterr().out

    def test_written_snapshot_is_what_the_service_loads(
        self, snapshot_path, stub_upstream, monkeypatch
    ):
        # The two must agree on shape, or a refresh silently breaks the offline
        # fallback until someone runs the app with no network.
        stub_upstream()
        refresh_repeaters.main()
        monkeypatch.setattr(repeaters, "BUNDLED_JSON_PATH", snapshot_path)
        stations = repeaters._load_bundled()
        assert [station["callsign"] for station in stations] == ["GB3LO"]

    def test_snapshot_is_indented_and_newline_terminated(
        self, snapshot_path, stub_upstream
    ):
        # It is a committed file — an unindented single line makes every refresh
        # an unreviewable diff.
        stub_upstream()
        refresh_repeaters.main()
        text = snapshot_path.read_text(encoding="utf-8")
        assert text.endswith("}\n")
        assert "\n  " in text

    def test_uses_the_configured_url_timeout_and_identifying_user_agent(
        self, snapshot_path, stub_upstream
    ):
        recorder = stub_upstream()
        refresh_repeaters.main()
        assert recorder.urls == [settings.repeaters_upstream_url]
        assert recorder.kwargs[0]["headers"]["User-Agent"] == repeaters.USER_AGENT
        assert recorder.kwargs[0]["timeout"] == settings.repeaters_fetch_timeout_s
        assert recorder.kwargs[0]["follow_redirects"] is True

    def test_export_with_no_plottable_rows_is_refused(
        self, snapshot_path, stub_upstream, capsys
    ):
        stub_upstream(text=EXPORT_WITH_NO_PLOTTABLE_ROWS)
        assert refresh_repeaters.main() == 1
        assert not snapshot_path.exists()
        assert "refusing to write an empty snapshot" in capsys.readouterr().err

    def test_existing_snapshot_survives_an_empty_export(
        self, snapshot_path, stub_upstream
    ):
        snapshot_path.write_text('{"stations": ["previous"]}', encoding="utf-8")
        stub_upstream(text=EXPORT_WITH_NO_PLOTTABLE_ROWS)
        assert refresh_repeaters.main() == 1
        assert json.loads(snapshot_path.read_text(encoding="utf-8")) == {
            "stations": ["previous"]
        }

    def test_error_status_propagates_and_writes_nothing(
        self, snapshot_path, stub_upstream
    ):
        stub_upstream(text="Forbidden", status_code=403)
        with pytest.raises(httpx.HTTPStatusError):
            refresh_repeaters.main()
        assert not snapshot_path.exists()

    def test_network_failure_propagates_and_writes_nothing(
        self, snapshot_path, stub_upstream
    ):
        stub_upstream(error=httpx.ConnectTimeout("timed out"))
        with pytest.raises(httpx.ConnectTimeout):
            refresh_repeaters.main()
        assert not snapshot_path.exists()

    def test_body_that_is_not_the_export_propagates_and_writes_nothing(
        self, snapshot_path, stub_upstream
    ):
        stub_upstream(text="<html>login</html>")
        with pytest.raises(ValueError):
            refresh_repeaters.main()
        assert not snapshot_path.exists()

    def test_run_as_a_module_exits_with_the_return_code(self, tmp_path, monkeypatch):
        # Covers the __main__ entry point: `python -m backend.scripts.refresh_repeaters`
        # must turn the return value into a process exit code.
        snapshot_path = tmp_path / "uk_repeaters.json"
        monkeypatch.setattr(repeaters, "BUNDLED_JSON_PATH", snapshot_path)
        monkeypatch.setattr(
            httpx, "get", lambda url, **kwargs: _StubResponse(GOOD_EXPORT)
        )
        with pytest.raises(SystemExit) as excinfo:
            runpy.run_module(MODULE_NAME, run_name="__main__")
        assert excinfo.value.code == 0
        assert json.loads(snapshot_path.read_text(encoding="utf-8"))["stations"]

    def test_run_as_a_module_exits_non_zero_on_an_empty_export(
        self, tmp_path, monkeypatch
    ):
        snapshot_path = tmp_path / "uk_repeaters.json"
        monkeypatch.setattr(repeaters, "BUNDLED_JSON_PATH", snapshot_path)
        monkeypatch.setattr(
            httpx,
            "get",
            lambda url, **kwargs: _StubResponse(EXPORT_WITH_NO_PLOTTABLE_ROWS),
        )
        with pytest.raises(SystemExit) as excinfo:
            runpy.run_module(MODULE_NAME, run_name="__main__")
        assert excinfo.value.code == 1
        assert not snapshot_path.exists()
