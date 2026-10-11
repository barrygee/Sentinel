"""
tests/backend/test_decoder_hub_link.py

Tests for how the decoder sidecars (voice, APRS, AIS) log reaching the radio
hub: `HubLink` and its use in `fetch_decode_config`. Each supervisor polls the
hub's decode config every couple of seconds, so a hub that is starting or
restarting must produce one "waiting" line and one "connected … after N s"
line, not a line per failed poll. HTTP errors still log every time, because
they mean the hub answered and something is misconfigured.

The three entrypoints live in separate decoder images and each carries its own
copy of the helper, so every test runs against all three. APRS and AIS import
decode libraries the backend venv doesn't have, so stand-ins are injected
while they load.
"""

import importlib.util
import io
import socket
import sys
import types
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_DECODER_DIR = Path(__file__).resolve().parents[2] / "decoder"


def _load(module_name: str, path: Path):
    fake_aprslib = types.ModuleType("aprslib")
    fake_aprslib.parse = lambda packet: {}
    fake_aprslib.ParseError = type("ParseError", (Exception,), {})
    fake_aprslib.UnknownFormat = type("UnknownFormat", (Exception,), {})
    fake_pyais = types.ModuleType("pyais")
    fake_pyais.decode = lambda *sentences: None
    with patch.dict(sys.modules, {"aprslib": fake_aprslib, "pyais": fake_pyais}):
        spec = importlib.util.spec_from_file_location(module_name, path)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
    return module


# (log tag, module) for each decoder that polls its decode config.
DECODERS = [
    ("decoder", _load("hub_link_voice_entrypoint", _DECODER_DIR / "entrypoint.py")),
    ("aprs", _load("hub_link_aprs_entrypoint", _DECODER_DIR / "aprs" / "entrypoint.py")),
    ("ais", _load("hub_link_ais_entrypoint", _DECODER_DIR / "ais" / "entrypoint.py")),
]
DECODER_IDS = [tag for tag, _ in DECODERS]

CONFIG_URL = "http://radio-hub:8000/api/sdr/aprs/config?probe=1"


class FakeClock:
    """A monotonic clock the test moves by hand."""

    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture(params=DECODERS, ids=DECODER_IDS)
def decoder(request, monkeypatch):
    """(tag, module, clock): the module's shared HubLink replaced by a fresh one on a fake clock."""
    tag, module = request.param
    clock = FakeClock()
    monkeypatch.setattr(module, "_hub_link", module.HubLink(clock=clock))
    return tag, module, clock


def _stderr_lines(capsys) -> list[str]:
    return [line for line in capsys.readouterr().err.splitlines() if line]


def _response(status: int, body: bytes) -> MagicMock:
    response = MagicMock()
    response.status = status
    response.read.return_value = body
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    return response


def _connection_refused() -> urllib.error.URLError:
    return urllib.error.URLError(ConnectionRefusedError(111, "Connection refused"))


def _http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(CONFIG_URL, code, "Unauthorized", {}, io.BytesIO(b""))


class TestHubLink:
    def test_the_first_answer_says_connected_without_a_wait(self, decoder, capsys):
        tag, module, _ = decoder
        module._hub_link.reached(CONFIG_URL)
        assert _stderr_lines(capsys) == [f"[{tag}] connected to the radio hub at http://radio-hub:8000"]

    def test_later_answers_say_nothing(self, decoder, capsys):
        _, module, _ = decoder
        module._hub_link.reached(CONFIG_URL)
        capsys.readouterr()
        module._hub_link.reached(CONFIG_URL)
        module._hub_link.reached(CONFIG_URL)
        assert _stderr_lines(capsys) == []

    def test_an_outage_is_logged_once(self, decoder, capsys):
        tag, module, clock = decoder
        for _ in range(3):
            module._hub_link.unreachable(CONFIG_URL, "Connection refused")
            clock.now += 2
        assert _stderr_lines(capsys) == [
            f"[{tag}] waiting for the radio hub at http://radio-hub:8000 (Connection refused); retrying quietly"
        ]

    def test_recovery_reports_the_wait_from_the_first_failure(self, decoder, capsys):
        tag, module, clock = decoder
        module._hub_link.unreachable(CONFIG_URL, "Connection refused")
        clock.now += 2.0
        module._hub_link.unreachable(CONFIG_URL, "Connection refused")
        clock.now += 2.5
        capsys.readouterr()
        module._hub_link.reached(CONFIG_URL)
        assert _stderr_lines(capsys) == [f"[{tag}] connected to the radio hub at http://radio-hub:8000 after 4.5 s"]

    def test_recovery_is_reported_once(self, decoder, capsys):
        _, module, _ = decoder
        module._hub_link.unreachable(CONFIG_URL, "Connection refused")
        module._hub_link.reached(CONFIG_URL)
        capsys.readouterr()
        module._hub_link.reached(CONFIG_URL)
        assert _stderr_lines(capsys) == []

    def test_an_outage_after_a_connection_is_logged_again(self, decoder, capsys):
        tag, module, clock = decoder
        module._hub_link.reached(CONFIG_URL)
        module._hub_link.unreachable(CONFIG_URL, "Connection refused")
        clock.now += 7
        module._hub_link.reached(CONFIG_URL)
        assert _stderr_lines(capsys) == [
            f"[{tag}] connected to the radio hub at http://radio-hub:8000",
            f"[{tag}] waiting for the radio hub at http://radio-hub:8000 (Connection refused); retrying quietly",
            f"[{tag}] connected to the radio hub at http://radio-hub:8000 after 7.0 s",
        ]

    def test_it_defaults_to_the_monotonic_clock(self, decoder):
        _, module, _ = decoder
        assert module.HubLink()._clock is module.time.monotonic


class TestOrigin:
    @pytest.mark.parametrize(
        ("url", "origin"),
        [
            ("http://radio-hub:8000/api/sdr/decode/config", "http://radio-hub:8000"),
            ("http://app:8000/api/sdr/ais/config?x=1#frag", "http://app:8000"),
            ("https://hub.example", "https://hub.example"),
        ],
    )
    def test_keeps_scheme_host_and_port_only(self, decoder, url, origin):
        _, module, _ = decoder
        assert module._origin(url) == origin


class TestFetchDecodeConfigLogging:
    def test_a_refused_connection_returns_empty_and_logs_one_wait(self, decoder, capsys):
        tag, module, _ = decoder
        with patch.object(module.urllib.request, "urlopen", side_effect=_connection_refused()):
            for _ in range(5):
                assert module.fetch_decode_config(CONFIG_URL, "secret") == {}
        lines = _stderr_lines(capsys)
        assert lines == [
            f"[{tag}] waiting for the radio hub at http://radio-hub:8000 "
            "([Errno 111] Connection refused); retrying quietly"
        ]
        assert "decode-config fetch failed" not in "\n".join(lines)

    def test_an_unresolvable_host_counts_as_unreachable(self, decoder, capsys):
        # A decoder pointed at `radio-hub` while that container isn't running.
        tag, module, _ = decoder
        error = urllib.error.URLError(socket.gaierror(-2, "Name or service not known"))
        with patch.object(module.urllib.request, "urlopen", side_effect=error):
            assert module.fetch_decode_config(CONFIG_URL, "secret") == {}
        assert _stderr_lines(capsys) == [
            f"[{tag}] waiting for the radio hub at http://radio-hub:8000 "
            "([Errno -2] Name or service not known); retrying quietly"
        ]

    def test_a_bare_os_error_is_logged_as_itself(self, decoder, capsys):
        # A read timeout is a TimeoutError (an OSError with no `reason`).
        tag, module, _ = decoder
        with patch.object(module.urllib.request, "urlopen", side_effect=TimeoutError("timed out")):
            assert module.fetch_decode_config(CONFIG_URL, "secret") == {}
        assert _stderr_lines(capsys) == [
            f"[{tag}] waiting for the radio hub at http://radio-hub:8000 (timed out); retrying quietly"
        ]

    def test_an_answer_after_an_outage_logs_connected_with_the_wait(self, decoder, capsys):
        tag, module, clock = decoder
        with patch.object(module.urllib.request, "urlopen", side_effect=_connection_refused()):
            module.fetch_decode_config(CONFIG_URL, "secret")
            clock.now += 3.3
            module.fetch_decode_config(CONFIG_URL, "secret")
        capsys.readouterr()
        with patch.object(module.urllib.request, "urlopen", return_value=_response(200, b'{"active": true}')):
            assert module.fetch_decode_config(CONFIG_URL, "secret") == {"active": True}
        assert _stderr_lines(capsys) == [f"[{tag}] connected to the radio hub at http://radio-hub:8000 after 3.3 s"]

    def test_the_first_answer_logs_connected_once(self, decoder, capsys):
        tag, module, _ = decoder
        with patch.object(module.urllib.request, "urlopen", return_value=_response(200, b'{"active": false}')):
            assert module.fetch_decode_config(CONFIG_URL, "secret") == {"active": False}
            assert module.fetch_decode_config(CONFIG_URL, "secret") == {"active": False}
        assert _stderr_lines(capsys) == [f"[{tag}] connected to the radio hub at http://radio-hub:8000"]

    def test_a_non_2xx_answer_still_counts_as_reaching_the_hub(self, decoder, capsys):
        tag, module, _ = decoder
        module._hub_link.unreachable(CONFIG_URL, "Connection refused")
        capsys.readouterr()
        with patch.object(module.urllib.request, "urlopen", return_value=_response(304, b"")):
            assert module.fetch_decode_config(CONFIG_URL, "secret") == {}
        assert _stderr_lines(capsys) == [f"[{tag}] connected to the radio hub at http://radio-hub:8000 after 0.0 s"]

    def test_http_errors_are_logged_on_every_poll(self, decoder, capsys):
        # A 401 is a wrong decoder secret: the hub answered, so it must stay loud.
        tag, module, _ = decoder
        with patch.object(module.urllib.request, "urlopen", side_effect=_http_error(401)):
            assert module.fetch_decode_config(CONFIG_URL, "wrong") == {}
            assert module.fetch_decode_config(CONFIG_URL, "wrong") == {}
        assert _stderr_lines(capsys) == [
            f"[{tag}] connected to the radio hub at http://radio-hub:8000",
            f"[{tag}] decode-config fetch failed: HTTP Error 401: Unauthorized",
            f"[{tag}] decode-config fetch failed: HTTP Error 401: Unauthorized",
        ]

    def test_an_http_error_ends_an_outage(self, decoder, capsys):
        tag, module, clock = decoder
        module._hub_link.unreachable(CONFIG_URL, "Connection refused")
        clock.now += 1
        capsys.readouterr()
        with patch.object(module.urllib.request, "urlopen", side_effect=_http_error(401)):
            module.fetch_decode_config(CONFIG_URL, "wrong")
        assert _stderr_lines(capsys)[0] == f"[{tag}] connected to the radio hub at http://radio-hub:8000 after 1.0 s"

    def test_an_unreadable_body_is_logged_and_counts_as_reaching_the_hub(self, decoder, capsys):
        tag, module, _ = decoder
        with patch.object(module.urllib.request, "urlopen", return_value=_response(200, b"not json")):
            assert module.fetch_decode_config(CONFIG_URL, "secret") == {}
        lines = _stderr_lines(capsys)
        assert lines[0] == f"[{tag}] connected to the radio hub at http://radio-hub:8000"
        assert lines[1].startswith(f"[{tag}] decode-config fetch failed: Expecting value")
        assert len(lines) == 2
