"""Fetch amateur-radio metadata for every satellite in the Sentinel catalogue
from the SatNOGS DB and write it as JSON to disk.

Usage:
    python -m backend.scripts.fetch_amateur_radio_data \
        --app http://192.168.1.99:8080 \
        --out backend/data/amateur_radio_data.json

The output JSON is consumed by seed_amateur_radio_data.py which writes the
results into a Sentinel SQLite database. Splitting fetch from seed lets us
re-seed any DB file (dev / staging / prod) without re-hitting SatNOGS.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

_CTCSS_RE = re.compile(r"CTCSS\s+(\d{2,3}(?:\.\d)?)\s*Hz", re.IGNORECASE)

SATNOGS_URL = "https://db.satnogs.org/api/transmitters/?satellite__norad_cat_id={norad}"


def _http_get_json(url: str, timeout: float = 20.0) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "sentinel-radio-fetcher/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _fetch_amateur_list(app_base: str) -> list[dict[str, Any]]:
    data = _http_get_json(f"{app_base.rstrip('/')}/api/space/tle/list")
    sats = data.get("satellites") or []
    return [s for s in sats if (s.get("category") == "amateur")]


def _fetch_transmitters(norad_id: str) -> list[dict[str, Any]]:
    try:
        return _http_get_json(SATNOGS_URL.format(norad=norad_id))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise


def _summarise(transmitters: list[dict[str, Any]]) -> dict[str, Any]:
    """Reduce SatNOGS transmitters to a single radio-info record.

    Strategy:
      - radio_status   = 'active' if any alive transmitter has status='active',
                         else 'inactive' if all alive==False, else 'partial'.
      - downlink/uplink = take the first ACTIVE transmitter with both an uplink
                          and downlink (transponder), else first active downlink.
      - transponder_type = 'Linear'|'FM'|'Digital'|'Telemetry'|'SSTV'|'APRS' based
                           on best transmitter's mode and bandwidth.
      - beacon_hz       = downlink of any transmitter described as Beacon / CW / TLM.
      - packet_info     = description of any digital/packet/APRS/SSTV transmitter.
      - radio_notes     = comma-separated descriptions of all alive transmitters.
    """
    if not transmitters:
        return {"radio_status": "no data"}

    alive = [t for t in transmitters if t.get("alive")]
    any_active = any((t.get("status") == "active") for t in alive)
    if any_active:
        status = "active"
    elif not alive:
        status = "silent"
    else:
        status = "partial"

    out: dict[str, Any] = {"radio_status": status}

    # Pick a primary downlink + uplink for display
    primary = _pick_primary(alive)
    if primary:
        ulo = primary.get("uplink_low")
        dlo = primary.get("downlink_low")
        mode = primary.get("mode") or None
        if ulo:
            out["uplink_hz"] = int(ulo)
            out["uplink_mode"] = primary.get("uplink_mode") or mode
        if dlo:
            out["downlink_hz"] = int(dlo)
            out["downlink_mode"] = mode
        out["transponder_type"] = _classify_transponder(primary)

    # Beacon — any CW/telemetry transmitter, alive or otherwise
    beacon = _find_first(alive, lambda t: _is_beacon(t))
    if beacon and beacon.get("downlink_low"):
        out["beacon_hz"] = int(beacon["downlink_low"])

    # Packet / digital — separate field for APRS/digi/SSTV/DUV details
    packet = _find_first(alive, lambda t: _is_packet(t))
    if packet:
        parts: list[str] = []
        desc = (packet.get("description") or "").strip()
        mode = (packet.get("mode") or "").strip()
        baud = packet.get("baud")
        if desc:
            parts.append(desc)
        if mode and mode not in desc:
            parts.append(mode)
        if baud:
            parts.append(f"{int(baud)} baud")
        if packet.get("downlink_low") and packet.get("downlink_low") != out.get("downlink_hz"):
            parts.append(f"DL {packet['downlink_low']/1e6:.4f} MHz")
        out["packet_info"] = " · ".join(parts) or None

    # Compact one-line summary of all alive transmitters for the notes field
    descs = []
    for t in alive[:8]:
        d = (t.get("description") or "").strip()
        if d and d not in descs:
            descs.append(d)
    if descs:
        out["radio_notes"] = "; ".join(descs)

    # Pull CTCSS tone from descriptions if present (SatNOGS doesn't expose it as a field)
    for t in alive:
        desc = t.get("description") or ""
        m = _CTCSS_RE.search(desc)
        if m:
            try:
                out["ctcss_hz"] = float(m.group(1))
                break
            except ValueError:
                pass

    return out


def _pick_primary(alive: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Choose the most representative transmitter to show as the primary up/down link."""
    if not alive:
        return None
    # Prefer transceivers (both uplink + downlink) — these are repeaters/transponders
    transceivers = [t for t in alive if t.get("uplink_low") and t.get("downlink_low")
                    and (t.get("status") == "active")]
    if transceivers:
        # FM repeater first (most useful for casual operators), then Linear
        for pref in ("FM", "FMN"):
            for t in transceivers:
                if (t.get("mode") or "").upper().startswith(pref):
                    return t
        return transceivers[0]
    # Otherwise the first active downlink (telemetry beacon / one-way)
    downlinks = [t for t in alive if t.get("downlink_low") and (t.get("status") == "active")]
    if downlinks:
        return downlinks[0]
    return alive[0]


def _classify_transponder(t: dict[str, Any]) -> str | None:
    mode = (t.get("mode") or "").upper()
    desc = (t.get("description") or "").upper()
    has_up = bool(t.get("uplink_low"))
    has_dn = bool(t.get("downlink_low"))
    if has_up and has_dn:
        if "LINEAR" in desc or mode in ("SSB", "LSB", "USB", "CW", "LINEAR"):
            return "Linear"
        if mode in ("FM", "FMN") or "REPEATER" in desc or "PARROT" in desc:
            return "FM repeater"
        if "DIGI" in desc or "APRS" in desc or mode in ("AFSK", "GMSK", "FSK", "1K2 AFSK"):
            return "Digital repeater"
        return "Transponder"
    if has_dn and not has_up:
        if mode in ("CW",) or "BEACON" in desc:
            return "Beacon"
        if "SSTV" in desc or mode == "SSTV":
            return "SSTV"
        return "Telemetry"
    return None


def _is_beacon(t: dict[str, Any]) -> bool:
    desc = (t.get("description") or "").upper()
    mode = (t.get("mode") or "").upper()
    return ("BEACON" in desc or "CW" in desc or "TLM" in desc or "TELEMETRY" in desc
            or mode == "CW")


def _is_packet(t: dict[str, Any]) -> bool:
    desc = (t.get("description") or "").upper()
    mode = (t.get("mode") or "").upper()
    return ("APRS" in desc or "DIGI" in desc or "PACKET" in desc or "SSTV" in desc
            or mode in ("AFSK", "GMSK", "FSK", "G3RUH", "BPSK", "1K2 AFSK", "9K6 GMSK"))


def _find_first(seq, pred):
    for x in seq:
        if pred(x):
            return x
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch SatNOGS radio info for Sentinel amateur sats")
    ap.add_argument("--app", required=True, help="Base URL of running Sentinel app, e.g. http://192.168.1.99:8080")
    ap.add_argument("--out", required=True, help="Path to write JSON output")
    ap.add_argument("--sleep", type=float, default=0.25, help="Delay between SatNOGS requests (sec)")
    args = ap.parse_args()

    print(f"→ fetching amateur sat list from {args.app}", file=sys.stderr)
    sats = _fetch_amateur_list(args.app)
    print(f"  {len(sats)} amateur satellites found", file=sys.stderr)

    out: dict[str, dict[str, Any]] = {}
    for i, sat in enumerate(sats, 1):
        norad = sat["norad_id"]
        name = sat["name"]
        # Strip leading zeros — SatNOGS expects bare integer
        norad_int = str(int(norad))
        print(f"  [{i:>3}/{len(sats)}] {norad_int:>6} {name}", file=sys.stderr)
        try:
            txs = _fetch_transmitters(norad_int)
        except Exception as e:
            print(f"      ! SatNOGS error: {e}", file=sys.stderr)
            out[norad] = {"radio_status": "error", "radio_notes": f"SatNOGS fetch failed: {e}"}
            continue
        summary = _summarise(txs)
        summary["name"] = name
        summary["_transmitter_count"] = len(txs)
        out[norad] = summary
        time.sleep(args.sleep)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2, sort_keys=True))
    print(f"✓ wrote {len(out)} records to {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
