#!/usr/bin/env python3
"""Decoder sidecar supervisor.

Launches ``dsd-fme`` pointed at the Sentinel backend's FM-demodulated PCM feed,
parses its log output into structured events, and POSTs them to the backend's
ingest endpoint so they reach the browser. Decoded voice is sent straight to the
backend over UDP by dsd-fme itself (``-o udp:...``); this process only handles
the control-plane (launch + event parsing + capability report).

Uses only the Python standard library so the runtime image stays minimal.

Where the hub is: config and ingest go to Sentinel's gateway, which routes them
to the radio hub wherever it runs. The PCM feed dsd-fme reads (TCP) and the
port it sends decoded voice to (UDP) aren't HTTP, so each config reply names
them (``pcmFeed`` / ``voiceAudioReturn``: the host the hub is registered under,
plus the port).

Environment:
    SENTINEL_GATEWAY_URL           Sentinel's gateway (http://gateway:8080)
    DECODER_CREDENTIALS_FILE       this decoder's own credential (written by the
                                   `service-credentials` compose service)
    DSD_EXTRA_ARGS                 optional extra dsd-fme args (space-separated)
"""

from __future__ import annotations

import json
import os
import queue
import re
import shlex
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


def resolve_secret() -> str | None:
    """This decoder's own credential, from ``DECODER_CREDENTIALS_FILE``.

    The one-shot ``service-credentials`` service writes the file before any
    decoder starts (``{"caller", "token"}``); the hub accepts the token for this
    decoder's kind only. None when the variable is unset or the file unreadable.
    """
    path = os.environ.get("DECODER_CREDENTIALS_FILE", "").strip()
    if not path:
        return None
    try:
        with open(path, encoding="utf-8") as credentials_file:
            token = json.load(credentials_file).get("token")
    except (OSError, ValueError, AttributeError):
        return None
    return token if isinstance(token, str) and token else None


# ── dsd-fme log parsing ───────────────────────────────────────────────────────

# These patterns are deliberately tolerant — dsd-fme's exact wording varies by
# version and protocol. They extract the high-signal fields we surface in the
# UI; pin the dsd-fme ref (Dockerfile DSDFME_REF) and adjust here if a build
# changes the log format. A line that matches nothing yields no event.
_SYNC_LOST = re.compile(r"\b(no sync|sync\s*lost|carrier\s*lost)\b", re.IGNORECASE)
_SYNC_OK = re.compile(r"\bsync\s*[:]?\s*[+\-]?\s*([A-Za-z0-9]+)", re.IGNORECASE)
_TALKGROUP = re.compile(r"\b(?:tg|talkgroup|target)\b[:=\s]+(\d+)", re.IGNORECASE)
_SOURCE = re.compile(r"\b(?:source|src)(?:\s*id)?\b[:=\s]+(\d+)", re.IGNORECASE)
_COLOR_CODE = re.compile(r"\b(?:color\s*code|cc)\b[:=\s]+(\d+)", re.IGNORECASE)
_MODE = re.compile(
    r"\b(P25|DMR|NXDN|D-?STAR|YSF|M17|EDACS|DPMR|PROVOICE)\b", re.IGNORECASE
)


def parse_dsd_line(line: str) -> dict | None:
    """Parse one dsd-fme output line into a decode event dict, or None.

    The returned dict is the ``event`` payload POSTed to the backend; it may
    carry any of: ``mode``, ``talkgroup``, ``source``, ``color_code``, and
    ``sync`` (bool). Sync-loss lines produce ``{"sync": False}``.
    """
    text = line.strip()
    if not text:
        return None

    if _SYNC_LOST.search(text):
        return {"sync": False}

    event: dict = {}
    mode = _MODE.search(text)
    if mode:
        event["mode"] = mode.group(1).upper().replace("DSTAR", "D-STAR")
    talkgroup = _TALKGROUP.search(text)
    if talkgroup:
        event["talkgroup"] = int(talkgroup.group(1))
    source = _SOURCE.search(text)
    if source:
        event["source"] = int(source.group(1))
    color_code = _COLOR_CODE.search(text)
    if color_code:
        event["color_code"] = int(color_code.group(1))
    sync = _SYNC_OK.search(text)
    if sync and "mode" not in event:
        # "Sync: +DMR" style line — treat the token as the mode if recognisable.
        token = sync.group(1).upper()
        if _MODE.fullmatch(token):
            event["mode"] = token
    if sync:
        event["sync"] = True

    return event or None


# ── backend ingest ────────────────────────────────────────────────────────────


def build_log_event(line: str) -> dict | None:
    """Wrap one raw dsd-fme output line as a ``log`` event, or None if blank.

    The browser's Decoder panel shows these verbatim (the same lines the
    container log shows), so — unlike :func:`parse_dsd_line` — nothing is
    extracted or normalised here. Trailing newlines are dropped; an
    all-whitespace line yields no event so the log view stays free of blank rows.
    """
    text = line.rstrip("\n")
    if not text.strip():
        return None
    return {"type": "log", "line": text}


def post_event(ingest_url: str, secret: str, event: dict) -> bool:
    """POST one event to the backend ingest endpoint. Returns success.

    The backend routes the event to the single active decode session, so no
    radio id is sent.
    """
    payload = json.dumps({"event": event}).encode("utf-8")
    request = urllib.request.Request(
        ingest_url,
        data=payload,
        headers={"Content-Type": "application/json", "X-Decode-Secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return 200 <= response.status < 300
    except urllib.error.HTTPError as exc:
        # 409 = "decode not active": the expected idle response while DIGITAL is
        # off, so don't treat it as an error worth logging.
        if exc.code != 409:
            print(f"[decoder] ingest POST failed: {exc}", file=sys.stderr, flush=True)
        return False
    except (urllib.error.URLError, OSError) as exc:
        print(f"[decoder] ingest POST failed: {exc}", file=sys.stderr, flush=True)
        return False


def socket_address(config: dict, name: str) -> tuple[str, int] | None:
    """``(host, port)`` of one of the hub's sockets named in a config reply, or None.

    None when the reply doesn't carry a usable one (``name`` missing, a blank
    host, a port that isn't a number): there is then nothing to connect to.
    """
    endpoint = config.get(name)
    if not isinstance(endpoint, dict):
        return None
    host = endpoint.get("host")
    port = endpoint.get("port")
    if not isinstance(host, str) or not host or isinstance(port, bool) or not isinstance(port, int):
        return None
    return host, port


def build_dsd_command(pcm_feed: tuple[str, int], voice_audio_return: tuple[str, int]) -> list[str]:
    """Assemble the dsd-fme command line for the hub's PCM feed and voice-audio port."""
    pcm_host, pcm_port = pcm_feed
    audio_host, audio_port = voice_audio_return
    command = [
        "dsd-fme",
        "-i",
        f"tcp:{pcm_host}:{pcm_port}",
        "-o",
        f"udp:{audio_host}:{audio_port}",
    ]

    extra = os.environ.get("DSD_EXTRA_ARGS", "").strip()
    if extra:
        command.extend(shlex.split(extra))
    return command


class HubLink:
    """Logs the radio hub becoming unreachable once and coming back once.

    The supervisor polls the hub's decode config every couple of seconds, so a
    line per failed poll fills the log whenever the hub is starting or
    restarting (a `docker compose up` starts this container before the hub
    answers). Only "not there" failures are quietened — no connection, the
    gateway answering for a hub that is down, or no hub registered yet — while
    any other HTTP error means the hub answered, so it is still logged every
    time.
    """

    def __init__(self, clock=time.monotonic) -> None:
        self._clock = clock
        self._connected = False
        self._unreachable_since: float | None = None

    def reached(self, url: str) -> None:
        """The hub answered: say so the first time, and after every outage."""
        if self._unreachable_since is not None:
            waited = self._clock() - self._unreachable_since
            _log_hub(f"connected to the radio hub through {_origin(url)} after {waited:.1f} s")
        elif not self._connected:
            _log_hub(f"connected to the radio hub through {_origin(url)}")
        self._connected = True
        self._unreachable_since = None

    def unreachable(self, url: str, error: object) -> None:
        """A poll couldn't connect: log the first one, then retry quietly."""
        if self._unreachable_since is not None:
            return
        self._unreachable_since = self._clock()
        _log_hub(f"waiting for the radio hub through {_origin(url)} ({error}); retrying quietly")


def _origin(url: str) -> str:
    """scheme://host:port of a URL, the part that says which hub this is."""
    parts = urllib.parse.urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def _log_hub(message: str) -> None:
    print(f"[decoder] {message}", file=sys.stderr, flush=True)


_hub_link = HubLink()


# The gateway's answers for a hub that is registered but not serving: it can't
# be dialled (502), the registry marks it unavailable (503), or it timed out (504).
_HUB_UNAVAILABLE_STATUSES = frozenset({502, 503, 504})


def fetch_decode_config(config_url: str, secret: str) -> dict:
    """GET the hub's decode config (is a session active, where are its sockets). {} on failure.

    Polled before each dsd-fme launch. Network/parse failures are non-fatal —
    the decoder simply idles until the hub is reachable again.
    """
    request = urllib.request.Request(config_url, headers={"X-Decode-Secret": secret}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        if exc.code in _HUB_UNAVAILABLE_STATUSES:
            _hub_link.unreachable(config_url, f"HTTP {exc.code}")
            return {}
        _hub_link.reached(config_url)
        print(f"[decoder] decode-config fetch failed: {exc}", file=sys.stderr, flush=True)
        return {}
    except (urllib.error.URLError, OSError) as exc:
        _hub_link.unreachable(config_url, getattr(exc, "reason", exc))
        return {}
    try:
        config = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        # Not the hub answering: with no hub registered yet, the gateway hands
        # the path to the app, whose SPA fallback replies with its HTML page.
        _hub_link.unreachable(config_url, "no radio hub registered yet")
        return {}
    _hub_link.reached(config_url)
    return config if isinstance(config, dict) else {}


def _event_worker(ingest_url: str, secret: str, events: queue.Queue) -> None:  # pragma: no cover - thread
    """Drain parsed events and POST them, off the dsd-fme read path.

    Keeping the (blocking) HTTP POST off the stdout-reading loop is essential:
    on a busy control channel dsd-fme emits log lines faster than they can be
    POSTed, and blocking the read loop would backpressure dsd-fme's stdout and
    stall its real-time decode (audible as slow/broken voice).
    """
    while True:
        event = events.get()
        if event is None:
            return
        post_event(ingest_url, secret, event)


def run_dsd_once(
    events: queue.Queue, pcm_feed: tuple[str, int], voice_audio_return: tuple[str, int]
) -> int:  # pragma: no cover - drives a subprocess
    """Run dsd-fme once, echoing its output and queueing parsed events.

    dsd-fme's own log lines are echoed to stderr so the container log shows what
    it is doing (and why it exits). Every non-blank line is also forwarded raw as
    a ``log`` event for the browser's Decoder log view, while recognised lines are
    additionally de-duplicated against the previous structured event (the control
    channel repeats near-identical status lines) and surfaced as call rows. Both
    are handed to the worker queue without ever blocking the read loop.
    """
    command = build_dsd_command(pcm_feed, voice_audio_return)
    print(f"[decoder] launching: {' '.join(command)}", file=sys.stderr, flush=True)
    # dsd-fme intermixes raw (non-UTF-8) decoded-voice/control bytes into its
    # stdout, so strict decoding (the `text=True` default) raises UnicodeDecodeError
    # mid-stream and crashes the supervisor — the decoder then drops its PCM link
    # and the UI shows "Decoder offline". Decode tolerantly: replace undecodable
    # bytes rather than raising, so the read loop survives bad bytes.
    process = subprocess.Popen(  # noqa: S603 - command built from trusted env, not user input
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    assert process.stdout is not None
    last_event = None
    try:
        for line in process.stdout:
            sys.stderr.write(line)  # surface dsd-fme's raw output in the logs
            sys.stderr.flush()
            log_event = build_log_event(line)
            if log_event is not None:
                try:
                    events.put_nowait(log_event)
                except queue.Full:
                    pass  # log view is a courtesy — drop rather than stall decode
            event = parse_dsd_line(line)
            if event is not None and event != last_event:
                last_event = event
                try:
                    events.put_nowait(event)
                except queue.Full:
                    pass  # UI is a courtesy view — drop rather than stall decode
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
    return process.returncode or 0


def main() -> int:  # pragma: no cover - container entrypoint loop
    gateway_url = os.environ.get("SENTINEL_GATEWAY_URL", "http://gateway:8080").rstrip("/")
    ingest_url = f"{gateway_url}/api/sdr/decode/ingest"
    config_url = f"{gateway_url}/api/sdr/decode/config"
    secret = resolve_secret()
    if not secret:
        print(
            "[decoder] no decoder credential (DECODER_CREDENTIALS_FILE) — refusing to start",
            file=sys.stderr,
            flush=True,
        )
        return 2

    # One background poster for the whole process lifetime (bounded queue, drops
    # when full so it never backpressures dsd-fme).
    events: queue.Queue = queue.Queue(maxsize=256)
    threading.Thread(target=_event_worker, args=(ingest_url, secret, events), daemon=True).start()

    # Supervise dsd-fme in-process. Only run it while a decode session is actually
    # serving PCM (config["active"]): with decode OFF the backend isn't listening on
    # the PCM port, so launching dsd-fme just makes it fail to connect and spew its
    # startup banner — every line of which the sidecar would POST and the backend
    # would reject with 409. So poll the config while idle and launch only once a
    # session is up; when it ends, dsd-fme exits (PCM EOF) and we return to idling.
    retry_seconds = 3
    idle_poll_seconds = 2
    while True:
        # Re-read the active flag each cycle so a decode session starting or
        # ending is picked up on the next loop.
        config = fetch_decode_config(config_url, secret)
        if not config.get("active"):
            time.sleep(idle_poll_seconds)
            continue
        pcm_feed = socket_address(config, "pcmFeed")
        voice_audio_return = socket_address(config, "voiceAudioReturn")
        if pcm_feed is None or voice_audio_return is None:
            print(
                "[decoder] the hub's decode config names no PCM feed / voice-audio port — is the hub older "
                "than this decoder?",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(idle_poll_seconds)
            continue
        # A session is up: announce the vocoder so the UI learns voice is available,
        # then run dsd-fme until the PCM feed drops (decode disabled / bounced).
        post_event(ingest_url, secret, {"type": "decode_status", "vocoder": "mbelib"})
        try:
            run_dsd_once(events, pcm_feed, voice_audio_return)
        except KeyboardInterrupt:
            return 0
        time.sleep(retry_seconds)


if __name__ == "__main__":
    sys.exit(main())
