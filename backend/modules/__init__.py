"""Each module's lifecycle, in the order the app runs them (B8).

The order is load-bearing — see `backend/platform/lifecycle.py`:
  prepare: core (schema, migrations, settings seed) → sdr (frequency + band-plan
           seed) → space (satellite radio backfill)
  start:   bus (NATS, when configured — so every later module publishes onto a
           connected bus) → core (config file sync, offline maps) → radio hub (decode secret,
           resumed APRS/AIS decode, Sentry poller) → land → sea → air (squawk
           watcher; it asks the radio hub where the receiver is)
  stop:    the reverse.

`MANIFESTS` are the services this process hosts, registered in-process with the
service registry at import (`backend/main.py`, plan §3.2).

A service listed in `SENTINEL_EXTERNAL_SERVICES` runs in its own container
(P6), so its lifecycle and manifest are left out here — `hosts_in_process`
says which. Its module is not even imported: a section subscribes to bus
events at import (e.g. Land's `decode.aprs.*` store), and the copy left behind
in this process would otherwise keep handling them.
"""

import importlib
from types import ModuleType

from backend.config import settings
from backend.platform.lifecycle import ModuleLifecycle
from backend.platform.service_manifest import ServiceManifest

# The services that have a standalone entry point (`backend/standalone/`) and
# whose routers `backend/main.py` can leave out. Grows one section at a time
# through P6.
EXTRACTABLE_SERVICES = frozenset({"space", "land", "air"})

# Every module, in lifecycle order (see above), with the service it belongs
# to. bus and core are this process itself and never run elsewhere.
_MODULE_ORDER: tuple[tuple[str, str], ...] = (
    ("bus", "bus"),
    ("core", "core"),
    ("sdr", "sdr"),
    ("space", "space"),
    ("radio_hub", "radio-hub"),
    ("land", "land"),
    ("sea", "sea"),
    ("air", "air"),
)

# The services this process can host, in the order they are registered.
_MANIFEST_ORDER: tuple[str, ...] = ("air", "space", "sea", "land", "sdr", "radio_hub")


def external_services() -> frozenset[str]:
    """The service ids this deployment runs in their own containers, not in this process.

    Raises `ValueError` for an id that can't run on its own yet: leaving it out
    would silently drop a section rather than move it.
    """
    external = frozenset(
        service_id.strip() for service_id in settings.sentinel_external_services.split(",") if service_id.strip()
    )
    unsupported = external - EXTRACTABLE_SERVICES
    if unsupported:
        raise ValueError(
            f"SENTINEL_EXTERNAL_SERVICES lists {sorted(unsupported)}, which can't run as separate services yet "
            f"(supported: {sorted(EXTRACTABLE_SERVICES)})"
        )
    return external


def hosts_in_process(service_id: str) -> bool:
    """True when this process hosts `service_id`'s routers, lifecycle and registration."""
    return service_id not in external_services()


def _module(module_name: str) -> ModuleType:
    return importlib.import_module(f"backend.modules.{module_name}")


MODULES: tuple[ModuleLifecycle, ...] = tuple(
    _module(module_name).lifecycle for module_name, service_id in _MODULE_ORDER if hosts_in_process(service_id)
)
_SERVICE_OF_MODULE = dict(_MODULE_ORDER)
MANIFESTS: tuple[ServiceManifest, ...] = tuple(
    _module(module_name).manifest
    for module_name in _MANIFEST_ORDER
    if hosts_in_process(_SERVICE_OF_MODULE[module_name])
)
