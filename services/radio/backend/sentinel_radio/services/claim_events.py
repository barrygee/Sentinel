"""The hub's side of sdr-manager-remote's claims: who holds which dongle (ADR 0007).

sdr-manager-remote leases a remote SDR host's dongle to Air for ADS-B and
tells the hub about each claim. The hub streams that dongle, so it records
the claim (`device_claims`) and, on a grant, takes its own connection off the
relay's tuning token — from then until the claim lapses or is released,
nothing in the hub retunes it.

A grant is a request (`sdr-manager.claims.granted`): sdr-manager-remote holds
the claim's retune until the hub replies, so the hub has always let go first.
A release is a plain event (`sdr-manager.claims.released`).

Registered at import time, like the hub's other bus handlers, so the claims
reach it in tests, which skip the app lifespan.
"""

from __future__ import annotations

import logging
from typing import Any

from backend.platform.bus import EventPayload, bus

from sentinel_radio.services import device_claims
from sentinel_radio.services import sdr as sdr_svc

logger = logging.getLogger(__name__)

CLAIM_GRANTED_SUBJECT = "sdr-manager.claims.granted"
CLAIM_RELEASED_SUBJECT = "sdr-manager.claims.released"


def _claimed_address(payload: EventPayload) -> tuple[str, int] | None:
    """The dongle's rtl_tcp ``(host, port)`` from a claim event, or None when the event is malformed."""
    host, port = payload.get("host"), payload.get("port")
    if not isinstance(host, str) or not host or not isinstance(port, int) or isinstance(port, bool):
        logger.warning("Ignoring a claim event without a usable host and port: %r", payload)
        return None
    return host, port


async def _on_claim_granted(payload: EventPayload) -> dict[str, Any]:
    """Record the claim and yield the dongle, then acknowledge — the claim's retune waits for this reply."""
    address = _claimed_address(payload)
    expires_at_ms = payload.get("expires_at")
    if address is None or not isinstance(expires_at_ms, int) or isinstance(expires_at_ms, bool):
        return {"ok": False, "reason": "bad_claim"}
    device_claims.mark_claimed(*address, expires_at_ms)
    await sdr_svc.yield_to_claim(*address)
    return {"ok": True}


async def _on_claim_released(payload: EventPayload) -> None:
    address = _claimed_address(payload)
    if address is not None:
        device_claims.mark_released(*address)


bus.reply(CLAIM_GRANTED_SUBJECT, _on_claim_granted)
bus.subscribe(CLAIM_RELEASED_SUBJECT, _on_claim_released)
