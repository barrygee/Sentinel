"""The radio hub's view of configured radios (`sdr.radios`) and their live IQ.

`sdr.radios` stays a core setting (plan B7) — the hub only reads and writes it,
through the settings client, so the same code works when the hub runs in its
own container and the setting is core's, over HTTP (P6.5). These lookups are
shared by every hub router: radio CRUD, connection control, the spectrum/IQ
WebSockets and the decode bridges.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from backend.platform.bus import bus
from backend.platform.settings_client import read_setting, write_setting
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_radio.services import sdr as sdr_svc

logger = logging.getLogger(__name__)

HOSTS_SNAPSHOT_SUBJECT = "sdr-manager.remote.hosts.snapshot"
"""sdr-manager-remote's reply: every polled SDR host's reachability and devices."""

HOSTS_SNAPSHOT_TTL_S = 5.0
"""How long one snapshot answers every radio listing — the host poll itself runs every 2 s."""

HOSTS_SNAPSHOT_TIMEOUT_S = 2.0
"""A radio listing waits no longer than this for sdr-manager-remote before reporting availability unknown."""

UNKNOWN_AVAILABILITY_REASON = "Its SDR host's status is unknown: SDR Manager is not answering."

# (monotonic time fetched, hosts keyed by str(host_id) — or None when nobody answered).
_hosts_snapshot_cache: tuple[float, dict[str, Any] | None] | None = None


async def get_radios(db: AsyncSession) -> list[dict]:
    """Read the sdr.radios array. Returns [] if not set."""
    radios = await read_setting(db, "sdr", "radios", default=[])
    return radios if isinstance(radios, list) else []


async def save_radios(db: AsyncSession, radios: list[dict]) -> None:
    """Write the sdr.radios array back, announcing it like a Settings save."""
    await write_setting(db, "sdr", "radios", radios)


def get_radio_by_id(radios: list[dict], radio_id: int) -> dict | None:
    """Return the radio dict with the given id, or None if not found."""
    return next((r for r in radios if r.get("id") == radio_id), None)


async def _hosts_snapshot() -> dict[str, Any] | None:
    """The SDR hosts' live status from sdr-manager-remote, cached for `HOSTS_SNAPSHOT_TTL_S`.

    None when sdr-manager-remote isn't deployed, doesn't answer in time or
    answers with something unusable. Cached either way, so a missing service
    costs one short wait per TTL rather than one per listing.
    """
    global _hosts_snapshot_cache
    now = time.monotonic()
    if _hosts_snapshot_cache is not None and now - _hosts_snapshot_cache[0] < HOSTS_SNAPSHOT_TTL_S:
        return _hosts_snapshot_cache[1]
    hosts: dict[str, Any] | None = None
    try:
        reply = await bus.request(HOSTS_SNAPSHOT_SUBJECT, {}, timeout=HOSTS_SNAPSHOT_TIMEOUT_S)
    except (LookupError, TimeoutError, RuntimeError) as error:
        # No responder, no reply in time, or the responder failed (NATS
        # surfaces that as a RuntimeError subclass): availability is unknown.
        logger.debug("No SDR host snapshot from sdr-manager-remote: %s", error)
    else:
        if isinstance(reply, dict) and reply.get("ok") and isinstance(reply.get("hosts"), dict):
            hosts = reply["hosts"]
    _hosts_snapshot_cache = (now, hosts)
    return hosts


def forget_hosts_snapshot() -> None:
    """Drop the cached SDR host snapshot, so the next listing asks again (tests)."""
    global _hosts_snapshot_cache
    _hosts_snapshot_cache = None


async def device_availability(radio: dict) -> tuple[bool, str]:
    """Whether an SDR-host-mirrored radio's device is currently there.

    A radio created from an SDR host's device is a mirror, and the device can
    be unplugged, disabled or made private at any moment. Reporting that here
    is what lets the UI grey the radio out instead of offering a connection
    that can only fail — and what turns the old bare socket error into a
    sentence naming the actual reason.

    A manually-entered radio has no SDR host device behind it and is always
    reported available: nothing here knows any better than the operator did.
    Neither is a mirrored radio greyed out when sdr-manager-remote can't say:
    the hub fails open rather than blocking a radio that may well work.
    """
    host_id = radio.get("sentry_host_id")
    device_id = radio.get("sentry_device_id")
    if not isinstance(host_id, int) or not isinstance(device_id, str):
        return True, ""

    hosts = await _hosts_snapshot()
    if hosts is None:
        return True, UNKNOWN_AVAILABILITY_REASON
    host = hosts.get(str(host_id))
    if not isinstance(host, dict) or not host.get("reachable"):
        return False, "Its SDR host is not reachable."

    for device in host.get("sdrs") or []:
        if not isinstance(device, dict) or device.get("device_id") != device_id:
            continue
        if not device.get("present"):
            return False, "The dongle is unplugged."
        if not device.get("enabled"):
            return False, "The device is disabled on its SDR host."
        if (device.get("output") or {}).get("iq_port") is None:
            return False, "Its SDR host has not assigned this device an output port."
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
