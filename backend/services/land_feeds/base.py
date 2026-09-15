"""The adapter contract every Land feed provider implements.

An adapter turns one upstream schema family into the normalised
:class:`~backend.services.land_feeds.schema.FeedSnapshot` shape, and maps the
opaque ``ref`` in an image/clip URL back to the actual upstream resource. The
router and poller only ever talk to this interface — provider-specific
quirks (auth shape, field names, image URL pattern) stay inside the adapter.
"""

from __future__ import annotations

import time
from typing import Protocol, runtime_checkable

import httpx
from backend.services.land_feeds.schema import FeedConfig, FeedSnapshot, ProbeResult

# Fallback poll floor for any adapter that doesn't need a stricter one. Keeps
# a misconfigured `refreshSeconds` from ever driving faster than this.
DEFAULT_MIN_INTERVAL_SECONDS = 15.0


class FeedAdapterError(Exception):
    """Base class for adapter-raised errors — always sanitised before they
    reach a client (never the raw upstream body)."""


class FeedRefNotFound(FeedAdapterError):
    """The ``ref`` in an image/clip request doesn't map to a known upstream
    resource for this feed (stale ref, or the feed hasn't fetched yet)."""


class FeedUpstreamError(FeedAdapterError):
    """The upstream call itself failed (network error, non-2xx response)."""


class FeedOffline(FeedAdapterError):
    """The upstream says this specific camera/webcam is not currently live
    (night blackout, operator control, ``available:false``, ...)."""


@runtime_checkable
class FeedAdapter(Protocol):
    """Protocol every provider adapter implements.

    ``credential`` is the resolved secret dict (``{"username","password"}`` or
    ``{"apiKey"}``) or ``None`` when the feed's auth is optional/none — never
    a raw settings row.
    """

    #: Floor under `config.refreshSeconds` the poller must respect regardless
    #: of what the user configured (published upstream rate limits).
    min_interval_seconds: float = DEFAULT_MIN_INTERVAL_SECONDS

    #: Whether this provider exposes /clip/{ref} at all.
    supports_clips: bool = False

    async def fetch(self, config: FeedConfig, credential: dict | None) -> FeedSnapshot:
        """Poll the upstream and return a normalised snapshot.

        Raises :class:`FeedUpstreamError` on any failure — the poller decides
        what to do with the stale data, this call just reports success/fail.
        """
        ...

    async def probe(self, config: FeedConfig, credential: dict | None) -> ProbeResult:
        """A single best-effort call used by the Settings "TEST" button.

        Never raises — failures come back as ``ProbeResult(ok=False, ...)``
        with a sanitised message, since this runs on the request path.
        """
        ...

    async def image(self, config: FeedConfig, credential: dict | None, ref: str) -> tuple[bytes, str]:
        """Return (bytes, content_type) for one camera's current image.

        Raises :class:`FeedRefNotFound`, :class:`FeedOffline` or
        :class:`FeedUpstreamError`.
        """
        ...

    async def clip(self, config: FeedConfig, credential: dict | None, ref: str) -> tuple[bytes, str]:
        """Return (bytes, content_type) for one camera's video clip.

        Only implemented by providers with ``supports_clips = True``; the
        default raises :class:`FeedRefNotFound` so an adapter that doesn't
        override it behaves like "no such clip" rather than crashing.
        """
        raise FeedRefNotFound("this provider does not expose clips")


class RefMapMixin:
    """Shared bookkeeping for adapters that mint opaque refs during `fetch()`
    and need to resolve them back to an upstream URL in `image()`/`clip()`.

    Each feed gets its own map (keyed by feed id) so refs from one feed can
    never resolve against another's upstream, and entries expire so a feed
    that stops listing a camera eventually stops serving its old image URL.
    """

    _REF_TTL_SECONDS = 3600.0

    def __init__(self) -> None:
        self._ref_maps: dict[str, dict[str, tuple[str, float]]] = {}

    def _remember_ref(self, feed_id: str, ref: str, upstream_url: str) -> None:
        self._ref_maps.setdefault(feed_id, {})[ref] = (upstream_url, time.monotonic())

    @staticmethod
    def _ref_entry(upstream_url: str) -> tuple[str, float]:
        """Build one (url, timestamp) entry for a batch a fetch is assembling
        before handing it to `_replace_ref_map`."""
        return upstream_url, time.monotonic()

    def _resolve_ref(self, feed_id: str, ref: str) -> str | None:
        entry = self._ref_maps.get(feed_id, {}).get(ref)
        if entry is None:
            return None
        upstream_url, remembered_at = entry
        if time.monotonic() - remembered_at > self._REF_TTL_SECONDS:
            return None
        return upstream_url

    def _replace_ref_map(self, feed_id: str, fresh_map: dict[str, tuple[str, float]]) -> None:
        """Swap in the ref map built by the fetch that just completed.

        Replacing atomically (rather than clearing at the start of `fetch()`)
        means an in-flight image request always resolves against either the
        old or the new listing, never a window where the feed's map is empty."""
        self._ref_maps[feed_id] = fresh_map


class FeedAssetTooLarge(Exception):
    """Raised when a proxied image or clip exceeds the size cap."""


# Caps on what the image/clip proxy will buffer from an upstream. A traffic
# camera still is tens of kilobytes and a JamCam loop ~115 KB, so these are
# generous — they exist so a misconfigured `snapshot` URL (or a compromised
# upstream) cannot make the backend swallow arbitrarily large bodies.
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_CLIP_BYTES = 32 * 1024 * 1024


async def download_capped(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_bytes: int,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    auth: httpx.Auth | tuple[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    """GET `url` streaming the body, refusing to buffer more than `max_bytes`.

    Returns (status_code, headers, body). The check runs on the declared
    Content-Length first, then again as chunks arrive, so a server that lies
    about (or omits) the length is still bounded. Raises
    :class:`FeedAssetTooLarge` if the cap is hit; httpx errors propagate for
    the caller's usual handling. Redirects are not followed — the adapters
    resolved the exact upstream URL themselves, and following one could walk
    off the allow-listed host.
    """
    async with client.stream("GET", url, headers=headers, params=params, auth=auth) as response:
        declared_length = response.headers.get("content-length")
        if declared_length and declared_length.isdigit() and int(declared_length) > max_bytes:
            raise FeedAssetTooLarge(f"upstream declares {declared_length} bytes, cap is {max_bytes}")
        if response.status_code >= 400:
            # Drain nothing; let the caller map the status (404 → offline etc.).
            return response.status_code, dict(response.headers), b""
        chunks: list[bytes] = []
        received = 0
        async for chunk in response.aiter_bytes():
            received += len(chunk)
            if received > max_bytes:
                raise FeedAssetTooLarge(f"upstream body exceeded {max_bytes} bytes")
            chunks.append(chunk)
        return response.status_code, dict(response.headers), b"".join(chunks)
