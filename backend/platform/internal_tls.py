"""TLS trust for HTTPS between Sentinel processes on different hosts (plan §4.6, P7.5).

A process on a second host reaches core through core's TLS service entrypoint,
and core reaches a radio hub through that host's TLS gateway. Both present
certificates issued by the deployment's own CA (`service-credentials`), which
no public trust store knows, so every internal HTTP client verifies with
`internal_verify()`: the public certificate authorities plus the deployment's.
"""

from __future__ import annotations

import logging
import ssl
from functools import lru_cache

import certifi
from backend.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=4)
def _context_trusting(certificate_authority_file: str) -> ssl.SSLContext | bool:
    try:
        # certifi is what httpx trusts by default; the deployment CA is added to it.
        context = ssl.create_default_context(cafile=certifi.where())
        context.load_verify_locations(cafile=certificate_authority_file)
    except (OSError, ssl.SSLError) as error:
        # Verification then fails loudly on the first internal HTTPS call
        # rather than this process silently trusting nothing it should.
        logger.error("internal certificate authority at %s can't be loaded (%s)", certificate_authority_file, error)
        return True
    return context


def internal_verify() -> ssl.SSLContext | bool:
    """The `verify=` argument for an httpx client that calls another Sentinel process."""
    if not settings.internal_certificate_authority_file:
        return True
    return _context_trusting(settings.internal_certificate_authority_file)
