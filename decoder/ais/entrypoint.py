#!/usr/bin/env python3
"""Off-grid AIS decoder sidecar supervisor.

Runs ``direwolf`` with its AIS modem (9600 bps GMSK) against the Sentinel
backend's FM-demodulated PCM feed, decodes each AIVDM sentence with ``pyais``,
and POSTs the results to the backend so vessels plot on the Sea map without any
internet connection.

Data flow, mirroring the APRS sidecar:
  * The backend serves 48 kHz **stereo** s16 PCM over TCP (only while an AIS
    session is active) and this supervisor pipes the bytes into Direwolf's stdin
    (``direwolf … -``), so Direwolf never opens the single-client ``rtl_tcp``
    connection itself.
  * The stereo feed is what makes both AIS channels work: the backend
    demodulates A (161.975 MHz) into the left channel and B (162.025 MHz) into
    the right, and ``direwolf.conf`` runs an AIS modem on each. Decoding one
    channel only would miss roughly half of all transmissions.
  * Direwolf prints each decoded frame on stdout as APRS user-defined data:
    ``[0] AIS>APDW16,NOGATE:{DA!AIVDM,1,1,,A,<payload>,0*7B``. We extract the
    NMEA sentence, forward it raw as a ``log`` event, and additionally decode it
    with pyais into a structured ``ais`` event (MMSI, lat/lon, SOG/COG, …).
  * Both are POSTed to the backend ingest endpoint off the stdout-read path, so a
    burst of traffic never backpressures Direwolf.

Uses only the Python standard library plus pyais.

Environment:
    IQ_PCM_HOST / IQ_PCM_PORT   backend PCM TCP feed Direwolf's stdin is fed from
    INGEST_URL                  backend AIS decode-event ingest endpoint
    CONFIG_URL                  backend AIS decode-config endpoint (active gate)
    INGEST_SECRET               shared secret (explicit override)
    INGEST_SECRET_FILE          path to the auto-generated shared secret file
    DIREWOLF_CONFIG             path to the Direwolf config file (see -c, below)
    AIS_EXTRA_ARGS              optional extra direwolf args (space-separated)
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

from pyais import decode as decode_ais_sentence

# How long to wait for the backend to write the shared secret file on startup.
_SECRET_WAIT_SECONDS = 30

# Direwolf REQUIRES a configuration file. Given none in the working directory or
# $HOME it prints "Could not open configuration file" and exits(1) rather than
# falling back to built-in defaults. The AIS config additionally carries the
# two-channel setup, which has no command-line equivalent, so it is doubly
# load-bearing. The file ships in the image beside this script.
_DIREWOLF_CONFIG = "/app/direwolf.conf"

# A Direwolf run shorter than this never got as far as decoding — it died during
# startup (bad/missing config, unopenable audio device) or the PCM feed went away
# immediately. Used to turn a silent respawn loop into a visible error.
_STARTUP_SECONDS = 5.0

# Direwolf wraps each decoded AIS frame in APRS user-defined data, prefixed with
# its channel index, e.g.
#   [0] AIS>APDW16,NOGATE:{DA!AIVDM,1,1,,A,13HOI:0P0000VOHLCnHQKwvL05Ip,0*23
# The prefix also carries a subchannel and/or slicer index when the modem runs
# several of them ("[0.2]"), so accept any number of dot-separated indices. The
# leading index is the audio channel: 0 = AIS channel A (left), 1 = B (right).
# "{D" is the user-defined-data marker and "A" is Direwolf's AIS type byte.
_AIS_LINE = re.compile(r"^\[(\d+)(?:\.\d+)*\]\s+AIS>[^:]*:\{DA(!AIVDM.+)$")

# Which stereo channel decoded a frame, for display. Not used for positioning —
# both channels carry the same kind of traffic — but it makes a one-sided antenna
# or a mistuned span obvious in the logs.
_CHANNEL_LABELS = {"0": "A", "1": "B"}


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


# ── sentence parsing ────────────────────────────────────────────────────────────


def extract_sentence(line: str) -> tuple[str, str] | None:
    """Return ``(channel_label, nmea_sentence)`` from one Direwolf stdout line.

    Returns None for anything that is not a decoded AIS frame — Direwolf's other
    output (audio-level meters, decode diagnostics, startup banner) carries no
    sentence.
    """
    match = _AIS_LINE.match(line.strip())
    if not match:
        return None
    sentence = match.group(2).strip()
    if not sentence:
        return None
    return _CHANNEL_LABELS.get(match.group(1), match.group(1)), sentence


def _clean(value: object) -> object | None:
    """Drop empty/blank values so the POSTed event stays small and tidy.

    AIS pads unused text fields with '@', which carries no meaning and would
    otherwise reach the UI as a vessel called "@@@@@@@@".
    """
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.replace("@", " ").strip()
        return stripped or None
    return value


def _enum_value(value: object) -> object | None:
    """Unwrap a pyais enum (NavigationStatus, ShipType) to its plain value.

    pyais returns IntEnum members for coded fields; JSON-serialising those would
    embed the enum's repr, so take ``.value`` when present.
    """
    if value is None:
        return None
    return getattr(value, "value", value)


def parse_ais_sentence(sentence: str, channel_label: str) -> dict | None:
    """Decode one AIVDM sentence into a structured AIS event dict, or None.

    Returns None when pyais cannot decode the sentence (corrupt frame that still
    passed the CRC, or an unsupported message type) — the raw sentence is still
    surfaced in the log view, but no structured/plottable row is produced.

    Reads fields out of ``asdict()`` rather than attributes so one code path
    covers every message type: a position report has no ``shipname`` and a static
    report has no ``lat``, and the backend adapter decides which of those makes a
    usable record.

    There is deliberately no multi-fragment reassembly here, although AIVDM on
    the wire is often split across sentences. Direwolf builds its sentence from
    one complete HDLC frame and always emits "!AIVDM,1,1,,A,…" — a single
    fragment carrying the whole payload, even for a long type-5 static report
    (see ais_to_nmea in Direwolf's ais.c). Every sentence that reaches us is
    therefore self-contained, and a fragment assembler would be dead code.
    """
    try:
        decoded = decode_ais_sentence(sentence).asdict()
    except Exception:  # noqa: BLE001 - pyais raises varied types on a bad frame
        return None

    mmsi = _clean(decoded.get("mmsi"))
    if mmsi is None:
        return None

    event = {
        "type": "ais",
        "mmsi": str(mmsi),
        "msgType": _enum_value(decoded.get("msg_type")),
        "channel": channel_label,
        "lat": _clean(decoded.get("lat")),
        "lon": _clean(decoded.get("lon")),
        "sog": _clean(decoded.get("speed")),
        "cog": _clean(decoded.get("course")),
        "heading": _clean(decoded.get("heading")),
        "navStatus": _enum_value(decoded.get("status")),
        "name": _clean(decoded.get("shipname")),
        "shipType": _enum_value(decoded.get("ship_type")),
        "callsign": _clean(decoded.get("callsign")),
        "destination": _clean(decoded.get("destination")),
        "imo": _clean(decoded.get("imo")),
        "raw": sentence,
        "ts": int(time.time() * 1000),
    }
    return {key: value for key, value in event.items() if value is not None}


# ── backend ingest ────────────────────────────────────────────────────────────


def post_event(ingest_url: str, secret: str, event: dict) -> bool:
    """POST one event to the backend AIS ingest endpoint. Returns success.

    The backend routes the event to the single active AIS decode session, so no
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
        # 409 = "ais decode not active": the expected idle response between
        # sessions, so don't treat it as an error worth logging.
        if exc.code != 409:
            print(f"[ais] ingest POST failed: {exc}", file=sys.stderr, flush=True)
        return False
    except (urllib.error.URLError, OSError) as exc:
        print(f"[ais] ingest POST failed: {exc}", file=sys.stderr, flush=True)
        return False


def fetch_decode_config(config_url: str, secret: str) -> dict:
    """GET the backend's AIS decode config (``active`` gate). {} on failure.

    Polled while idle so Direwolf is only launched once the backend is actually
    serving PCM. Network/parse failures are non-fatal — the supervisor simply
    keeps idling until the backend is reachable.
    """
    request = urllib.request.Request(config_url, headers={"X-Decode-Secret": secret}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            if 200 <= response.status < 300:
                return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
        print(f"[ais] decode-config fetch failed: {exc}", file=sys.stderr, flush=True)
    return {}


def build_direwolf_command() -> list[str]:
    """Assemble the Direwolf command line.

    ``-c`` points at the bundled config file, which Direwolf cannot run without
    and which carries the two-channel AIS setup (there is no command-line way to
    say "two channels, both AIS"). ``-t 0`` disables coloured output (so stdout
    parses cleanly), ``-r 48000 -b 16`` matches the backend's 48 kHz s16 PCM, and
    the trailing ``-`` reads audio from stdin (fed from the backend PCM socket by
    :func:`pump_pcm`). Command-line options are applied after the config file, so
    these win over it.

    Note there is no ``-B AIS`` here: that sets the modem for ONE channel, and
    would override only channel 0. The per-channel ``MODEM AIS`` lines in the
    config are what give both channels an AIS modem.
    """
    config = os.environ.get("DIREWOLF_CONFIG", "").strip() or _DIREWOLF_CONFIG
    command = ["direwolf", "-c", config, "-t", "0", "-r", "48000", "-b", "16", "-"]
    extra = os.environ.get("AIS_EXTRA_ARGS", "").strip()
    if extra:
        command.extend(shlex.split(extra))
    return command


def describe_direwolf_exit(status: int, ran_seconds: float) -> str | None:
    """Describe an abnormal Direwolf exit, or None when it looks normal.

    A healthy run ends when the backend stops serving PCM: Direwolf reaches EOF
    on stdin and exits 0, having decoded for as long as the session lasted. A
    non-zero status, or an exit within :data:`_STARTUP_SECONDS` of launch, means
    it never got as far as decoding — a missing or invalid config file and an
    unopenable audio output device both exit immediately. Those would otherwise
    show only as a silent relaunch every few seconds with no vessels ever
    arriving, so the caller logs whatever this returns.
    """
    if status != 0:
        return f"direwolf exited with status {status} after {ran_seconds:.1f}s"
    if ran_seconds < _STARTUP_SECONDS:
        return f"direwolf exited after only {ran_seconds:.1f}s without decoding"
    return None


def pump_pcm(pcm_sock: socket.socket, process: subprocess.Popen) -> None:  # pragma: no cover - thread/socket I/O
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


def _event_worker(ingest_url: str, secret: str, events: queue.Queue) -> None:  # pragma: no cover - thread
    """Drain parsed events and POST them, off the Direwolf read path."""
    while True:
        event = events.get()
        if event is None:
            return
        post_event(ingest_url, secret, event)


def handle_line(line: str, events: queue.Queue) -> None:
    """Turn one Direwolf stdout line into queued log + structured events.

    Recognised AIS frames are forwarded verbatim as a ``log`` event (the raw
    sentence view) and, when pyais can decode them, additionally as a structured
    ``ais`` event. Non-AIS chatter yields nothing. Events are dropped rather than
    blocking if the worker queue is full (the UI is a courtesy view; the vessel
    store is fed from the same POSTs, so a sustained overflow shows as a stale
    map rather than a stall).
    """
    extracted = extract_sentence(line)
    if extracted is None:
        return
    channel_label, sentence = extracted
    for event in (
        {"type": "log", "line": f"[{channel_label}] {sentence}"},
        parse_ais_sentence(sentence, channel_label),
    ):
        if event is None:
            continue
        try:
            events.put_nowait(event)
        except queue.Full:
            pass


def run_direwolf_once(events: queue.Queue, pcm_host: str, pcm_port: int) -> None:  # pragma: no cover - drives a subprocess
    """Run Direwolf once against the backend PCM feed until the feed ends.

    Connects to the backend PCM socket first; if the backend isn't serving yet
    (race between the config flip and the PCM listener), the connect fails and the
    caller retries. Direwolf's own output is echoed to stderr so the container log
    shows what it is doing.
    """
    try:
        pcm_sock = socket.create_connection((pcm_host, pcm_port), timeout=10)
    except OSError as exc:
        print(f"[ais] PCM connect to {pcm_host}:{pcm_port} failed: {exc}", file=sys.stderr, flush=True)
        return

    command = build_direwolf_command()
    print(f"[ais] launching: {' '.join(command)}", file=sys.stderr, flush=True)
    started = time.monotonic()
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
            status = process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            status = process.wait()
        problem = describe_direwolf_exit(status, time.monotonic() - started)
        if problem:
            print(
                f"[ais] {problem} — see Direwolf's output above; the supervisor "
                "will retry, but nothing decodes until this is fixed",
                file=sys.stderr,
                flush=True,
            )


def main() -> int:  # pragma: no cover - container entrypoint loop
    ingest_url = os.environ.get("INGEST_URL", "http://app:8000/api/sdr/ais/ingest")
    config_url = os.environ.get("CONFIG_URL", "http://app:8000/api/sdr/ais/config")
    pcm_host = os.environ.get("IQ_PCM_HOST", "app")
    pcm_port = int(os.environ.get("IQ_PCM_PORT", "7358"))

    secret = resolve_secret()
    if not secret:
        print(
            "[ais] no ingest secret (INGEST_SECRET / INGEST_SECRET_FILE) — refusing to start",
            file=sys.stderr,
            flush=True,
        )
        return 2

    # One background poster for the whole process lifetime (bounded queue, drops
    # when full so it never backpressures Direwolf).
    events: queue.Queue = queue.Queue(maxsize=256)
    threading.Thread(target=_event_worker, args=(ingest_url, secret, events), daemon=True).start()

    # Launch Direwolf only while an AIS session is serving PCM (config["active"]);
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
