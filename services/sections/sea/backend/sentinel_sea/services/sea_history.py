"""Sea's position history: every vessel position the store ingests, gated and recorded.

The one seam is ``AisVesselStore.ingest_envelope``, which both sources feed
(AISStream online, the SDR AIS decoder off grid), so history needs no code per
source. The store's own source switch empties the *live* picture; history
keeps both, each sample tagged with the source that heard it.
"""

from __future__ import annotations

from typing import Any

from backend.database import AsyncSessionLocal
from backend.platform.history.recorder import HistoryRecorder, PositionSample, SampleGate
from backend.platform.history.retention import PruneTarget, RetentionLoop

from sentinel_sea.models import SeaPositionHistory

NAMESPACE = "sea"
# A seek shows every vessel heard in the half hour before it: the live store's
# own retention, and roughly the slowest class B reporting interval at anchor.
REPLAY_LOOKBACK_MS = 30 * 60 * 1000

# Class A ships underway report every 2–10 s; never store faster than 30 s,
# keep moves of 25 m (the live track's own threshold) or 20° turns, and keep a
# moored vessel alive on the timeline every 5 minutes.
recorder = HistoryRecorder(
    namespace=NAMESPACE,
    model=SeaPositionHistory,
    gate=SampleGate(min_interval_s=300, min_move_m=25, heading_change_deg=20, min_gap_s=30),
    session_factory=AsyncSessionLocal,
)
retention = RetentionLoop(NAMESPACE, [PruneTarget(SeaPositionHistory)], AsyncSessionLocal)


def record_vessel(record: dict[str, Any], source_mode: str) -> bool:
    """Offer one freshly ingested vessel record (the store's live shape) to the recorder."""
    if not recorder.enabled:
        return False
    heading = record.get("heading")
    if heading is None:
        heading = record.get("cog")
    extra = {
        key: value
        for key, value in {
            "name": record.get("name"),
            "type": record.get("type") or None,
            "typeLabel": record.get("typeLabel"),
            "family": record.get("family"),
            "navStatus": record.get("navStatus"),
            "cog": record.get("cog"),
            "destination": record.get("destination") or None,
            "callsign": record.get("callsign") or None,
        }.items()
        if value is not None
    }
    return recorder.offer(
        PositionSample(
            entity_id=str(record["mmsi"]),
            # The report's own time (AIS ``time_utc``), not when Sea received it.
            t_ms=int(record["lastPositionMs"]),
            lat=float(record["lat"]),
            lon=float(record["lon"]),
            heading=heading,
            speed=record.get("sog"),
            source_mode=source_mode,
            extra=extra or None,
        )
    )
