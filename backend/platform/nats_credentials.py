"""This process's NATS identity: its user, password, reply inbox and trusted CA (plan §4.5, P7.4).

Compose mounts each service's own folder from the `service-credentials` output
(`backend/scripts/generate_service_credentials.py`) and points
`NATS_CREDENTIALS_FILE` and `NATS_CERTIFICATE_AUTHORITY_FILE` at it. Neither
is set outside Docker, where the process connects anonymously and trusts the
system's CAs, as before.
"""

from __future__ import annotations

import json
import logging
import ssl
from pathlib import Path
from typing import Any

from backend.config import settings
from backend.platform.nats_permissions import inbox_prefix

logger = logging.getLogger(__name__)


def connection_options() -> dict[str, Any]:
    """Extra `nats.connect()` keyword arguments for this process's identity.

    A credentials file that can't be read is logged and skipped rather than
    failing startup: the broker then refuses the connection, which the
    transport logs and keeps retrying, and events stay in-process meanwhile.
    """
    options: dict[str, Any] = {}
    if settings.nats_credentials_file:
        try:
            credentials = json.loads(Path(settings.nats_credentials_file).read_text())
            user, password = credentials["user"], credentials["password"]
        except (OSError, ValueError, KeyError, TypeError) as error:
            logger.error("NATS credentials at %s can't be read (%s)", settings.nats_credentials_file, error)
        else:
            # Replies come back on the user's own inbox, the only one its
            # NATS permissions let it subscribe to.
            options.update(user=user, password=password, inbox_prefix=inbox_prefix(user))
    if settings.nats_certificate_authority_file:
        try:
            options["tls"] = ssl.create_default_context(cafile=settings.nats_certificate_authority_file)
        except (OSError, ssl.SSLError) as error:
            logger.error(
                "NATS certificate authority at %s can't be loaded (%s)", settings.nats_certificate_authority_file, error
            )
    return options
