"""Reservation proxy — sdr-manager-remote's bus responders (ADR 0007).

Air needs a remote SDR host's dongle for Off Grid ADS-B, but the hosts (and
their console passwords) belong to this service. Rather than Air reading
`remote_sdr_hosts` and building its own `SdrManagerClient`, it asks over the
bus and this service makes the SDR Manager API calls on its behalf:

  sdr-manager.remote.reservation.acquire   claim (or renew) a device lease, and
                                           optionally retune it under that lease
  sdr-manager.remote.reservation.release   give a device back
  sdr-manager.remote.device.address        where a device's rtl_tcp stream answers
  sdr-manager.remote.host.location         where a host (and its receivers) is
  sdr-manager.remote.hosts.snapshot        every polled host's live device status,
                                           which the radio hub greys radios out by

The optional retune rides on the acquire request rather than being its own
subject: the claim and the tune share one `SdrManagerClient`, and with it the
console session cookie, so a renewal costs no extra sign-in round trip.

Every request carries `host_id` + `device_id`; this service supplies the holder
itself — `app.instanceId`, read verbatim from core — so the host stays the lease
authority across Sentinel instances and an upgrade never looks like a second
claimant (no first-claim 409).

The radio hub streams the claimed dongle, so it is told about every claim.
`sdr-manager.claims.granted` (with the claim's expiry) is a *request*: the
claim's retune waits for the hub's acknowledgement, so over NATS too the hub
has let go of the tuning before the retune reaches the relay. If no hub
answers within `CLAIM_GRANTED_TIMEOUT_S` (none deployed, or it is down) the
retune goes ahead — there is then no hub connection to fight it.
`sdr-manager.claims.released` is a plain event: it only lifts the hold early,
and a lost one costs no more than waiting for the claim to lapse.

Replies are plain dicts, never exceptions, so the contract survives NATS
request/reply, where a raised exception cannot cross the wire:
`{"ok": True, ...}` on success, otherwise `{"ok": False, "reason": ...}` where
`reason` is one of `unknown_host`, `host_disabled`, `unreachable` or
`api_error` (the last also carries the host's `status_code`, `code`, `message`
and `context`). An acquire failure also says which `stage` failed —
`acquire` or `patch` — because "claimed but could not be tuned" reads
differently to an operator. The caller turns all of that into its own wording.

`db` rides in the payload, as on every in-process subject (see
`backend/platform/bus.py`).
"""

from __future__ import annotations

import logging
import time
from typing import Any

from backend.core.instance_identity import get_instance_id
from backend.platform.bus import EventPayload, bus
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sdr_manager_remote.models import RemoteSdrHost
from sentinel_sdr_manager_remote.services.host_poller import host_poller
from sentinel_sdr_manager_remote.services.sdr_manager_client import (
    SdrManagerApiError,
    SdrManagerClient,
    SdrManagerUnreachableError,
)

logger = logging.getLogger(__name__)

ACQUIRE_SUBJECT = "sdr-manager.remote.reservation.acquire"
RELEASE_SUBJECT = "sdr-manager.remote.reservation.release"
DEVICE_ADDRESS_SUBJECT = "sdr-manager.remote.device.address"
HOST_LOCATION_SUBJECT = "sdr-manager.remote.host.location"
HOSTS_SNAPSHOT_SUBJECT = "sdr-manager.remote.hosts.snapshot"

CLAIM_GRANTED_SUBJECT = "sdr-manager.claims.granted"
CLAIM_GRANTED_TIMEOUT_S = 2.0
"""How long a claim's retune waits for the hub to acknowledge the claim."""
CLAIM_RELEASED_SUBJECT = "sdr-manager.claims.released"


class _HostUnavailable(Exception):
    """The requested host can't be used; `reply` is the failure to send back."""

    def __init__(self, reply: dict[str, Any]) -> None:
        super().__init__(reply["reason"])
        self.reply = reply


async def _client_for_host(db: AsyncSession, host_id: int, *, require_enabled: bool) -> SdrManagerClient:
    host = await db.get(RemoteSdrHost, host_id)
    if host is None:
        raise _HostUnavailable({"ok": False, "reason": "unknown_host"})
    if require_enabled and not host.enabled:
        raise _HostUnavailable({"ok": False, "reason": "host_disabled", "host_label": host.name or host.address})
    return SdrManagerClient(host.address, host.port, host.auth_token)


def _failure_from(error: SdrManagerUnreachableError | SdrManagerApiError) -> dict[str, Any]:
    if isinstance(error, SdrManagerUnreachableError):
        return {"ok": False, "reason": "unreachable", "message": str(error)}
    return {
        "ok": False,
        "reason": "api_error",
        "status_code": error.status_code,
        "code": error.code,
        "message": error.message,
        "context": dict(error.context),
    }


async def _on_acquire(payload: EventPayload) -> dict[str, Any]:
    db: AsyncSession = payload["db"]
    # Holder before host, matching the order Air used: the identity is created
    # on first use even when the host lookup then fails.
    holder = await get_instance_id(db)
    try:
        client = await _client_for_host(db, payload["host_id"], require_enabled=True)
    except _HostUnavailable as unavailable:
        return unavailable.reply
    try:
        reservation = await client.acquire_reservation(
            payload["device_id"],
            holder=holder,
            label=payload["label"],
            ttl_seconds=payload["ttl_seconds"],
            force=payload.get("force", False),
        )
    except (SdrManagerUnreachableError, SdrManagerApiError) as error:
        return {**_failure_from(error), "stage": "acquire"}
    # The claim wins the dongle: the hub must take its own connection off the
    # tuning token before the retune goes out, so the claim's tuning is the
    # only change the relay sees — hence a request, not an event.
    address = _stream_address(payload["host_id"], payload["device_id"])
    if address is not None:
        expires_at_ms = (reservation.data or {}).get("expires_at")
        if not isinstance(expires_at_ms, int):
            expires_at_ms = int(time.time() * 1000) + payload["ttl_seconds"] * 1000
        host, port = address
        await _tell_hub_claim_granted(host, port, expires_at_ms)
    changes = payload.get("patch")
    if changes:
        try:
            await client.patch_device(payload["device_id"], changes, holder=holder)
        except (SdrManagerUnreachableError, SdrManagerApiError) as error:
            return {**_failure_from(error), "stage": "patch"}
    return {"ok": True, "reservation": reservation.data}


async def _tell_hub_claim_granted(host: str, port: int, expires_at_ms: int) -> None:
    """Have the radio hub record the claim and let go of the dongle's tuning; wait for it to say so.

    Never fails the acquire: with no hub to answer (not deployed, down, or
    slow past `CLAIM_GRANTED_TIMEOUT_S`) there is no hub connection holding the
    tuning token either, so the retune is safe to send. Logged, because a hub
    that is up but not answering would be retuning a claimed dongle.
    """
    try:
        reply = await bus.request(
            CLAIM_GRANTED_SUBJECT,
            {"host": host, "port": port, "expires_at": expires_at_ms},
            timeout=CLAIM_GRANTED_TIMEOUT_S,
        )
    except (LookupError, TimeoutError, RuntimeError) as error:
        # No responder, no reply in time, or the hub's handler failed (NATS
        # surfaces that as a RuntimeError subclass).
        logger.warning("The radio hub did not acknowledge the claim on %s:%s: %s", host, port, error)
        return
    if not (isinstance(reply, dict) and reply.get("ok")):
        logger.warning("The radio hub refused the claim on %s:%s: %r", host, port, reply)


def _stream_address(host_id: int, device_id: str) -> tuple[str, int] | None:
    """A device's rtl_tcp ``(host, port)`` from the host poller's last snapshot, if known."""
    snapshot = host_poller.get_snapshot(host_id)
    for device in (snapshot.status_payload or {}).get("sdrs", []) if snapshot else []:
        if device.get("device_id") != device_id:
            continue
        output = device.get("output") or {}
        if output.get("host") and isinstance(output.get("iq_port"), int):
            return output["host"], output["iq_port"]
    return None


async def _on_release(payload: EventPayload) -> dict[str, Any]:
    db: AsyncSession = payload["db"]
    # Released even if the host can't be reached: the claim is over on our side.
    address = _stream_address(payload["host_id"], payload["device_id"])
    if address is not None:
        host, port = address
        await bus.publish(CLAIM_RELEASED_SUBJECT, {"host": host, "port": port})
    holder = await get_instance_id(db)
    try:
        client = await _client_for_host(db, payload["host_id"], require_enabled=True)
        await client.release_reservation(payload["device_id"], holder=holder)
    except _HostUnavailable as unavailable:
        return unavailable.reply
    except (SdrManagerUnreachableError, SdrManagerApiError) as error:
        return _failure_from(error)
    return {"ok": True}


async def _on_device_address(payload: EventPayload) -> dict[str, Any]:
    """Find a device's rtl_tcp address in its host's SDR export.

    Deliberately does not require the host to be enabled — the ADS-B decoder
    sidecar polls this, and it has always been answered for a disabled host.
    """
    db: AsyncSession = payload["db"]
    try:
        client = await _client_for_host(db, payload["host_id"], require_enabled=False)
        export = await client.get_sdr_export()
    except _HostUnavailable as unavailable:
        return unavailable.reply
    except (SdrManagerUnreachableError, SdrManagerApiError) as error:
        return _failure_from(error)
    for device in (export.data or {}).get("sdrs", []):
        if device.get("sdr_manager_device_id") == payload["device_id"]:
            return {"ok": True, "found": True, "host": device.get("host"), "port": device.get("port")}
    return {"ok": True, "found": False}


async def _on_host_location(payload: EventPayload) -> dict[str, Any]:
    """Where a host (and so every receiver on it) is, from the host poller's last snapshot.

    Air centres its off-grid ADS-B area on the receiver it decodes from: the
    receiver only hears aircraft around itself. Answered from memory, so it
    costs no round trip to the host; ``found`` is False until the host has been
    polled or when it reports no usable position.
    """
    snapshot = host_poller.get_snapshot(payload["host_id"])
    location = ((snapshot.status_payload or {}).get("location") if snapshot else None) or {}
    latitude, longitude = location.get("latitude"), location.get("longitude")
    if not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in (latitude, longitude)):
        return {"ok": True, "found": False}
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return {"ok": True, "found": False}
    return {"ok": True, "found": True, "latitude": float(latitude), "longitude": float(longitude)}


async def _on_hosts_snapshot(payload: EventPayload) -> dict[str, Any]:
    """Every polled host's reachability and devices, keyed by host id, for the radio hub.

    The hub greys out a radio mirroring a device that is unplugged, disabled or
    on an unreachable host. Answered from memory. Keys are strings so the reply
    survives JSON over NATS unchanged. Only enabled hosts are polled, so a
    disabled host is simply absent — which the hub reads as unreachable, as it
    always has.
    """
    hosts = {
        str(snapshot.host_id): {
            "reachable": snapshot.reachable,
            "sdrs": (snapshot.status_payload or {}).get("sdrs", []) if snapshot.reachable else [],
        }
        for snapshot in host_poller.all_snapshots()
    }
    return {"ok": True, "hosts": hosts}


bus.reply(ACQUIRE_SUBJECT, _on_acquire)
bus.reply(RELEASE_SUBJECT, _on_release)
bus.reply(DEVICE_ADDRESS_SUBJECT, _on_device_address)
bus.reply(HOST_LOCATION_SUBJECT, _on_host_location)
bus.reply(HOSTS_SNAPSHOT_SUBJECT, _on_hosts_snapshot)
