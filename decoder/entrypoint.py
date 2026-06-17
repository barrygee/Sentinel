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
    INGEST_SECRET                  shared secret for the ingest endpoint
    RADIO_ID                       radio id the decode session belongs to
    DSD_EXTRA_ARGS                 optional extra dsd-fme args (space-separated)
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import urllib.error
import urllib.request

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


def post_event(ingest_url: str, secret: str, radio_id: int, event: dict) -> bool:
    """POST one event to the backend ingest endpoint. Returns success."""
    payload = json.dumps({"radio_id": radio_id, "event": event}).encode("utf-8")
    request = urllib.request.Request(
        ingest_url,
        data=payload,
        headers={"Content-Type": "application/json", "X-Decode-Secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, OSError) as exc:
        print(f"[decoder] ingest POST failed: {exc}", file=sys.stderr, flush=True)
        return False


def build_dsd_command() -> list[str]:
    """Assemble the dsd-fme command line from the environment."""
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
    extra = os.environ.get("DSD_EXTRA_ARGS", "").strip()
    if extra:
        command.extend(shlex.split(extra))
    return command


def main() -> int:
    ingest_url = os.environ.get("INGEST_URL", "http://app:8000/api/sdr/decode/ingest")
    secret = os.environ.get("INGEST_SECRET", "")
    radio_id = int(os.environ.get("RADIO_ID", "0") or "0")
    if not secret:
        print(
            "[decoder] INGEST_SECRET is not set — refusing to start",
            file=sys.stderr,
            flush=True,
        )
        return 2

    # Announce the vocoder this image was built with (always software mbelib for
    # dsd-fme), so the UI can show that voice decode is available.
    post_event(
        ingest_url, secret, radio_id, {"type": "decode_status", "vocoder": "mbelib"}
    )

    command = build_dsd_command()
    print(f"[decoder] launching: {' '.join(command)}", file=sys.stderr, flush=True)
    process = subprocess.Popen(  # noqa: S603 - command built from trusted env, not user input
        command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
    )
    assert process.stdout is not None
    try:
        for line in process.stdout:
            event = parse_dsd_line(line)
            if event is not None:
                post_event(ingest_url, secret, radio_id, event)
    except KeyboardInterrupt:
        pass
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
    return process.returncode or 0


if __name__ == "__main__":  # pragma: no cover - container entrypoint
    sys.exit(main())
