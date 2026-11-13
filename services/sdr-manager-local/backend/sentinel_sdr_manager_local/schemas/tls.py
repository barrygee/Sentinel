"""Response schema for `GET /api/tls/certificate-authority`."""

from __future__ import annotations

from pydantic import BaseModel


class CertificateAuthorityResponse(BaseModel):
    """This deployment's certificate authority, which signed this machine's TLS certificate.

    Public on purpose: another Sentinel reads it once to trust this machine
    (sdr-manager-remote's `host_certificates`), after its operator compares
    `fingerprint` with the one shown here, in Settings and in the log.
    """

    certificate_authority: str
    fingerprint: str
