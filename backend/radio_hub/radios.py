"""The radio hub's view of configured radios (`sdr.radios`) and their live IQ.

`sdr.radios` stays a core setting (plan B7) — the hub only reads and writes it.
These lookups are shared by every hub router: radio CRUD, connection control,
the spectrum/IQ WebSockets and the decode bridges.
"""

from __future__ import annotations

import asyncio
import json
import logging

from backend.db_helpers import get_setting, upsert_setting
from backend.radio_hub.services import sdr as sdr_svc
from backend.radio_hub.services.sentry_fleet import fleet_poller
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def get_radios(db: AsyncSession) -> list[dict]:
    """Read the sdr.radios array from UserSettings. Returns [] if not set."""
    val = await get_setting(db, "sdr", "radios", default=[])
    return val if isinstance(val, list) else []


async def save_radios(db: AsyncSession, radios: list[dict]) -> None:
    """Write the sdr.radios array back to UserSettings (upsert)."""
    await upsert_setting(db, "sdr", "radios", radios)


def get_radio_by_id(radios: list[dict], radio_id: int) -> dict | None:
    """Return the radio dict with the given id, or None if not found."""
    return next((r for r in radios if r.get("id") == radio_id), None)


def device_availability(radio: dict) -> tuple[bool, str]:
    """Whether a Sentry-mirrored radio's device is currently there.

    A radio created from a Sentry device is a mirror, and the device can be
    unplugged, disabled or made private at any moment. Reporting that here is
    what lets the UI grey the radio out instead of offering a connection that
    can only fail — and what turns the old bare socket error into a sentence
    naming the actual reason.

    A manually-entered radio has no Sentry device behind it and is always
    reported available: nothing here knows any better than the operator did.
    """
    host_id = radio.get("sentry_host_id")
    device_id = radio.get("sentry_device_id")
    if not isinstance(host_id, int) or not isinstance(device_id, str):
        return True, ""

    snapshot = fleet_poller.get_snapshot(host_id)
    if snapshot is None or not snapshot.reachable:
        return False, "Its Sentry host is not reachable."

    for device in (snapshot.status_payload or {}).get("sdrs", []):
        if device.get("device_id") != device_id:
            continue
        if not device.get("present"):
            return False, "The dongle is unplugged."
        if not device.get("enabled"):
            return False, "The device is disabled on its Sentry."
        if (device.get("output") or {}).get("iq_port") is None:
            return False, "Sentry has not assigned this device an output port."
        return True, ""

    # Known host, live snapshot, no such device: the dongle it mirrors is gone —
    # most often replugged into another socket, which changes its identity.
    return False, "Device not found."


async def resolve_broadcaster(
    radio_id: int,
    websocket: WebSocket,
) -> tuple[sdr_svc.RadioBroadcaster, dict] | tuple[None, None]:
    """Look up a radio by id and return a running broadcaster for it.

    Sends an error frame and closes the WebSocket on failure.
    Returns (broadcaster, radio_dict) on success, or (None, None) on failure.
    """
    from backend.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        radios = await get_radios(db)
    radio = get_radio_by_id(radios, radio_id)

    if not radio:
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "code": "NOT_FOUND", "message": f"Radio {radio_id} not found"})
            )
        except Exception:
            pass
        try:
            await websocket.close()
        except RuntimeError:
            pass
        return None, None

    broadcaster = None
    last_exc: Exception = RuntimeError("unknown")
    for attempt in range(3):
        try:
            broadcaster = await sdr_svc.get_or_create_broadcaster(radio["host"], radio["port"])
            break
        except ConnectionError as exc:
            last_exc = exc
            if attempt < 2:
                await asyncio.sleep(1)

    if broadcaster is None:
        try:
            await websocket.send_text(json.dumps({"type": "error", "code": "CONNECT_FAILED", "message": str(last_exc)}))
        except Exception:
            pass
        try:
            await websocket.close()
        except RuntimeError:
            pass
        return None, None

    return broadcaster, radio
