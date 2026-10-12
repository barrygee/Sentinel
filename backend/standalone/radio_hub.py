"""The radio hub as its own service (P6.5): `uvicorn backend.standalone.radio_hub:app`.

Owns everything that touches a physical radio: the rtl_tcp/Sentry IQ
connections and their broadcasters, the four `/ws/sdr/*` WebSockets, radio
CRUD and connect/status, the decode bridges (voice, APRS, AIS and every
manifest-registered kind) with their PCM ports and ingest routes, IQ capture
and the Sentry fleet. Its one table, `sentry_hosts` (with each host's bearer
token), lives in its own database (`DB_PATH`), copied from the monolith's on
first boot (`LEGACY_DB_PATH`). It has no UI remote: the radio panes are the
SDR section's.

Settings stay in core and are read over HTTP: the radios themselves
(`sdr.radios`), which radio APRS/AIS decode on, the APRS channel and this
Sentinel's `app.instanceId` (the holder name on Sentry reservations).
Everyone else reaches the hub over NATS, so `NATS_URL` must be set: Air's
Sentry reservations, Sea's AIS receiver, the SDR section's IQ captures
(`hub.*` requests); the hub publishes `decode.<kind>.*` for Land and Sea, and
reacts to core's `settings.changed.land` and `sdr.decode.radio-reassigned`.

Decoder sidecars reach it through the gateway like everyone else; their PCM
(TCP) and voice return (UDP) sockets are named in each decoder config reply, by
the host this service registers (`SERVICE_INTERNAL_URL`, see
`radio_hub/services/decoder_sockets.py`). IQ captures are written into the SDR
section's recordings folder (`IQ_CAPTURE_DIR`), which is still on the app's volume.
"""

from __future__ import annotations

import asyncio

from backend.config import settings
from backend.database import RADIO_HUB_TABLES, create_radio_hub_tables
from backend.modules.radio_hub import lifecycle as radio_hub_lifecycle
from backend.modules.radio_hub import manifest
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.sdk import create_service
from backend.platform.sdk.legacy_import import import_legacy_tables
from backend.radio_hub.routers import decode, decoders, radio_control, radios, sentry


async def _prepare() -> None:
    await create_radio_hub_tables()
    await asyncio.to_thread(import_legacy_tables, settings.db_path, settings.legacy_db_path, RADIO_HUB_TABLES)


app = create_service(
    manifest=manifest,
    # The monolith includes these interleaved with the SDR section's router to
    # keep its route order; on their own their order doesn't matter, since no
    # two of them share a path.
    routers=[radios.router, radio_control.router, decode.router, decoders.router, sentry.router],
    # The monolith's radio hub lifecycle (ingest secret, resumed APRS/AIS
    # decode, the Sentry fleet poller; every broadcaster and bridge stopped and
    # woken on shutdown), unchanged, after this service's own schema and legacy import.
    lifecycles=[
        ModuleLifecycle(name="radio-hub-schema", prepare=_prepare),
        radio_hub_lifecycle,
    ],
)
