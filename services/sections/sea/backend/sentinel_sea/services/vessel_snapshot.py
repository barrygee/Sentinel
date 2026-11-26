"""Sea's vessel snapshot: the one read both its consumers share.

The map's `GET /api/sea/vessels` (and `/api/sea/status`) and the globe's
`sea.globe.snapshot` bus request both go through `active_feed` and
`vessel_snapshot`, so whichever feed the domain is set to is nudged the same
way (and AISStream is never dialled off grid), and the rows come from the same
store query, newest position first.
"""

from __future__ import annotations

from backend.cache import now_ms
from backend.config import settings as app_settings
from backend.platform.bus import bus
from backend.utils import resolve_effective_mode
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sea.services import ais_store, ais_stream

Bbox = tuple[float, float, float, float]
"""``(south, west, north, east)`` in degrees; west > east crosses the antimeridian."""


def parse_bbox(raw: str | None) -> Bbox | None:
    """Parse ``south,west,north,east`` degrees; None when empty, `ValueError` when malformed."""
    if raw is None or raw.strip() == "":
        return None
    parts = raw.split(",")
    if len(parts) != 4:
        raise ValueError("bbox must be south,west,north,east")
    try:
        south, west, north, east = (float(part) for part in parts)
    except ValueError as exc:
        raise ValueError("bbox values must be numbers") from exc
    if not (-90 <= south <= north <= 90) or abs(west) > 180 or abs(east) > 180:
        raise ValueError("bbox out of range")
    return south, west, north, east


async def _offgrid_decode_snapshot() -> dict[str, object]:
    """Feed status for the off-grid source: the SDR AIS decode bridge.

    Shaped exactly like :meth:`AisStreamReader.snapshot` — same keys, same
    status vocabulary — so the map's status line and the store's ``SeaFeedInfo``
    read one contract whichever source is live, and only ``mode`` says which one
    produced it. The statuses are chosen for what the operator can DO about them:

      * ``no-source``  — no radio picked yet: nothing can ever arrive (actionable)
      * ``down``       — bridge running but the sidecar container isn't connected
      * ``stale``      — decoding, but the radio has been moved off 162 MHz, so
                         only silence is reaching Direwolf until it retunes
      * ``live``       — on channel with the decoder attached

    The retune case is deliberately not ``live``: the vessel picture is going
    stale either way, and calling it live would hide the one fault the operator
    can actually see and fix.

    Reads the bridge's state over the bus (``hub.decode.ais.status``, B3)
    rather than importing ``radio_hub.services.sdr_decode`` directly, so Sea never reads
    the decode bridge in-process.
    """
    bridge_state = await bus.request("hub.decode.ais.status", {})
    running = bool(bridge_state["running"])
    on_channel = bool(bridge_state["on_channel"])
    decoder_reachable = bool(bridge_state["decoder_reachable"])
    if not running:
        status, error = "no-source", "No off-grid AIS receiver selected"
    elif not decoder_reachable:
        status, error = "down", "The AIS decoder container is not connected"
    elif not on_channel:
        status, error = "stale", "The radio has been tuned away from the AIS channels"
    else:
        status, error = "live", None
    newest_position_ms = ais_store.store.newest_position_ms
    return {
        "mode": "offgrid",
        "source": "SDR off-grid AIS decode",
        "status": status,
        "error": error,
        "lastMessageAt": newest_position_ms,
        "silentForMs": (now_ms() - newest_position_ms) if newest_position_ms is not None else None,
        "reconnectAttempt": 0,
        "nextAttemptAt": None,
        "staleAfterMs": app_settings.sea_ais_silence_report_ms,
        "retentionMs": app_settings.sea_ais_stale_ms,
        "newestPositionAt": newest_position_ms,
        "vesselCount": len(ais_store.store),
        # Off-grid-only diagnostics, for Settings › SEA and the sidecar README's
        # troubleshooting steps. Absent from the online snapshot.
        "decoderReachable": decoder_reachable,
        "onChannel": on_channel,
        "channelAHz": bridge_state["channel_a_hz"],
        "channelBHz": bridge_state["channel_b_hz"],
    }


async def active_feed(db: AsyncSession) -> dict[str, object]:
    """Nudge whichever feed the Sea domain is configured to use, and describe it.

    Online is the AISStream WebSocket (``reader.ensure`` also serves as the
    "someone is looking" nudge that skips the background tick's wait). Off grid
    it is the SDR decode bridge, which must NOT dial AISStream — the whole point
    of off-grid mode is that there is no internet to reach it on, and an
    unreachable upstream would otherwise burn the reconnect ladder and log auth
    probes forever.
    """
    mode = await resolve_effective_mode("sea", db)
    # Also checked by the reader's tick; doing it here too means the first poll
    # after a switch never serves the previous source's vessels.
    await ais_store.store.switch_source(mode)
    if mode == "offgrid":
        return await _offgrid_decode_snapshot()
    # Through the module, not a name imported from it, so the reader in use
    # is the one `ais_stream` holds (tests swap it).
    await ais_stream.reader.ensure()
    return {"mode": "online", **ais_stream.reader.snapshot()}


async def vessel_snapshot(
    db: AsyncSession, max_rows: int, bbox: Bbox | None
) -> tuple[list[dict[str, object]], dict[str, object]]:
    """The vessels inside `bbox` (everywhere when None), at most `max_rows`, plus the active feed's status.

    The feed is nudged first, so the first poll after a connectivity switch
    never serves the previous source's vessels.
    """
    feed = await active_feed(db)
    return ais_store.store.vessels(max_rows, bbox), feed
