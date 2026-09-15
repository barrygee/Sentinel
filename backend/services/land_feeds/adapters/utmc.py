"""``utmc`` provider — Tyne & Wear + Durham UTMC Open Data Service cameras.

The North East's urban traffic control centres publish their CCTV through
``https://www.netraveldata.co.uk/api/v2`` (Newcastle City Council, OGL 3.0).
Every request is HTTP Basic-authenticated with the operator's free site
account, so the credential row for this provider is ``{"username", "password"}``
and the adapter never runs without one.

Two calls per poll:

1. ``GET {url}/cctv/static`` — one entry per camera with its
   ``systemCodeNumber`` and a ``definitions[]`` list carrying the short/long
   description and a ``point`` with WGS84 ``latitude``/``longitude`` (the
   OSGR easting/northing alongside it is ignored).
2. ``GET {url}/cctv/dynamic`` — the same code numbers with a ``dynamics[]``
   list holding the current ``image`` URL and its ``lastUpdated`` stamp.

The image URL itself is Basic-auth'd, which is exactly why it must never reach
the browser: the adapter records it against an opaque ref (the code number,
lower-cased) and the proxy fetches it with the credential server-side.

Behaviour the feed documents that the state machine has to respect: joint
UTMC / Public-Safety cameras stop returning JPEGs overnight (Mon–Fri
23:00–06:30, weekends 23:00–07:00) and PTZ cameras return nothing while an
operator is driving them. A camera listed in ``static`` but with no ``dynamics``
entry — or whose image fetch 404s — is therefore reported ``offline``, not as
an error, and the poller must not back off for it.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

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

_REQUEST_TIMEOUT_SECONDS = 15.0
_USER_AGENT = "Sentinel"
_ATTRIBUTION = (
    "Contains public sector information licensed under the Open Government Licence v3.0 "
    "(Tyne and Wear UTMC Open Data Service)"
)


class UtmcCredentialMissing(FeedUpstreamError):
    """Raised when the feed is polled without a username/password."""


def _basic_auth(credential: dict | None) -> tuple[str, str]:
    """Return the (username, password) pair or raise if either is missing."""
    username = str((credential or {}).get("username", "")).strip()
    password = str((credential or {}).get("password", ""))
    if not username or not password:
        raise UtmcCredentialMissing("UTMC feed needs a username and password")
    return username, password


def _parse_timestamp(raw: object) -> datetime | None:
    """Parse the feed's ISO-8601 stamp (``2012-01-13T12:19:32.419+0000``) to UTC."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = raw.strip()
    # The feed writes the offset as +0000 (no colon), which fromisoformat only
    # accepts from 3.11 on; normalise so the parse is version-independent.
    if len(text) >= 5 and text[-5] in "+-" and text[-3] != ":":
        text = f"{text[:-2]}:{text[-2:]}"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class UtmcAdapter(RefMapMixin):
    """Polls the UTMC cctv static + dynamic datasets and reports one feature per camera."""

    min_interval_seconds = 60.0
    supports_clips = False

    def __init__(self) -> None:
        super().__init__()

    async def _get_dataset(self, config: FeedConfig, dataset_path: str, auth: tuple[str, str]) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.get(
                    f"{config.url}/{dataset_path}", auth=auth, headers={"User-Agent": _USER_AGENT}
                )
                if response.status_code in (401, 403):
                    raise FeedUpstreamError("UTMC rejected the username/password")
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise FeedUpstreamError(str(exc)) from exc
        if not isinstance(payload, list):
            raise FeedUpstreamError("unexpected UTMC response shape")
        return [entry for entry in payload if isinstance(entry, dict)]

    async def fetch(self, config: FeedConfig, credential: dict | None) -> FeedSnapshot:
        auth = _basic_auth(credential)
        static_entries = await self._get_dataset(config, "cctv/static", auth)
        dynamic_entries = await self._get_dataset(config, "cctv/dynamic", auth)

        # Latest image URL + stamp per camera code, from the dynamic dataset.
        latest_image: dict[str, tuple[str, datetime | None]] = {}
        for entry in dynamic_entries:
            code = str(entry.get("systemCodeNumber", "")).strip()
            dynamics = entry.get("dynamics")
            if not code or not isinstance(dynamics, list) or not dynamics:
                continue
            newest = dynamics[-1] if isinstance(dynamics[-1], dict) else {}
            image_url = str(newest.get("image", "")).strip()
            if image_url.startswith("https://"):
                latest_image[code] = (image_url, _parse_timestamp(newest.get("lastUpdated")))

        fresh_ref_map: dict[str, tuple[str, float]] = {}
        out_features: list[FeedFeature] = []
        for entry in static_entries:
            code = str(entry.get("systemCodeNumber", "")).strip()
            definitions = entry.get("definitions")
            if not code or not isinstance(definitions, list) or not definitions:
                continue
            definition = definitions[0] if isinstance(definitions[0], dict) else {}
            point = definition.get("point") if isinstance(definition.get("point"), dict) else {}
            latitude, longitude = point.get("latitude"), point.get("longitude")
            if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
                continue
            ref = code.lower()
            if not FEED_REF_PATTERN.match(ref):
                continue

            image = latest_image.get(code)
            if image is not None:
                fresh_ref_map[ref] = self._ref_entry(image[0])
            updated_at = image[1].isoformat().replace("+00:00", "Z") if image is not None and image[1] else None
            properties = FeedFeatureProperties(
                id=f"{config.id}:{ref}",
                name=str(definition.get("shortDescription", "")).strip() or code,
                description=str(definition.get("longDescription", "")).strip(),
                view=None,
                updated_at=updated_at,
                # No dynamics entry = the camera is not currently publishing
                # (night blackout / operator control), which is offline, not stale.
                state="live" if image is not None else "offline",
                image_url=f"/api/land/feeds/{config.id}/image/{ref}" if image is not None else None,
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
        except UtmcCredentialMissing:
            return ProbeResult(ok=False, message="enter the netraveldata.co.uk username and password", feature_count=0)
        except FeedUpstreamError as exc:
            return ProbeResult(ok=False, message=str(exc)[:120], feature_count=0)
        if not snapshot.features:
            return ProbeResult(ok=True, message="reachable, but returned no cameras", feature_count=0)
        publishing = sum(1 for feature in snapshot.features if feature.properties.state == "live")
        return ProbeResult(
            ok=True,
            message=f"{len(snapshot.features)} cameras, {publishing} publishing images",
            feature_count=len(snapshot.features),
        )

    async def image(self, config: FeedConfig, credential: dict | None, ref: str) -> tuple[bytes, str]:
        upstream_url = self._resolve_ref(config.id, ref)
        if upstream_url is None:
            raise FeedRefNotFound(f"unknown UTMC camera ref {ref!r}")
        auth = _basic_auth(credential)
        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                status_code, headers, body = await download_capped(
                    client,
                    upstream_url,
                    max_bytes=MAX_IMAGE_BYTES,
                    headers={"User-Agent": _USER_AGENT},
                    auth=auth,
                )
        except httpx.HTTPError as exc:
            raise FeedUpstreamError(str(exc)) from exc
        except FeedAssetTooLarge as exc:
            raise FeedUpstreamError(str(exc)) from exc
        if status_code == 404:
            raise FeedOffline("camera is not publishing an image right now")
        if status_code >= 400:
            raise FeedUpstreamError(f"upstream returned HTTP {status_code}")
        content_type = headers.get("content-type", "image/jpeg").split(";")[0].strip()
        return body, content_type
