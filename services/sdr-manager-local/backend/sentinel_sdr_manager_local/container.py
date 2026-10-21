"""Composition root: builds every adapter and service and runs them (Sentry architecture §4.4).

Sentry's `main.py`, moved over (ADR 0007). Kept thin per the dependency rule
— `routers -> services -> interfaces <- adapters`. This module is the *only*
place that chooses concrete adapters, constructs every service, and wires
them together via `AppContainer`; everything downstream depends on the narrow
Protocol or the already-built service, never on how it was assembled.

What changed in the move:
  - the schema is built by `database.py` (no Alembic) in Sentinel's own
    database, and its session factory is Sentinel's;
  - the position is Sentinel's Location setting (`location_source.py`), not a
    table of SDR Manager's;
  - `SDR_MANAGER_LOCAL_HARDWARE=fake` swaps every host-facing adapter for the
    simulated ones (`adapters/simulated_hardware.py`);
  - startup and shutdown run as a `ModuleLifecycle` of `service.py`'s
    `create_service()` app, which needs no core: dongles keep streaming while
    core is down (`serve_before_core`).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path

from backend import database as core_database
from backend.platform.lifecycle import ModuleLifecycle
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from sentinel_sdr_manager_local.adapters.asyncio_process import AsyncioProcessSpawner
from sentinel_sdr_manager_local.adapters.composite_hotplug import CompositeHotplugSource
from sentinel_sdr_manager_local.adapters.ctypes_rtlsdr import CtypesRtlSdrLibrary, RtlSdrLibraryUnavailableError
from sentinel_sdr_manager_local.adapters.gated_wifi_ap import GatedWifiApController
from sentinel_sdr_manager_local.adapters.net import SocketPortProber
from sentinel_sdr_manager_local.adapters.nmcli_wifi_ap import NmcliWifiApController, UnavailableWifiApController
from sentinel_sdr_manager_local.adapters.reconcile_hotplug import ReconcileHotplugSource
from sentinel_sdr_manager_local.adapters.simulated_hardware import build_simulated_hardware
from sentinel_sdr_manager_local.adapters.sysfs_usb import SysfsUsbDiscovery
from sentinel_sdr_manager_local.adapters.system_clock import SystemClock
from sentinel_sdr_manager_local.adapters.udev_netlink import UdevNetlinkHotplugSource
from sentinel_sdr_manager_local.config import Settings, get_settings
from sentinel_sdr_manager_local.database import create_sdr_manager_local_tables, seed_single_row_tables
from sentinel_sdr_manager_local.example_fixtures import SDR_MANAGER_LOCAL_VERSION
from sentinel_sdr_manager_local.interfaces.clock import Clock
from sentinel_sdr_manager_local.interfaces.process import ProcessSpawner
from sentinel_sdr_manager_local.interfaces.rtlsdr import RtlSdrLibrary
from sentinel_sdr_manager_local.interfaces.types import RtlSdrUsbStrings
from sentinel_sdr_manager_local.interfaces.usb import HotplugSource, UsbDiscovery
from sentinel_sdr_manager_local.interfaces.wifi_ap import WifiApController
from sentinel_sdr_manager_local.location_source import CoreLocationSource
from sentinel_sdr_manager_local.repositories.device_repository import DeviceRepository
from sentinel_sdr_manager_local.services.console_auth import ConsoleAuthService
from sentinel_sdr_manager_local.services.control_follower import ControlFollowerService
from sentinel_sdr_manager_local.services.device_registry import DeviceRegistry
from sentinel_sdr_manager_local.services.device_reservations import DeviceReservationService
from sentinel_sdr_manager_local.services.eeprom import EepromService
from sentinel_sdr_manager_local.services.event_bus import EventBus
from sentinel_sdr_manager_local.services.health import HealthService
from sentinel_sdr_manager_local.services.host_control_settings import HostControlSettingsService
from sentinel_sdr_manager_local.services.hotplug import HotplugService
from sentinel_sdr_manager_local.services.hotspot import HotspotService
from sentinel_sdr_manager_local.services.port_allocator import PortAllocatorService
from sentinel_sdr_manager_local.services.supervisor import SupervisorService
from sentinel_sdr_manager_local.services.usb_discovery import UsbDiscoveryService

_logger = logging.getLogger(__name__)


class _NullRtlSdrLibrary:
    """A `RtlSdrLibrary` reporting zero devices, for hosts with no `librtlsdr` installed.

    Constructing the real `CtypesRtlSdrLibrary` fails on any host (or image)
    missing `librtlsdr0`; rather than crashing the whole process at startup,
    SDR Manager degrades to "no dongles resolvable" — every spawn attempt then
    correctly reports `state_reason=index_unresolved` instead of the process
    refusing to boot at all. The `sdr-manager-local` image always ships
    librtlsdr, so `CtypesRtlSdrLibrary` is used there.
    """

    def is_available(self) -> bool:
        """Always `False` — no real `librtlsdr` was ever loaded."""
        return False

    def device_count(self) -> int:
        """Always zero — no library is loaded to enumerate anything."""
        return 0

    def usb_strings(self, index: int) -> RtlSdrUsbStrings:
        """Always raises: there is never a valid index against zero devices."""
        raise IndexError(f"no RtlSdrLibrary loaded; index {index} does not exist")


def _build_rtlsdr_library() -> RtlSdrLibrary:
    """Construct the real ctypes-backed library, degrading to the null object if unavailable."""
    try:
        return CtypesRtlSdrLibrary()
    except RtlSdrLibraryUnavailableError:
        _logger.warning(
            "librtlsdr is unavailable on this host; RTL-SDR index resolution will always "
            "report index_unresolved. Install librtlsdr, or run with SDR_MANAGER_LOCAL_HARDWARE=fake "
            "to develop without dongles."
        )
        return _NullRtlSdrLibrary()


DBUS_SYSTEM_BUS_SOCKET = Path("/run/dbus/system_bus_socket")
"""The host's system D-Bus socket, which `nmcli` needs to reach NetworkManager.

Present only when compose mounts it (Sentry ADR-0007). Its absence is the
normal state on a developer workstation and on any deployment that has not
opted into hotspot control, so it degrades rather than failing."""


def _build_wifi_ap_controller(settings: Settings, process_spawner: ProcessSpawner) -> WifiApController:
    """Construct the real nmcli-backed controller, degrading to the null object.

    Follows `_build_rtlsdr_library`'s precedent exactly: an optional capability
    the host may simply not have must never crash startup. Two things have to be
    true for real control — `nmcli` exists, and the host's D-Bus socket is
    reachable — and each failing case names itself in the log so an operator
    knows which one to fix.

    Whether the operator has *switched control on* is not decided here: it is
    a database value the operator can flip at runtime (Sentry ADR-0013), applied
    per call by `GatedWifiApController`. This function answers only "can this
    host do it at all", which really is fixed for the life of the process.
    """
    if shutil.which(settings.nmcli_path) is None:
        _logger.warning(
            "hotspot control is enabled but %s was not found; the hotspot API will report "
            "available=false. Expected on a developer workstation; the sdr-manager-local "
            "image installs network-manager.",
            settings.nmcli_path,
        )
        return UnavailableWifiApController(
            f"{settings.nmcli_path} is not installed.",
            nm_state_root=Path(settings.nm_state_root),
        )
    if not DBUS_SYSTEM_BUS_SOCKET.exists():
        _logger.warning(
            "hotspot control is enabled but %s is missing, so nmcli cannot reach the host's "
            "NetworkManager; the hotspot API will report available=false. The sdr-manager-local "
            "compose service mounts it (Sentry ADR-0007).",
            DBUS_SYSTEM_BUS_SOCKET,
        )
        return UnavailableWifiApController(
            "The host's D-Bus socket is not mounted into this container.",
            nm_state_root=Path(settings.nm_state_root),
        )
    # Whether a console password exists is a database fact, not a setting, and
    # this runs while the container is still being assembled — so no warning
    # about it here. The router refuses each hotspot mutation individually,
    # which reaches the operator at the moment it matters.
    return NmcliWifiApController(
        process_spawner=process_spawner,
        nmcli_path=settings.nmcli_path,
        connection_name=settings.hotspot_connection_name,
        nm_state_root=Path(settings.nm_state_root),
        timeout_s=settings.nmcli_timeout_s,
    )


@dataclass
class _HostAdapters:
    """The adapters that face the host: real ones, or the simulated set."""

    usb_discovery: UsbDiscovery
    hotplug_source: HotplugSource
    process_spawner: ProcessSpawner
    rtlsdr_library: RtlSdrLibrary
    hotspot_controller: WifiApController


def _build_host_adapters(settings: Settings, clock: Clock) -> _HostAdapters:
    if settings.hardware == "fake":
        _logger.warning("SDR_MANAGER_LOCAL_HARDWARE=fake: simulating two RTL-SDRs; no dongle is used")
        simulated = build_simulated_hardware()
        return _HostAdapters(
            usb_discovery=simulated.usb_discovery,
            hotplug_source=ReconcileHotplugSource(simulated.usb_discovery, clock, settings.reconcile_interval_s),
            process_spawner=simulated.process_spawner,
            rtlsdr_library=simulated.rtlsdr_library,
            hotspot_controller=simulated.wifi_ap_controller,
        )
    sysfs_root = Path(settings.sysfs_root)
    process_spawner = AsyncioProcessSpawner()
    return _HostAdapters(
        usb_discovery=SysfsUsbDiscovery(sysfs_root),
        hotplug_source=CompositeHotplugSource(
            primary_factory=lambda: UdevNetlinkHotplugSource(clock),
            fallback=ReconcileHotplugSource(SysfsUsbDiscovery(sysfs_root), clock, settings.reconcile_interval_s),
        ),
        process_spawner=process_spawner,
        rtlsdr_library=_build_rtlsdr_library(),
        hotspot_controller=_build_wifi_ap_controller(settings, process_spawner),
    )


@dataclass
class AppContainer:
    """Every long-lived collaborator the HTTP layer depends on, built once at startup.

    Attached to the SDR Manager API app's `state.container`; routers reach it
    only through the `Depends()` accessors in `dependencies.py`, never directly.
    """

    settings: Settings
    clock: Clock
    session_factory: async_sessionmaker[AsyncSession]
    event_bus: EventBus
    device_registry: DeviceRegistry
    hotplug_service: HotplugService
    supervisor: SupervisorService
    control_follower: ControlFollowerService
    eeprom_service: EepromService
    port_allocator: PortAllocatorService
    health_service: HealthService
    hotspot_service: HotspotService
    console_auth_service: ConsoleAuthService
    host_control_settings: HostControlSettingsService
    location_source: CoreLocationSource
    device_reservations: DeviceReservationService
    background_tasks: list[asyncio.Task[None]]


def build_container(settings: Settings) -> AppContainer:
    """Construct every adapter and service, wired per Sentry architecture §4.3/§4.4.

    Chooses the real, production adapters unless `settings.hardware` is
    `fake`; `_build_rtlsdr_library` and `_build_wifi_ap_controller` degrade
    gracefully rather than crashing on a host without librtlsdr or nmcli.
    """
    clock: Clock = SystemClock()
    # Bound to Sentinel's engine, which is this service's own database (DB_PATH).
    # `expire_on_commit=False` so a row returned from a repository method stays
    # readable after its transaction commits.
    session_factory = async_sessionmaker(core_database.engine, expire_on_commit=False)
    # One process-wide `DeviceRepository`, backed by a session-per-call (see
    # that module's docstring) rather than one long-lived shared session —
    # `DeviceRegistry`'s background hotplug-consumer task and concurrent HTTP
    # request handlers (via `PortAllocatorService`) both call into it, and a
    # single `AsyncSession` is not safe for that kind of concurrent use.
    device_repository = DeviceRepository(session_factory)

    event_bus = EventBus(clock)
    device_registry = DeviceRegistry(device_repository, event_bus, clock)

    host_adapters = _build_host_adapters(settings, clock)
    usb_discovery_service = UsbDiscoveryService(host_adapters.usb_discovery)
    hotplug_service = HotplugService(host_adapters.hotplug_source, usb_discovery_service, clock, event_bus)

    process_spawner = host_adapters.process_spawner
    rtlsdr_library = host_adapters.rtlsdr_library
    # Built before `SupervisorService`, which takes it directly, so live
    # per-dongle tuning reaches a running pair and `DeviceStatus.tuner` is populated.
    control_follower = ControlFollowerService(device_registry, clock)
    supervisor = SupervisorService(
        process_spawner=process_spawner,
        rtlsdr_library=rtlsdr_library,
        device_registry=device_registry,
        clock=clock,
        event_bus=event_bus,
        rtl_tcp_path=settings.rtl_tcp_path,
        relay_path=settings.relay_path,
        internal_port_base=settings.internal_port_base,
        max_devices=settings.max_devices,
        control_follower=control_follower,
    )
    eeprom_service = EepromService(
        process_spawner=process_spawner,
        rtlsdr_library=rtlsdr_library,
        supervisor=supervisor,
        device_registry=device_registry,
        rtl_eeprom_path=settings.rtl_eeprom_path,
        event_bus=event_bus,
    )
    port_allocator = PortAllocatorService(
        port_prober=SocketPortProber(),
        device_repository=device_repository,
        http_port=settings.http_port,
        internal_port_base=settings.internal_port_base,
        max_devices=settings.max_devices,
        operator_reserved_ports=settings.reserved_port_numbers(),
    )
    health_service = HealthService(
        device_registry=device_registry,
        hotplug=hotplug_service,
        started_at_ms=clock.now_ms(),
        version=SDR_MANAGER_LOCAL_VERSION,
    )
    # The password lives in SDR Manager's own database (Sentry ADR-0010), not
    # the environment, so it survives a container recreation the way device
    # configuration does.
    console_auth_service = ConsoleAuthService(session_factory)
    location_source = CoreLocationSource(clock, settings.location_refresh_s)
    # A lease outlives the request that took it and must survive a container
    # recreation, like every other stored fact.
    device_reservations = DeviceReservationService(session_factory, clock)

    # `.env` can still force hotspot control on and, when it does, wins over the
    # stored value permanently (Sentry ADR-0013).
    host_control_settings = HostControlSettingsService(
        session_factory,
        clock,
        forced_hotspot_control_enabled=settings.hotspot_control_enabled,
    )
    # Both controllers are built up front; which one answers is decided per call.
    # With control switched off nothing reaches nmcli or D-Bus (Sentry ADR-0007),
    # which is why this is a delegating wrapper rather than a flag inside the
    # nmcli adapter.
    hotspot_controller = GatedWifiApController(
        enabled_controller=host_adapters.hotspot_controller,
        disabled_controller=UnavailableWifiApController(
            "Hotspot control is switched off for this SDR Manager.",
            nm_state_root=Path(settings.nm_state_root),
        ),
        control_enabled=host_control_settings.hotspot_control_enabled,
    )

    hotspot_service = HotspotService(
        controller=hotspot_controller,
        event_bus=event_bus,
        clock=clock,
        default_gateway_cidr=settings.hotspot_gateway_cidr,
        confirm_timeout_s=settings.hotspot_confirm_timeout_s,
        configured_interface=settings.hotspot_interface,
        hotspot_connection_name=settings.hotspot_connection_name,
    )

    return AppContainer(
        settings=settings,
        clock=clock,
        session_factory=session_factory,
        event_bus=event_bus,
        device_registry=device_registry,
        hotplug_service=hotplug_service,
        supervisor=supervisor,
        control_follower=control_follower,
        eeprom_service=eeprom_service,
        port_allocator=port_allocator,
        health_service=health_service,
        hotspot_service=hotspot_service,
        console_auth_service=console_auth_service,
        host_control_settings=host_control_settings,
        location_source=location_source,
        device_reservations=device_reservations,
        background_tasks=[],
    )


async def _run_hotplug_forever(container: AppContainer) -> None:
    """Background task: consume the hotplug stream for the process lifetime."""
    try:
        await container.hotplug_service.run()
    except asyncio.CancelledError:
        raise
    except Exception:
        _logger.exception("hotplug service crashed")


RECONCILE_DEBOUNCE_S = 0.25
"""Coalesces a burst of `device_changed`/`device_removed` events into one
`reconcile()` call (finding: reconcile amplification). `reconcile()` always
reads the registry's *live* desired set rather than anything carried by the
triggering event, so a debounced call is never stale — merely less frequent —
which is what keeps an operator alternating a device between two valid ports
from holding the SDRs in continuous stop/respawn churn."""


async def _run_supervisor_reconcile_loop(container: AppContainer) -> None:
    """Background task: re-run the supervisor's reconcile whenever the registry changes.

    `DeviceRegistry` already owns its own subscription to `HotplugService`'s
    internal `internal.device_arrived` / `internal.device_departed` messages
    (started from `DeviceRegistry.load()`), so this loop must **not** forward
    those same internal messages into the registry a second time — every
    arrival/departure would then be applied twice. The one thing the registry
    cannot do for itself is re-run `SupervisorService.reconcile()` (it has no
    reference to the supervisor, by design — Sentry architecture §4.3's
    dependency direction), so that is the sole responsibility left here:
    whenever the registry publishes a public `device_changed` /
    `device_removed` event, bring the running process set back in line with
    its desired set — debounced by `RECONCILE_DEBOUNCE_S`.

    **Guaranteed trailing reconcile.** A single `asyncio.Event` is set on
    every qualifying message and a single worker (`_reconcile_worker`) clears
    it *before* debouncing and reconciling, then loops back to check it again —
    so a `device_changed` that arrives during the debounce sleep *or* during
    `reconcile()` itself produces one more reconcile pass, never zero.
    """
    reconcile_requested = asyncio.Event()
    worker_task = asyncio.create_task(
        _reconcile_worker(container, reconcile_requested), name="supervisor-reconcile-worker"
    )
    subscription = container.event_bus.subscribe()
    try:
        async for message in subscription:
            if message.event not in ("device_changed", "device_removed"):
                continue
            reconcile_requested.set()
    except asyncio.CancelledError:
        raise
    except Exception:
        _logger.exception("supervisor reconcile loop crashed")
    finally:
        worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker_task


async def _reconcile_worker(container: AppContainer, reconcile_requested: asyncio.Event) -> None:
    """Wait for a requested reconcile, debounce, run it, and repeat while more were requested.

    Clearing `reconcile_requested` *before* debouncing/reconciling (rather
    than after) is what makes this loss-proof: any `set()` landing between
    that `clear()` and the next `wait()` is still observed.
    """
    while True:
        await reconcile_requested.wait()
        reconcile_requested.clear()
        try:
            await container.clock.sleep(RECONCILE_DEBOUNCE_S)
        except asyncio.CancelledError:
            return
        try:
            await container.supervisor.reconcile()
        except asyncio.CancelledError:
            return
        except Exception:
            _logger.exception("supervisor reconcile crashed")


async def start_container(container: AppContainer) -> None:
    """Load state, bring the supervised pairs in line, and start the background loops."""
    await container.device_registry.load()
    await container.supervisor.reconcile()
    container.background_tasks.append(asyncio.create_task(_run_hotplug_forever(container)))
    container.background_tasks.append(asyncio.create_task(_run_supervisor_reconcile_loop(container)))
    container.background_tasks.append(
        asyncio.create_task(container.location_source.run(), name="sdr-manager-local-location")
    )


async def stop_container(container: AppContainer) -> None:
    """Reap everything `start_container` began.

    Order matters: background loops are cancelled first (so nothing keeps
    mutating the registry), then every supervised `rtl_tcp`+relay pair is
    terminated and, after a grace period, killed — no orphaned child process
    may survive `docker stop` — then the hotplug source is closed.
    """
    for task in container.background_tasks:
        task.cancel()
    for task in container.background_tasks:
        with contextlib.suppress(asyncio.CancelledError):
            await task

    try:
        await container.hotplug_service.close()
    except Exception:
        _logger.exception("error closing hotplug service")

    try:
        await container.supervisor.stop_all()
    except Exception:
        _logger.exception("error stopping supervised processes")

    try:
        # Cancels any armed rollback timer only — deliberately does not roll a
        # hotspot back on the way out, since a container restart must not tear
        # down a working network (Sentry ADR-0007).
        await container.hotspot_service.close()
    except Exception:
        _logger.exception("error closing hotspot service")

    try:
        await container.device_registry.close()
    except Exception:
        _logger.exception("error closing device registry")


def container_lifecycle(api_app: FastAPI) -> ModuleLifecycle:
    """SDR Manager's startup and shutdown, as a lifecycle that needs no core.

    `prepare` builds and seeds the schema; `start` builds the container onto
    `api_app.state.container` (where `dependencies.py` finds it) and starts
    it; `stop` reaps it; `wake` ends open SSE streams so a stop doesn't hang.
    """
    started: AppContainer | None = None

    async def prepare() -> None:
        await create_sdr_manager_local_tables()
        await seed_single_row_tables()

    async def start() -> None:
        nonlocal started
        started = build_container(get_settings())
        api_app.state.container = started
        await start_container(started)

    async def stop() -> None:
        nonlocal started
        if started is not None:
            await stop_container(started)
            started = None

    def wake() -> None:
        if started is not None:
            started.event_bus.close()

    return ModuleLifecycle(name="sdr-manager-local", prepare=prepare, start=start, stop=stop, wake=wake)
