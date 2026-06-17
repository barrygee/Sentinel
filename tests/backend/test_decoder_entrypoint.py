"""
tests/backend/test_decoder_entrypoint.py

Tests for the decoder sidecar's pure logic (decoder/entrypoint.py): dsd-fme log
parsing, ingest POST, and command assembly. The module lives in the separate
decoder image but uses only the stdlib, so we load it by path and test it here.
The long-running main() loop is not exercised (it drives a real subprocess).
"""

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock, patch


_ENTRYPOINT_PATH = Path(__file__).resolve().parents[2] / "decoder" / "entrypoint.py"


def _load_entrypoint():
    spec = importlib.util.spec_from_file_location(
        "decoder_entrypoint", _ENTRYPOINT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


entrypoint = _load_entrypoint()


# ── parse_dsd_line ────────────────────────────────────────────────────────────


class TestParseDsdLine:
    def test_blank_line_returns_none(self):
        assert entrypoint.parse_dsd_line("   ") is None

    def test_unrecognised_line_returns_none(self):
        assert entrypoint.parse_dsd_line("hello world nothing useful") is None

    def test_sync_lost_emits_sync_false(self):
        assert entrypoint.parse_dsd_line("No Sync") == {"sync": False}
        assert entrypoint.parse_dsd_line("Sync Lost!") == {"sync": False}

    def test_mode_detected(self):
        event = entrypoint.parse_dsd_line("Decoding DMR voice frame")
        assert event["mode"] == "DMR"

    def test_talkgroup_source_color_code(self):
        event = entrypoint.parse_dsd_line("DMR Color Code: 1 TG=1234 Source ID: 9876")
        assert event["mode"] == "DMR"
        assert event["talkgroup"] == 1234
        assert event["source"] == 9876
        assert event["color_code"] == 1

    def test_sync_line_sets_mode_from_token(self):
        event = entrypoint.parse_dsd_line("Sync: +P25")
        assert event["mode"] == "P25"
        assert event["sync"] is True

    def test_dstar_token_normalised(self):
        event = entrypoint.parse_dsd_line("Sync acquired DSTAR header")
        assert event["mode"] == "D-STAR"


# ── post_event ────────────────────────────────────────────────────────────────


class TestPostEvent:
    def test_success_returns_true(self):
        fake_response = MagicMock()
        fake_response.status = 200
        fake_response.__enter__ = lambda self_: fake_response
        fake_response.__exit__ = lambda *args: False
        with patch.object(
            entrypoint.urllib.request, "urlopen", return_value=fake_response
        ):
            ok = entrypoint.post_event("http://app/ingest", "secret", {"mode": "DMR"})
        assert ok is True

    def test_non_2xx_returns_false(self):
        fake_response = MagicMock()
        fake_response.status = 500
        fake_response.__enter__ = lambda self_: fake_response
        fake_response.__exit__ = lambda *args: False
        with patch.object(
            entrypoint.urllib.request, "urlopen", return_value=fake_response
        ):
            ok = entrypoint.post_event("http://app/ingest", "secret", {"mode": "DMR"})
        assert ok is False

    def test_network_error_returns_false(self):
        with patch.object(
            entrypoint.urllib.request, "urlopen", side_effect=OSError("boom")
        ):
            ok = entrypoint.post_event("http://app/ingest", "secret", {"mode": "DMR"})
        assert ok is False


# ── build_dsd_command ─────────────────────────────────────────────────────────


class TestBuildDsdCommand:
    def test_defaults(self, monkeypatch):
        for var in (
            "IQ_PCM_HOST",
            "IQ_PCM_PORT",
            "AUDIO_UDP_HOST",
            "AUDIO_UDP_PORT",
            "DSD_EXTRA_ARGS",
        ):
            monkeypatch.delenv(var, raising=False)
        command = entrypoint.build_dsd_command()
        assert command[0] == "dsd-fme"
        assert "tcp:app:7355" in command
        assert "udp:app:7356" in command

    def test_custom_hosts_and_extra_args(self, monkeypatch):
        monkeypatch.setenv("IQ_PCM_HOST", "backend")
        monkeypatch.setenv("IQ_PCM_PORT", "9000")
        monkeypatch.setenv("DSD_EXTRA_ARGS", "-fr -mc")
        command = entrypoint.build_dsd_command()
        assert "tcp:backend:9000" in command
        assert "-fr" in command and "-mc" in command


# ── resolve_secret ──────────────────────────────────────────────────────────


class TestResolveSecret:
    def test_env_secret_takes_precedence(self, monkeypatch):
        monkeypatch.setenv("INGEST_SECRET", "from-env")
        monkeypatch.setenv("INGEST_SECRET_FILE", "/nonexistent")
        assert entrypoint.resolve_secret() == "from-env"

    def test_reads_secret_file(self, monkeypatch, tmp_path):
        secret_file = tmp_path / "secret"
        secret_file.write_text("from-file\n")
        monkeypatch.delenv("INGEST_SECRET", raising=False)
        monkeypatch.setenv("INGEST_SECRET_FILE", str(secret_file))
        assert entrypoint.resolve_secret() == "from-file"

    def test_returns_none_when_neither_set(self, monkeypatch):
        monkeypatch.delenv("INGEST_SECRET", raising=False)
        monkeypatch.delenv("INGEST_SECRET_FILE", raising=False)
        assert entrypoint.resolve_secret() is None


# ── main guard ────────────────────────────────────────────────────────────────


class TestMainGuard:
    def test_main_refuses_without_secret(self, monkeypatch):
        monkeypatch.delenv("INGEST_SECRET", raising=False)
        monkeypatch.delenv("INGEST_SECRET_FILE", raising=False)
        assert entrypoint.main() == 2
