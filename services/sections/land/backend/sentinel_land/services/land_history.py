"""Land's position history: every APRS position fix the station store upserts, gated and recorded.

APRS reaches Land only off-air (the radio hub's Direwolf decoder), so every
sample is tagged 'offgrid' whatever the global connectivity mode says.
"""

from __future__ import annotations

from backend.database import AsyncSessionLocal
from backend.platform.history.recorder import HistoryRecorder, PositionSample, SampleGate
from backend.platform.history.retention import PruneTarget, RetentionLoop

from sentinel_land.models import LandPositionHistory

NAMESPACE = "land"
SOURCE_MODE = "offgrid"
# Fixed stations beacon every 10–30 minutes; a seek shows any heard in the half
# hour before it (the map then applies the live retention setting on top).
REPLAY_LOOKBACK_MS = 30 * 60 * 1000

# APRS is low volume, so nearly every fix is kept: digipeated copies of one
# beacon (seconds apart) are skipped by the 5 s gap, and a station that hasn't
# moved still gets a point a minute when it beacons that often.
recorder = HistoryRecorder(
    namespace=NAMESPACE,
    model=LandPositionHistory,
    gate=SampleGate(min_interval_s=60, min_move_m=10, heading_change_deg=20, min_gap_s=5),
    session_factory=AsyncSessionLocal,
)
retention = RetentionLoop(NAMESPACE, [PruneTarget(LandPositionHistory)], AsyncSessionLocal)


def record_station(station: dict, heard_ms: int) -> bool:
    """Offer one station fix (``aprs_store.station_from_event``'s shape) to the recorder."""
    if not recorder.enabled:
        return False
    extra = {key: station.get(key) for key in ("symbol", "comment", "path") if station.get(key) is not None}
    return recorder.offer(
        PositionSample(
            entity_id=str(station["callsign"]),
            t_ms=heard_ms,
            lat=float(station["latitude"]),
            lon=float(station["longitude"]),
            alt=station.get("altitude"),
            heading=station.get("course"),
            speed=station.get("speed"),
            source_mode=SOURCE_MODE,
            extra=extra or None,
        )
    )
