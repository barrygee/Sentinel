"""Generate backend/data/satellite_radio_extra.json — curated radio frequencies
for the NON-amateur satellite categories (weather, space stations incl. ISS
ham/EVA, cubesat, science, navigation, military), keyed by NORAD ID.

Amateur satellites are seeded separately from amateur_radio_data.json (SatNOGS).

Frequencies are public, well-documented values in Hz. Sources: NOAA/NESDIS,
EUMETSAT, JMA, KMA, CMA, ESA, AMSAT/ARISS, and the GPS/Galileo/GLONASS/BeiDou/
QZSS/NavIC signal-in-space ICDs. GNSS satellites broadcast on shared CDMA/FDMA
L-band signals, so each constellation's members get that constellation's
frequency set (beacon_hz = primary civil signal).

Run:  python backend/scripts/build_satellite_radio_extra.py
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "satellite_radio_extra.json"

# ── Individually curated satellites ──────────────────────────────────────────
# Each value: only the fields we know. Hz integers; modes free text.
CURATED: dict[str, dict] = {
    # ===== SPACE STATIONS =====
    "25544": {  # ISS (ZARYA)
        "downlink_hz": 145800000,
        "downlink_mode": "FM",
        "uplink_hz": 145990000,
        "uplink_mode": "FM",
        "beacon_hz": 145825000,
        "ctcss_hz": 67.0,
        "transponder_type": "FM",
        "radio_status": "active",
        "radio_notes": (
            "ISS ham radio (RS0ISS/NA1SS): V/V FM voice repeater 145.990 up "
            "(67.0 Hz CTCSS) / 437.800 down; APRS digipeater 145.825 (1k2 AFSK); "
            "SSTV 145.800 (PD120); ARISS school contacts 145.800 down / 144.490 up. "
            "EVA/spacewalk: US space-to-space UHF ~414.2 / 417.1 MHz (S-band relay "
            "via TDRS); Russian Orlan/Soyuz VHF 121.75 / 130.165 / 143.625 MHz."
        ),
    },
    "49044": {  # ISS (NAUKA)
        "radio_status": "active",
        "radio_notes": "ISS Nauka (MLM) module — part of the ISS complex; shares ISS comms (S-band TDRS, VHF).",
    },
    "36086": {  # POISK
        "radio_status": "active",
        "radio_notes": "ISS Poisk (MRM-2) module — part of the ISS complex; Russian-segment VHF/S-band.",
    },
    "48274": {  # CSS (TIANHE)
        "downlink_hz": 437600000,
        "downlink_mode": "FM",
        "transponder_type": "FM",
        "radio_status": "active",
        "radio_notes": "China Space Station core (Tianhe). Amateur UHF payload; TT&C via Tianlian (S/Ka-band relay). Feitian EVA suit UHF comms.",
    },
    "54216": {
        "radio_status": "active",
        "radio_notes": "CSS Mengtian lab module — part of the CSS complex (S/Ka-band TT&C via Tianlian).",
    },
    "53239": {
        "radio_status": "active",
        "radio_notes": "CSS Wentian lab module — part of the CSS complex (S/Ka-band TT&C via Tianlian).",
    },
    # ===== WEATHER — polar, direct-readout (listenable) =====
    # Note: the classic 137 MHz APT NOAA birds (NOAA-15/18/19) are not in this
    # catalogue; only NOAA-20/21 (JPSS, X-band) are present (handled below).
    "40069": {  # METEOR-M 2
        "downlink_hz": 137100000,
        "downlink_mode": "LRPT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Meteor-M N2 LRPT 137.100 MHz (digital QPSK 72k, SatDump); HRPT L-band 1700.0 MHz.",
    },
    "44387": {  # METEOR-M2 2
        "downlink_hz": 137900000,
        "downlink_mode": "LRPT",
        "transponder_type": "Telemetry",
        "radio_status": "partial",
        "radio_notes": "Meteor-M2-2 LRPT 137.900 MHz (intermittent history); HRPT L-band.",
    },
    "57166": {  # METEOR-M2 3
        "downlink_hz": 137900000,
        "downlink_mode": "LRPT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Meteor-M2-3 LRPT 137.900 MHz (QPSK); HRPT L-band 1700 MHz.",
    },
    "59051": {  # METEOR-M2 4
        "downlink_hz": 137100000,
        "downlink_mode": "LRPT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Meteor-M2-4 LRPT 137.100 MHz (QPSK); HRPT L-band.",
    },
    # ===== WEATHER — polar, L/X-band digital (not VHF) =====
    "38771": {
        "downlink_hz": 1701300000,
        "downlink_mode": "AHRPT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Metop-B AHRPT 1701.3 MHz L-band (no APT).",
    },
    "43689": {
        "downlink_hz": 1701300000,
        "downlink_mode": "AHRPT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Metop-C AHRPT 1701.3 MHz L-band (no APT).",
    },
    "43013": {
        "downlink_hz": 7812000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "NOAA-20 (JPSS-1) HRD X-band 7812 MHz; no APT/HRPT.",
    },
    "54234": {
        "downlink_hz": 7812000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "NOAA-21 (JPSS-2) HRD X-band 7812 MHz.",
    },
    "37849": {
        "downlink_hz": 7812000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Suomi NPP HRD X-band 7812 MHz.",
    },
    "32958": {
        "downlink_hz": 1704500000,
        "downlink_mode": "AHRPT",
        "transponder_type": "Telemetry",
        "radio_status": "inactive",
        "radio_notes": "FengYun-3A AHRPT L-band ~1704.5 MHz.",
    },
    "37214": {
        "downlink_hz": 1704500000,
        "downlink_mode": "AHRPT",
        "transponder_type": "Telemetry",
        "radio_status": "inactive",
        "radio_notes": "FengYun-3B AHRPT L-band ~1704.5 MHz.",
    },
    "39260": {
        "downlink_hz": 1704500000,
        "downlink_mode": "AHRPT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "FengYun-3C AHRPT L-band ~1704.5 MHz.",
    },
    "43010": {
        "downlink_hz": 1704500000,
        "downlink_mode": "AHRPT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "FengYun-3D AHRPT 1704.5 MHz; MPT X-band 7820 MHz.",
    },
    "49008": {
        "downlink_hz": 1704500000,
        "downlink_mode": "AHRPT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "FengYun-3E AHRPT L-band (early-morning orbit).",
    },
    # ===== WEATHER — geostationary imagers (L-band LRIT/HRIT/GRB) =====
    "41836": {
        "downlink_hz": 1694100000,
        "downlink_mode": "HRIT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Himawari-9 (JMA, geo) HRIT/LRIT L-band ~1694.1 MHz (HimawariCast).",
    },
    "40267": {
        "downlink_hz": 1694100000,
        "downlink_mode": "HRIT",
        "transponder_type": "Telemetry",
        "radio_status": "inactive",
        "radio_notes": "Himawari-8 (JMA, geo) — standby behind Himawari-9.",
    },
    "43823": {
        "downlink_hz": 1692140000,
        "downlink_mode": "LRIT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "GEO-KOMPSAT-2A / GK-2A (KMA, geo) LRIT/HRIT L-band ~1692.14 MHz.",
    },
    "38552": {
        "downlink_hz": 1691000000,
        "downlink_mode": "HRIT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Meteosat-10 / MSG-3 (EUMETSAT, geo) HRIT/LRIT L-band 1691/1695.15 MHz; EUMETCast.",
    },
    "40732": {
        "downlink_hz": 1691000000,
        "downlink_mode": "HRIT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Meteosat-11 / MSG-4 (EUMETSAT, geo) prime service; L-band 1691 MHz.",
    },
    "28912": {
        "downlink_hz": 1691000000,
        "downlink_mode": "HRIT",
        "transponder_type": "Telemetry",
        "radio_status": "inactive",
        "radio_notes": "Meteosat-9 / MSG-2 (EUMETSAT, geo) backup/rapid-scan; L-band 1691 MHz.",
    },
    "54743": {
        "downlink_hz": 1686000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Meteosat-12 / MTG-I1 (EUMETSAT, geo) FCI via EUMETCast; raw downlink Ka-band.",
    },
    "35491": {
        "downlink_hz": 1694100000,
        "downlink_mode": "HRIT",
        "transponder_type": "Telemetry",
        "radio_status": "inactive",
        "radio_notes": "GOES-14 (NOAA, geo) on-orbit storage; legacy GVAR/HRIT L-band.",
    },
    "36411": {
        "downlink_hz": 1694100000,
        "downlink_mode": "LRIT",
        "transponder_type": "Telemetry",
        "radio_status": "inactive",
        "radio_notes": "EWS-G2 (ex-GOES-15) — USSF; legacy L-band imagery.",
    },
    "41866": {
        "downlink_hz": 1686600000,
        "downlink_mode": "GRB",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "GOES-16 (GOES-East legacy/standby). GRB L-band 1686.6 MHz; HRIT 1694.1 MHz.",
    },
    "43226": {
        "downlink_hz": 1686600000,
        "downlink_mode": "GRB",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "GOES-17 (GOES-West legacy). GRB L-band 1686.6 MHz; HRIT 1694.1 MHz.",
    },
    "51850": {
        "downlink_hz": 1686600000,
        "downlink_mode": "GRB",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "GOES-18 (GOES-West operational). GRB 1686.6 MHz; HRIT 1694.1 MHz.",
    },
    "60133": {
        "downlink_hz": 1686600000,
        "downlink_mode": "GRB",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "GOES-19 (GOES-East operational). GRB 1686.6 MHz; HRIT 1694.1 MHz.",
    },
    "39216": {
        "downlink_hz": 1691000000,
        "downlink_mode": "LRIT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "INSAT-3D (ISRO/IMD, geo) LRIT/meteorological data L-band ~1691 MHz.",
    },
    "41752": {
        "downlink_hz": 1691000000,
        "downlink_mode": "LRIT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "INSAT-3DR (ISRO/IMD, geo) L-band ~1691 MHz.",
    },
    "58990": {
        "downlink_hz": 1691000000,
        "downlink_mode": "LRIT",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "INSAT-3DS (ISRO/IMD, geo) L-band meteorological data.",
    },
    # ===== SCIENCE — well-known downlinks =====
    "20580": {
        "downlink_hz": 2287500000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Hubble Space Telescope — S-band TT&C via TDRS (~2287.5 MHz); science data S/Ku-band.",
    },
    "25867": {
        "downlink_hz": 2250000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Chandra X-ray Observatory (CXO) — DSN S-band TT&C.",
    },
    "25994": {
        "downlink_hz": 8212500000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Terra (EOS AM-1) — direct broadcast X-band 8212.5 MHz; S-band TT&C.",
    },
    "26998": {
        "downlink_hz": 2287500000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "TIMED — S-band TT&C ~2287.5 MHz.",
    },
    "36395": {
        "downlink_hz": 2245000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "SDO (Solar Dynamics Observatory, geo) — Ka-band science 26.5 GHz; S-band TT&C.",
    },
    "33053": {
        "downlink_hz": 2245500000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Fermi Gamma-ray (FGST/GLAST) — S-band TT&C via TDRS.",
    },
    "28485": {
        "downlink_hz": 2272500000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Swift — S-band TT&C; Malindi ground station.",
    },
    "38358": {
        "downlink_hz": 8025000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "NuSTAR — X-band science downlink; S-band TT&C.",
    },
    "25989": {
        "downlink_hz": 2263000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "XMM-Newton (ESA, HEO) — S-band TT&C.",
    },
    "39197": {
        "downlink_hz": 2280000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "inactive",
        "radio_notes": "IRIS solar observatory — S-band TT&C.",
    },
    "39452": {
        "downlink_hz": 2215000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Swarm-A (ESA geomagnetic) — S-band TT&C ~2215 MHz.",
    },
    "39451": {
        "downlink_hz": 2215000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Swarm-B (ESA geomagnetic) — S-band TT&C.",
    },
    "39453": {
        "downlink_hz": 2215000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Swarm-C (ESA geomagnetic) — S-band TT&C.",
    },
    "36508": {
        "downlink_hz": 2278000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "CryoSat-2 (ESA) — X-band science 8100 MHz; S-band TT&C.",
    },
    "43194": {
        "downlink_hz": 2280000000,
        "downlink_mode": "DIGITAL",
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Zhangheng-1 (CSES-1) — S-band TT&C; also carries amateur-coordinated science.",
    },
    # ===== MILITARY — limited public data =====
    "39088": {
        "beacon_hz": 0,
        "transponder_type": "Telemetry",
        "radio_status": "active",
        "radio_notes": "Sapphire (Canadian SSA) — military space-surveillance optical payload; TT&C not publicly published. No open-listen downlink.",
    },
    "31797": {
        "transponder_type": "Radar",
        "radio_status": "active",
        "radio_notes": "SAR-Lupe 2 (German recon) — X-band SAR radar; comms/TT&C classified. No public downlink.",
    },
}

# ── GNSS constellations: assign each member its constellation's L-band set ────
# beacon_hz holds the primary civil signal; radio_notes lists the full set.
GNSS_GROUPS = {
    "GPS": {
        "match_prefixes": ("NAVSTAR",),
        "beacon_hz": 1575420000,
        "radio_notes": "GPS L-band (CDMA): L1 C/A & L1C 1575.42, L2 1227.60, L5 1176.45 MHz. Receive-only navigation signals.",
        "transponder_type": "Navigation",
    },
    "GALILEO": {
        "match_prefixes": ("GSAT0",),
        "beacon_hz": 1575420000,
        "radio_notes": "Galileo (CDMA): E1 1575.42, E5a 1176.45, E5b 1207.14, E5 AltBOC 1191.795, E6 1278.75 MHz.",
        "transponder_type": "Navigation",
    },
    "GLONASS": {
        "match_prefixes": ("COSMOS",),
        "match_contains": ("GLONASS",),
        "beacon_hz": 1602000000,
        "radio_notes": "GLONASS (FDMA L1 ~1598-1606, L2 ~1242-1249 MHz); GLONASS-K/K2 add CDMA L3OC 1202.025 MHz.",
        "transponder_type": "Navigation",
    },
    "BEIDOU": {
        "match_prefixes": ("BEIDOU",),
        "beacon_hz": 1561098000,
        "radio_notes": "BeiDou (CDMA): B1I 1561.098, B1C 1575.42, B2a 1176.45, B2b 1207.14, B3I 1268.52 MHz.",
        "transponder_type": "Navigation",
    },
    "QZSS": {
        "match_prefixes": ("QZS-",),
        "beacon_hz": 1575420000,
        "radio_notes": "QZSS (CDMA, GPS-interoperable): L1C/A & L1C 1575.42, L2C 1227.60, L5 1176.45, L6/LEX 1278.75 MHz.",
        "transponder_type": "Navigation",
    },
    "IRNSS": {
        "match_prefixes": ("IRNSS", "NVS-"),
        "beacon_hz": 1176450000,
        "radio_notes": "NavIC/IRNSS: L5 1176.45 MHz and S-band 2492.028 MHz (RHCP).",
        "transponder_type": "Navigation",
    },
}


def gnss_for_name(name: str) -> dict | None:
    up = name.upper()
    for group in GNSS_GROUPS.values():
        contains = group.get("match_contains")
        if contains and not any(c in up for c in contains):
            continue
        if any(up.startswith(p) for p in group["match_prefixes"]):
            return {
                "beacon_hz": group["beacon_hz"],
                "downlink_hz": group["beacon_hz"],
                "downlink_mode": "CDMA" if "FDMA" not in group["radio_notes"] else "FDMA",
                "transponder_type": group["transponder_type"],
                "radio_status": "active",
                "radio_notes": group["radio_notes"],
            }
    return None


def main() -> None:
    import sqlite3

    # Navigation roster: prefer a JSON dump (from the live container DB) at
    # /tmp/nav_roster.json; else fall back to a local sqlite DB. If neither is
    # available, GNSS auto-assignment is skipped and only CURATED entries write.
    nav_rows: list[tuple[str, str]] = []
    roster = Path("/tmp/nav_roster.json")
    if roster.exists():
        nav_rows = [tuple(r) for r in json.loads(roster.read_text())]
    else:
        for db_path in ("backend/sentinel.db",):
            try:
                conn = sqlite3.connect(db_path)
                nav_rows = conn.execute(
                    "SELECT norad_id, name FROM satellite_catalogue WHERE category='navigation'"
                ).fetchall()
                conn.close()
                break
            except Exception:
                continue

    data: dict[str, dict] = {}
    data["_comment"] = (
        "Curated radio frequencies for non-amateur categories, keyed by NORAD ID. "
        "Frequencies in Hz. GNSS entries are auto-assigned per constellation from "
        "public ICDs. Amateur sats are seeded from amateur_radio_data.json. "
        "Generated by backend/scripts/build_satellite_radio_extra.py."
    )
    data.update(CURATED)

    matched = 0
    for nid, name in nav_rows:
        entry = gnss_for_name(name)
        if entry and nid not in data:
            data[nid] = entry
            matched += 1

    OUT.write_text(json.dumps(data, indent=2) + "\n")
    real = sum(1 for k in data if not k.startswith("_"))
    print(f"wrote {OUT} — {real} satellites ({len(CURATED)} curated + {matched} GNSS auto-assigned)")


if __name__ == "__main__":
    main()
