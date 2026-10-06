"""Server-side squawk alerts: notice emergency squawks with no browser open.

Plan: docs/plans/adsb-server-alerts.md. Three parts, all Air's:

- `SquawkTracker` is handed every aircraft snapshot Air fetches (the router's
  fetches for the map, and the watcher's own) and publishes
  `air.squawk.changed` on the event bus whenever an aircraft's squawk differs
  from the last one seen.
- `_on_squawk_changed` turns a change to or from an emergency code into a core
  notification (`notifications.raise`), which core stores and pushes to every
  open browser.
- `AdsbWatcher` fetches a snapshot itself, around the receiver (off grid) or
  the operator's location (online), only while no browser is fetching.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx
from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.db_helpers import get_setting
from backend.platform.bus import EventPayload, bus
from backend.services import adsb as adsb_service
from backend.services import adsb_source
from backend.services.upstream_rate_limit import UpstreamThrottledError
from backend.utils import resolve_domain_urls, resolve_effective_mode
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SQUAWK_CHANGED_SUBJECT = "air.squawk.changed"
NOTIFICATIONS_RAISE_SUBJECT = "notifications.raise"

EMERGENCY_SQUAWKS: dict[str, str] = {
    "7700": "General Emergency",
    "7600": "Radio Failure / Lost Comm",
    "7500": "Hijacking / Unlawful Interference",
}

FORGET_AFTER_MS = 10 * 60 * 1000
"""An aircraft unseen this long is forgotten. Snapshots cover different areas
(the map follows the browser; the watcher stays home), so missing from one is
not "gone" — forgetting at once would alert again when it reappeared."""

WATCH_TICK_S = 5.0
"""How often the watcher checks whether it has to fetch."""


def _now_ms() -> int:
    return int(time.time() * 1000)


def callsign_of(aircraft: dict[str, Any]) -> str:
    """Flight number, else registration, else hex — as the map labels it."""
    return (aircraft.get("flight") or "").strip() or (aircraft.get("r") or "").strip() or aircraft["hex"]


class SquawkTracker:
    """Last squawk seen per aircraft; publishes each change."""

    def __init__(self) -> None:
        self._squawks: dict[str, tuple[str, int]] = {}
        self.last_observed_ms = 0
        # When a browser last asked for aircraft, whatever the answer. A map
        # served from cache, or whose fetch was throttled, is still a map that
        # is open — and still spending the upstream's rate budget.
        self.last_browser_poll_ms = 0

    def browser_polled(self) -> None:
        """Note that a browser asked for aircraft, which keeps the watcher idle."""
        self.last_browser_poll_ms = _now_ms()

    async def observe(self, snapshot: dict[str, Any], db: AsyncSession) -> None:
        """Compare a snapshot (`{"ac": [...]}`) with what was seen before.

        The first sighting of an aircraft counts as a change only when it is
        already squawking an emergency, as on the map before this moved here.
        """
        now = _now_ms()
        self.last_observed_ms = now
        for aircraft in snapshot.get("ac") or []:
            hex_code = aircraft.get("hex")
            if not hex_code:
                continue
            squawk = aircraft.get("squawk") or ""
            seen = self._squawks.get(hex_code)
            previous = seen[0] if seen else None
            self._squawks[hex_code] = (squawk, now)
            if squawk == previous or (previous is None and squawk not in EMERGENCY_SQUAWKS):
                continue
            await bus.publish(
                SQUAWK_CHANGED_SUBJECT,
                {
                    "hex": hex_code,
                    "callsign": callsign_of(aircraft),
                    "squawk": squawk,
                    "previous": previous,
                    "alt_baro": aircraft.get("alt_baro"),
                    "gs": aircraft.get("gs"),
                    "lat": aircraft.get("lat"),
                    "lon": aircraft.get("lon"),
                    "ts": now,
                    "db": db,
                },
            )
        self._forget_unseen(now)

    def _forget_unseen(self, now: int) -> None:
        for hex_code in [code for code, (_, seen_at) in self._squawks.items() if now - seen_at > FORGET_AFTER_MS]:
            del self._squawks[hex_code]


tracker = SquawkTracker()


def emergency_detail(squawk: str, alt_baro: Any, ground_speed: Any) -> str:
    """`SQK 7700 — General Emergency · ALT 12,000 ft · GS 420 kt`.

    No date/time: the alert card shows its own, in the viewer's time zone.
    """
    parts = [f"SQK {squawk} — {EMERGENCY_SQUAWKS[squawk]}"]
    # alt_baro is a number, or "ground" on the ground.
    parts.append(f"ALT {alt_baro:,} ft" if isinstance(alt_baro, int | float) and alt_baro > 0 else "ON GROUND")
    if ground_speed:
        parts.append(f"GS {round(ground_speed)} kt")
    return " · ".join(parts)


async def _on_squawk_changed(payload: EventPayload) -> None:
    """Raise an alert for a squawk change to or from an emergency code."""
    squawk = payload["squawk"]
    previous = payload["previous"]
    if squawk in EMERGENCY_SQUAWKS:
        alert_type = "emergency"
        detail = emergency_detail(squawk, payload.get("alt_baro"), payload.get("gs"))
    elif previous in EMERGENCY_SQUAWKS:
        alert_type = "squawk-clr"
        detail = f"Squawk changed to {squawk or '(none)'}"
    else:
        return
    await bus.publish(
        NOTIFICATIONS_RAISE_SUBJECT,
        {
            "msg_id": f"adsb-squawk:{payload['hex']}:{squawk or 'none'}:{payload['ts']}",
            "type": alert_type,
            "title": payload["callsign"],
            "detail": detail,
            "ts": payload["ts"],
            "hex": payload["hex"],
            "db": payload["db"],
        },
    )


bus.subscribe(SQUAWK_CHANGED_SUBJECT, _on_squawk_changed)


async def _parse_location(db: AsyncSession) -> tuple[float, float] | None:
    """Settings › App › Location as `(lat, lon)`, or None while it is unset."""
    location = await get_setting(db, "app", "location", default=None)
    if not isinstance(location, dict):
        return None
    try:
        return float(location["latitude"]), float(location["longitude"])
    except (KeyError, TypeError, ValueError):
        return None


async def watch_area(db: AsyncSession) -> tuple[float, float] | None:
    """Where the watcher looks: the receiver off grid (else the operator's
    location), the operator's location online; None leaves the watcher idle."""
    if await resolve_effective_mode("air", db) == "offgrid":
        try:
            receiver = await adsb_source.receiver_location(db)
        except (LookupError, TimeoutError):
            # No radio hub answering: fall back to the operator's location.
            receiver = None
        if receiver is not None:
            return receiver
    return await _parse_location(db)


async def watch_once(db: AsyncSession) -> bool:
    """Fetch one snapshot for the tracker unless a browser polled, or a snapshot arrived, recently.

    Returns whether a snapshot was observed.
    """
    # Idle while a browser is polling, not just while its fetches succeed: when
    # the upstream is slow or rate-limiting, the map's requests are answered
    # from cache, and a watcher fetching then takes the rate budget the map's
    # next fetch needed — which then falls back to an empty off-grid list.
    last_activity_ms = max(tracker.last_observed_ms, tracker.last_browser_poll_ms)
    if _now_ms() - last_activity_ms < settings.adsb_watch_idle_s * 1000:
        return False
    area = await watch_area(db)
    if area is None:
        return False
    primary_url, fallback_url = await resolve_domain_urls(
        "air", db, online_default=settings.adsb_upstream_base, offgrid_default=settings.adsb_offgrid_url
    )
    lat, lon = area
    for base_url in filter(None, [primary_url, fallback_url]):
        try:
            snapshot = await adsb_service.fetch_aircraft(lat, lon, settings.adsb_watch_radius_nm, base_url)
        except (UpstreamThrottledError, httpx.HTTPError):
            # The map's own fetches log upstream trouble; try the next source
            # and otherwise wait for the next tick.
            continue
        await tracker.observe(snapshot, db)
        return True
    return False


class AdsbWatcher:
    """Background task running `watch_once` every `WATCH_TICK_S`."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None

    async def _run(self) -> None:
        while True:
            try:
                async with AsyncSessionLocal() as db:
                    await watch_once(db)
            except Exception:
                logger.exception("ADS-B squawk watcher pass failed")
            await asyncio.sleep(WATCH_TICK_S)


watcher = AdsbWatcher()
