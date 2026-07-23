#!/usr/bin/env python3
"""APRS decoder sidecar supervisor.

Runs ``direwolf`` (a software TNC) against the Sentinel backend's FM-demodulated
PCM feed, parses each decoded packet with ``aprslib``, and POSTs the results to
the backend so they plot on the Land map and appear in the SDR waterfall panels.

Data flow, mirroring the digital-voice decoder:
  * The backend serves 48 kHz mono s16 PCM over TCP (only while an APRS session is
    active). This supervisor connects to it and **pipes the bytes into Direwolf's
    stdin** (``direwolf … -``), so Direwolf never opens the single-client
    ``rtl_tcp`` connection itself.
  * Direwolf prints each decoded frame in TNC2 monitor format on stdout. We
    extract the packet, forward it raw as a ``log`` event, and additionally parse
    it with aprslib into a structured ``aprs`` event (callsign, lat/lon, …).
  * Both are POSTed to the backend ingest endpoint off the stdout-read path, so a
    burst of packets never backpressures Direwolf.

Uses only the Python standard library plus aprslib.

Environment:
    IQ_PCM_HOST / IQ_PCM_PORT   backend PCM TCP feed Direwolf's stdin is fed from
    INGEST_URL                  backend APRS decode-event ingest endpoint
    CONFIG_URL                  backend APRS decode-config endpoint (active gate)
    INGEST_SECRET               shared secret (explicit override)
    INGEST_SECRET_FILE          path to the auto-generated shared secret file
    APRS_EXTRA_ARGS             optional extra direwolf args (space-separated)
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

import aprslib

# How long to wait for the backend to write the shared secret file on startup.
_SECRET_WAIT_SECONDS = 30

# Direwolf prints each decoded frame prefixed with its channel/slice, e.g.
# "[0.1] M0ABC-9>APU25N,WIDE1-1:!5129.83N/00005.32W>Comment". The remainder after
# the prefix is the TNC2-format packet aprslib understands.
_PACKET_LINE = re.compile(r"^\[\d+(?:\.\d+)?\]\s+(.+)$")


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


# ── packet parsing ──────────────────────────────────────────────────────────────


def extract_packet(line: str) -> str | None:
    """Return the TNC2 packet text from one Direwolf stdout line, or None.

    Only the channel-prefixed frame lines carry a packet; Direwolf's other output
    (audio-level meters, decode diagnostics) is skipped for structured parsing.
    """
    match = _PACKET_LINE.match(line.strip())
    if not match:
        return None
    return match.group(1).strip() or None


def _clean(value: object) -> object | None:
    """Drop empty/blank values so the POSTed event stays small and tidy."""
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def parse_aprs_packet(packet: str) -> dict | None:
    """Parse one TNC2 packet into a structured APRS event dict, or None.

    Returns None when aprslib cannot parse the packet (malformed, or an
    unsupported frame type) — the raw line is still surfaced in the log view, but
    no structured/plottable row is produced. Only the fields the UI and map use
    are forwarded; blank fields are omitted.
    """
    try:
        parsed = aprslib.parse(packet)
    except Exception:  # noqa: BLE001 - aprslib raises varied types (ParseError/UnknownFormat/…) on bad input
        return None

    # Third-party packets (a digipeater/IGate relaying another station, e.g. MMDVM
    # DMR gateways) carry no top-level position — the real station + fix are nested
    # in `subpacket`. Plot the reported station, not the relay, by reading fields
    # from the subpacket when present.
    subpacket = parsed.get("subpacket")
    source = subpacket if isinstance(subpacket, dict) else parsed

    symbol_table = source.get("symbol_table") or ""
    symbol = source.get("symbol") or ""
    path = source.get("path")
    event = {
        "type": "aprs",
        "from": _clean(source.get("from")),
        "latitude": _clean(source.get("latitude")),
        "longitude": _clean(source.get("longitude")),
        "symbol": _clean(f"{symbol_table}{symbol}"),
        "comment": _clean(source.get("comment")),
        "course": _clean(source.get("course")),
        "speed": _clean(source.get("speed")),
        "altitude": _clean(source.get("altitude")),
        "path": _clean(",".join(path) if isinstance(path, list) else path),
        "raw": packet,
        "ts": int(time.time() * 1000),
    }
    return {key: value for key, value in event.items() if value is not None}


# ── backend ingest ────────────────────────────────────────────────────────────


def post_event(ingest_url: str, secret: str, event: dict) -> bool:
    """POST one event to the backend APRS ingest endpoint. Returns success.

    The backend routes the event to the single active APRS decode session, so no
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
        # 409 = "aprs decode not active": the expected idle response between
        # sessions, so don't treat it as an error worth logging.
        if exc.code != 409:
            print(f"[aprs] ingest POST failed: {exc}", file=sys.stderr, flush=True)
        return False
    except (urllib.error.URLError, OSError) as exc:
        print(f"[aprs] ingest POST failed: {exc}", file=sys.stderr, flush=True)
        return False


def fetch_decode_config(config_url: str, secret: str) -> dict:
    """GET the backend's APRS decode config (``active`` gate). {} on failure.

    Polled while idle so Direwolf is only launched once the backend is actually
    serving PCM. Network/parse failures are non-fatal — the supervisor simply
    keeps idling until the backend is reachable.
    """
    request = urllib.request.Request(
        config_url, headers={"X-Decode-Secret": secret}, method="GET"
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if 200 <= response.status < 300:
                return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
        print(f"[aprs] decode-config fetch failed: {exc}", file=sys.stderr, flush=True)
    return {}


def build_direwolf_command() -> list[str]:
    """Assemble the Direwolf command line.

    ``-t 0`` disables coloured output (so stdout parses cleanly), ``-r 48000
    -b 16`` matches the backend's 48 kHz mono s16 PCM, ``-B 1200`` selects the
    standard APRS AFSK1200 modem, and the trailing ``-`` reads audio from stdin
    (fed from the backend PCM socket by :func:`pump_pcm`).
    """
    command = ["direwolf", "-t", "0", "-r", "48000", "-b", "16", "-B", "1200", "-"]
    extra = os.environ.get("APRS_EXTRA_ARGS", "").strip()
    if extra:
        command.extend(shlex.split(extra))
    return command


def pump_pcm(
    pcm_sock: socket.socket, process: subprocess.Popen
) -> None:  # pragma: no cover - thread/socket I/O
    """Copy PCM bytes from the backend socket into Direwolf's stdin until EOF.

    When the backend stops serving (session ended / bounced), the socket closes,
    Direwolf gets stdin EOF and exits, and the supervisor returns to idling.
    """
    try:
        assert process.stdin is not None
        stdin_buffer = process.stdin.buffer
        while True:
            data = pcm_sock.recv(4096)
            if not data:
                break
            stdin_buffer.write(data)
            stdin_buffer.flush()
    except (OSError, ValueError):
        pass
    finally:
        try:
            if process.stdin is not None:
                process.stdin.close()
        except OSError:
            pass


def _event_worker(
    ingest_url: str, secret: str, events: queue.Queue
) -> None:  # pragma: no cover - thread
    """Drain parsed events and POST them, off the Direwolf read path."""
    while True:
        event = events.get()
        if event is None:
            return
        post_event(ingest_url, secret, event)


def handle_line(line: str, events: queue.Queue) -> None:
    """Turn one Direwolf stdout line into queued log + structured events.

    Recognised packet lines are forwarded verbatim as a ``log`` event (the raw
    packet view) and, when aprslib can parse them, additionally as a structured
    ``aprs`` event. Non-packet chatter yields nothing. Events are dropped rather
    than blocking if the worker queue is full (the UI is a courtesy view).
    """
    packet = extract_packet(line)
    if packet is None:
        return
    for event in ({"type": "log", "line": packet}, parse_aprs_packet(packet)):
        if event is None:
            continue
        try:
            events.put_nowait(event)
        except queue.Full:
            pass


def run_direwolf_once(
    events: queue.Queue, pcm_host: str, pcm_port: int
) -> None:  # pragma: no cover - drives a subprocess
    """Run Direwolf once against the backend PCM feed until the feed ends.

    Connects to the backend PCM socket first; if the backend isn't serving yet
    (race between the config flip and the PCM listener), the connect fails and the
    caller retries. Direwolf's own output is echoed to stderr so the container log
    shows what it is doing.
    """
    try:
        pcm_sock = socket.create_connection((pcm_host, pcm_port), timeout=10)
    except OSError as exc:
        print(
            f"[aprs] PCM connect to {pcm_host}:{pcm_port} failed: {exc}",
            file=sys.stderr,
            flush=True,
        )
        return

    command = build_direwolf_command()
    print(f"[aprs] launching: {' '.join(command)}", file=sys.stderr, flush=True)
    process = subprocess.Popen(  # noqa: S603 - command built from trusted env, not user input
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    pump = threading.Thread(target=pump_pcm, args=(pcm_sock, process), daemon=True)
    pump.start()
    try:
        assert process.stdout is not None
        for line in process.stdout:
            sys.stderr.write(line)  # surface Direwolf's raw output in the logs
            sys.stderr.flush()
            handle_line(line, events)
    finally:
        try:
            pcm_sock.close()
        except OSError:
            pass
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def main() -> int:  # pragma: no cover - container entrypoint loop
    ingest_url = os.environ.get("INGEST_URL", "http://app:8000/api/sdr/aprs/ingest")
    config_url = os.environ.get("CONFIG_URL", "http://app:8000/api/sdr/aprs/config")
    pcm_host = os.environ.get("IQ_PCM_HOST", "app")
    pcm_port = int(os.environ.get("IQ_PCM_PORT", "7357"))

    secret = resolve_secret()
    if not secret:
        print(
            "[aprs] no ingest secret (INGEST_SECRET / INGEST_SECRET_FILE) — refusing to start",
            file=sys.stderr,
            flush=True,
        )
        return 2

    # One background poster for the whole process lifetime (bounded queue, drops
    # when full so it never backpressures Direwolf).
    events: queue.Queue = queue.Queue(maxsize=256)
    threading.Thread(
        target=_event_worker, args=(ingest_url, secret, events), daemon=True
    ).start()

    # Launch Direwolf only while an APRS session is serving PCM (config["active"]);
    # otherwise idle-poll so we don't spin connecting to a closed PCM port.
    retry_seconds = 3
    idle_poll_seconds = 2
    while True:
        config = fetch_decode_config(config_url, secret)
        if not config.get("active"):
            time.sleep(idle_poll_seconds)
            continue
        try:
            run_direwolf_once(events, pcm_host, pcm_port)
        except KeyboardInterrupt:
            return 0
        time.sleep(retry_seconds)


if __name__ == "__main__":
    sys.exit(main())
