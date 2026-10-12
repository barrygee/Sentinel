"""Stub decoder — a stand-in decoder container for testing the radio hub's decoder contract.

The real decoders need software CI must not build (dsd-fme needs the
patent-encumbered mbelib) or that decodes nothing without a real signal
(Direwolf). This one decodes nothing at all: it drives the exact contract a
manifest-declared decoder kind follows (plan §3.4), so CI can prove the hub's
side of it end to end.

  1. register  POST {gateway}/api/sdr/decoders/register   its manifest (kind ``stub``)
  2. poll      GET  {gateway}/api/sdr/decoders/stub/config  until ``active``
                    (404 = the hub forgot the kind, e.g. it restarted → register again)
  3. connect   TCP  {pcmFeed host}:{pcm port}              read 48 kHz s16 PCM
  4. ingest    POST {gateway}/api/sdr/decoders/stub/ingest  one summary event per
                    ``REPORT_SECONDS`` of PCM: frames, RMS and peak

HTTP goes through Sentinel's gateway, which routes it to the radio hub wherever
it runs. The PCM feed isn't HTTP, so the config reply names it (``pcmFeed``: the
host the hub is registered under, plus the port this manifest declared).

The hub publishes each ingested event as ``decode.stub.<radioId>`` and relays it
to ``/ws/sdr/{id}/decode``. Standard library only, so it runs anywhere Python does.

Environment:
    SENTINEL_GATEWAY_URL Sentinel's gateway                   (http://gateway:8080)
    PCM_PORT             PCM TCP port declared in the manifest (7370)
    STUB_CHANNELS_HZ     comma-separated absolute channels: empty = ``relative``
                         mono; one = ``absolute`` mono; two = ``absolute`` stereo
    REPORT_SECONDS       PCM per summary event                (1.0)
    POLL_SECONDS         config poll interval                 (2.0)
    DECODER_CREDENTIALS_FILE  the stub's own credential (written by the
                         `service-credentials` compose service)
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
_HTTP_TIMEOUT_SECONDS = 5.0


def log(message: str) -> None:
    print(f"[{KIND}] {message}", file=sys.stderr, flush=True)


@dataclass(frozen=True)
class StubConfig:
    """Everything the stub reads from its environment."""

    gateway_url: str
    pcm_port: int
    channels_hz: tuple[int, ...]
    report_seconds: float
    poll_seconds: float

    @classmethod
    def from_env(cls, env: dict[str, str]) -> StubConfig:
        raw_channels = env.get("STUB_CHANNELS_HZ", "").strip()
        return cls(
            gateway_url=env.get("SENTINEL_GATEWAY_URL", "http://gateway:8080").rstrip("/"),
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


def resolve_secret(env: dict[str, str]) -> str | None:
    """The stub's own credential, from ``DECODER_CREDENTIALS_FILE``.

    The one-shot ``service-credentials`` service writes the file
    (``{"caller", "token"}``) before any decoder starts; the hub accepts the
    token for the ``stub`` kind only. None when unset or unreadable.
    """
    path = env.get("DECODER_CREDENTIALS_FILE", "").strip()
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as credentials_file:
            token = json.load(credentials_file).get("token")
    except (OSError, ValueError, AttributeError):
        return None
    return token if isinstance(token, str) and token else None


class HubLink:
    """Logs the hub becoming unreachable once and coming back once.

    The supervisor polls the hub every ``POLL_SECONDS``, so a line per failed
    request fills the log whenever the hub is starting or restarting (a
    ``docker compose up`` starts this container before the hub answers). Only
    "not there" answers count as unreachable (see ``HUB_ABSENT_STATUSES``); any
    other HTTP error means the hub answered, so it counts as reaching it.
    """

    def __init__(
        self, gateway_url: str, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._gateway_url = gateway_url
        self._clock = clock
        self._connected = False
        self._unreachable_since: float | None = None

    def reached(self) -> None:
        """The hub answered: say so the first time, and after every outage."""
        if self._unreachable_since is not None:
            waited = self._clock() - self._unreachable_since
            log(
                f"connected to the radio hub through {self._gateway_url} after {waited:.1f} s"
            )
        elif not self._connected:
            log(f"connected to the radio hub through {self._gateway_url}")
        self._connected = True
        self._unreachable_since = None

    def unreachable(self, error: object) -> None:
        """A request found no hub: log the first one, then retry quietly."""
        if self._unreachable_since is not None:
            return
        self._unreachable_since = self._clock()
        log(
            f"waiting for the radio hub through {self._gateway_url} ({error}); retrying quietly"
        )


# Answers that mean no hub is there to ask, so they are waited out quietly. The
# gateway gives 502/503/504 for a registered hub that is down; with no hub
# registered at all the path falls through to the app, which only serves GET
# there (its SPA page, never JSON) and so answers a POST with 405.
HUB_ABSENT_STATUSES = frozenset({405, 502, 503, 504})


class HubClient:
    """The hub's decoder-facing endpoints for one kind, authenticated with the secret."""

    def __init__(
        self,
        gateway_url: str,
        secret: str,
        kind: str = KIND,
        link: HubLink | None = None,
    ) -> None:
        self._base = f"{gateway_url}/api/sdr/decoders"
        self._kind = kind
        self._secret = secret
        self._link = link or HubLink(gateway_url)

    def _request(
        self, method: str, path: str, body: dict | None = None
    ) -> tuple[int, dict]:
        """One request; returns (status, JSON body). Status 0 means no hub answered."""
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
                status, raw_body = response.status, response.read()
        except urllib.error.HTTPError as exc:
            if exc.code in HUB_ABSENT_STATUSES:
                self._link.unreachable(f"HTTP {exc.code}")
                return 0, {}
            self._link.reached()
            return exc.code, {}
        except (urllib.error.URLError, OSError) as exc:
            self._link.unreachable(getattr(exc, "reason", exc))
            return 0, {}
        try:
            body = json.loads(raw_body or b"{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            # The app's SPA page: no hub is registered, so the gateway handed
            # the path to the app.
            self._link.unreachable("no radio hub registered yet")
            return 0, {}
        self._link.reached()
        return status, body if isinstance(body, dict) else {}

    def register(self, manifest: dict) -> int:
        status, _ = self._request("POST", "/register", manifest)
        return status

    def config(self) -> tuple[int, bool, tuple[str, int] | None]:
        """(status, active, PCM feed address). 404 means the hub doesn't know the kind."""
        status, body = self._request("GET", f"/{self._kind}/config")
        return status, bool(body.get("active")), pcm_feed_address(body)

    def ingest(self, event: dict) -> int:
        status, _ = self._request("POST", f"/{self._kind}/ingest", {"event": event})
        return status


def pcm_feed_address(config: dict) -> tuple[str, int] | None:
    """``(host, port)`` of the hub's PCM feed from a config reply, or None.

    None when the reply doesn't carry a usable one (no ``pcmFeed``, a blank host,
    a port that isn't a number): there is then nothing to connect to.
    """
    endpoint = config.get("pcmFeed")
    if not isinstance(endpoint, dict):
        return None
    host = endpoint.get("host")
    port = endpoint.get("port")
    if (
        not isinstance(host, str)
        or not host
        or isinstance(port, bool)
        or not isinstance(port, int)
    ):
        return None
    return host, port


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
    pcm_feed: tuple[str, int],
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
    pcm_host, pcm_port = pcm_feed
    with connect((pcm_host, pcm_port), _HTTP_TIMEOUT_SECONDS) as pcm_socket:
        pcm_socket.settimeout(config.poll_seconds)
        log(f"connected to PCM {pcm_host}:{pcm_port}")
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
                status, active, _ = hub.config()
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
            if status != 0:  # 0: no hub answered, which HubLink already logged
                log(f"registration answered {status}; retrying")
            return False
        log("registered")
    status, active, pcm_feed = hub.config()
    if status == 404:
        log("hub no longer knows this kind; registering again")
        return False
    if status == 200 and active:
        if pcm_feed is None:
            log("the hub's config names no PCM feed — is the hub older than this decoder?")
            return True
        try:
            run_session(hub, config, pcm_feed)
        except OSError as exc:
            log(f"PCM session failed: {exc}")
    return True


def main() -> int:  # pragma: no cover - container entrypoint loop
    env = dict(os.environ)
    config = StubConfig.from_env(env)
    secret = resolve_secret(env)
    if not secret:
        log(
            "no decoder credential (DECODER_CREDENTIALS_FILE) — refusing to start"
        )
        return 1
    hub = HubClient(config.gateway_url, secret)
    manifest = build_manifest(config)
    registered = False
    while True:
        registered = supervise_once(hub, config, manifest, registered)
        time.sleep(config.poll_seconds)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
