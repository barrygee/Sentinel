"""``snapshot`` provider — a single JPEG URL polled at a fixed, user-entered
location.

This is the generic fallback for any camera whose operator only offers a
plain image URL: the feed config's own `location` supplies the coordinates
(there is no upstream feature list to derive them from), and `fetch()` just
confirms the image is reachable. The one feature it emits always uses the
fixed ref ``"snapshot"``.

Because the target host is entirely user-supplied, this adapter is the SSRF
boundary: https is enforced at the schema layer, and this module additionally
resolves the hostname and refuses private/loopback/link-local/reserved
addresses before every fetch — a URL that resolved safely at config-save time
could still be repointed via DNS by the time the poller calls it.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

import httpx
from backend.services.land_feeds.base import (
    MAX_IMAGE_BYTES,
    FeedAssetTooLarge,
    FeedOffline,
    FeedRefNotFound,
    FeedUpstreamError,
    RefMapMixin,
    download_capped,
)
from backend.services.land_feeds.schema import (
    FeedConfig,
    FeedFeature,
    FeedFeatureProperties,
    FeedSnapshot,
    ProbeResult,
)

_SNAPSHOT_REF = "snapshot"
_REQUEST_TIMEOUT_SECONDS = 10.0
_USER_AGENT = "Sentinel"


class SsrfBlockedHost(FeedUpstreamError):
    """The configured host resolves to a private/loopback/link-local/reserved
    address and is refused rather than fetched."""


def _assert_public_host(url: str) -> None:
    """Raise :class:`SsrfBlockedHost` if `url`'s host resolves to a
    non-public address. Best-effort: DNS can still change between this check
    and the request, but it closes the obvious "point the feed at an internal
    service" misconfiguration."""
    hostname = urlsplit(url).hostname
    if not hostname:
        raise SsrfBlockedHost("snapshot URL has no hostname")
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except OSError as exc:
        raise SsrfBlockedHost(f"could not resolve {hostname!r}") from exc
    for _family, _type, _proto, _canonname, sockaddr in addr_infos:
        raw_address = sockaddr[0]
        address = ipaddress.ip_address(raw_address)
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
            raise SsrfBlockedHost(f"{hostname!r} resolves to a non-public address")


class SnapshotAdapter(RefMapMixin):
    """Polls one fixed JPEG URL and reports it as a single camera feature."""

    min_interval_seconds = 15.0
    supports_clips = False

    def __init__(self) -> None:
        super().__init__()

    def _headers_and_params(self, config: FeedConfig, credential: dict | None) -> tuple[dict[str, str], dict[str, str]]:
        headers = {"User-Agent": _USER_AGENT}
        params: dict[str, str] = {}
        if config.auth.type == "basic" or config.auth.type == "apiKey":
            api_key = (credential or {}).get("apiKey") if config.auth.type == "apiKey" else None
            if api_key and config.auth.header_name:
                headers[config.auth.header_name] = api_key
            elif api_key and config.auth.query_param:
                params[config.auth.query_param] = api_key
        return headers, params

    def _auth(self, config: FeedConfig, credential: dict | None) -> httpx.BasicAuth | None:
        if config.auth.type != "basic" or not credential:
            return None
        username, password = credential.get("username"), credential.get("password")
        if not username or not password:
            return None
        return httpx.BasicAuth(username, password)

    async def fetch(self, config: FeedConfig, credential: dict | None) -> FeedSnapshot:
        assert config.location is not None  # enforced by FeedConfig validation
        _assert_public_host(config.url)
        headers, params = self._headers_and_params(config, credential)
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.head(
                    config.url, headers=headers, params=params, auth=self._auth(config, credential)
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise FeedUpstreamError(str(exc)) from exc

        self._replace_ref_map(config.id, {_SNAPSHOT_REF: self._ref_entry(config.url)})
        properties = FeedFeatureProperties(
            id=f"{config.id}:{_SNAPSHOT_REF}",
            name=config.name,
            state="live",
            image_url=f"/api/land/feeds/{config.id}/image/{_SNAPSHOT_REF}",
            source_id=config.id,
            source_name=config.name,
        )
        feature = FeedFeature.point(
            longitude=config.location.longitude, latitude=config.location.latitude, properties=properties
        )
        return FeedSnapshot(features=[feature])

    async def probe(self, config: FeedConfig, credential: dict | None) -> ProbeResult:
        try:
            snapshot = await self.fetch(config, credential)
        except SsrfBlockedHost as exc:
            return ProbeResult(ok=False, message=str(exc), feature_count=0)
        except FeedUpstreamError:
            return ProbeResult(ok=False, message="could not reach the snapshot URL", feature_count=0)
        return ProbeResult(ok=True, message="snapshot reachable", feature_count=len(snapshot.features))

    async def image(self, config: FeedConfig, credential: dict | None, ref: str) -> tuple[bytes, str]:
        upstream_url = self._resolve_ref(config.id, ref)
        if upstream_url is None:
            raise FeedRefNotFound(f"unknown snapshot ref {ref!r}")
        _assert_public_host(upstream_url)
        headers, params = self._headers_and_params(config, credential)
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                status_code, response_headers, body = await download_capped(
                    client,
                    upstream_url,
                    max_bytes=MAX_IMAGE_BYTES,
                    headers=headers,
                    params=params,
                    auth=self._auth(config, credential),
                )
        except httpx.HTTPError as exc:
            raise FeedUpstreamError(str(exc)) from exc
        except FeedAssetTooLarge as exc:
            raise FeedUpstreamError(str(exc)) from exc
        if status_code == 404:
            raise FeedOffline("snapshot image not currently available")
        if status_code >= 400:
            raise FeedUpstreamError(f"upstream returned HTTP {status_code}")
        content_type = response_headers.get("content-type", "image/jpeg").split(";")[0].strip()
        return body, content_type
