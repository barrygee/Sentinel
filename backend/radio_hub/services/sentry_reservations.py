"""Sentry reservation proxy — the radio hub's side of B6.

Air needs a Sentry dongle for Off Grid ADS-B, but the Sentry hosts (and their
console passwords) belong to the radio hub. Rather than Air reading
`sentry_hosts` and building its own `SentryClient`, it asks the hub over the
bus and the hub makes the Sentry calls on its behalf:

  hub.sentry.reservation.acquire   claim (or renew) a device lease, and
                                   optionally retune it under that lease
  hub.sentry.reservation.release   give a device back
  hub.sentry.device.address        where a device's rtl_tcp stream answers

The optional retune rides on the acquire request rather than being its own
subject: the claim and the tune share one `SentryClient`, and with it the
console session cookie, so a renewal costs no extra sign-in round trip.

Every request carries `host_id` + `device_id`; the hub supplies the holder
itself — `app.instanceId`, read verbatim from core — so Sentry stays the lease
authority across Sentinel instances and an upgrade never looks like a second
claimant (no first-claim 409).

Replies are plain dicts, never exceptions, so the contract survives the move
to a real NATS request/reply where a raised exception cannot cross the wire:
`{"ok": True, ...}` on success, otherwise `{"ok": False, "reason": ...}` where
`reason` is one of `unknown_host`, `host_disabled`, `unreachable` or
`api_error` (the last also carries Sentry's `status_code`, `code`, `message`
and `context`). An acquire failure also says which `stage` failed —
`acquire` or `patch` — because "claimed but could not be tuned" reads
differently to an operator. The caller turns all of that into its own wording.

`db` rides in the payload, as on every in-process subject (see
`backend/platform/bus.py`).
"""

from __future__ import annotations

import time
from typing import Any

from backend.core.instance_identity import get_instance_id
from backend.models import SentryHost
from backend.platform.bus import EventPayload, bus
from backend.radio_hub.services import device_claims
from backend.radio_hub.services import sdr as sdr_svc
from backend.radio_hub.services.sentry_client import SentryApiError, SentryClient, SentryUnreachableError
from backend.radio_hub.services.sentry_fleet import fleet_poller
from sqlalchemy.ext.asyncio import AsyncSession

ACQUIRE_SUBJECT = "hub.sentry.reservation.acquire"
RELEASE_SUBJECT = "hub.sentry.reservation.release"
DEVICE_ADDRESS_SUBJECT = "hub.sentry.device.address"


class _HostUnavailable(Exception):
    """The requested host can't be used; `reply` is the failure to send back."""

    def __init__(self, reply: dict[str, Any]) -> None:
        super().__init__(reply["reason"])
        self.reply = reply


async def _client_for_host(db: AsyncSession, host_id: int, *, require_enabled: bool) -> SentryClient:
    host = await db.get(SentryHost, host_id)
    if host is None:
        raise _HostUnavailable({"ok": False, "reason": "unknown_host"})
    if require_enabled and not host.enabled:
        raise _HostUnavailable({"ok": False, "reason": "host_disabled", "host_label": host.name or host.address})
    return SentryClient(host.address, host.port, host.auth_token)


def _failure_from(error: SentryUnreachableError | SentryApiError) -> dict[str, Any]:
    if isinstance(error, SentryUnreachableError):
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
    except (SentryUnreachableError, SentryApiError) as error:
        return {**_failure_from(error), "stage": "acquire"}
    # The claim wins the dongle (device_claims): record it, and take Sentinel's
    # own connection off the tuning token before the retune goes out, so the
    # claim's tuning is the only change the relay sees.
    address = _stream_address(payload["host_id"], payload["device_id"])
    if address is not None:
        expires_at_ms = (reservation.data or {}).get("expires_at")
        if not isinstance(expires_at_ms, int):
            expires_at_ms = int(time.time() * 1000) + payload["ttl_seconds"] * 1000
        device_claims.mark_claimed(*address, expires_at_ms)
        await sdr_svc.yield_to_claim(*address)
    changes = payload.get("patch")
    if changes:
        try:
            await client.patch_device(payload["device_id"], changes, holder=holder)
        except (SentryUnreachableError, SentryApiError) as error:
            return {**_failure_from(error), "stage": "patch"}
    return {"ok": True, "reservation": reservation.data}


def _stream_address(host_id: int, device_id: str) -> tuple[str, int] | None:
    """A device's rtl_tcp ``(host, port)`` from the fleet poller's last snapshot, if known."""
    snapshot = fleet_poller.get_snapshot(host_id)
    for device in (snapshot.status_payload or {}).get("sdrs", []) if snapshot else []:
        if device.get("device_id") != device_id:
            continue
        output = device.get("output") or {}
        if output.get("host") and isinstance(output.get("iq_port"), int):
            return output["host"], output["iq_port"]
    return None


async def _on_release(payload: EventPayload) -> dict[str, Any]:
    db: AsyncSession = payload["db"]
    # Forgotten even if Sentry can't be reached: the claim is over on our side.
    address = _stream_address(payload["host_id"], payload["device_id"])
    if address is not None:
        device_claims.mark_released(*address)
    holder = await get_instance_id(db)
    try:
        client = await _client_for_host(db, payload["host_id"], require_enabled=True)
        await client.release_reservation(payload["device_id"], holder=holder)
    except _HostUnavailable as unavailable:
        return unavailable.reply
    except (SentryUnreachableError, SentryApiError) as error:
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
    except (SentryUnreachableError, SentryApiError) as error:
        return _failure_from(error)
    for device in (export.data or {}).get("sdrs", []):
        if device.get("sentry_device_id") == payload["device_id"]:
            return {"ok": True, "found": True, "host": device.get("host"), "port": device.get("port")}
    return {"ok": True, "found": False}


bus.reply(ACQUIRE_SUBJECT, _on_acquire)
bus.reply(RELEASE_SUBJECT, _on_release)
bus.reply(DEVICE_ADDRESS_SUBJECT, _on_device_address)
