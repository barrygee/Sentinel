"""
tests/backend/test_decoder_aprs_entrypoint.py

Tests for the APRS decoder sidecar's pure logic (decoder/aprs/entrypoint.py):
Direwolf stdout → TNC2 extraction, aprslib-based structured parsing, ingest POST,
config fetch, command assembly, and line handling. The module lives in the
separate aprs-decoder image; it imports aprslib (not installed in the backend
venv), so a lightweight fake aprslib is injected before loading it by path. The
long-running loops (main/run_direwolf_once/pump_pcm) drive real subprocesses/
sockets and are not exercised.
"""

import importlib.util
import queue as _queue
import sys
import types
from pathlib import Path
from unittest.mock import patch


_ENTRYPOINT_PATH = (
    Path(__file__).resolve().parents[2] / "decoder" / "aprs" / "entrypoint.py"
)


def _load_entrypoint():
    fake_aprslib = types.ModuleType("aprslib")
    fake_aprslib.parse = lambda packet: {}  # replaced per-test
    fake_aprslib.ParseError = type("ParseError", (Exception,), {})
    fake_aprslib.UnknownFormat = type("UnknownFormat", (Exception,), {})
    sys.modules["aprslib"] = fake_aprslib
    spec = importlib.util.spec_from_file_location("aprs_entrypoint", _ENTRYPOINT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


entrypoint = _load_entrypoint()


# ── extract_packet ────────────────────────────────────────────────────────────


class TestExtractPacket:
    def test_channel_prefixed_line(self):
        line = "[0.1] M0ABC-9>APU25N,WIDE1-1:!5129.83N/00005.32W>Test"
        assert (
            entrypoint.extract_packet(line)
            == "M0ABC-9>APU25N,WIDE1-1:!5129.83N/00005.32W>Test"
        )

    def test_bare_channel_prefix(self):
        assert entrypoint.extract_packet("[0] G0XYZ>APRS:hello") == "G0XYZ>APRS:hello"

    def test_non_packet_line_is_none(self):
        assert entrypoint.extract_packet("M0ABC-9 audio level = 50") is None

    def test_blank_line_is_none(self):
        assert entrypoint.extract_packet("   ") is None

    def test_prefix_with_empty_remainder_is_none(self):
        assert entrypoint.extract_packet("[0]    ") is None


# ── _clean ────────────────────────────────────────────────────────────────────


class TestClean:
    def test_none(self):
        assert entrypoint._clean(None) is None

    def test_empty_string(self):
        assert entrypoint._clean("") is None

    def test_whitespace_string(self):
        assert entrypoint._clean("   ") is None

    def test_nonempty_string(self):
        assert entrypoint._clean("hi") == "hi"

    def test_zero_is_kept(self):
        # 0 is a meaningful numeric value (e.g. course due north), not "blank".
        assert entrypoint._clean(0) == 0


# ── parse_aprs_packet ─────────────────────────────────────────────────────────


class TestParseAprsPacket:
    def test_full_packet_maps_fields(self, monkeypatch):
        monkeypatch.setattr(
            entrypoint.aprslib,
            "parse",
            lambda packet: {
                "from": "M0ABC-9",
                "latitude": 51.5,
                "longitude": -0.1,
                "symbol_table": "/",
                "symbol": ">",
                "comment": "rolling",
                "course": 90,
                "speed": 30,
                "altitude": 120,
                "path": ["WIDE1-1", "WIDE2-1"],
            },
        )
        event = entrypoint.parse_aprs_packet("M0ABC-9>APRS:!x")
        assert event["type"] == "aprs"
        assert event["from"] == "M0ABC-9"
        assert event["latitude"] == 51.5
        assert event["symbol"] == "/>"
        assert event["path"] == "WIDE1-1,WIDE2-1"
        assert event["raw"] == "M0ABC-9>APRS:!x"
        assert isinstance(event["ts"], int)

    def test_parse_error_returns_none(self, monkeypatch):
        def _raise(packet):
            raise entrypoint.aprslib.ParseError("bad")

        monkeypatch.setattr(entrypoint.aprslib, "parse", _raise)
        assert entrypoint.parse_aprs_packet("garbage") is None

    def test_blank_optional_fields_omitted(self, monkeypatch):
        # A minimal position packet: only from/lat/lon; blanks are dropped.
        monkeypatch.setattr(
            entrypoint.aprslib,
            "parse",
            lambda packet: {"from": "G0XYZ", "latitude": 1.0, "longitude": 2.0},
        )
        event = entrypoint.parse_aprs_packet("G0XYZ>APRS:!x")
        assert event["from"] == "G0XYZ"
        assert "comment" not in event
        assert "course" not in event
        assert "symbol" not in event  # empty table+code collapses to blank → dropped

    def test_third_party_packet_uses_subpacket_position(self, monkeypatch):
        # A relay/IGate third-party packet has no top-level position; the plotted
        # station + fix come from the nested subpacket.
        monkeypatch.setattr(
            entrypoint.aprslib,
            "parse",
            lambda packet: {
                "from": "MB7UXX",
                "latitude": None,
                "longitude": None,
                "format": "thirdparty",
                "subpacket": {
                    "from": "M8GGQ-D",
                    "latitude": 54.6,
                    "longitude": -1.05,
                    "symbol_table": "/",
                    "symbol": "-",
                    "comment": "gateway",
                },
            },
        )
        event = entrypoint.parse_aprs_packet("MB7UXX>APRS:}M8GGQ-D>...")
        assert event["from"] == "M8GGQ-D"  # the reported station, not the relay
        assert event["latitude"] == 54.6
        assert event["longitude"] == -1.05
        assert event["symbol"] == "/-"
        assert event["comment"] == "gateway"

    def test_string_path_passed_through(self, monkeypatch):
        monkeypatch.setattr(
            entrypoint.aprslib,
            "parse",
            lambda packet: {
                "from": "G0XYZ",
                "latitude": 1.0,
                "longitude": 2.0,
                "path": "WIDE1-1",
            },
        )
        event = entrypoint.parse_aprs_packet("G0XYZ>APRS:!x")
        assert event["path"] == "WIDE1-1"


# ── post_event ────────────────────────────────────────────────────────────────


class TestPostEvent:
    def _response(self, status):
        from unittest.mock import MagicMock

        response = MagicMock()
        response.status = status
        response.__enter__ = lambda self_: response
        response.__exit__ = lambda *args: False
        return response

    def test_success_returns_true(self):
        with patch.object(
            entrypoint.urllib.request, "urlopen", return_value=self._response(200)
        ):
            assert (
                entrypoint.post_event("http://app/ingest", "s", {"from": "X"}) is True
            )

    def test_non_2xx_returns_false(self):
        with patch.object(
            entrypoint.urllib.request, "urlopen", return_value=self._response(500)
        ):
            assert (
                entrypoint.post_event("http://app/ingest", "s", {"from": "X"}) is False
            )

    def test_http_409_is_quiet(self, capsys):
        err = entrypoint.urllib.error.HTTPError(
            "http://app/ingest", 409, "Conflict", {}, None
        )
        with patch.object(entrypoint.urllib.request, "urlopen", side_effect=err):
            assert entrypoint.post_event("http://app/ingest", "s", {}) is False
        assert "ingest POST failed" not in capsys.readouterr().err

    def test_other_http_error_is_logged(self, capsys):
        err = entrypoint.urllib.error.HTTPError(
            "http://app/ingest", 500, "err", {}, None
        )
        with patch.object(entrypoint.urllib.request, "urlopen", side_effect=err):
            assert entrypoint.post_event("http://app/ingest", "s", {}) is False
        assert "ingest POST failed" in capsys.readouterr().err

    def test_network_error_returns_false(self):
        with patch.object(
            entrypoint.urllib.request, "urlopen", side_effect=OSError("boom")
        ):
            assert entrypoint.post_event("http://app/ingest", "s", {}) is False


# ── fetch_decode_config ───────────────────────────────────────────────────────


class TestFetchDecodeConfig:
    def _response(self, status, body):
        from unittest.mock import MagicMock

        response = MagicMock()
        response.status = status
        response.read.return_value = body.encode()
        response.__enter__ = lambda self_: response
        response.__exit__ = lambda *args: False
        return response

    def test_success_returns_config(self):
        with patch.object(
            entrypoint.urllib.request,
            "urlopen",
            return_value=self._response(200, '{"active": true}'),
        ):
            assert entrypoint.fetch_decode_config("http://app/config", "s") == {
                "active": True
            }

    def test_non_2xx_returns_empty(self):
        with patch.object(
            entrypoint.urllib.request,
            "urlopen",
            return_value=self._response(500, "nope"),
        ):
            assert entrypoint.fetch_decode_config("http://app/config", "s") == {}

    def test_network_error_returns_empty(self):
        with patch.object(
            entrypoint.urllib.request, "urlopen", side_effect=OSError("boom")
        ):
            assert entrypoint.fetch_decode_config("http://app/config", "s") == {}


# ── build_direwolf_command ────────────────────────────────────────────────────


class TestBuildDirewolfCommand:
    def test_default_flags(self, monkeypatch):
        monkeypatch.delenv("APRS_EXTRA_ARGS", raising=False)
        command = entrypoint.build_direwolf_command()
        assert command[0] == "direwolf"
        assert command[-1] == "-"  # read audio from stdin
        for flag in ("-r", "48000", "-b", "16", "-B", "1200"):
            assert flag in command

    def test_extra_args_appended(self, monkeypatch):
        monkeypatch.setenv("APRS_EXTRA_ARGS", "-d x -a 3")
        command = entrypoint.build_direwolf_command()
        assert command[-4:] == ["-d", "x", "-a", "3"]


# ── handle_line ───────────────────────────────────────────────────────────────


class TestHandleLine:
    def test_packet_line_queues_log_and_structured(self, monkeypatch):
        monkeypatch.setattr(
            entrypoint.aprslib,
            "parse",
            lambda packet: {"from": "M0ABC-9", "latitude": 1.0, "longitude": 2.0},
        )
        events: _queue.Queue = _queue.Queue()
        entrypoint.handle_line("[0.1] M0ABC-9>APRS:!x", events)
        first = events.get_nowait()
        second = events.get_nowait()
        assert first == {"type": "log", "line": "M0ABC-9>APRS:!x"}
        assert second["type"] == "aprs"
        assert events.empty()

    def test_unparseable_packet_queues_only_log(self, monkeypatch):
        def _raise(packet):
            raise entrypoint.aprslib.ParseError("bad")

        monkeypatch.setattr(entrypoint.aprslib, "parse", _raise)
        events: _queue.Queue = _queue.Queue()
        entrypoint.handle_line("[0.1] junk>data:!x", events)
        assert events.get_nowait()["type"] == "log"
        assert events.empty()  # no structured event

    def test_non_packet_line_queues_nothing(self):
        events: _queue.Queue = _queue.Queue()
        entrypoint.handle_line("Direwolf startup banner", events)
        assert events.empty()

    def test_full_queue_is_dropped_not_raised(self, monkeypatch):
        monkeypatch.setattr(
            entrypoint.aprslib,
            "parse",
            lambda packet: {"from": "X", "latitude": 1.0, "longitude": 2.0},
        )
        events: _queue.Queue = _queue.Queue(maxsize=1)
        events.put_nowait({"pre": "existing"})  # already full
        # Must not raise even though both put_nowait calls hit a full queue.
        entrypoint.handle_line("[0] X>APRS:!y", events)
        assert events.qsize() == 1


# ── resolve_secret ────────────────────────────────────────────────────────────


class TestResolveSecret:
    def test_env_override_wins(self, monkeypatch):
        monkeypatch.setenv("INGEST_SECRET", "explicit")
        assert entrypoint.resolve_secret() == "explicit"

    def test_reads_secret_file(self, monkeypatch, tmp_path):
        monkeypatch.delenv("INGEST_SECRET", raising=False)
        secret_file = tmp_path / "secret"
        secret_file.write_text("from-file")
        monkeypatch.setenv("INGEST_SECRET_FILE", str(secret_file))
        assert entrypoint.resolve_secret() == "from-file"

    def test_no_source_returns_none(self, monkeypatch):
        monkeypatch.delenv("INGEST_SECRET", raising=False)
        monkeypatch.delenv("INGEST_SECRET_FILE", raising=False)
        assert entrypoint.resolve_secret() is None

    def test_missing_file_times_out_to_none(self, monkeypatch, tmp_path):
        monkeypatch.delenv("INGEST_SECRET", raising=False)
        monkeypatch.setenv("INGEST_SECRET_FILE", str(tmp_path / "never"))
        # Collapse the wait so the poll loop returns immediately.
        monkeypatch.setattr(entrypoint, "_SECRET_WAIT_SECONDS", 0)
        assert entrypoint.resolve_secret() is None
