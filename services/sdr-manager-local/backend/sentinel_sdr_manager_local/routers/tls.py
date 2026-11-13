"""`GET /api/tls/certificate-authority` — what other Sentinels trust this machine by. Auth-exempt.

Every Sentinel deployment has its own certificate authority (`service-credentials`),
which signs this machine's TLS certificate. Another Sentinel reads it here
over a connection that can't check anything yet, shows its operator the
fingerprint, and pins it once they confirm it matches the one this machine
shows. A certificate authority's certificate is public by nature: nothing
here helps anyone impersonate this machine, which takes its private key.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from sentinel_sdr_manager_local.schemas.tls import CertificateAuthorityResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tls"])

_UNAVAILABLE = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail={"code": "no_certificate_authority", "message": "This machine has no certificate authority to share."},
)


def read_certificate_authority() -> CertificateAuthorityResponse | None:
    """This deployment's certificate authority and its fingerprint, or None when there is none to read."""
    # Imported here, not at module level: the native Mac process sets the
    # platform's environment after importing this package (`native.py`), and
    # the `sdr-manager-local` command imports this module (through run_server)
    # with only the installed packages on its path, which `backend` isn't.
    from backend.config import settings as platform_settings
    from backend.platform.tls_fingerprint import certificate_fingerprint

    path = platform_settings.internal_certificate_authority_file
    if not path:
        return None
    try:
        pem = Path(path).read_text()
        return CertificateAuthorityResponse(certificate_authority=pem, fingerprint=certificate_fingerprint(pem))
    except (OSError, ValueError) as error:
        logger.warning("the certificate authority at %s can't be read (%s)", path, error)
        return None


@router.get(
    "/tls/certificate-authority",
    response_model=CertificateAuthorityResponse,
    summary="This deployment's certificate authority",
)
async def get_certificate_authority() -> CertificateAuthorityResponse:
    """The certificate authority other Sentinels pin to trust this machine. 404 when there is none."""
    authority = read_certificate_authority()
    if authority is None:
        raise _UNAVAILABLE
    return authority
