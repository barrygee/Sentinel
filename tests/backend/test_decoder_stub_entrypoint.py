"""
tests/backend/test_decoder_stub_entrypoint.py

Tests for the stub decoder's logic (decoder/stub/entrypoint.py) — the stand-in
decoder container that follows the decoder contract for manifest-declared kinds
(section-containers plan §3.4). The module lives outside the backend package
(it ships in its own image), so it is loaded by path, as the APRS sidecar's is.

The hub is faked at `urllib.request.urlopen` and the PCM feed with a scripted
socket; the end-to-end run against the real hub is test_decoder_stub_contract.py.
The container's forever-loop `main()` is not exercised.
"""

from __future__ import annotations

import importlib.util
import io
import json
import struct
import sys
import urllib.error
from pathlib import Path

import pytest

from backend.radio_hub.services.decoder_manifest import DecoderManifest

_ENTRYPOINT_PATH = (
    Path(__file__).resolve().parents[2] / "decoder" / "stub" / "entrypoint.py"
)


def _load_entrypoint():
    spec = importlib.util.spec_from_file_location(
        "stub_decoder_entrypoint", _ENTRYPOINT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    # Registered before exec: @dataclass resolves its annotations through sys.modules.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


stub = _load_entrypoint()


def _config(**overrides):
    values = {
        "hub_url": "http://hub:8000",
        "pcm_host": "hub",
        "pcm_port": 7370,
        "channels_hz": (),
        "report_seconds": 0.001,  # 48 frames per summary
        "poll_seconds": 10.0,
    }
    values.update(overrides)
    return stub.StubConfig(**values)


def _pcm(*samples: int) -> bytes:
    return struct.pack(f"<{len(samples)}h", *samples)


# ── configuration and manifest ───────────────────────────────────────────────


class TestStubConfig:
    def test_defaults_point_at_the_compose_app(self):
        config = stub.StubConfig.from_env({})
        assert config == stub.StubConfig(
            hub_url="http://app:8000",
            pcm_host="app",
            pcm_port=7370,
            channels_hz=(),
            report_seconds=1.0,
            poll_seconds=2.0,
        )
        assert config.pcm_channels == 1

    def test_reads_every_variable(self):
        config = stub.StubConfig.from_env(
            {
                "HUB_URL": "http://hub:9000/",
                "PCM_HOST": "hub",
                "PCM_PORT": "7999",
                "STUB_CHANNELS_HZ": "161975000, 162025000",
                "REPORT_SECONDS": "0.5",
                "POLL_SECONDS": "3",
            }
        )
        assert config.hub_url == "http://hub:9000"  # trailing slash dropped
        assert (config.pcm_host, config.pcm_port) == ("hub", 7999)
        assert config.channels_hz == (161_975_000, 162_025_000)
        assert config.pcm_channels == 2
        assert (config.report_seconds, config.poll_seconds) == (0.5, 3.0)

    def test_blank_channel_entries_are_ignored(self):
        assert stub.StubConfig.from_env(
            {"STUB_CHANNELS_HZ": " 144800000, ,"}
        ).channels_hz == (144_800_000,)


class TestBuildManifest:
    """The stub's manifest must be one the hub actually accepts."""

    def test_relative_mono_by_default(self):
        manifest = stub.build_manifest(_config())
        parsed = DecoderManifest.model_validate(manifest)
        assert (parsed.decoder_kind, parsed.id) == ("stub", "decoder-stub")
        assert (parsed.pcm.port, parsed.pcm.channels, parsed.pcm.ownership) == (
            7370,
            1,
            "relative",
        )
        assert parsed.pcm.channels_hz == []

    def test_one_channel_is_absolute_mono(self):
        parsed = DecoderManifest.model_validate(
            stub.build_manifest(_config(channels_hz=(144_800_000,)))
        )
        assert (parsed.pcm.ownership, parsed.pcm.channels, parsed.pcm.channels_hz) == (
            "absolute",
            1,
            [144_800_000],
        )

    def test_two_channels_are_absolute_stereo(self):
        parsed = DecoderManifest.model_validate(
            stub.build_manifest(_config(channels_hz=(161_975_000, 162_025_000)))
        )
        assert (parsed.pcm.ownership, parsed.pcm.channels) == ("absolute", 2)


# ── secret ───────────────────────────────────────────────────────────────────


class TestResolveSecret:
    def test_the_env_override_wins(self, tmp_path):
        secret_file = tmp_path / "secret"
        secret_file.write_text("from-file")
        env = {"INGEST_SECRET": " from-env ", "INGEST_SECRET_FILE": str(secret_file)}
        assert stub.resolve_secret(env) == "from-env"

    def test_reads_the_shared_file(self, tmp_path):
        secret_file = tmp_path / "secret"
        secret_file.write_text("from-file\n")
        assert (
            stub.resolve_secret({"INGEST_SECRET_FILE": str(secret_file)}) == "from-file"
        )

    def test_waits_for_the_hub_to_write_the_file(self, tmp_path):
        secret_file = tmp_path / "secret"
        naps = []

        def _nap(seconds):
            naps.append(seconds)
            secret_file.write_text(
                "" if len(naps) == 1 else "late"
            )  # empty first, then written

        assert (
            stub.resolve_secret({"INGEST_SECRET_FILE": str(secret_file)}, sleep=_nap)
            == "late"
        )
        assert naps == [1.0, 1.0]

    def test_gives_up_after_the_wait(self, tmp_path):
        env = {"INGEST_SECRET_FILE": str(tmp_path / "never")}
        assert (
            stub.resolve_secret(env, wait_seconds=0, sleep=lambda seconds: None) is None
        )

    def test_none_without_either_source(self):
        assert stub.resolve_secret({"INGEST_SECRET": "  "}) is None


# ── the hub client ───────────────────────────────────────────────────────────


class _Response:
    def __init__(self, status: int, body: bytes) -> None:
        self.status = status
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc_info) -> None:
        return None


@pytest.fixture()
def hub_calls(monkeypatch):
    """Record every request; answer from `responses` (a status, body or exception)."""
    calls: list = []
    responses: list = []

    def _urlopen(request, timeout):
        calls.append(request)
        outcome = responses.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        status, body = outcome
        return _Response(status, json.dumps(body).encode() if body is not None else b"")

    monkeypatch.setattr(stub.urllib.request, "urlopen", _urlopen)
    return calls, responses


def _http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("http://hub", code, "error", {}, io.BytesIO(b""))


class TestHubClient:
    def test_register_posts_the_manifest_with_the_secret(self, hub_calls):
        calls, responses = hub_calls
        responses.append((201, {"status": "registered"}))
        assert (
            stub.HubClient("http://hub:8000", "s3cret").register(
                {"decoderKind": "stub"}
            )
            == 201
        )
        request = calls[0]
        assert (request.get_method(), request.full_url) == (
            "POST",
            "http://hub:8000/api/sdr/decoders/register",
        )
        assert request.get_header("X-decode-secret") == "s3cret"
        assert request.get_header("Content-type") == "application/json"
        assert json.loads(request.data) == {"decoderKind": "stub"}

    def test_config_reads_active(self, hub_calls):
        calls, responses = hub_calls
        responses.extend([(200, {"active": True}), (200, {"active": False})])
        client = stub.HubClient("http://hub:8000", "s3cret")
        assert client.config() == (200, True)
        assert client.config() == (200, False)
        assert (calls[0].get_method(), calls[0].full_url) == (
            "GET",
            "http://hub:8000/api/sdr/decoders/stub/config",
        )
        assert calls[0].data is None and calls[0].get_header("Content-type") is None

    def test_config_404_means_unknown_kind(self, hub_calls):
        _, responses = hub_calls
        responses.append(_http_error(404))
        assert stub.HubClient("http://hub", "s").config() == (404, False)

    def test_ingest_wraps_the_event(self, hub_calls):
        calls, responses = hub_calls
        responses.append((200, {"status": "ok"}))
        assert stub.HubClient("http://hub", "s").ingest({"frames": 48}) == 200
        assert calls[0].full_url == "http://hub/api/sdr/decoders/stub/ingest"
        assert json.loads(calls[0].data) == {"event": {"frames": 48}}

    def test_an_error_status_is_returned_not_raised(self, hub_calls):
        _, responses = hub_calls
        responses.append(_http_error(409))
        assert stub.HubClient("http://hub", "s").ingest({}) == 409

    def test_an_unreachable_hub_is_status_0(self, hub_calls, capsys):
        _, responses = hub_calls
        responses.append(urllib.error.URLError("connection refused"))
        assert stub.HubClient("http://hub", "s").register({}) == 0
        assert "POST /register failed" in capsys.readouterr().err

    def test_an_empty_body_reads_as_no_fields(self, hub_calls):
        _, responses = hub_calls
        responses.append((200, None))
        assert stub.HubClient("http://hub", "s").config() == (200, False)


# ── PCM summary ──────────────────────────────────────────────────────────────


class TestPcmSummary:
    def test_full_scale_square_wave(self):
        # s16 full scale is asymmetric (+32767 / -32768), so the RMS lands just under 1.
        assert stub.pcm_summary(_pcm(32767, -32768) * 4, channels=1) == {
            "frames": 8,
            "rms": 0.999985,
            "peak": 32768,
        }

    def test_silence(self):
        assert stub.pcm_summary(_pcm(0, 0, 0), channels=1) == {
            "frames": 3,
            "rms": 0.0,
            "peak": 0,
        }

    def test_stereo_counts_frames_not_samples(self):
        assert stub.pcm_summary(_pcm(100, -100, 100, -100), channels=2)["frames"] == 2

    def test_a_trailing_odd_byte_is_ignored(self):
        assert stub.pcm_summary(_pcm(16384) + b"\x01", channels=1) == {
            "frames": 1,
            "rms": 0.5,
            "peak": 16384,
        }

    def test_empty(self):
        assert stub.pcm_summary(b"", channels=1) == {"frames": 0, "rms": 0.0, "peak": 0}

    def test_reads_little_endian_on_a_big_endian_host(self, monkeypatch):
        monkeypatch.setattr(stub.sys, "byteorder", "big")
        # On a little-endian test host, swapping "as if big-endian" must undo itself:
        # feed big-endian bytes and expect the little-endian reading of the values.
        assert stub.pcm_summary(struct.pack(">h", 256), channels=1)["peak"] == 256


# ── one PCM session ──────────────────────────────────────────────────────────


class _ScriptedSocket:
    """A PCM socket that returns scripted recv() results (bytes, or an exception)."""

    def __init__(self, script: list) -> None:
        self.script = list(script)
        self.timeouts: list[float] = []

    def settimeout(self, seconds: float) -> None:
        self.timeouts.append(seconds)

    def recv(self, size: int) -> bytes:
        outcome = self.script.pop(0) if self.script else b""
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    def __enter__(self):
        return self

    def __exit__(self, *exc_info) -> None:
        return None


class _FakeHub:
    def __init__(
        self,
        *,
        ingest_status: int = 200,
        configs: list | None = None,
        register_status: int = 201,
    ) -> None:
        self.events: list[dict] = []
        self.ingest_status = ingest_status
        self.configs = list(configs or [])
        self.config_calls = 0
        self.register_status = register_status
        self.registered: list[dict] = []

    def ingest(self, event: dict) -> int:
        self.events.append(event)
        return self.ingest_status

    def config(self) -> tuple[int, bool]:
        self.config_calls += 1
        return self.configs.pop(0) if self.configs else (200, True)

    def register(self, manifest: dict) -> int:
        self.registered.append(manifest)
        return self.register_status


WINDOW = 48 * 2  # 0.001 s of 48 kHz mono s16


class TestRunSession:
    def _run(self, hub, script, *, config=None, clock=lambda: 0.0):
        connected = []
        pcm_socket = _ScriptedSocket(script)

        def _connect(address, timeout):
            connected.append((address, timeout))
            return pcm_socket

        accepted = stub.run_session(
            hub, config or _config(), connect=_connect, clock=clock
        )
        return accepted, connected, pcm_socket

    def test_one_summary_per_report_window_until_the_hub_closes_the_feed(self):
        hub = _FakeHub()
        accepted, connected, pcm_socket = self._run(
            hub, [_pcm(1000) * 48 * 2 + _pcm(1000) * 10, _pcm(1000) * 38]
        )
        assert connected == [(("hub", 7370), 5.0)]
        assert pcm_socket.timeouts == [10.0]
        assert accepted == 3
        assert (
            hub.events
            == [{"frames": 48, "rms": round(1000 / 32768, 6), "peak": 1000}] * 3
        )

    def test_stereo_windows_hold_whole_frames(self):
        hub = _FakeHub()
        accepted, _, _ = self._run(
            hub,
            [_pcm(1, 2) * 48],
            config=_config(channels_hz=(161_975_000, 162_025_000)),
        )
        assert accepted == 1
        assert hub.events[0]["frames"] == 48

    def test_rejected_events_are_not_counted(self):
        hub = _FakeHub(ingest_status=409)
        accepted, _, _ = self._run(hub, [_pcm(5) * 48])
        assert (accepted, len(hub.events)) == (0, 1)

    def test_a_recv_timeout_just_waits_for_more(self):
        hub = _FakeHub()
        accepted, _, _ = self._run(hub, [TimeoutError(), _pcm(5) * 48])
        assert accepted == 1

    def test_ends_when_a_config_poll_says_inactive(self):
        times = iter([0.0, 11.0, 11.0, 11.0])
        hub = _FakeHub(configs=[(200, False)])
        accepted, _, pcm_socket = self._run(
            hub, [_pcm(5) * 10, _pcm(5) * 10], clock=lambda: next(times)
        )
        assert hub.config_calls == 1
        assert accepted == 0
        assert pcm_socket.script == [_pcm(5) * 10]  # stopped before reading on

    def test_keeps_going_while_polls_say_active_or_fail(self):
        times = iter([0.0, 11.0, 11.0, 22.0, 22.0, 30.0])
        hub = _FakeHub(configs=[(200, True), (0, False)])
        self._run(hub, [_pcm(5), _pcm(5), _pcm(5)], clock=lambda: next(times))
        assert hub.config_calls == 2


class TestSuperviseOnce:
    def test_registers_then_runs_an_active_session(self, monkeypatch):
        sessions = []
        monkeypatch.setattr(
            stub, "run_session", lambda hub, config: sessions.append(config)
        )
        hub = _FakeHub(configs=[(200, True)])
        assert (
            stub.supervise_once(
                hub, _config(), {"decoderKind": "stub"}, registered=False
            )
            is True
        )
        assert hub.registered == [{"decoderKind": "stub"}]
        assert sessions == [_config()]

    @pytest.mark.parametrize("status", [200, 201])
    def test_either_registration_success_counts(self, monkeypatch, status):
        hub = _FakeHub(register_status=status, configs=[(200, False)])
        assert stub.supervise_once(hub, _config(), {}, registered=False) is True

    @pytest.mark.parametrize("status", [0, 401, 409, 422])
    def test_a_failed_registration_retries_next_time(self, status):
        hub = _FakeHub(register_status=status)
        assert stub.supervise_once(hub, _config(), {}, registered=False) is False
        assert hub.config_calls == 0

    def test_does_not_register_again_once_registered(self):
        hub = _FakeHub(configs=[(200, False)])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is True
        assert hub.registered == []

    def test_a_404_means_register_again(self):
        hub = _FakeHub(configs=[(404, False)])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is False

    @pytest.mark.parametrize("config_reply", [(200, False), (0, False), (500, False)])
    def test_idles_without_an_active_session(self, monkeypatch, config_reply):
        monkeypatch.setattr(
            stub, "run_session", lambda hub, config: pytest.fail("no session expected")
        )
        hub = _FakeHub(configs=[config_reply])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is True

    def test_a_failed_session_is_logged_not_raised(self, monkeypatch, capsys):
        def _refused(hub, config):
            raise ConnectionRefusedError("no PCM listener")

        monkeypatch.setattr(stub, "run_session", _refused)
        hub = _FakeHub(configs=[(200, True)])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is True
        assert "PCM session failed: no PCM listener" in capsys.readouterr().err
