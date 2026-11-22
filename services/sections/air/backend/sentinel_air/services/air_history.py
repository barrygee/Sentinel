"""Air's position history: every ADS-B snapshot Air already fetches, gated and recorded.

Nothing here fetches. Both places a snapshot arrives — a browser's poll
(``router.get_aircraft_near_point``) and the idle squawk watcher
(``adsb_squawk.watch_once``) — hand it to :func:`record_snapshot` with the
source it came from, so recording costs no extra calls against the online
feed's daily quota, and online and off-grid snapshots land in one history.
"""

from __future__ import annotations

from typing import Any

from backend.database import AsyncSessionLocal
from backend.platform.history.recorder import HistoryRecorder, PositionSample, SampleGate
from backend.platform.history.retention import PruneTarget, RetentionLoop

from sentinel_air.models import AirPositionHistory

NAMESPACE = "air"
# Off grid with recording on, the watcher fetches at least this often while no
# browser is open (there is no quota off grid; readsb's own limit still applies).
OFFGRID_RECORDING_WATCH_INTERVAL_S = 10.0
# A seek shows every aircraft heard in the minute before it, as the live map would.
REPLAY_LOOKBACK_MS = 60_000

# Cruising aircraft are thinned to one point per 10 s / 200 m; turns and
# climbs keep their shape through the heading and altitude thresholds.
recorder = HistoryRecorder(
    namespace=NAMESPACE,
    model=AirPositionHistory,
    gate=SampleGate(min_interval_s=10, min_move_m=200, heading_change_deg=20, altitude_change_ft=1000),
    session_factory=AsyncSessionLocal,
)
retention = RetentionLoop(NAMESPACE, [PruneTarget(AirPositionHistory)], AsyncSessionLocal)


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def observed_at_ms(snapshot_now_ms: int, aircraft: dict[str, Any]) -> int:
    """When this aircraft's position was heard: the snapshot time less its position age.

    ``seen_pos`` (seconds since the last position) is what dates the fix; a
    cached snapshot re-offered later therefore carries the same times and is
    refused as a duplicate.
    """
    age_s = _number(aircraft.get("seen_pos"))
    if age_s is None:
        age_s = _number(aircraft.get("seen")) or 0.0
    return int(snapshot_now_ms - max(0.0, age_s) * 1000)


def sample_from_aircraft(aircraft: dict[str, Any], snapshot_now_ms: int, source_mode: str) -> PositionSample | None:
    """One aircraft of a v2/readsb snapshot as a history sample, or None without a usable position."""
    hex_code = aircraft.get("hex")
    lat, lon = _number(aircraft.get("lat")), _number(aircraft.get("lon"))
    if not isinstance(hex_code, str) or not hex_code or lat is None or lon is None:
        return None
    altitude = aircraft.get("alt_baro")
    extra = {
        key: value
        for key, value in {
            "flight": (aircraft.get("flight") or "").strip() or None,
            "squawk": aircraft.get("squawk"),
            "category": aircraft.get("category"),
            "r": aircraft.get("r"),
            "t": aircraft.get("t"),
            # Kept raw: "ground" is a value the map draws differently.
            "alt_baro": altitude,
        }.items()
        if value is not None
    }
    return PositionSample(
        entity_id=hex_code.lower(),
        t_ms=observed_at_ms(snapshot_now_ms, aircraft),
        lat=lat,
        lon=lon,
        alt=_number(altitude),
        heading=_number(aircraft.get("track")),
        speed=_number(aircraft.get("gs")),
        source_mode=source_mode,
        extra=extra or None,
    )


def record_snapshot(snapshot: dict[str, Any], source_mode: str, fetched_at_ms: int) -> int:
    """Offer every positioned aircraft in `snapshot` to the recorder. Returns how many were kept.

    `fetched_at_ms` stands in for the snapshot's own ``now`` when a source
    leaves it out.
    """
    if not recorder.enabled:
        return 0
    snapshot_now = _number(snapshot.get("now"))
    now_ms = int(snapshot_now) if snapshot_now else fetched_at_ms
    kept = 0
    for aircraft in snapshot.get("ac") or []:
        if not isinstance(aircraft, dict):
            continue
        sample = sample_from_aircraft(aircraft, now_ms, source_mode)
        if sample is not None and recorder.offer(sample):
            kept += 1
    return kept
