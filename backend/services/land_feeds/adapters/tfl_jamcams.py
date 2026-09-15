"""``tfl-jamcams`` provider — Transport for London JamCams (Greater London).

One list call per poll (`GET {url}/Place/Type/JamCam`), optionally carrying an
`app_key` query parameter that lifts TfL's anonymous 50 req/min budget to
500/min. Each place's `additionalProperties` is a flat key/value list rather
than a nested object — `imageUrl` (JPEG still), `videoUrl` (short MP4 loop),
`view` (compass direction) and `available` ("true"/"false" string) are pulled
out of it. Image/clip URLs are only ever trusted when they resolve to TfL's
own asset hosts; anything else is dropped rather than proxied.
"""

from __future__ import annotations

from urllib.parse import urlsplit

import httpx
from backend.services.land_feeds.base import (
    MAX_CLIP_BYTES,
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

_REQUEST_TIMEOUT_SECONDS = 10.0
_USER_AGENT = "Sentinel"
_ATTRIBUTION = "Powered by TfL Open Data"

# Only these hosts are ever proxied — TfL's own asset hosts for JamCam stills
# and clips. Anything else in `additionalProperties` (a future TfL response
# change, or a compromised upstream) is silently dropped, never fetched.
_ALLOWED_ASSET_HOSTS = ("s3-eu-west-1.amazonaws.com", "jamcams.tfl.gov.uk")


def _clean_ref(place_id: str) -> str | None:
    """TfL place ids look like `JamCams_00002.00865`; the ref is the part
    after the prefix, which is what appears in the image/video filenames."""
    ref = place_id.split("_", 1)[1] if "_" in place_id else place_id
    return ref if FEED_REF_PATTERN.match(ref) else None


def _is_allowed_asset_url(url: str) -> bool:
    if not url.startswith("https://"):
        return False
    host = urlsplit(url).hostname or ""
    return any(host == allowed or host.endswith(f".{allowed}") for allowed in _ALLOWED_ASSET_HOSTS)


class TflJamCamsAdapter(RefMapMixin):
    """Polls the TfL Unified API JamCam list."""

    min_interval_seconds = 60.0
    supports_clips = True

    def __init__(self) -> None:
        super().__init__()
        # Clip refs share the ref namespace but are tracked separately from
        # stills, since a camera can offer one without the other.
        self._clip_maps: dict[str, dict[str, tuple[str, float]]] = {}

    def _query_params(self, config: FeedConfig, credential: dict | None) -> dict[str, str]:
        params: dict[str, str] = {}
        api_key = (credential or {}).get("apiKey")
        if api_key and config.auth.type == "apiKey":
            query_param = config.auth.query_param or "app_key"
            params[query_param] = api_key
        return params

    async def fetch(self, config: FeedConfig, credential: dict | None) -> FeedSnapshot:
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.get(
                    f"{config.url}/Place/Type/JamCam",
                    params=self._query_params(config, credential),
                    headers={"User-Agent": _USER_AGENT},
                )
                response.raise_for_status()
                places = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise FeedUpstreamError(str(exc)) from exc
        if not isinstance(places, list):
            raise FeedUpstreamError("unexpected TfL response shape")

        fresh_image_map: dict[str, tuple[str, float]] = {}
        fresh_clip_map: dict[str, tuple[str, float]] = {}
        out_features: list[FeedFeature] = []

        for place in places:
            if not isinstance(place, dict):
                continue
            place_id = str(place.get("id", ""))
            ref = _clean_ref(place_id)
            latitude, longitude = place.get("lat"), place.get("lon")
            if ref is None or not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
                continue

            flattened: dict[str, str] = {}
            for prop in place.get("additionalProperties", []) or []:
                if isinstance(prop, dict) and isinstance(prop.get("key"), str):
                    flattened[prop["key"]] = str(prop.get("value", ""))

            available = flattened.get("available", "true").strip().lower() != "false"
            image_url = flattened.get("imageUrl", "")
            video_url = flattened.get("videoUrl", "")

            has_image = bool(image_url) and _is_allowed_asset_url(image_url)
            if has_image:
                fresh_image_map[ref] = self._ref_entry(image_url)
            has_clip = bool(video_url) and _is_allowed_asset_url(video_url)
            if has_clip:
                fresh_clip_map[ref] = self._ref_entry(video_url)

            state = "live" if available and has_image else "offline"
            properties = FeedFeatureProperties(
                id=f"{config.id}:{ref}",
                name=str(place.get("commonName", "")).strip() or f"JamCam {ref}",
                view=(flattened.get("view", "").strip() or None),
                state=state,
                image_url=(f"/api/land/feeds/{config.id}/image/{ref}" if has_image else None),
                clip_url=(f"/api/land/feeds/{config.id}/clip/{ref}" if has_clip else None),
                source_id=config.id,
                source_name=config.name,
                attribution=_ATTRIBUTION,
            )
            out_features.append(
                FeedFeature.point(longitude=float(longitude), latitude=float(latitude), properties=properties)
            )

        self._replace_ref_map(config.id, fresh_image_map)
        self._clip_maps[config.id] = fresh_clip_map
        return FeedSnapshot(features=out_features)

    async def probe(self, config: FeedConfig, credential: dict | None) -> ProbeResult:
        try:
            snapshot = await self.fetch(config, credential)
        except FeedUpstreamError:
            return ProbeResult(ok=False, message="could not reach the TfL JamCams feed", feature_count=0)
        return ProbeResult(ok=True, message=f"{len(snapshot.features)} cameras", feature_count=len(snapshot.features))

    async def _get_asset(self, url: str, max_bytes: int) -> tuple[bytes, str]:
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                status_code, headers, body = await download_capped(
                    client, url, max_bytes=max_bytes, headers={"User-Agent": _USER_AGENT}
                )
        except httpx.HTTPError as exc:
            raise FeedUpstreamError(str(exc)) from exc
        except FeedAssetTooLarge as exc:
            raise FeedUpstreamError(str(exc)) from exc
        if status_code == 404:
            raise FeedOffline("asset not currently available")
        if status_code >= 400:
            raise FeedUpstreamError(f"upstream returned HTTP {status_code}")
        return body, headers.get("content-type", "application/octet-stream").split(";")[0].strip()

    async def image(self, config: FeedConfig, credential: dict | None, ref: str) -> tuple[bytes, str]:
        upstream_url = self._resolve_ref(config.id, ref)
        if upstream_url is None:
            raise FeedRefNotFound(f"unknown JamCam ref {ref!r}")
        return await self._get_asset(upstream_url, MAX_IMAGE_BYTES)

    async def clip(self, config: FeedConfig, credential: dict | None, ref: str) -> tuple[bytes, str]:
        entry = self._clip_maps.get(config.id, {}).get(ref)
        if entry is None:
            raise FeedRefNotFound(f"unknown JamCam clip ref {ref!r}")
        upstream_url, _remembered_at = entry
        return await self._get_asset(upstream_url, MAX_CLIP_BYTES)
