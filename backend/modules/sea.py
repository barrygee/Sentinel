"""Sea section lifecycle: the AISStream reader, its warm-start snapshot, and the off-grid AIS receiver."""

from backend.platform.lifecycle import ModuleLifecycle
from backend.services import sea_ais_receiver
from backend.services.ais_stream import reader as ais_reader


async def _start() -> None:
    # Warms the vessel store from the last snapshot and starts the AISStream
    # watchdog (it only opens the socket once the domain is enabled and keyed).
    await ais_reader.start()
    # Off grid with a designated AIS radio, start decoding now rather than when
    # the Sea page is first opened. Runs after the radio hub has started.
    await sea_ais_receiver.reconcile_now()


lifecycle = ModuleLifecycle(name="sea", start=_start, stop=ais_reader.stop, wake=ais_reader.wake)
