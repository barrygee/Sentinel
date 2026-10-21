"""Assertions shared by the Air section's backend tests (services/sections/air/backend/tests)."""

from __future__ import annotations


def assert_nothing_to_serve(response, reason: str = "upstream") -> None:
    """The map's endpoint said it has no snapshot: 204, not an error the
    browser logs in red, with the reason in X-Unavailable-Reason."""
    assert response.status_code == 204
    assert response.content == b""
    assert response.headers["X-Cache"] == "UNAVAILABLE"
    assert response.headers["X-Unavailable-Reason"] == reason
