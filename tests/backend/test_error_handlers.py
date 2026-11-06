"""Handler decorators: what a client sees when a route raises.

An exception's text can name paths, hosts or SQL, so an unexpected failure must
reach the log and never the response. A RuntimeError is the exception: services
raise those on purpose, as the message the operator should read.

Run with:  uv run --project backend pytest tests/backend/test_error_handlers.py
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable

import pytest
from fastapi import Request

from backend.error_handlers import (
    SETTINGS_RETRY_AFTER_SECONDS,
    SETTINGS_UNAVAILABLE_MESSAGE,
    UNEXPECTED_ERROR_MESSAGE,
    handle_service_errors,
    handle_unexpected_errors,
    settings_unavailable_error_handler,
)

SECRET_DETAIL = "cannot open /data/sentinel.db as postgres:hunter2"

DECORATORS = [handle_service_errors, handle_unexpected_errors]


def raising(error: Exception) -> Callable[[], Awaitable[dict]]:
    async def failing_route() -> dict:
        raise error

    return failing_route


@pytest.mark.parametrize("decorator", DECORATORS)
class TestUnexpectedErrors:
    async def test_the_client_gets_a_generic_500(self, decorator) -> None:
        response = await decorator(raising(ValueError(SECRET_DETAIL)))()

        assert response.status_code == 500
        assert json.loads(response.body) == {"error": UNEXPECTED_ERROR_MESSAGE}

    async def test_the_detail_never_reaches_the_client(self, decorator) -> None:
        response = await decorator(raising(ValueError(SECRET_DETAIL)))()

        assert b"hunter2" not in response.body
        assert b"sentinel.db" not in response.body

    async def test_the_detail_reaches_the_log_with_its_traceback(
        self, decorator, caplog
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="backend.error_handlers"):
            await decorator(raising(ValueError(SECRET_DETAIL)))()

        (record,) = caplog.records
        assert record.getMessage() == "Unexpected error in failing_route"
        assert record.exc_info is not None
        assert str(record.exc_info[1]) == SECRET_DETAIL

    async def test_a_successful_route_passes_through_silently(
        self, decorator, caplog
    ) -> None:
        async def working_route() -> dict:
            return {"ok": True}

        with caplog.at_level(logging.ERROR, logger="backend.error_handlers"):
            assert await decorator(working_route)() == {"ok": True}

        assert caplog.records == []

    async def test_arguments_reach_the_route(self, decorator) -> None:
        async def echoing_route(first: int, *, second: int) -> tuple[int, int]:
            return first, second

        assert await decorator(echoing_route)(1, second=2) == (1, 2)

    def test_the_route_keeps_its_name(self, decorator) -> None:
        assert decorator(raising(ValueError("x"))).__name__ == "failing_route"


class TestServiceErrors:
    async def test_a_runtime_error_stays_visible_as_a_503(self, caplog) -> None:
        with caplog.at_level(logging.ERROR, logger="backend.error_handlers"):
            response = await handle_service_errors(
                raising(RuntimeError("radio offline"))
            )()

        assert response.status_code == 503
        assert json.loads(response.body) == {"error": "radio offline"}
        assert caplog.records == []

    async def test_a_runtime_error_subclass_counts_too(self) -> None:
        response = await handle_service_errors(
            raising(NotImplementedError("not built"))
        )()

        assert response.status_code == 503


class TestUnexpectedErrorsDecorator:
    async def test_it_doesnt_treat_a_runtime_error_as_intended(self) -> None:
        response = await handle_unexpected_errors(
            raising(RuntimeError(SECRET_DETAIL))
        )()

        assert response.status_code == 500
        assert json.loads(response.body) == {"error": UNEXPECTED_ERROR_MESSAGE}


class TestSettingsUnavailableErrorHandler:
    """Core not answering is a passing outage: a 503, one log line, and nothing internal."""

    INTERNAL_DETAIL = "core settings API unreachable: http://app:8000 timed out"

    @staticmethod
    def _request() -> Request:
        return Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/api/sdr/radios",
                "headers": [],
                "query_string": b"",
            }
        )

    async def test_answers_503_with_a_retry_hint(self):
        response = await settings_unavailable_error_handler(
            self._request(), RuntimeError(self.INTERNAL_DETAIL)
        )

        assert response.status_code == 503
        assert response.headers["Retry-After"] == str(SETTINGS_RETRY_AFTER_SECONDS)
        assert json.loads(response.body) == {"detail": SETTINGS_UNAVAILABLE_MESSAGE}

    async def test_keeps_cores_address_out_of_the_response(self):
        response = await settings_unavailable_error_handler(
            self._request(), RuntimeError(self.INTERNAL_DETAIL)
        )

        assert b"app:8000" not in response.body

    async def test_logs_the_route_and_the_cause_without_a_traceback(self, caplog):
        with caplog.at_level(logging.WARNING, logger="backend.error_handlers"):
            await settings_unavailable_error_handler(
                self._request(), RuntimeError(self.INTERNAL_DETAIL)
            )

        assert len(caplog.records) == 1
        record = caplog.records[0]
        assert "GET /api/sdr/radios" in record.getMessage()
        assert self.INTERNAL_DETAIL in record.getMessage()
        assert record.exc_info is None
