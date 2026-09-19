"""
Land live feeds router — traffic cameras, traffic data and public webcams.

Endpoints:
  GET    /api/land/feeds                      — Configured feeds + runtime status (never credentials)
  GET    /api/land/feeds/{id}/features         — Latest normalised GeoJSON snapshot for one feed
  GET    /api/land/feeds/{id}/image/{ref}       — Proxied camera/webcam still image
  GET    /api/land/feeds/{id}/clip/{ref}        — Proxied camera clip (providers that offer one)
  GET    /api/land/feeds/{id}/credentials       — Whether a credential is configured
  PUT    /api/land/feeds/{id}/credentials       — Save/replace a feed's credential
  DELETE /api/land/feeds/{id}/credentials       — Forget a feed's saved credential
  POST   /api/land/feeds/{id}/test              — Probe the feed with its stored credential

Feed *configuration* (add/remove/edit a feed) goes through the generic
`PUT /api/settings/land/feeds` (validated there — see `_validated_feeds` in
`routers/settings.py`), not this router: this router only serves what the
poller already knows and proxies per-camera assets. `backend.services.
land_feeds.poller.poller` is the single in-process source of truth for feed
runtime state; it is started/stopped by the app lifespan.
"""

from __future__ import annotations

from backend.database import get_db
from backend.services.land_feeds import credentials
from backend.services.land_feeds.base import FeedOffline, FeedRefNotFound, FeedUpstreamError
from backend.services.land_feeds.poller import poller
from backend.services.land_feeds.schema import (
    FEED_ID_PATTERN,
    FEED_REF_PATTERN,
    FeedConfig,
    FeedCredentialIn,
)
from fastapi import APIRouter, Depends, Header, HTTPException, Path
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/land/feeds", tags=["land-feeds"])

_FeedIdPath = Path(pattern=FEED_ID_PATTERN.pattern)
_RefPath = Path(pattern=FEED_REF_PATTERN.pattern)


def _require_feed(feed_id: str) -> FeedConfig:
    config = poller.get_config(feed_id)
    if config is None:
        raise HTTPException(status_code=404, detail="feed not found")
    return config


def _feed_with_status(config: FeedConfig, credential_configured: bool) -> dict:
    status = poller.get_status(config.id)
    return {
        **config.model_dump(by_alias=True),
        "status": {**status.as_dict(), "credentialConfigured": credential_configured},
    }


@router.get("")
async def list_feeds(db: AsyncSession = Depends(get_db)):
    """All configured feeds with their runtime status. Never includes a credential value."""
    feeds = []
    for config in poller.list_configs():
        configured = await credentials.is_configured(db, config.id)
        feeds.append(_feed_with_status(config, configured))
    return JSONResponse({"feeds": feeds})


@router.get("/{feed_id}/features")
async def get_feed_features(feed_id: str = _FeedIdPath):
    """The feed's latest normalised GeoJSON FeatureCollection.

    Always served from the poller's in-memory store — never triggers a live
    fetch — so an unresponsive upstream can't turn this into a slow request.
    Empty collection if the feed is disabled or hasn't fetched successfully yet.
    """
    _require_feed(feed_id)
    snapshot, cache_state = poller.get_snapshot_with_cache_state(feed_id)
    return JSONResponse(
        snapshot.model_dump(by_alias=True),
        headers={"X-Cache": cache_state, "Cache-Control": "no-store"},
    )


def _asset_error_status(exc: Exception) -> int:
    if isinstance(exc, FeedRefNotFound):
        return 404
    if isinstance(exc, FeedOffline):
        return 503
    return 502  # FeedUpstreamError and anything else the poller normalised to it


@router.get("/{feed_id}/image/{ref}")
async def get_feed_image(feed_id: str = _FeedIdPath, ref: str = _RefPath):
    """Proxy one camera/webcam's current still image.

    The credential (if any) is injected server-side and the upstream URL is
    never echoed back to the client — `ref` is an opaque, adapter-issued
    token, not the image URL itself.
    """
    _require_feed(feed_id)
    try:
        content, content_type = await poller.get_asset(feed_id, ref, kind="image")
    except (FeedRefNotFound, FeedOffline, FeedUpstreamError) as exc:
        raise HTTPException(status_code=_asset_error_status(exc), detail="image unavailable") from exc
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "no-store"})


def _parse_byte_range(range_header: str | None, total: int) -> tuple[int, int] | None:
    """The single ``bytes=start-end`` range a browser video element asks for, clamped to ``total``.

    None for no/unsupported header (the whole body is served); raises a 416 for a
    range that starts past the end. Multi-range requests are served whole too —
    ``<video>`` never issues them.
    """
    if not range_header or not range_header.startswith("bytes="):
        return None
    spec = range_header[len("bytes=") :].strip()
    if "," in spec or "-" not in spec:
        return None
    start_text, end_text = spec.split("-", 1)
    try:
        if start_text == "":
            # Suffix range: the last N bytes.
            length = int(end_text)
            if length <= 0:
                return None
            return max(0, total - length), total - 1
        start = int(start_text)
        end = int(end_text) if end_text else total - 1
    except ValueError:
        return None
    if start >= total:
        raise HTTPException(
            status_code=416, detail="range not satisfiable", headers={"Content-Range": f"bytes */{total}"}
        )
    return start, min(end, total - 1)


@router.get("/{feed_id}/clip/{ref}")
async def get_feed_clip(
    feed_id: str = _FeedIdPath,
    ref: str = _RefPath,
    range_header: str | None = Header(default=None, alias="Range"),
):
    """Proxy one camera's short video clip (only providers that expose one, e.g. TfL JamCams).

    Honours a single byte range: a ``<video loop>`` seeks back to the start of a
    clip by re-requesting a range, and treats a source that ignores ranges as
    unseekable — the loop then stalls and the element pauses at 0.
    """
    _require_feed(feed_id)
    try:
        content, content_type = await poller.get_asset(feed_id, ref, kind="clip")
    except (FeedRefNotFound, FeedOffline, FeedUpstreamError) as exc:
        raise HTTPException(status_code=_asset_error_status(exc), detail="clip unavailable") from exc
    headers = {"Cache-Control": "no-store", "Accept-Ranges": "bytes"}
    byte_range = _parse_byte_range(range_header, len(content))
    if byte_range is None:
        return Response(content=content, media_type=content_type, headers=headers)
    start, end = byte_range
    headers["Content-Range"] = f"bytes {start}-{end}/{len(content)}"
    return Response(content=content[start : end + 1], status_code=206, media_type=content_type, headers=headers)


@router.get("/{feed_id}/credentials")
async def get_feed_credential_status(feed_id: str = _FeedIdPath, db: AsyncSession = Depends(get_db)):
    """Whether a credential is saved for this feed — never the credential itself."""
    _require_feed(feed_id)
    configured = await credentials.is_configured(db, feed_id)
    return JSONResponse({"configured": configured})


@router.put("/{feed_id}/credentials")
async def put_feed_credential(
    body: FeedCredentialIn,
    feed_id: str = _FeedIdPath,
    db: AsyncSession = Depends(get_db),
):
    """Save/replace this feed's credential. Body shape must match its configured `auth.type`."""
    config = _require_feed(feed_id)
    if config.auth.type == "none":
        raise HTTPException(status_code=400, detail="this feed does not use a credential")
    if config.auth.type == "basic":
        if not (body.username and body.password) or body.api_key:
            raise HTTPException(status_code=400, detail="this feed needs a username and password")
        value = {"username": body.username, "password": body.password}
    else:  # apiKey
        if not body.api_key or body.username or body.password:
            raise HTTPException(status_code=400, detail="this feed needs an apiKey")
        value = {"apiKey": body.api_key}
    await credentials.set_credential(db, feed_id, value)
    return JSONResponse({"configured": True})


@router.delete("/{feed_id}/credentials")
async def delete_feed_credential(feed_id: str = _FeedIdPath, db: AsyncSession = Depends(get_db)):
    """Forget this feed's saved credential; a `.env` fallback (if any) applies again."""
    _require_feed(feed_id)
    await credentials.clear_credential(db, feed_id)
    return JSONResponse({"configured": False})


@router.post("/{feed_id}/test")
async def test_feed(feed_id: str = _FeedIdPath):
    """Probe the feed's upstream with its currently-stored credential.

    Best-effort and never raises for an upstream failure — a failed probe
    is a normal `{"ok": false, ...}` result, not a 5xx.
    """
    _require_feed(feed_id)
    result = await poller.probe(feed_id)
    return JSONResponse(result.model_dump(by_alias=True))
