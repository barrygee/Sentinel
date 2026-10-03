"""Sea section lifecycle: the AISStream reader and its warm-start snapshot."""

from backend.platform.lifecycle import ModuleLifecycle
from backend.services.ais_stream import reader as ais_reader

# Warms the vessel store from the last snapshot and starts the AISStream
# watchdog (it only opens the socket once the domain is enabled and keyed).
lifecycle = ModuleLifecycle(name="sea", start=ais_reader.start, stop=ais_reader.stop, wake=ais_reader.wake)
