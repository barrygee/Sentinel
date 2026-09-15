"""``twni`` provider — TrafficWatchNI (Department for Infrastructure, Northern Ireland).

TrafficWatchNI publishes no API. Its public map page loads camera positions
through the same endpoint a browser uses, so this adapter drives that page the
way a browser would — which is scraping, and is flagged as such in the plan:
the images are Crown copyright and the site's terms apply. Keep the cadence
gentle (the poll floor below is 5 minutes) and stop using it if DfI object.

Three kinds of request:

1. ``GET {url}/twni/cameras`` — only to collect the session cookie and the
   CSRF token (``<meta name="_csrf">``) the data call insists on.
2. ``POST {url}/twni/map/mapData`` with ``selectedTypes=CCTV_CAMERAS`` — JSON
   ``{"mapData": {"CCTV_CAMERAS": [{id, latitude, longitude, summary, ...}]}}``.
   One call lists every camera (~145), so this is the whole poll.
3. Lazily, per camera, on first image request: ``GET
   {url}/twni/cameras/cctvMapPopup?id=<id>`` — the popup fragment whose
   ``<img class="cctvImage" src="https://cctv.trafficwatchni.com/<n>.jpg">``
   reveals which blob the camera writes to. The camera-id → image-number map
   is stable, so it is cached for the life of the process; the JPEG itself
   comes from ``cctv.trafficwatchni.com`` (an Azure blob store that 403s
   anything without a browser-like User-Agent and a trafficwatchni Referer).

Camera ids are decimal strings, used directly as the opaque ref.
"""

from __future__ import annotations

import logging
import re

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
    FEED_REF_PATTERN,
    FeedConfig,
    FeedFeature,
    FeedFeatureProperties,
    FeedSnapshot,
    ProbeResult,
)

logger = logging.getLogger(__name__)

_REQUEST_TIMEOUT_SECONDS = 20.0
# The image host refuses non-browser agents; the page endpoints do not care,
# but one agent string keeps the session coherent.
_BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0 Safari/537.36 Sentinel"
)
_IMAGE_HOST = "cctv.trafficwatchni.com"
_ATTRIBUTION = "© Crown copyright — TrafficWatchNI, Department for Infrastructure"

_CSRF_META_PATTERN = re.compile(r'name="_csrf"\s+content="([^"]+)"')
_CSRF_HEADER_META_PATTERN = re.compile(r'name="_csrf_header"\s+content="([^"]+)"')
# The popup's <img class="... cctvImage ..." src="https://cctv.trafficwatchni.com/125.jpg?cache=...">
_POPUP_IMAGE_PATTERN = re.compile(
    r'class="[^"]*cctvImage[^"]*"\s+src="(https://' + re.escape(_IMAGE_HOST) + r"/[0-9]+\.jpg)"
)


class TwniAdapter(RefMapMixin):
    """Polls the TrafficWatchNI map data for camera positions; resolves images lazily."""

    min_interval_seconds = 300.0
    supports_clips = False

    def __init__(self) -> None:
        super().__init__()
        # camera id -> blob URL, learned from the popup fragment on first use.
        self._image_urls: dict[str, str] = {}

    @staticmethod
    def _headers(referer: str) -> dict[str, str]:
        return {"User-Agent": _BROWSER_USER_AGENT, "Referer": referer}

    async def _fetch_camera_rows(self, config: FeedConfig) -> list[dict]:
        cameras_page = f"{config.url}/twni/cameras"
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                page = await client.get(cameras_page, headers=self._headers(config.url))
                page.raise_for_status()
                token_match = _CSRF_META_PATTERN.search(page.text)
                header_match = _CSRF_HEADER_META_PATTERN.search(page.text)
                if not token_match:
                    raise FeedUpstreamError("TrafficWatchNI page had no CSRF token")
                csrf_header = header_match.group(1) if header_match else "X-CSRF-TOKEN"
                response = await client.post(
                    f"{config.url}/twni/map/mapData",
                    data={"selectedTypes": "CCTV_CAMERAS", "roadworksEndDateFilter": ""},
                    headers={
                        **self._headers(cameras_page),
                        csrf_header: token_match.group(1),
                        "X-Requested-With": "XMLHttpRequest",
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise FeedUpstreamError(str(exc)) from exc
        rows = payload.get("mapData", {}).get("CCTV_CAMERAS") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            raise FeedUpstreamError("unexpected TrafficWatchNI response shape")
        return [row for row in rows if isinstance(row, dict)]

    async def fetch(self, config: FeedConfig, credential: dict | None) -> FeedSnapshot:
        rows = await self._fetch_camera_rows(config)
        fresh_ref_map: dict[str, tuple[str, float]] = {}
        out_features: list[FeedFeature] = []
        for row in rows:
            camera_id = str(row.get("id", "")).strip()
            latitude, longitude = row.get("latitude"), row.get("longitude")
            if not camera_id or not FEED_REF_PATTERN.match(camera_id):
                continue
            if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
                continue
            # The ref map holds the popup URL; the blob URL is learned from it
            # on first image request and cached in `_image_urls`.
            fresh_ref_map[camera_id] = self._ref_entry(f"{config.url}/twni/cameras/cctvMapPopup?id={camera_id}")
            properties = FeedFeatureProperties(
                id=f"{config.id}:{camera_id}",
                name=" ".join(str(row.get("summary", "")).split()) or f"Camera {camera_id}",
                description="",
                view=None,
                updated_at=None,
                state="live",
                image_url=f"/api/land/feeds/{config.id}/image/{camera_id}",
                source_id=config.id,
                source_name=config.name,
                attribution=_ATTRIBUTION,
            )
            out_features.append(
                FeedFeature.point(longitude=float(longitude), latitude=float(latitude), properties=properties)
            )
        self._replace_ref_map(config.id, fresh_ref_map)
        return FeedSnapshot(features=out_features)

    async def probe(self, config: FeedConfig, credential: dict | None) -> ProbeResult:
        try:
            snapshot = await self.fetch(config, credential)
        except FeedUpstreamError:
            return ProbeResult(ok=False, message="could not reach TrafficWatchNI", feature_count=0)
        if not snapshot.features:
            return ProbeResult(ok=True, message="reachable, but returned no cameras", feature_count=0)
        return ProbeResult(ok=True, message=f"{len(snapshot.features)} cameras", feature_count=len(snapshot.features))

    async def _resolve_image_url(self, client: httpx.AsyncClient, config: FeedConfig, ref: str) -> str:
        cached = self._image_urls.get(ref)
        if cached:
            return cached
        popup_url = self._resolve_ref(config.id, ref)
        if popup_url is None:
            raise FeedRefNotFound(f"unknown TrafficWatchNI camera ref {ref!r}")
        response = await client.get(popup_url, headers=self._headers(f"{config.url}/twni/cameras"))
        response.raise_for_status()
        match = _POPUP_IMAGE_PATTERN.search(response.text)
        if not match:
            raise FeedOffline("camera has no image right now")
        self._image_urls[ref] = match.group(1)
        return match.group(1)

    async def image(self, config: FeedConfig, credential: dict | None, ref: str) -> tuple[bytes, str]:
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                image_url = await self._resolve_image_url(client, config, ref)
                status_code, headers, body = await download_capped(
                    client,
                    image_url,
                    max_bytes=MAX_IMAGE_BYTES,
                    headers={**self._headers(f"{config.url}/"), "Accept": "image/*,*/*;q=0.8"},
                )
        except httpx.HTTPError as exc:
            raise FeedUpstreamError(str(exc)) from exc
        except FeedAssetTooLarge as exc:
            raise FeedUpstreamError(str(exc)) from exc
        if status_code == 404:
            raise FeedOffline("camera image not currently available")
        if status_code >= 400:
            # A stale mapping is the likeliest cause of a refusal; forget it so
            # the next request re-reads the popup.
            self._image_urls.pop(ref, None)
            raise FeedUpstreamError(f"upstream returned HTTP {status_code}")
        # The blob store labels JPEGs application/octet-stream; we know better.
        content_type = headers.get("content-type", "").split(";")[0].strip()
        if not content_type.startswith("image/"):
            content_type = "image/jpeg"
        return body, content_type
