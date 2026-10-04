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
import shutil
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
            adsb.subprocess, "Popen", lambda command: launched.append(command)
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
