"""Uvicorn logging configuration with query strings redacted from the access log (Sentry architecture §7.9).

Sentry once accepted its API token as `?access_token=...` on `GET /api/events`
(because `EventSource` cannot set headers), which wrote the credential to
stdout, `docker logs` and journald. The session cookie replaced that path
(`security.py`), so no credential rides in a URL any more — the redaction
stays as defence in depth, wired in by `run_server.py`.
"""

from __future__ import annotations

import logging
from typing import Any

from uvicorn.logging import AccessFormatter


class RedactingAccessFormatter(AccessFormatter):
    """`uvicorn.logging.AccessFormatter`, with any query string stripped from the request line.

    Uvicorn's `AccessFormatter.formatMessage` reads `record.args` as the
    5-tuple `(client_addr, method, full_path, http_version, status_code)`
    (`uvicorn/logging.py`) — `full_path` is the only element that can carry a
    query string, so this subclass rewrites just that element, in place, on
    `record.args` before delegating to the real formatter.
    """

    def formatMessage(self, record: logging.LogRecord) -> str:
        """Redact `record.args[2]`'s query string, then format exactly as the base class would."""
        args = record.args
        if isinstance(args, tuple) and len(args) == 5:
            client_addr, method, full_path, http_version, status_code = args
            if isinstance(full_path, str) and "?" in full_path:
                full_path = full_path.split("?", 1)[0] + "?[redacted]"
                record.args = (client_addr, method, full_path, http_version, status_code)
        return super().formatMessage(record)


SDR_MANAGER_LOCAL_LOGGING_CONFIG: dict[str, Any] = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "%(levelprefix)s %(message)s",
            "use_colors": None,
        },
        "access": {
            "()": "sentinel_sdr_manager_local.logging_config.RedactingAccessFormatter",
            "fmt": '%(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s',
        },
    },
    "handlers": {
        "default": {
            "formatter": "default",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stderr",
        },
        "access": {
            "formatter": "access",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
        },
    },
    "loggers": {
        "uvicorn": {"handlers": ["default"], "level": "INFO", "propagate": False},
        "uvicorn.error": {"level": "INFO"},
        "uvicorn.access": {"handlers": ["access"], "level": "INFO", "propagate": False},
    },
}
"""A copy of `uvicorn.config.LOGGING_CONFIG` with only the `access` formatter
class swapped for `RedactingAccessFormatter` — every other handler/logger
entry is unchanged so behaviour otherwise matches uvicorn's own default."""
