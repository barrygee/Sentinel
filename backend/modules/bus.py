"""Event bus lifecycle: connect the bus to NATS when `NATS_URL` is set (P5.2).

First in `MODULES`, so the bus is attached before any other module's `start`
publishes or requests, and detached only after every other module has
stopped. Unset, nothing happens and the bus stays in-process only.
"""

from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.platform.bus import bus
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.nats_transport import NatsTransport

_transport: NatsTransport | None = None


async def _start() -> None:
    global _transport
    if not settings.nats_url:
        return
    _transport = NatsTransport(bus, settings.nats_url, client_name="sentinel-app", open_session=AsyncSessionLocal)
    # Never blocks startup for long: an unreachable broker is retried in the
    # background while events stay in-process.
    await _transport.start()


async def _stop() -> None:
    global _transport
    if _transport is not None:
        await _transport.stop()
        _transport = None


lifecycle = ModuleLifecycle(name="bus", start=_start, stop=_stop)
