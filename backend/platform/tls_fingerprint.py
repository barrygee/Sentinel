"""The SHA-256 fingerprint of a PEM certificate, in the form operators compare.

One definition for both ends of SDR host trust on first use: sdr-manager-local
shows its certificate authority's fingerprint (Settings, its log, `doctor`),
and sdr-manager-remote shows the one a host presents before it is trusted. If
the two computed it differently, an honest host could never match.
"""

from __future__ import annotations

import hashlib
import ssl


def certificate_fingerprint(pem: str) -> str:
    """SHA-256 of the certificate's DER bytes, as `AA:BB:…` (the form `openssl x509 -fingerprint -sha256` prints).

    Raises `ValueError` when `pem` holds no PEM certificate.
    """
    digest = hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem)).hexdigest().upper()
    return ":".join(digest[index : index + 2] for index in range(0, len(digest), 2))
