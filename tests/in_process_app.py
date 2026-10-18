"""The test suite's app: core plus every section, the radio hub and the docs service, in one process.

No deployment runs this. `docker compose up` runs core (`backend.main`) and
each section and the hub as a service of its own behind the gateway. The
backend tests run their router tests, parity goldens and lifecycle tests
against all of them at once, through one `TestClient`, on top of core's own
factory (`create_core_app()`, `backend/core/app.py`).

It lives here, outside `backend`, because it is the one place that imports
every section; import-linter keeps all of `backend` section-free.
"""

from __future__ import annotations

from fastapi import APIRouter, FastAPI
from sentinel_air import adsb_source_router
from sentinel_air import module as air_module
from sentinel_air import router as air_router
from sentinel_docs import module as docs_module
from sentinel_docs import router as docs_router
from sentinel_land import module as land_module
from sentinel_land import router as land_router
from sentinel_radio import module as radio_module
from sentinel_radio.routers import decode as radio_decode_router
from sentinel_radio.routers import decoders as radio_decoders_router
from sentinel_radio.routers import iq_captures as radio_iq_captures_router
from sentinel_radio.routers import radio_control as radio_control_router
from sentinel_radio.routers import radios as radio_radios_router
from sentinel_radio.routers import sentry as radio_sentry_router
from sentinel_sdr import module as sdr_module
from sentinel_sdr import router as sdr_router
from sentinel_sea import module as sea_module
from sentinel_sea import router as sea_router
from sentinel_space import module as space_module
from sentinel_space import router as space_router

from backend.core import app_docs, app_sections, notifications, registry_router, settings_secrets
from backend.core.app import CORE_LIFECYCLES, create_core_app
from backend.core.service_registry import registry
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.service_manifest import ServiceManifest
from backend.routers import offline_map
from backend.routers import settings as settings_router

# Every module's lifecycle, in the order the app runs them. The order is
# load-bearing — see backend/platform/lifecycle.py:
#   prepare: core (schema, migrations, settings seed) → sdr (frequency +
#            band-plan seed) → space (its tables, satellite radio backfill) → …
#   start:   bus (NATS, when configured) → core (config file sync, offline
#            maps) → radio hub (resumed APRS/AIS decode, Sentry poller) →
#            land → sea → air (squawk watcher; it asks the hub where the
#            receiver is)
#   stop:    the reverse.
IN_PROCESS_LIFECYCLES: tuple[ModuleLifecycle, ...] = (
    *CORE_LIFECYCLES,
    sdr_module.lifecycle,
    space_module.lifecycle,
    radio_module.lifecycle,
    land_module.lifecycle,
    sea_module.lifecycle,
    air_module.lifecycle,
)

# Every hosted service's manifest, in the order they are registered.
IN_PROCESS_MANIFESTS: tuple[ServiceManifest, ...] = (
    air_module.manifest,
    space_module.manifest,
    sea_module.manifest,
    land_module.manifest,
    sdr_module.manifest,
    radio_module.manifest,
    docs_module.manifest,
)


def in_process_routers() -> list[APIRouter]:
    """Core's routers and every section's and the hub's, in route-matching order.

    The order is load-bearing: the parity route-inventory golden pins it. The
    radio hub and the SDR section share the /api/sdr/ prefix, so their routers
    are interleaved in the order the single SDR router once registered them;
    in a deployment the gateway's longest-prefix match keeps them apart.
    """
    return [
        air_router.router,
        # Core notifications keep their /api/air/messages paths (B5).
        notifications.router,
        space_router.router,
        land_router.router,
        sea_router.router,
        settings_router.router,
        radio_radios_router.router,
        sdr_router.router,
        radio_control_router.router,
        radio_decode_router.router,
        radio_decoders_router.router,
        radio_sentry_router.router,
        radio_iq_captures_router.router,
        # Air's, despite sitting under /api/sdr/ (the Sentry dongle behind Off Grid ADS-B).
        adsb_source_router.router,
        offline_map.router,
        app_sections.router,
        app_docs.router,
        registry_router.router,
        settings_secrets.router,
        # The in-app documentation (its own `docs` service in a deployment).
        docs_router.router,
    ]


def create_in_process_app() -> FastAPI:
    """Build the all-in-one test app and register every hosted service with the registry.

    Registered before returning, so the sections are listed before the first
    request; the tests skip the lifespan.
    """
    app = create_core_app(
        routers=in_process_routers(),
        lifecycles=IN_PROCESS_LIFECYCLES,
        serve_section_remotes=True,
    )
    registry.register_in_process(list(IN_PROCESS_MANIFESTS), instance_id="core")
    return app


app = create_in_process_app()
