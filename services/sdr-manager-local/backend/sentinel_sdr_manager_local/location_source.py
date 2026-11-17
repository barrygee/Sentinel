"""This machine's position and name, read from Sentinel's own settings (ADR 0007).

Sentry stored a fixed position of its own, typed into its console. SDR Manager
does not: the machine running it already has a position, Sentinel's Location
setting (`app.location`, in core), and a second copy would only drift from it.
So `GET /api/status`, `GET /api/v1/sdrs` and the SSE snapshot publish core's
value instead — in SDR Manager-only mode too, where the trimmed Settings keep
the Location item for exactly this. Its name is read the same way, from
`app.machineName` (Settings › App Settings › Machine Name), and published on
`/api/v1/sdrs`'s `source` so other Sentinels can call this machine by it.

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
MACHINE_NAME_KEY = "machineName"
MACHINE_NAME_MAX_LENGTH = 64
"""Longer names are cut: the name is a label on other Sentinels' maps and lists."""


def parse_machine_name_setting(value: Any) -> str:
    """The `app.machineName` setting as a trimmed label, or `""` when it is unset or not text."""
    if not isinstance(value, str):
        return ""
    return value.strip()[:MACHINE_NAME_MAX_LENGTH]


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
    """Serves the last position and machine name read from core, refreshed in the background."""

    def __init__(self, clock: Clock, refresh_interval_s: float) -> None:
        self._clock = clock
        self._refresh_interval_s = refresh_interval_s
        self._location = SdrManagerLocation()
        self._machine_name = ""
        # Logged once per outage, not on every failed refresh.
        self._core_unreachable_logged = False

    async def get_location(self) -> SdrManagerLocation:
        """The last position read from core; unset until the first read succeeds."""
        return self._location

    def get_machine_name(self) -> str:
        """The operator's name for this machine, from core; `""` until read or when unnamed."""
        return self._machine_name

    async def refresh(self) -> None:
        """Read `app.location` and `app.machineName` from core once; on failure keep the last good values."""
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
        # After the position is stored, so a name that can't be read never
        # holds back the position other Sentinels plot this machine at.
        try:
            machine_name = await settings_client.read_setting(None, LOCATION_NAMESPACE, MACHINE_NAME_KEY)
        except settings_client.SettingsUnavailable:
            return
        self._machine_name = parse_machine_name_setting(machine_name)

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
