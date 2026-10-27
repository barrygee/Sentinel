"""fastapi-guard callbacks: refusals as Sentinel's JSON, and how refusals are logged.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_hooks.py
"""

from __future__ import annotations

import json
import logging
from typing import Any

import pytest
from guard.adapters import StarletteGuardResponse
from starlette.responses import JSONResponse, PlainTextResponse, Response

from backend.platform.security.hooks import (
    DEFAULT_RETRY_AFTER_SECONDS,
    json_error_responses,
    log_block,
    log_guard_error,
)


def guard_response(response: Response) -> StarletteGuardResponse:
    return StarletteGuardResponse(response)


async def modified(response: Response) -> Any:
    return await json_error_responses(guard_response(response))


class TestJsonErrorResponses:
    async def test_a_plain_text_refusal_becomes_json_detail(self) -> None:
        result = await modified(PlainTextResponse("IP address banned", status_code=403))

        assert result.status_code == 403
        assert result.headers["content-type"] == "application/json"
        assert json.loads(result.body) == {"detail": "IP address banned"}

    async def test_a_refusal_is_never_cached(self) -> None:
        result = await modified(PlainTextResponse("Forbidden", status_code=403))

        assert result.headers["cache-control"] == "no-store"

    async def test_an_empty_refusal_gets_a_detail(self) -> None:
        result = await modified(PlainTextResponse("  ", status_code=400))

        assert json.loads(result.body) == {"detail": "Request refused"}

    async def test_bytes_that_arent_utf8_dont_break_it(self) -> None:
        result = await modified(Response(b"bad \xff byte", status_code=400, media_type="text/plain"))

        assert json.loads(result.body)["detail"].startswith("bad ")

    async def test_its_own_headers_are_kept(self) -> None:
        result = await modified(PlainTextResponse("Slow down", status_code=429, headers={"Retry-After": "12"}))

        assert result.headers["retry-after"] == "12"

    async def test_a_rate_limit_refusal_says_when_to_retry(self) -> None:
        result = await modified(PlainTextResponse("Too many requests", status_code=429))

        assert result.headers["retry-after"] == DEFAULT_RETRY_AFTER_SECONDS

    async def test_other_refusals_get_no_retry_after(self) -> None:
        result = await modified(PlainTextResponse("Forbidden", status_code=403))

        assert "retry-after" not in result.headers

    async def test_the_apps_own_errors_pass_through_untouched(self) -> None:
        original = guard_response(JSONResponse({"detail": "Not found"}, status_code=404))

        assert await json_error_responses(original) is original

    async def test_successes_pass_through_untouched(self) -> None:
        original = guard_response(PlainTextResponse("ok", status_code=200))

        assert await json_error_responses(original) is original


class TestLogBlock:
    payload = {
        "method": "GET",
        "path": "/api/settings",
        "client_ip": "192.168.1.50",
        "check_name": "rate_limit",
        "reason": "too many requests",
    }

    def test_one_line_per_refusal(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            log_block(None, dict(self.payload))  # type: ignore[arg-type]

        assert caplog.messages == ["guard blocked: GET /api/settings from 192.168.1.50 (rate_limit: too many requests)"]

    def test_passive_mode_says_would_block(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            log_block(None, {**self.payload, "passive_mode": True})  # type: ignore[arg-type]

        assert caplog.messages[0].startswith("guard would block: GET /api/settings")

    def test_never_logs_headers_or_bodies(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.WARNING, logger="sentinel.guard"):
            log_block(None, {**self.payload, "headers": {"authorization": "Bearer secret"}, "body": "secret"})  # type: ignore[arg-type]

        assert "secret" not in caplog.text


class TestLogGuardError:
    def test_logs_the_stage_and_error_but_not_its_context(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.ERROR, logger="sentinel.guard"):
            log_guard_error("geo_lookup", ValueError("database missing"), {"request": "secret-request-data"})

        assert caplog.messages == ["guard failure in geo_lookup: ValueError: database missing"]
        assert "secret-request-data" not in caplog.text
