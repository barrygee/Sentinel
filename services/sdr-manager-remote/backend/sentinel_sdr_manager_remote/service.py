"""SDR hosts on other machines as their own service: `uvicorn sentinel_sdr_manager_remote.service:app`.

Owns the remote SDR hosts this Sentinel manages (ADR 0007): their table
(`remote_sdr_hosts`, with each host's console password) in its own database
(`DB_PATH`), the SDR Manager API client, the poller that caches each host's
live status and follows mirrored radios to their device's current port, and
the REST surface under `/api/sdr-manager/remote/hosts`. It also links this
machine's own sdr-manager-local, found in core's registry, as the "This
machine" host, which it manages with its service bearer rather than the
console password.

Settings stay in core and are read over HTTP: the radios (`sdr.radios`, whose
ports the poller follows) and this Sentinel's `app.instanceId` (the holder
name on reservations). Over NATS it answers `sdr-manager.remote.*` — Air's
reservations, device addresses and receiver locations, and the hub's host
snapshot — and tells the radio hub about Air's claims
(`sdr-manager.claims.granted`, a request the hub acknowledges before the
claim's retune goes out, and the `sdr-manager.claims.released` event), so the
hub never retunes a dongle Air has claimed.
"""

from __future__ import annotations

from backend.platform.sdk import create_service

from sentinel_sdr_manager_remote.module import lifecycle, manifest
from sentinel_sdr_manager_remote.routers import hosts

app = create_service(manifest=manifest, routers=[hosts.router], lifecycles=[lifecycle])
