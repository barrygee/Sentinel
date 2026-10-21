"""Tests for `logging_config.py`: query strings never reach the access log.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_access_log.py
"""

from __future__ import annotations

import logging

from sentinel_sdr_manager_local.logging_config import SDR_MANAGER_LOCAL_LOGGING_CONFIG, RedactingAccessFormatter


def _access_record(path: str) -> logging.LogRecord:
    return logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("10.0.0.5:5000", "GET", path, "1.1", 200),
        exc_info=None,
    )


def _formatter() -> RedactingAccessFormatter:
    return RedactingAccessFormatter(fmt='%(client_addr)s - "%(request_line)s" %(status_code)s', use_colors=False)


def test_a_query_string_is_redacted() -> None:
    line = _formatter().format(_access_record("/api/events?access_token=secret-value"))

    assert "secret-value" not in line
    assert '"GET /api/events?[redacted] HTTP/1.1" 200' in line


def test_a_path_without_a_query_is_logged_as_is() -> None:
    line = _formatter().format(_access_record("/api/v1/sdrs"))

    assert '"GET /api/v1/sdrs HTTP/1.1" 200' in line


def test_uvicorns_access_log_uses_the_redacting_formatter() -> None:
    access = SDR_MANAGER_LOCAL_LOGGING_CONFIG["formatters"]["access"]

    assert access["()"] == "sentinel_sdr_manager_local.logging_config.RedactingAccessFormatter"
