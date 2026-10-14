"""
tests/backend/test_decoder_stub_entrypoint.py

Tests for the stub decoder's logic (decoder/stub/entrypoint.py) — the stand-in
decoder container that follows the decoder contract for manifest-declared kinds
(section-containers plan §3.4). The module lives outside the backend package
(it ships in its own image), so it is loaded by path, as the APRS sidecar's is.

The gateway (and the hub behind it) is faked at `urllib.request.urlopen` and the
PCM feed with a scripted socket; the end-to-end run against the real hub is test_decoder_stub_contract.py.
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

from sentinel_radio.services.decoder_manifest import DecoderManifest

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
        "gateway_url": "http://gateway:8080",
        "pcm_port": 7370,
        "channels_hz": (),
        "report_seconds": 0.001,  # 48 frames per summary
        "poll_seconds": 10.0,
    }
    values.update(overrides)
    return stub.StubConfig(**values)


# Where the hub's config reply says its PCM feed is.
PCM_FEED = ("radio", 7370)


def _pcm(*samples: int) -> bytes:
    return struct.pack(f"<{len(samples)}h", *samples)


# ── configuration and manifest ───────────────────────────────────────────────


class TestStubConfig:
    def test_defaults_point_at_the_compose_gateway(self):
        config = stub.StubConfig.from_env({})
        assert config == stub.StubConfig(
            gateway_url="http://gateway:8080",
            pcm_port=7370,
            channels_hz=(),
            report_seconds=1.0,
            poll_seconds=2.0,
        )
        assert config.pcm_channels == 1

    def test_reads_every_variable(self):
        config = stub.StubConfig.from_env(
            {
                "SENTINEL_GATEWAY_URL": "http://gateway:9000/",
                "PCM_PORT": "7999",
                "STUB_CHANNELS_HZ": "161975000, 162025000",
                "REPORT_SECONDS": "0.5",
                "POLL_SECONDS": "3",
            }
        )
        assert config.gateway_url == "http://gateway:9000"  # trailing slash dropped
        assert config.pcm_port == 7999
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
    """The stub's own credential, from DECODER_CREDENTIALS_FILE (P7.4b)."""

    def test_reads_the_token(self, tmp_path):
        path = tmp_path / "http-credentials.json"
        path.write_text('{"caller": "stub-decoder", "token": "own-token"}')
        assert (
            stub.resolve_secret({"DECODER_CREDENTIALS_FILE": f" {path} "})
            == "own-token"
        )

    def test_none_when_the_variable_is_unset(self):
        assert stub.resolve_secret({}) is None

    def test_the_old_shared_secret_variable_is_ignored(self):
        assert stub.resolve_secret({"INGEST_SECRET": "shared"}) is None

    def test_none_when_the_file_is_missing(self, tmp_path):
        assert (
            stub.resolve_secret(
                {"DECODER_CREDENTIALS_FILE": str(tmp_path / "absent.json")}
            )
            is None
        )

    @pytest.mark.parametrize(
        "contents",
        ["not json", "[1, 2]", '{"caller": "x"}', '{"token": ""}', '{"token": 42}'],
    )
    def test_none_for_an_unusable_file(self, tmp_path, contents):
        path = tmp_path / "http-credentials.json"
        path.write_text(contents)
        assert stub.resolve_secret({"DECODER_CREDENTIALS_FILE": str(path)}) is None


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

    def test_config_reads_active_and_the_pcm_feed(self, hub_calls):
        calls, responses = hub_calls
        pcm_feed = {"host": "radio", "port": 7370}
        responses.extend(
            [
                (200, {"active": True, "pcmFeed": pcm_feed}),
                (200, {"active": False, "pcmFeed": pcm_feed}),
                (200, {"active": True}),
            ]
        )
        client = stub.HubClient("http://hub:8000", "s3cret")
        assert client.config() == (200, True, ("radio", 7370))
        assert client.config() == (200, False, ("radio", 7370))
        assert client.config() == (200, True, None)
        assert (calls[0].get_method(), calls[0].full_url) == (
            "GET",
            "http://hub:8000/api/sdr/decoders/stub/config",
        )
        assert calls[0].data is None and calls[0].get_header("Content-type") is None

    def test_config_404_means_unknown_kind(self, hub_calls):
        _, responses = hub_calls
        responses.append(_http_error(404))
        assert stub.HubClient("http://hub", "s").config() == (404, False, None)

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
        assert (
            "waiting for the radio hub through http://hub (connection refused)"
            in capsys.readouterr().err
        )

    def test_an_empty_body_reads_as_no_fields(self, hub_calls):
        _, responses = hub_calls
        responses.append((200, None))
        assert stub.HubClient("http://hub", "s").config() == (200, False, None)

    @pytest.mark.parametrize(
        "body", [b"<!doctype html><title>Sentinel</title>", b"\xff\xfe not utf-8"]
    )
    def test_a_body_that_is_not_json_means_no_hub_is_registered(
        self, monkeypatch, capsys, body
    ):
        # No hub registered: the gateway hands the path to the app, whose SPA
        # fallback answers GET with its HTML page and a 200.
        monkeypatch.setattr(
            stub.urllib.request,
            "urlopen",
            lambda request, timeout: _Response(200, body),
        )
        link = stub.HubLink("http://gateway", clock=_FakeClock())
        client = stub.HubClient("http://gateway", "s", link=link)
        assert client.config() == (0, False, None)
        assert client.config() == (0, False, None)
        assert _stderr_lines(capsys) == [
            "[stub] waiting for the radio hub through http://gateway "
            "(no radio hub registered yet); retrying quietly"
        ]

    @pytest.mark.parametrize("body", [[], None, "active"])
    def test_json_that_is_not_an_object_reads_as_no_fields(
        self, monkeypatch, capsys, body
    ):
        monkeypatch.setattr(
            stub.urllib.request,
            "urlopen",
            lambda request, timeout: _Response(200, json.dumps(body).encode()),
        )
        assert stub.HubClient("http://gateway", "s").config() == (200, False, None)
        assert _stderr_lines(capsys) == [
            "[stub] connected to the radio hub through http://gateway"
        ]

    @pytest.mark.parametrize("code", [405, 502, 503, 504])
    def test_the_gateway_answering_for_no_hub_is_status_0_and_one_quiet_wait(
        self, hub_calls, capsys, code
    ):
        # 502/503/504: the hub is registered but down. 405: no hub registered,
        # so a POST fell through to the app, which only serves GET there.
        _, responses = hub_calls
        responses.extend([_http_error(code), _http_error(code)])
        client = stub.HubClient(
            "http://gateway",
            "s",
            link=stub.HubLink("http://gateway", clock=_FakeClock()),
        )
        assert client.register({}) == 0
        assert client.register({}) == 0
        assert _stderr_lines(capsys) == [
            f"[stub] waiting for the radio hub through http://gateway (HTTP {code}); "
            "retrying quietly"
        ]


# ── logging the hub going away and coming back ───────────────────────────────


class _FakeClock:
    """A monotonic clock the test moves by hand."""

    def __init__(self) -> None:
        self.now = 50.0

    def __call__(self) -> float:
        return self.now


def _stderr_lines(capsys) -> list[str]:
    return [line for line in capsys.readouterr().err.splitlines() if line]


def _refused() -> urllib.error.URLError:
    return urllib.error.URLError(ConnectionRefusedError(111, "Connection refused"))


class TestHubLink:
    def test_the_first_answer_says_connected_without_a_wait(self, capsys):
        stub.HubLink("http://hub:8000").reached()
        assert _stderr_lines(capsys) == [
            "[stub] connected to the radio hub through http://hub:8000"
        ]

    def test_an_outage_is_logged_once_and_recovery_reports_the_wait(self, capsys):
        clock = _FakeClock()
        link = stub.HubLink("http://hub:8000", clock=clock)
        link.unreachable("Connection refused")
        clock.now += 2
        link.unreachable("Connection refused")
        clock.now += 4
        link.reached()
        link.reached()
        assert _stderr_lines(capsys) == [
            "[stub] waiting for the radio hub through http://hub:8000 "
            "(Connection refused); retrying quietly",
            "[stub] connected to the radio hub through http://hub:8000 after 6.0 s",
        ]

    def test_an_outage_after_a_connection_is_logged_again(self, capsys):
        link = stub.HubLink("http://hub:8000", clock=_FakeClock())
        link.reached()
        link.unreachable("Connection refused")
        assert _stderr_lines(capsys)[-1] == (
            "[stub] waiting for the radio hub through http://hub:8000 "
            "(Connection refused); retrying quietly"
        )

    def test_it_defaults_to_the_monotonic_clock(self):
        assert stub.HubLink("http://hub")._clock is stub.time.monotonic


class TestHubClientLogging:
    def test_repeated_refusals_log_one_wait_then_the_recovery(self, hub_calls, capsys):
        _, responses = hub_calls
        clock = _FakeClock()
        hub = stub.HubClient(
            "http://hub:8000", "s", link=stub.HubLink("http://hub:8000", clock=clock)
        )
        responses.extend([_refused(), _refused(), _refused(), (201, {})])
        for _ in range(3):
            assert hub.register({}) == 0
            clock.now += 2
        assert hub.register({}) == 201
        assert _stderr_lines(capsys) == [
            "[stub] waiting for the radio hub through http://hub:8000 "
            "([Errno 111] Connection refused); retrying quietly",
            "[stub] connected to the radio hub through http://hub:8000 after 6.0 s",
        ]

    def test_an_http_error_counts_as_reaching_the_hub(self, hub_calls, capsys):
        _, responses = hub_calls
        clock = _FakeClock()
        hub = stub.HubClient(
            "http://hub:8000", "s", link=stub.HubLink("http://hub:8000", clock=clock)
        )
        responses.extend([_refused(), _http_error(404)])
        hub.config()
        clock.now += 1.5
        assert hub.config() == (404, False, None)
        assert _stderr_lines(capsys)[-1] == (
            "[stub] connected to the radio hub through http://hub:8000 after 1.5 s"
        )

    def test_a_bare_os_error_is_logged_as_itself(self, hub_calls, capsys):
        _, responses = hub_calls
        responses.append(TimeoutError("timed out"))
        assert stub.HubClient("http://hub", "s").ingest({}) == 0
        assert _stderr_lines(capsys) == [
            "[stub] waiting for the radio hub through http://hub (timed out); retrying quietly"
        ]

    def test_without_a_link_it_makes_one_for_its_hub(self, hub_calls, capsys):
        _, responses = hub_calls
        responses.append((200, {"active": False}))
        stub.HubClient("http://radio:8000", "s").config()
        assert _stderr_lines(capsys) == [
            "[stub] connected to the radio hub through http://radio:8000"
        ]


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

    def config(self) -> tuple[int, bool, tuple[str, int] | None]:
        self.config_calls += 1
        return self.configs.pop(0) if self.configs else (200, True, PCM_FEED)

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
            hub, config or _config(), PCM_FEED, connect=_connect, clock=clock
        )
        return accepted, connected, pcm_socket

    def test_one_summary_per_report_window_until_the_hub_closes_the_feed(self):
        hub = _FakeHub()
        accepted, connected, pcm_socket = self._run(
            hub, [_pcm(1000) * 48 * 2 + _pcm(1000) * 10, _pcm(1000) * 38]
        )
        assert connected == [(("radio", 7370), 5.0)]
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
        hub = _FakeHub(configs=[(200, False, PCM_FEED)])
        accepted, _, pcm_socket = self._run(
            hub, [_pcm(5) * 10, _pcm(5) * 10], clock=lambda: next(times)
        )
        assert hub.config_calls == 1
        assert accepted == 0
        assert pcm_socket.script == [_pcm(5) * 10]  # stopped before reading on

    def test_keeps_going_while_polls_say_active_or_fail(self):
        times = iter([0.0, 11.0, 11.0, 22.0, 22.0, 30.0])
        hub = _FakeHub(configs=[(200, True, PCM_FEED), (0, False, None)])
        self._run(hub, [_pcm(5), _pcm(5), _pcm(5)], clock=lambda: next(times))
        assert hub.config_calls == 2


class TestSuperviseOnce:
    def test_registers_then_runs_an_active_session(self, monkeypatch):
        sessions = []
        monkeypatch.setattr(
            stub,
            "run_session",
            lambda hub, config, pcm_feed: sessions.append((config, pcm_feed)),
        )
        hub = _FakeHub(configs=[(200, True, PCM_FEED)])
        assert (
            stub.supervise_once(
                hub, _config(), {"decoderKind": "stub"}, registered=False
            )
            is True
        )
        assert hub.registered == [{"decoderKind": "stub"}]
        assert sessions == [(_config(), PCM_FEED)]

    @pytest.mark.parametrize("status", [200, 201])
    def test_either_registration_success_counts(self, monkeypatch, status):
        hub = _FakeHub(register_status=status, configs=[(200, False, None)])
        assert stub.supervise_once(hub, _config(), {}, registered=False) is True

    @pytest.mark.parametrize("status", [0, 401, 409, 422])
    def test_a_failed_registration_retries_next_time(self, status):
        hub = _FakeHub(register_status=status)
        assert stub.supervise_once(hub, _config(), {}, registered=False) is False
        assert hub.config_calls == 0

    @pytest.mark.parametrize("status", [401, 409, 422])
    def test_a_refused_registration_is_logged(self, capsys, status):
        hub = _FakeHub(register_status=status)
        stub.supervise_once(hub, _config(), {}, registered=False)
        assert _stderr_lines(capsys) == [
            f"[stub] registration answered {status}; retrying"
        ]

    def test_no_hub_answering_registration_is_left_to_the_hub_link(self, capsys):
        # Status 0: the HubLink already logged the wait, once; a line per retry
        # here would undo that.
        hub = _FakeHub(register_status=0)
        stub.supervise_once(hub, _config(), {}, registered=False)
        assert _stderr_lines(capsys) == []

    def test_does_not_register_again_once_registered(self):
        hub = _FakeHub(configs=[(200, False, None)])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is True
        assert hub.registered == []

    def test_a_404_means_register_again(self):
        hub = _FakeHub(configs=[(404, False, None)])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is False

    @pytest.mark.parametrize(
        "config_reply",
        [(200, False, PCM_FEED), (0, False, None), (500, False, None)],
    )
    def test_idles_without_an_active_session(self, monkeypatch, config_reply):
        monkeypatch.setattr(
            stub,
            "run_session",
            lambda hub, config, pcm_feed: pytest.fail("no session expected"),
        )
        hub = _FakeHub(configs=[config_reply])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is True

    def test_an_active_session_without_a_pcm_feed_idles_and_says_why(
        self, monkeypatch, capsys
    ):
        # A hub from before P7.2 answers {"active": true} with no pcmFeed.
        monkeypatch.setattr(
            stub,
            "run_session",
            lambda hub, config, pcm_feed: pytest.fail("no session expected"),
        )
        hub = _FakeHub(configs=[(200, True, None)])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is True
        assert _stderr_lines(capsys) == [
            "[stub] the hub's config names no PCM feed — is the hub older than this decoder?"
        ]

    def test_a_failed_session_is_logged_not_raised(self, monkeypatch, capsys):
        def _refused(hub, config, pcm_feed):
            raise ConnectionRefusedError("no PCM listener")

        monkeypatch.setattr(stub, "run_session", _refused)
        hub = _FakeHub(configs=[(200, True, PCM_FEED)])
        assert stub.supervise_once(hub, _config(), {}, registered=True) is True
        assert "PCM session failed: no PCM listener" in capsys.readouterr().err


# ── the PCM feed named in a config reply ─────────────────────────────────────


class TestPcmFeedAddress:
    def test_reads_host_and_port(self):
        assert stub.pcm_feed_address(
            {"active": True, "pcmFeed": {"host": "radio", "port": 7370}}
        ) == ("radio", 7370)

    @pytest.mark.parametrize(
        "config",
        [
            {},
            {"pcmFeed": None},
            {"pcmFeed": ["radio", 7370]},
            {"pcmFeed": {"port": 7370}},
            {"pcmFeed": {"host": "", "port": 7370}},
            {"pcmFeed": {"host": 7, "port": 7370}},
            {"pcmFeed": {"host": "radio"}},
            {"pcmFeed": {"host": "radio", "port": "7370"}},
            {"pcmFeed": {"host": "radio", "port": 7370.0}},
            {"pcmFeed": {"host": "radio", "port": True}},
        ],
        ids=[
            "no-pcm-feed",
            "null",
            "not-an-object",
            "no-host",
            "blank-host",
            "host-not-a-string",
            "no-port",
            "port-a-string",
            "port-a-float",
            "port-a-bool",
        ],
    )
    def test_anything_unusable_is_none(self, config):
        assert stub.pcm_feed_address(config) is None
