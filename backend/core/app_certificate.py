"""This deployment's certificate authority, for browsers to trust the web page over HTTPS.

  GET /api/app/certificate-authority       `{"certificate_authority": "<PEM>", "fingerprint": "AA:BB:…", "https_port": 8444}`
  GET /api/app/certificate-authority.crt   the same certificate as a file to install

The gateway serves the page over HTTPS (:8444) with a certificate this
deployment's own certificate authority issued (`service-credentials`). No
browser knows that authority, so each device that opens the page installs it
once: Settings › App Settings › HTTPS shows its fingerprint and downloads it,
and docs/https.md says how to install it on each kind of device.

Served to browsers on the LAN without signing in, on purpose: a certificate
authority's certificate is public by nature. Trusting it lets a device check
this machine's certificate; nothing here helps anyone impersonate this
machine, which takes the authority's private key, and that never leaves
`service-credentials`.
"""

from __future__ import annotations

import logging
from pathlib import Path

from backend.config import settings
from backend.platform.tls_fingerprint import certificate_fingerprint
from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/app", tags=["app"])

CERTIFICATE_FILE_NAME = "sentinel-certificate-authority.crt"
"""What the download is saved as: `.crt` is the extension every OS offers to install."""

CERTIFICATE_MEDIA_TYPE = "application/x-x509-ca-cert"
"""The type iOS and Android open as "install this certificate authority" rather than as text."""

_UNAVAILABLE = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail={"code": "no_certificate_authority", "message": "This Sentinel has no certificate authority to share."},
)


class CertificateAuthority(BaseModel):
    """Body of GET /api/app/certificate-authority."""

    certificate_authority: str
    fingerprint: str
    # Where the gateway serves the page over HTTPS, for the card's link to it.
    https_port: int


def read_certificate_authority() -> CertificateAuthority | None:
    """The certificate authority and its fingerprint, or None (logged) when there is none to read."""
    path = settings.internal_certificate_authority_file
    if not path:
        return None
    try:
        pem = Path(path).read_text()
        return CertificateAuthority(
            certificate_authority=pem, fingerprint=certificate_fingerprint(pem), https_port=settings.web_https_port
        )
    except (OSError, ValueError) as error:
        logger.warning("the certificate authority at %s can't be read (%s)", path, error)
        return None


@router.get("/certificate-authority", response_model=CertificateAuthority)
async def get_certificate_authority() -> CertificateAuthority:
    """The certificate authority and its fingerprint. 404 when there is none."""
    authority = read_certificate_authority()
    if authority is None:
        raise _UNAVAILABLE
    return authority


@router.get("/certificate-authority.crt", response_class=Response)
async def download_certificate_authority() -> Response:
    """The certificate authority as a file to install. 404 when there is none."""
    authority = read_certificate_authority()
    if authority is None:
        raise _UNAVAILABLE
    return Response(
        content=authority.certificate_authority,
        media_type=CERTIFICATE_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{CERTIFICATE_FILE_NAME}"',
            "Cache-Control": "no-cache",
        },
    )
