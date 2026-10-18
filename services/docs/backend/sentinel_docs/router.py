"""
Docs router — the in-app documentation the shell's `/docs/…` page renders.

Endpoints:
  GET /api/documentation/library               — the menu, every page's markdown and the image list
  GET /api/documentation/images/{image_path}   — one image under docs/images/

Not `/api/docs`: that is core's OpenAPI page.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from sentinel_docs.library import DocsSourceMissing, docs_source_root, read_library, resolve_image

router = APIRouter(prefix="/api/documentation", tags=["documentation"])

# Revalidated on every load (ETag / Last-Modified), so an edited page or a
# replaced screenshot shows straight away; nothing here is content-hashed.
_REVALIDATE = {"Cache-Control": "no-cache"}


@router.get("/library")
async def get_library() -> JSONResponse:
    """The whole documentation set; 503 when the docs folder is missing from this container."""
    try:
        # About forty small files: read off the event loop all the same.
        library: dict[str, Any] = await asyncio.to_thread(read_library, docs_source_root())
    except DocsSourceMissing as error:
        # The path is the container's, not the caller's business.
        raise HTTPException(503, "documentation is not available") from error
    return JSONResponse(library, headers=_REVALIDATE)


@router.get("/images/{image_path:path}")
async def get_image(image_path: str) -> FileResponse:
    """One documentation image; 404 for anything that is not an image under docs/images/."""
    image = await asyncio.to_thread(resolve_image, docs_source_root(), image_path)
    if image is None:
        raise HTTPException(404, "image not found")
    return FileResponse(image, headers=_REVALIDATE)
