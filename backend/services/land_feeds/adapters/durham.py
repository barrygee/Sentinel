"""``durham`` provider — Durham County Council traffic cameras.

Two upstream calls per poll, both unauthenticated:
  1. an ArcGIS REST feature query against `config.url` (the council's
     `.../MapServer/30` layer) for the camera list + metadata;
  2. (on image request) a plain JPEG at `dcc.ussgroup.co.uk`, keyed by the
     camera's lowercased USS camera number.

The USS camera number doubles as the opaque image ref — it already matches
`FEED_REF_PATTERN` (digits/letters only) so no extra mangling is needed, but
it is still validated defensively since it comes from upstream JSON.
"""

from __future__ import annotations

import logging

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

_REQUEST_TIMEOUT_SECONDS = 10.0
_USER_AGENT = "Sentinel"
_IMAGE_BASE = "https://dcc.ussgroup.co.uk/images"
_ATTRIBUTION = "Contains public sector information licensed under the Open Government Licence v3.0"


def _image_url_for(uss_camera_number: str) -> str:
    return f"{_IMAGE_BASE}/{uss_camera_number.lower()}.jpg"


class DurhamAdapter(RefMapMixin):
    """Polls the DCC ArcGIS feature layer and reports one feature per camera."""

    min_interval_seconds = 30.0
    supports_clips = False

    def __init__(self) -> None:
        super().__init__()

    async def _query_features(self, config: FeedConfig) -> list[dict]:
        params = {"where": "1=1", "outFields": "*", "outSR": "4326", "f": "json"}
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.get(f"{config.url}/query", params=params, headers={"User-Agent": _USER_AGENT})
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise FeedUpstreamError(str(exc)) from exc
        if not isinstance(payload, dict) or "features" not in payload:
            raise FeedUpstreamError("unexpected ArcGIS response shape")
        return payload.get("features", [])

    async def fetch(self, config: FeedConfig, credential: dict | None) -> FeedSnapshot:
        raw_features = await self._query_features(config)
        fresh_ref_map: dict[str, tuple[str, float]] = {}
        out_features: list[FeedFeature] = []

        for raw in raw_features:
            attrs = raw.get("attributes", {}) if isinstance(raw, dict) else {}
            geometry = raw.get("geometry", {}) if isinstance(raw, dict) else {}
            longitude, latitude = geometry.get("x"), geometry.get("y")
            uss_number = str(attrs.get("USS_Camera_Number", "")).strip()
            if not (uss_number and FEED_REF_PATTERN.match(uss_number.lower()) and isinstance(longitude, (int, float))):
                continue  # incomplete/malformed row — skip rather than fail the whole poll
            if not isinstance(latitude, (int, float)):
                continue

            ref = uss_number.lower()
            image_url = _image_url_for(ref)
            fresh_ref_map[ref] = self._ref_entry(image_url)

            status = str(attrs.get("Status", "")).strip()
            state = "live" if status.lower() == "live" else "offline"
            camera_name = str(attrs.get("Camera_Nam", "")).strip() or f"Camera {ref}"
            link = str(attrs.get("Link", "")).strip() or None

            properties = FeedFeatureProperties(
                id=f"{config.id}:{ref}",
                name=camera_name,
                description=str(attrs.get("Camera_Des", "")).strip(),
                view=(str(attrs.get("Camera_Vie", "")).strip() or None),
                state=state,
                image_url=f"/api/land/feeds/{config.id}/image/{ref}",
                external_url=link,
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
            return ProbeResult(ok=False, message="could not reach the Durham camera feed", feature_count=0)
        if not snapshot.features:
            return ProbeResult(ok=True, message="reachable, but returned no cameras", feature_count=0)
        return ProbeResult(ok=True, message=f"{len(snapshot.features)} cameras", feature_count=len(snapshot.features))

    async def image(self, config: FeedConfig, credential: dict | None, ref: str) -> tuple[bytes, str]:
        upstream_url = self._resolve_ref(config.id, ref)
        if upstream_url is None:
            raise FeedRefNotFound(f"unknown Durham camera ref {ref!r}")
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                status_code, headers, body = await download_capped(
                    client, upstream_url, max_bytes=MAX_IMAGE_BYTES, headers={"User-Agent": _USER_AGENT}
                )
        except httpx.HTTPError as exc:
            raise FeedUpstreamError(str(exc)) from exc
        except FeedAssetTooLarge as exc:
            raise FeedUpstreamError(str(exc)) from exc
        if status_code == 404:
            raise FeedOffline("camera image not currently available")
        if status_code >= 400:
            raise FeedUpstreamError(f"upstream returned HTTP {status_code}")
        content_type = headers.get("content-type", "image/jpeg").split(";")[0].strip()
        return body, content_type
