"""Sea's off-grid AIS receiver: keep the designated radio decoding, browser or not.

Two settings decide whether Sentinel decodes AIS off air:

  * ``sea.aisSdrRadioId`` — the radio the operator designated as the AIS receiver
    (Settings › SEA);
  * Sea's effective mode — ``sea.sourceOverride``, else ``app.connectivityMode``
    (see ``backend.utils.resolve_effective_mode``).

Off grid with a radio designated, that radio should be decoding; otherwise none
should (online vessels come from AISStream, and decoding would only hold a dongle
to duplicate them). This module makes that true from the backend: at startup and
whenever one of those settings changes — through Settings, a config upload or a
hand-edited config file — it asks the radio hub to start or stop
(``hub.decode.ais.{start,stop}``). It used to happen only when someone opened the
Sea page in a browser, so a headless or freshly installed Sentinel decoded
nothing until then (the plan's §6: sections keep ingesting headless).

The hub persists which radio is actually decoding (``sdr.ais_radio_id``); this
module only reads it, to know what to stop.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.database import AsyncSessionLocal
from backend.platform.bus import bus
from backend.platform.settings_client import read_setting
from backend.utils import resolve_effective_mode
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# The settings whose change can move the receiver, per namespace.
_TRIGGER_KEYS = {"sea": {"aisSdrRadioId", "sourceOverride"}, "app": {"connectivityMode"}}

# Reconciles run in the background, one at a time; held so they aren't garbage-collected.
_background: set[asyncio.Task] = set()
_reconcile_lock = asyncio.Lock()


async def desired_receiver(db: AsyncSession) -> int | None:
    """The radio that should be decoding AIS now: the designated one, off grid only."""
    designated = await read_setting(db, "sea", "aisSdrRadioId", default=None)
    if not isinstance(designated, int) or isinstance(designated, bool):
        return None
    return designated if await resolve_effective_mode("sea", db) == "offgrid" else None


async def reconcile(db: AsyncSession) -> dict[str, Any] | None:
    """Ask the hub to make AIS decode match :func:`desired_receiver`.

    Returns the hub's reply, or None when nothing needed doing. Starting the
    radio that is already decoding is a no-op on the hub, so a start is always
    sent while a receiver is wanted — that is also what recovers a decode whose
    previous start failed (an unreachable dongle).
    """
    wanted = await desired_receiver(db)
    if wanted is not None:
        reply = await bus.request("hub.decode.ais.start", {"radio_id": wanted, "db": db}, timeout=None)
        if not reply.get("ok"):
            logger.warning("Sea: could not start AIS decode on radio %s: %s", wanted, reply.get("message"))
        return reply
    decoding = await read_setting(db, "sdr", "ais_radio_id", default=None)
    if not isinstance(decoding, int) or isinstance(decoding, bool):
        return None
    return await bus.request("hub.decode.ais.stop", {"radio_id": decoding, "db": db}, timeout=None)


async def reconcile_now() -> bool:
    """Reconcile with a session of its own, never raising (startup and background use).

    Returns False when the reconcile itself failed (core's settings or the hub
    unreachable) — not when the hub answered that it couldn't start the radio.
    """
    async with _reconcile_lock:
        try:
            async with AsyncSessionLocal() as db:
                await reconcile(db)
        except Exception:
            logger.exception("Sea: AIS receiver reconcile failed")
            return False
    return True


def _on_settings_changed(namespace: str):
    async def handler(payload: dict) -> None:
        if not _TRIGGER_KEYS[namespace] & set(payload.get("keys", ())):
            return
        # In the background: reaching a dongle can take seconds, and a settings
        # save (whose PUT awaits its subscribers) must not wait for it.
        task = asyncio.create_task(reconcile_now(), name="sea-ais-receiver-reconcile")
        _background.add(task)
        task.add_done_callback(_background.discard)

    return handler


# Registered at import time, like every other subscriber (tests skip lifespan).
bus.subscribe("settings.changed.sea", _on_settings_changed("sea"))
bus.subscribe("settings.changed.app", _on_settings_changed("app"))
