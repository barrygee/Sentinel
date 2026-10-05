"""
tests/backend/test_decoder_adsb_entrypoint.py

Tests for the ADS-B decoder sidecar's pipeline (decoder/adsb/entrypoint.py):
`socat | tail | readsb`. Pinned here is the stall timeout — a connection that
stays open but goes silent (the Pi rebooted or left the network without closing
the socket) must end the pipeline so the supervisor reconnects, instead of
readsb waiting on an empty stdin for ever.

The module lives in the adsb-decoder image (outside the backend package), so it
is loaded by path. The behaviour test runs the real bash pipeline with a
stand-in `readsb`; it needs socat (installed in CI) and skips without it.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

_ENTRYPOINT_PATH = (
    Path(__file__).resolve().parents[2] / "decoder" / "adsb" / "entrypoint.py"
)


def _load_entrypoint():
    spec = importlib.util.spec_from_file_location("adsb_entrypoint", _ENTRYPOINT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


adsb = _load_entrypoint()


class TestPipelineCommand:
    def test_socat_carries_the_stall_timeout_and_the_pipeline_fails_as_a_whole(
        self, monkeypatch
    ):
        launched = []
        monkeypatch.setattr(
            adsb.subprocess, "Popen", lambda command, **_options: launched.append(command)
        )
        adsb.build_pipeline("192.168.5.67", 4444, "/run/adsb/data")
        bash, pipefail_flag, pipefail, dash_c, pipeline = launched[0]
        assert (bash, pipefail_flag, pipefail, dash_c) == (
            "/bin/bash",
            "-o",
            "pipefail",
            "-c",
        )
        assert pipeline.startswith(
            f"socat -u -T {adsb.STALL_TIMEOUT_SECONDS} TCP:192.168.5.67:4444 - | "
        )
        assert f"tail -c +{adsb.RTL_TCP_HEADER_BYTES + 1}" in pipeline

    def test_the_timeout_is_far_longer_than_any_gap_in_a_live_stream(self):
        # A streaming dongle sends ~4.8 MB/s; anything under a few seconds would
        # restart a healthy pipeline on an ordinary network hiccup.
        assert 10 <= adsb.STALL_TIMEOUT_SECONDS <= 120


@pytest.mark.skipif(shutil.which("socat") is None, reason="socat is not installed")
class TestPipelineBehaviour:
    def test_a_silent_open_connection_ends_the_pipeline(self, monkeypatch, tmp_path):
        # A source that sends the rtl_tcp header and a few samples, then goes
        # silent while keeping the socket open — a half-open connection.
        server = socket.socket()
        server.bind(("127.0.0.1", 0))
        server.listen(1)
        port = server.getsockname()[1]
        release = threading.Event()

        def _serve() -> None:
            connection, _ = server.accept()
            connection.sendall(b"RTL0" + bytes(8) + b"\x7f" * 1024)
            release.wait(30)
            connection.close()

        threading.Thread(target=_serve, daemon=True).start()

        # Stand-in readsb: drain stdin into a file so the test can see samples arrived.
        fake_bin = tmp_path / "bin"
        fake_bin.mkdir()
        received = tmp_path / "received"
        readsb = fake_bin / "readsb"
        readsb.write_text(f"#!/bin/bash\ncat > {received}\n")
        readsb.chmod(0o755)
        monkeypatch.setenv("PATH", f"{fake_bin}:{__import__('os').environ['PATH']}")
        monkeypatch.setattr(adsb, "STALL_TIMEOUT_SECONDS", 1)

        started = time.monotonic()
        process = adsb.build_pipeline("127.0.0.1", port, str(tmp_path))
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            pytest.fail("the pipeline kept waiting on a silent connection")
        finally:
            release.set()
            server.close()
        assert time.monotonic() - started < 5
        assert (
            received.read_bytes() == b"\x7f" * 1024
        )  # header stripped, samples passed through


class TestPipelineProcessGroup:
    def test_the_pipeline_runs_in_its_own_process_group(self, monkeypatch):
        # Without its own group, stop_pipeline's killpg would take down the
        # supervisor too — or, with a plain terminate(), leave socat and readsb
        # running on the old source's socket.
        options = {}
        monkeypatch.setattr(
            adsb.subprocess, "Popen", lambda command, **kwargs: options.update(kwargs)
        )
        adsb.build_pipeline("192.168.5.67", 4444, "/run/adsb/data")
        assert options == {"start_new_session": True}


def _group_is_alive(group_id: int) -> bool:
    try:
        os.killpg(group_id, 0)
    except ProcessLookupError:
        return False
    return True


class TestStopPipeline:
    def _spawn(self, script: str) -> subprocess.Popen[bytes]:
        process = subprocess.Popen(["/bin/bash", "-c", script], start_new_session=True)
        time.sleep(0.2)  # let bash start its children before we stop them
        return process

    def test_ends_every_stage_not_just_the_shell(self):
        process = self._spawn("sleep 60 | sleep 60")

        adsb.stop_pipeline(process)

        assert process.returncode is not None
        assert not _group_is_alive(process.pid)

    def test_kills_a_pipeline_that_ignores_sigterm(self, monkeypatch):
        monkeypatch.setattr(adsb, "STOP_GRACE_SECONDS", 0.5)
        # `trap '' TERM` is inherited by sleep, so only SIGKILL ends this group.
        process = self._spawn("trap '' TERM; sleep 60 | sleep 60")

        started = time.monotonic()
        adsb.stop_pipeline(process)

        assert time.monotonic() - started < 5
        assert process.returncode == -signal.SIGKILL
        assert not _group_is_alive(process.pid)

    def test_a_pipeline_that_already_exited_is_not_an_error(self):
        process = subprocess.Popen(["/bin/bash", "-c", "exit 0"], start_new_session=True)
        process.wait()

        adsb.stop_pipeline(process)  # must not raise ProcessLookupError


class _FakePipeline:
    """A pipeline that keeps streaming until stopped."""

    def __init__(self, source):
        self.source = source
        self.returncode = None

    def poll(self):
        return self.returncode


class _MainHarness:
    """Drives `main()` with fake time, sources and pipelines.

    `sources` is what successive `resolve_source` calls return; once it runs
    out the last value repeats. The run stops (as on SIGTERM) after
    `stop_after_checks` resolutions, so each test bounds its own loop.
    """

    def __init__(self, monkeypatch, sources, stop_after_checks):
        self.sources = list(sources)
        self.stop_after_checks = stop_after_checks
        self.resolutions = 0
        self.started: list[_FakePipeline] = []
        self.stopped: list[_FakePipeline] = []
        self.clock = 0.0
        self.signal_handler = None

        monkeypatch.setenv("CONFIG_URL", "http://app:8000/api/sdr/adsb/config")
        monkeypatch.delenv("SENTRY_API_BASE", raising=False)
        monkeypatch.setattr(adsb, "serve_json", lambda *_args: None)
        monkeypatch.setattr(adsb.os, "makedirs", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(adsb.signal, "signal", self._capture_signal)
        monkeypatch.setattr(adsb, "resolve_source", self._resolve)
        monkeypatch.setattr(adsb, "build_pipeline", self._build)
        monkeypatch.setattr(adsb, "stop_pipeline", self.stopped.append)
        monkeypatch.setattr(adsb.time, "sleep", self._sleep)
        monkeypatch.setattr(adsb.time, "monotonic", lambda: self.clock)

    def _capture_signal(self, signal_number, handler):
        if signal_number == signal.SIGTERM:
            self.signal_handler = handler

    def _resolve(self, _config_url, _fallback):
        self.resolutions += 1
        if self.resolutions >= self.stop_after_checks:
            self.signal_handler(signal.SIGTERM, None)
        index = min(self.resolutions - 1, len(self.sources) - 1)
        return self.sources[index]

    def _build(self, host, port, _json_dir):
        pipeline = _FakePipeline((host, port))
        self.started.append(pipeline)
        return pipeline

    def _sleep(self, seconds):
        self.clock += seconds

    def run(self):
        assert adsb.main() == 0


class TestFollowingTheSource:
    OLD = ("192.168.5.67", 4444)
    NEW = ("192.168.5.67", 4455)

    def test_a_source_changed_in_sentinel_moves_a_streaming_pipeline(self, monkeypatch):
        # The bug: a pipeline that never dropped never re-read the source, so
        # pointing AIR at a different dongle left the decoder on the old one.
        harness = _MainHarness(monkeypatch, [self.OLD, self.NEW], stop_after_checks=4)

        harness.run()

        assert [pipeline.source for pipeline in harness.started][:2] == [self.OLD, self.NEW]
        assert harness.stopped[0] is harness.started[0]

    def test_an_unchanged_source_leaves_the_pipeline_alone(self, monkeypatch):
        harness = _MainHarness(monkeypatch, [self.OLD], stop_after_checks=5)

        harness.run()

        assert len(harness.started) == 1
        # Stopped exactly once — by the shutdown, not by a phantom switch.
        assert harness.stopped == harness.started

    def test_an_unreachable_sentinel_is_not_a_change(self, monkeypatch):
        # resolve_source returns None when Sentinel cannot be read; dropping a
        # working feed every time the app restarts would be worse than useless.
        harness = _MainHarness(monkeypatch, [self.OLD, None, None], stop_after_checks=5)

        harness.run()

        assert len(harness.started) == 1

    def test_the_source_is_rechecked_on_an_interval_not_every_tick(self, monkeypatch):
        harness = _MainHarness(monkeypatch, [self.OLD], stop_after_checks=3)

        harness.run()

        # One resolution to start, then one per SOURCE_RECHECK_SECONDS of
        # (fake) running time — not one per 0.5 s poll of the process.
        assert harness.resolutions == 3
        assert harness.clock >= 2 * adsb.SOURCE_RECHECK_SECONDS
        assert harness.clock < 3 * adsb.SOURCE_RECHECK_SECONDS
