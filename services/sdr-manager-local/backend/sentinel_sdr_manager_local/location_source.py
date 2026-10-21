"""This machine's position, read from Sentinel's own Location setting (ADR 0007).

Sentry stored a fixed position of its own, typed into its console. SDR Manager
does not: the machine running it already has a position, Sentinel's Location
setting (`app.location`, in core), and a second copy would only drift from it.
So `GET /api/status`, `GET /api/v1/sdrs` and the SSE snapshot publish core's
value instead — in SDR Manager-only mode too, where the trimmed Settings keep
the Location item for exactly this.

Requests never wait on core. A background loop reads the setting every
`location_refresh_s` and keeps the **last good value**: dongles keep streaming
while core is down (`serve_before_core`), and a core outage must not make this
machine vanish from every other Sentinel's map. Until the first read succeeds
the position is unset, which is also what a blank setting means.
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any

from backend.platform import settings_client
from pydantic import ValidationError

from sentinel_sdr_manager_local.interfaces.clock import Clock
from sentinel_sdr_manager_local.schemas.location import SdrManagerLocation

logger = logging.getLogger(__name__)

LOCATION_NAMESPACE = "app"
LOCATION_KEY = "location"


def parse_location_setting(value: Any) -> tuple[float, float] | None:
    """`(latitude, longitude)` from the `app.location` setting, or `None` when it is unset.

    The setting holds strings as typed into Settings (`{"latitude": "", "longitude": ""}`
    on a fresh install), though numbers are accepted too. Anything that isn't a
    complete, finite pair is treated as unset rather than half-published.
    """
    if not isinstance(value, dict):
        return None
    coordinates: list[float] = []
    for key in ("latitude", "longitude"):
        raw_coordinate = value.get(key)
        if raw_coordinate is None or isinstance(raw_coordinate, bool):
            return None
        if isinstance(raw_coordinate, str):
            raw_coordinate = raw_coordinate.strip()
            if not raw_coordinate:
                return None
        try:
            coordinate = float(raw_coordinate)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(coordinate):
            return None
        coordinates.append(coordinate)
    return coordinates[0], coordinates[1]


class CoreLocationSource:
    """Serves the last position read from core, refreshed in the background."""

    def __init__(self, clock: Clock, refresh_interval_s: float) -> None:
        self._clock = clock
        self._refresh_interval_s = refresh_interval_s
        self._location = SdrManagerLocation()
        # Logged once per outage, not on every failed refresh.
        self._core_unreachable_logged = False

    async def get_location(self) -> SdrManagerLocation:
        """The last position read from core; unset until the first read succeeds."""
        return self._location

    async def refresh(self) -> None:
        """Read `app.location` from core once; on failure keep the last good value."""
        if not settings_client.settings_are_remote():
            # Only reachable outside a deployment (no SENTINEL_CORE_URL): there
            # is no core to ask, so the position simply stays unset.
            return
        try:
            value = await settings_client.read_setting(None, LOCATION_NAMESPACE, LOCATION_KEY)
        except settings_client.SettingsUnavailable as error:
            if not self._core_unreachable_logged:
                logger.info("location: core unreachable, keeping the last known position (%s)", error)
                self._core_unreachable_logged = True
            return
        self._core_unreachable_logged = False
        coordinates = parse_location_setting(value)
        try:
            location = SdrManagerLocation(
                latitude=coordinates[0] if coordinates else None,
                longitude=coordinates[1] if coordinates else None,
                updated_at=self._clock.now_ms(),
            )
        except ValidationError:
            logger.warning("location: Sentinel's Location setting is out of range; publishing no position")
            location = SdrManagerLocation(updated_at=self._clock.now_ms())
        self._location = location

    async def run(self) -> None:
        """Refresh now, then every `refresh_interval_s`, until cancelled."""
        while True:
            try:
                await self.refresh()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("location: refresh failed")
            await self._clock.sleep(self._refresh_interval_s)
