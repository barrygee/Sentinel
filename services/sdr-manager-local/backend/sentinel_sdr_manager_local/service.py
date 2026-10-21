"""`sdr-manager-local` as its own service: `python -m sentinel_sdr_manager_local.run_server`.

Manages the RTL-SDRs plugged into this machine — Sentry's composition root,
moved over unchanged (ADR 0007) and wrapped in `create_service()`. It serves
before core answers (`serve_before_core`): its own lifecycle (`container.py`)
needs no core, so dongles keep streaming through a core outage, while
registration and the location refresh follow whenever core is there. It uses
no NATS.

The SDR Manager API (`contract_app.py`) is mounted twice, because the gateway
never strips a prefix: at `/api/sdr-manager/local` for the gateway, and at
`/api` for other Sentinels' managers. The longer mount goes first, so it wins.
`/health` (core's probe) is the outer app's.
"""

from __future__ import annotations

from backend.platform.sdk import create_service
from fastapi import FastAPI

from sentinel_sdr_manager_local.container import container_lifecycle
from sentinel_sdr_manager_local.contract_app import create_contract_app
from sentinel_sdr_manager_local.manifest import GATEWAY_API_PREFIX, manifest

# The prefix other machines' managers use: Sentry's, unchanged.
MANAGER_API_PREFIX = "/api"


def create_sdr_manager_local_app() -> FastAPI:
    """Build the service app: `create_service()` plus the SDR Manager API at both prefixes.

    A factory so tests can build a fresh app (and a fresh API app, whose
    `state.container` the lifecycle fills) for each run.
    """
    contract_app = create_contract_app()
    service_app = create_service(
        manifest=manifest,
        routers=[],
        lifecycles=[],
        serve_before_core=True,
        core_independent_lifecycles=[container_lifecycle(contract_app)],
    )
    service_app.mount(GATEWAY_API_PREFIX, contract_app, name="sdr-manager-api-gateway")
    service_app.mount(MANAGER_API_PREFIX, contract_app, name="sdr-manager-api")
    # The mounted app answers every API route, so its dependency overrides (in
    # tests) are the ones that apply, not the outer app's.
    service_app.state.contract_app = contract_app
    return service_app


app = create_sdr_manager_local_app()
