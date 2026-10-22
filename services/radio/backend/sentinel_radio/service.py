"""The radio hub as its own service (P6.5): `uvicorn sentinel_radio.service:app`.

Owns everything that touches a physical radio: the rtl_tcp IQ connections and
their broadcasters, the four `/ws/sdr/*` WebSockets, radio CRUD and
connect/status, the decode bridges (voice, APRS, AIS and every
manifest-registered kind) with their PCM ports and ingest routes, and IQ
capture. It has no table of its own (the SDR hosts it once polled are
sdr-manager-remote's) and no UI remote: the radio panes are the SDR section's.

Settings stay in core and are read over HTTP: the radios themselves
(`sdr.radios`), which radio APRS/AIS decode on, and the APRS channel.
Everyone else reaches the hub over NATS, so `NATS_URL` must be set: Sea's AIS
receiver and the SDR section's IQ captures (`hub.*` requests); the hub
publishes `decode.<kind>.*` for Land and Sea, and reacts to core's
`settings.changed.land` and `sdr.decode.radio-reassigned` and to
sdr-manager-remote's `sdr-manager.claims.*` (it never retunes a claimed
dongle). It asks sdr-manager-remote for `sdr-manager.remote.hosts.snapshot` to
grey out radios whose device is gone.

Decoder sidecars reach it through the gateway like everyone else; their PCM
(TCP) and voice return (UDP) sockets are named in each decoder config reply, by
the host this service registers (`SERVICE_INTERNAL_URL`, see
`sentinel_radio/services/decoder_sockets.py`). IQ captures are written into this
service's own volume; the SDR section copies each one over HTTP when its
recording stops (`/internal/radio-hub/iq-captures/`, P7.3), so the two need not
share a host.
"""

from __future__ import annotations

from backend.platform.sdk import create_service

from sentinel_radio.module import lifecycle as radio_hub_lifecycle
from sentinel_radio.module import manifest
from sentinel_radio.routers import decode, decoders, iq_captures, radio_control, radios

app = create_service(
    manifest=manifest,
    # The test suite's in-process app interleaves these with the SDR section's
    # router to keep the original route order; on their own their order
    # doesn't matter, since no two of them share a path.
    routers=[radios.router, radio_control.router, decode.router, decoders.router, iq_captures.router],
    # The radio hub's own lifecycle: resumed APRS/AIS decode, every
    # broadcaster and bridge stopped and woken on shutdown.
    lifecycles=[radio_hub_lifecycle],
)
