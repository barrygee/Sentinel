"""Provider -> adapter lookup — the allow-list `FeedConfig.provider` is
validated against.

One adapter instance per process (adapters are stateless aside from their own
internal ref-map caches, which are already keyed per feed id), shared by the
poller and the router.
"""

from __future__ import annotations

from backend.services.land_feeds.adapters.durham import DurhamAdapter
from backend.services.land_feeds.adapters.snapshot import SnapshotAdapter
from backend.services.land_feeds.adapters.tfl_jamcams import TflJamCamsAdapter
from backend.services.land_feeds.adapters.twni import TwniAdapter
from backend.services.land_feeds.adapters.utmc import UtmcAdapter
from backend.services.land_feeds.base import FeedAdapter

_ADAPTERS: dict[str, FeedAdapter] = {
    "snapshot": SnapshotAdapter(),
    "durham": DurhamAdapter(),
    "tfl-jamcams": TflJamCamsAdapter(),
    "utmc": UtmcAdapter(),
    "twni": TwniAdapter(),
}


def get_adapter(provider: str) -> FeedAdapter:
    """Return the adapter for `provider`.

    Raises KeyError for anything outside the allow-list — callers should only
    ever pass a `FeedConfig.provider` value, which pydantic has already
    constrained to this same set, so a KeyError here means a bug, not
    untrusted input.
    """
    return _ADAPTERS[provider]
