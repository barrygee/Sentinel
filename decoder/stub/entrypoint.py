"""Stub decoder — a stand-in decoder container for testing the radio hub's decoder contract.

The real decoders need software CI must not build (dsd-fme needs the
patent-encumbered mbelib) or that decodes nothing without a real signal
(Direwolf). This one decodes nothing at all: it drives the exact contract a
manifest-declared decoder kind follows (plan §3.4), so CI can prove the hub's
side of it end to end.

  1. register  POST {hub}/api/sdr/decoders/register   its manifest (kind ``stub``)
  2. poll      GET  {hub}/api/sdr/decoders/stub/config  until ``active``
                    (404 = the hub forgot the kind, e.g. it restarted → register again)
  3. connect   TCP  {pcm host}:{pcm port}              read 48 kHz s16 PCM
  4. ingest    POST {hub}/api/sdr/decoders/stub/ingest  one summary event per
                    ``REPORT_SECONDS`` of PCM: frames, RMS and peak

The hub publishes each ingested event as ``decode.stub.<radioId>`` and relays it
to ``/ws/sdr/{id}/decode``. Standard library only, so it runs anywhere Python does.

Environment:
    HUB_URL              base URL of the radio hub            (http://app:8000)
    PCM_HOST             host serving the PCM feed            (app)
    PCM_PORT             PCM TCP port declared in the manifest (7370)
    STUB_CHANNELS_HZ     comma-separated absolute channels: empty = ``relative``
                         mono; one = ``absolute`` mono; two = ``absolute`` stereo
    REPORT_SECONDS       PCM per summary event                (1.0)
    POLL_SECONDS         config poll interval                 (2.0)
    INGEST_SECRET        shared decoder secret (explicit override)
    INGEST_SECRET_FILE   path to the hub's auto-generated decoder secret
"""

from __future__ import annotations

import json
import math
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from array import array
from collections.abc import Callable
from dataclasses import dataclass

KIND = "stub"
SAMPLE_RATE = 48_000
BYTES_PER_SAMPLE = 2
# How long to wait for the hub to write the shared secret file on startup.
SECRET_WAIT_SECONDS = 30.0
_HTTP_TIMEOUT_SECONDS = 5.0


def log(message: str) -> None:
    print(f"[{KIND}] {message}", file=sys.stderr, flush=True)


@dataclass(frozen=True)
class StubConfig:
    """Everything the stub reads from its environment."""

    hub_url: str
    pcm_host: str
    pcm_port: int
    channels_hz: tuple[int, ...]
    report_seconds: float
    poll_seconds: float

    @classmethod
    def from_env(cls, env: dict[str, str]) -> StubConfig:
        raw_channels = env.get("STUB_CHANNELS_HZ", "").strip()
        return cls(
            hub_url=env.get("HUB_URL", "http://app:8000").rstrip("/"),
            pcm_host=env.get("PCM_HOST", "app"),
            pcm_port=int(env.get("PCM_PORT", "7370")),
            channels_hz=tuple(
                int(part) for part in raw_channels.split(",") if part.strip()
            ),
            report_seconds=float(env.get("REPORT_SECONDS", "1.0")),
            poll_seconds=float(env.get("POLL_SECONDS", "2.0")),
        )

    @property
    def pcm_channels(self) -> int:
        return max(1, len(self.channels_hz))


def build_manifest(config: StubConfig) -> dict:
    """The decoder manifest the stub registers (plan §3.1, ``kind: decoder``)."""
    pcm: dict = {
        "port": config.pcm_port,
        "rate": SAMPLE_RATE,
        "demod": "fm",
        "channels": config.pcm_channels,
    }
    if config.channels_hz:
        pcm.update(ownership="absolute", channelsHz=list(config.channels_hz))
    else:
        pcm["ownership"] = "relative"
    return {
        "id": f"decoder-{KIND}",
        "kind": "decoder",
        "decoderKind": KIND,
        "version": "1.0.0",
        "contracts": "^1",
        "displayName": "Stub decoder",
        "pcm": pcm,
    }


def resolve_secret(
    env: dict[str, str],
    *,
    wait_seconds: float = SECRET_WAIT_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
) -> str | None:
    """The decoder secret: ``INGEST_SECRET``, else ``INGEST_SECRET_FILE``.

    The file is polled for up to ``wait_seconds`` because the hub writes it during
    its own startup and the stub may come up first. None if neither yields one.
    """
    env_secret = env.get("INGEST_SECRET", "").strip()
    if env_secret:
        return env_secret
    path = env.get("INGEST_SECRET_FILE", "").strip()
    if not path:
        return None
    deadline = time.monotonic() + wait_seconds
    while True:
        try:
            with open(path, encoding="utf-8") as secret_file:
                contents = secret_file.read().strip()
            if contents:
                return contents
        except OSError:
            pass
        if time.monotonic() >= deadline:
            return None
        sleep(1.0)


class HubClient:
    """The hub's decoder-facing endpoints for one kind, authenticated with the secret."""

    def __init__(self, hub_url: str, secret: str, kind: str = KIND) -> None:
        self._base = f"{hub_url}/api/sdr/decoders"
        self._kind = kind
        self._secret = secret

    def _request(
        self, method: str, path: str, body: dict | None = None
    ) -> tuple[int, dict]:
        """One request; returns (status, JSON body). Status 0 means the hub was unreachable."""
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"X-Decode-Secret": self._secret}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self._base}{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(
                request, timeout=_HTTP_TIMEOUT_SECONDS
            ) as response:
                return response.status, json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as exc:
            return exc.code, {}
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
            log(f"{method} {path} failed: {exc}")
            return 0, {}

    def register(self, manifest: dict) -> int:
        status, _ = self._request("POST", "/register", manifest)
        return status

    def config(self) -> tuple[int, bool]:
        """(status, active). 404 means the hub doesn't know the kind."""
        status, body = self._request("GET", f"/{self._kind}/config")
        return status, bool(body.get("active"))

    def ingest(self, event: dict) -> int:
        status, _ = self._request("POST", f"/{self._kind}/ingest", {"event": event})
        return status


def pcm_summary(pcm: bytes, channels: int) -> dict:
    """Summarise a run of s16 LE PCM: frames, RMS (0..1 of full scale) and peak."""
    samples = array("h")
    samples.frombytes(pcm[: len(pcm) - len(pcm) % BYTES_PER_SAMPLE])
    if sys.byteorder != "little":  # PCM on the wire is little-endian
        samples.byteswap()
    if not samples:
        return {"frames": 0, "rms": 0.0, "peak": 0}
    mean_square = sum(sample * sample for sample in samples) / len(samples)
    return {
        "frames": len(samples) // channels,
        "rms": round(math.sqrt(mean_square) / 32768, 6),
        "peak": max(abs(sample) for sample in samples),
    }


def run_session(
    hub: HubClient,
    config: StubConfig,
    *,
    connect: Callable[
        [tuple[str, int], float], socket.socket
    ] = socket.create_connection,
    clock: Callable[[], float] = time.monotonic,
) -> int:
    """Read PCM and ingest summaries until the session ends. Returns events accepted.

    The session ends when the hub closes the PCM socket, or when a config poll
    (every ``poll_seconds``) says the kind is no longer active.
    """
    # Whole frames by construction, so a stereo summary never splits a frame.
    report_bytes = (
        int(SAMPLE_RATE * config.report_seconds)
        * BYTES_PER_SAMPLE
        * config.pcm_channels
    )
    accepted = 0
    pending = bytearray()
    next_poll = clock() + config.poll_seconds
    with connect(
        (config.pcm_host, config.pcm_port), _HTTP_TIMEOUT_SECONDS
    ) as pcm_socket:
        pcm_socket.settimeout(config.poll_seconds)
        log(f"connected to PCM {config.pcm_host}:{config.pcm_port}")
        while True:
            try:
                chunk = pcm_socket.recv(65_536)
            except TimeoutError:
                chunk = None
            if chunk == b"":
                log("PCM feed closed by the hub")
                break
            if chunk:
                pending.extend(chunk)
            while len(pending) >= report_bytes:
                window, pending = bytes(pending[:report_bytes]), pending[report_bytes:]
                if hub.ingest(pcm_summary(window, config.pcm_channels)) == 200:
                    accepted += 1
            if clock() >= next_poll:
                next_poll = clock() + config.poll_seconds
                status, active = hub.config()
                if status == 200 and not active:
                    log("session no longer active")
                    break
    return accepted


def supervise_once(
    hub: HubClient, config: StubConfig, manifest: dict, registered: bool
) -> bool:
    """One supervisor step: register if needed, then run a session if one is active.

    Returns whether the kind is (still) registered with the hub.
    """
    if not registered:
        status = hub.register(manifest)
        if status not in (200, 201):
            log(f"registration answered {status}; retrying")
            return False
        log("registered")
    status, active = hub.config()
    if status == 404:
        log("hub no longer knows this kind; registering again")
        return False
    if status == 200 and active:
        try:
            run_session(hub, config)
        except OSError as exc:
            log(f"PCM session failed: {exc}")
    return True


def main() -> int:  # pragma: no cover - container entrypoint loop
    env = dict(os.environ)
    config = StubConfig.from_env(env)
    secret = resolve_secret(env)
    if not secret:
        log(
            "no decoder secret (INGEST_SECRET / INGEST_SECRET_FILE) — refusing to start"
        )
        return 1
    hub = HubClient(config.hub_url, secret)
    manifest = build_manifest(config)
    registered = False
    while True:
        registered = supervise_once(hub, config, manifest, registered)
        time.sleep(config.poll_seconds)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
