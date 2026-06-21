#!/usr/bin/env python3
"""Decoder sidecar supervisor.

Launches ``dsd-fme`` pointed at the Sentinel backend's FM-demodulated PCM feed,
parses its log output into structured events, and POSTs them to the backend's
ingest endpoint so they reach the browser. Decoded voice is sent straight to the
backend over UDP by dsd-fme itself (``-o udp:...``); this process only handles
the control-plane (launch + event parsing + capability report).

Uses only the Python standard library so the runtime image stays minimal.

Environment:
    IQ_PCM_HOST / IQ_PCM_PORT      backend PCM TCP feed dsd-fme connects to
    AUDIO_UDP_HOST / AUDIO_UDP_PORT where dsd-fme sends decoded voice (UDP)
    INGEST_URL                     backend decode-event ingest endpoint
    INGEST_SECRET                  shared secret (explicit override)
    INGEST_SECRET_FILE             path to the auto-generated shared secret file
                                   (the backend writes it; preferred over env)
    DSD_EXTRA_ARGS                 optional extra dsd-fme args (space-separated)
"""

from __future__ import annotations

import json
import os
import queue
import re
import shlex
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

# How long to wait for the backend to write the shared secret file on startup.
_SECRET_WAIT_SECONDS = 30


def resolve_secret() -> str | None:
    """Resolve the ingest secret from the env override or the shared file.

    An explicit ``INGEST_SECRET`` wins. Otherwise read ``INGEST_SECRET_FILE``,
    polling briefly because the backend writes it during its own startup and the
    decoder may come up first. Returns None if neither yields a secret.
    """
    env_secret = os.environ.get("INGEST_SECRET", "").strip()
    if env_secret:
        return env_secret
    path = os.environ.get("INGEST_SECRET_FILE", "").strip()
    if not path:
        return None
    deadline = time.monotonic() + _SECRET_WAIT_SECONDS
    while time.monotonic() < deadline:
        try:
            contents = open(path, encoding="utf-8").read().strip()  # noqa: SIM115
            if contents:
                return contents
        except OSError:
            pass
        time.sleep(1)
    return None


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


def safe_csv_name(name: object) -> str | None:
    """Return ``name`` if it is a safe bare CSV filename, else None.

    The backend already validates these, but the value is interpolated into a
    filesystem path handed to dsd-fme here, so it is re-checked: anything with a
    path separator or ``..`` is rejected to prevent escaping the maps directory.
    """
    if not name:
        return None
    candidate = str(name).strip()
    if not candidate or "/" in candidate or "\\" in candidate or ".." in candidate:
        return None
    return candidate


def build_dsd_command(config: dict | None = None) -> list[str]:
    """Assemble the dsd-fme command line from the environment and decode config.

    ``config`` is the backend's decode config (``GET /api/sdr/decode/config``).
    When ``config["trunk"]["enabled"]`` is set, the trunking + rigctl flags
    (``-T``, ``-U <port>``, ``-C <map>``, optional ``-G <group>``) are appended so
    dsd-fme follows control-channel grants; the channel map is resolved against
    ``CHANNEL_MAPS_DIR``. dsd-fme's rigctl is localhost-only, so ``-U`` points at
    the local forwarder port (see :func:`start_rigctl_forwarder`).
    """
    iq_host = os.environ.get("IQ_PCM_HOST", "app")
    iq_port = os.environ.get("IQ_PCM_PORT", "7355")
    audio_host = os.environ.get("AUDIO_UDP_HOST", "app")
    audio_port = os.environ.get("AUDIO_UDP_PORT", "7356")
    command = [
        "dsd-fme",
        "-i",
        f"tcp:{iq_host}:{iq_port}",
        "-o",
        f"udp:{audio_host}:{audio_port}",
    ]

    trunk = (config or {}).get("trunk") or {}
    if trunk.get("enabled"):
        rigctl_port = str((config or {}).get("rigctl_port") or os.environ.get("RIGCTL_PORT", "4532"))
        maps_dir = os.environ.get("CHANNEL_MAPS_DIR", "/app/channel-maps")
        command += ["-T", "-U", rigctl_port]
        channel_map = safe_csv_name(trunk.get("channel_map"))
        if channel_map:
            command += ["-C", os.path.join(maps_dir, channel_map)]
        group_list = safe_csv_name(trunk.get("group_list"))
        if group_list:
            command += ["-G", os.path.join(maps_dir, group_list)]

    extra = os.environ.get("DSD_EXTRA_ARGS", "").strip()
    if extra:
        command.extend(shlex.split(extra))
    return command


def fetch_decode_config(config_url: str, secret: str) -> dict:
    """GET the backend's decode config (trunk state + rigctl port). {} on failure.

    Polled before each dsd-fme launch so a trunk toggle is picked up on the next
    (re)connect. Network/parse failures are non-fatal — the decoder simply runs
    in its previous (typically non-trunk) mode until the backend is reachable.
    """
    request = urllib.request.Request(config_url, headers={"X-Decode-Secret": secret}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if 200 <= response.status < 300:
                return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
        print(f"[decoder] decode-config fetch failed: {exc}", file=sys.stderr, flush=True)
    return {}


def _pump(source: socket.socket, destination: socket.socket) -> None:  # pragma: no cover - thread/socket I/O
    """Copy bytes one way between two sockets until EOF, then half-close both."""
    try:
        while True:
            data = source.recv(4096)
            if not data:
                break
            destination.sendall(data)
    except OSError:
        pass
    finally:
        for sock in (source, destination):
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def _forward_client(client: socket.socket, target_host: str, target_port: int) -> None:  # pragma: no cover - socket
    """Bridge one accepted localhost client to the upstream rigctld server."""
    try:
        upstream = socket.create_connection((target_host, target_port), timeout=5)
    except OSError as exc:
        print(f"[decoder] rigctl forward to {target_host}:{target_port} failed: {exc}", file=sys.stderr, flush=True)
        client.close()
        return
    threading.Thread(target=_pump, args=(client, upstream), daemon=True).start()
    threading.Thread(target=_pump, args=(upstream, client), daemon=True).start()


def start_rigctl_forwarder(listen_port: int, target_host: str, target_port: int) -> socket.socket:  # pragma: no cover - socket
    """Forward 127.0.0.1:listen_port → target_host:target_port in a daemon thread.

    dsd-fme's rigctl client is hardwired to ``localhost`` (``-U`` takes only a
    port), but the backend's rigctld server lives in the app container. This thin
    TCP proxy lets dsd-fme connect locally while the traffic reaches the backend.
    """
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", listen_port))
    listener.listen(8)

    def _accept_loop() -> None:
        while True:
            try:
                client, _ = listener.accept()
            except OSError:
                break
            threading.Thread(target=_forward_client, args=(client, target_host, target_port), daemon=True).start()

    threading.Thread(target=_accept_loop, daemon=True).start()
    print(f"[decoder] rigctl forwarder 127.0.0.1:{listen_port} → {target_host}:{target_port}", file=sys.stderr, flush=True)
    return listener


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


def run_dsd_once(events: queue.Queue, config: dict | None = None) -> int:  # pragma: no cover - drives a subprocess
    """Run dsd-fme once, echoing its output and queueing parsed events.

    dsd-fme's own log lines are echoed to stderr so the container log shows what
    it is doing (and why it exits). Every non-blank line is also forwarded raw as
    a ``log`` event for the browser's Decoder log view, while recognised lines are
    additionally de-duplicated against the previous structured event (the control
    channel repeats near-identical status lines) and surfaced as call rows. Both
    are handed to the worker queue without ever blocking the read loop. ``config``
    carries the backend's current trunk state, which shapes the launch flags.
    """
    command = build_dsd_command(config)
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
    ingest_url = os.environ.get("INGEST_URL", "http://app:8000/api/sdr/decode/ingest")
    secret = resolve_secret()
    if not secret:
        print(
            "[decoder] no ingest secret (INGEST_SECRET / INGEST_SECRET_FILE) — refusing to start",
            file=sys.stderr,
            flush=True,
        )
        return 2

    # One background poster for the whole process lifetime (bounded queue, drops
    # when full so it never backpressures dsd-fme).
    events: queue.Queue = queue.Queue(maxsize=256)
    threading.Thread(target=_event_worker, args=(ingest_url, secret, events), daemon=True).start()

    # Start the rigctl forwarder once: dsd-fme's rigctl client only ever dials
    # localhost, so we proxy that to the backend's rigctld server. Harmless when
    # trunking is off — nothing connects to it until dsd-fme launches with `-U`.
    rigctl_host = os.environ.get("RIGCTL_HOST", "app").strip()
    rigctl_port = int(os.environ.get("RIGCTL_PORT", "4532"))
    if rigctl_host:
        start_rigctl_forwarder(rigctl_port, rigctl_host, rigctl_port)

    config_url = os.environ.get("CONFIG_URL", "http://app:8000/api/sdr/decode/config")

    # Supervise dsd-fme in-process: it exits whenever the backend PCM feed is
    # unavailable (i.e. digital decode is OFF, so nothing is listening on the PCM
    # port). Rather than letting the container die and thrash on restart, retry
    # here with a short backoff so it reconnects cleanly when decode is enabled.
    retry_seconds = 3
    while True:
        # Re-announce the vocoder each cycle so the UI learns voice is available
        # once a decode session is actually up (this 409s harmlessly when not).
        post_event(ingest_url, secret, {"type": "decode_status", "vocoder": "mbelib"})
        # Re-read trunk state each cycle so a toggle is honoured on the next
        # (re)launch — the backend bounces the PCM feed to force that relaunch.
        config = fetch_decode_config(config_url, secret)
        try:
            run_dsd_once(events, config)
        except KeyboardInterrupt:
            return 0
        time.sleep(retry_seconds)


if __name__ == "__main__":
    sys.exit(main())
