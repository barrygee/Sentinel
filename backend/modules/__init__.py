"""Each module's lifecycle, in the order the app runs them (B8).

The order is load-bearing — see `backend/platform/lifecycle.py`:
  prepare: core (schema, migrations, settings seed) → sdr (frequency + band-plan
           seed) → space (its tables, satellite radio backfill)
  start:   bus (NATS, when configured — so every later module publishes onto a
           connected bus) → core (config file sync, offline maps) → radio hub (decode secret,
           resumed APRS/AIS decode, Sentry poller) → land → sea → air (squawk
           watcher; it asks the radio hub where the receiver is)
  stop:    the reverse.

`MANIFESTS` are the services this process hosts, registered in-process with the
service registry when core builds its app (`backend/composition_root.py`, plan §3.2).

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

# The services that have a standalone entry point (`sentinel_<id>.service`) and
# whose routers core (`backend/composition_root.py`) can leave out: since P6.6, every one but
# bus and core.
EXTRACTABLE_SERVICES = frozenset({"space", "land", "air", "sea", "radio", "sdr"})

# Every module, in lifecycle order (see above), with the service it belongs
# to. bus and core are this process itself and never run elsewhere.
_MODULE_ORDER: tuple[tuple[str, str], ...] = (
    ("bus", "bus"),
    ("core", "core"),
    ("sdr", "sdr"),
    ("space", "space"),
    ("radio_hub", "radio"),
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


def shares_process_with(service_id: str) -> bool:
    """True when `service_id` runs in this very process, so the two share its files and memory.

    `hosts_in_process` answers for the app, whose `SENTINEL_EXTERNAL_SERVICES`
    lists what runs elsewhere. A standalone service (`SENTINEL_CORE_URL` set)
    hosts only itself, whatever that list says, so it shares a process with no
    other service.
    """
    return not settings.sentinel_core_url and hosts_in_process(service_id)


# Modules that have moved into their own package (each section's
# services/sections/<id>/backend, the radio hub's services/radio/backend);
# bus and core are still `backend.modules.<name>`.
_MOVED_MODULES: dict[str, str] = {
    "space": "sentinel_space.module",
    "land": "sentinel_land.module",
    "air": "sentinel_air.module",
    "sea": "sentinel_sea.module",
    "sdr": "sentinel_sdr.module",
    "radio_hub": "sentinel_radio.module",
}


def _module(module_name: str) -> ModuleType:
    return importlib.import_module(_MOVED_MODULES.get(module_name, f"backend.modules.{module_name}"))


_SERVICE_OF_MODULE = dict(_MODULE_ORDER)


def _hosted_lifecycles() -> tuple[ModuleLifecycle, ...]:
    return tuple(
        _module(module_name).lifecycle for module_name, service_id in _MODULE_ORDER if hosts_in_process(service_id)
    )


def _hosted_manifests() -> tuple[ServiceManifest, ...]:
    return tuple(
        _module(module_name).manifest
        for module_name in _MANIFEST_ORDER
        if hosts_in_process(_SERVICE_OF_MODULE[module_name])
    )


_COMPOSED = {"MODULES": _hosted_lifecycles, "MANIFESTS": _hosted_manifests}


def __getattr__(name: str) -> tuple[ModuleLifecycle, ...] | tuple[ServiceManifest, ...]:
    """`MODULES` and `MANIFESTS`, composed on first use rather than at import (PEP 562).

    A standalone section service imports its own module from this package
    (`sentinel_sea.module`), which runs this file. Composing eagerly would then
    import every other hosted module too — the radio hub's bus responders and
    the other sections' subscribers among them — so the service would answer
    `hub.*` requests itself, against its own database, instead of sending them
    to the hub over NATS. Only the monolith's composition root
    (`backend/composition_root.py`) asks for these.
    """
    if name in _COMPOSED:
        composed = _COMPOSED[name]()
        globals()[name] = composed  # cached: later lookups never reach __getattr__
        return composed
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
