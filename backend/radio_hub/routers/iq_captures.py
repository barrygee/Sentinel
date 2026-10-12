"""Radio hub — finished IQ captures, handed to the SDR section (section-containers plan P7.3).

  GET    /internal/radio-hub/iq-captures/{capture_id} — the capture's raw ``.u8`` bytes
  DELETE /internal/radio-hub/iq-captures/{capture_id} — drop the hub's copy

The hub writes a capture into its own folder (`services/iq_capture.py`). When
the SDR section runs somewhere else it has no view of that folder, so on stop
it streams the file from here into its recordings, then deletes it. Under
`/internal/`, which the gateway never routes, and behind the deployment's join
token: raw IQ is for the deployment's own services, not for browsers.
"""

from __future__ import annotations

from pathlib import Path

from backend.core.internal_auth import require_join_token
from backend.radio_hub.services import iq_capture
from fastapi import APIRouter, Header, HTTPException, Response
from fastapi import Path as PathParameter
from fastapi.responses import FileResponse

router = APIRouter(prefix="/internal/radio-hub/iq-captures", tags=["sdr"], include_in_schema=False)

# A recording id: SQLite row ids start at 1.
_CaptureId = PathParameter(ge=1)


def _finished_capture(capture_id: int) -> Path:
    """The finished capture's file; 409 while it is still being written, 404 when there is none."""
    if iq_capture.is_capturing(capture_id):
        raise HTTPException(status_code=409, detail="IQ capture still in progress")
    path = iq_capture.capture_path(capture_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="IQ capture not found")
    return path


@router.get("/{capture_id}")
async def download_capture(capture_id: int = _CaptureId, authorization: str | None = Header(default=None)):
    """Stream a finished capture to the SDR section."""
    require_join_token(authorization)
    return FileResponse(_finished_capture(capture_id), media_type="application/octet-stream")


@router.delete("/{capture_id}", status_code=204)
async def delete_capture(capture_id: int = _CaptureId, authorization: str | None = Header(default=None)):
    """Delete the hub's copy once the SDR section holds its own."""
    require_join_token(authorization)
    if not iq_capture.holds_staged_captures():
        # The file is the SDR section's own recording, in the same process.
        raise HTTPException(status_code=409, detail="IQ captures are written into the SDR section's recordings here")
    _finished_capture(capture_id).unlink(missing_ok=True)
    return Response(status_code=204)
