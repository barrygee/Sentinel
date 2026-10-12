"""The internal-route guards (backend/core/internal_auth.py, P7.4b): who is calling, and may they."""

import pytest
from fastapi import HTTPException

from backend.config import settings
from backend.core.internal_auth import (
    require_caller,
    require_decoder,
    require_permission,
)
from backend.platform import service_credentials
from tests.backend.service_credentials_test_helpers import TOKENS, accept_callers


@pytest.fixture
def accepting(monkeypatch, tmp_path):
    accept_callers(monkeypatch, tmp_path)


@pytest.fixture
def accepting_no_one(monkeypatch):
    monkeypatch.setattr(settings, "accepted_callers_file", "")
    monkeypatch.setattr(service_credentials, "_accepted_callers", {})
    monkeypatch.setattr(service_credentials, "_accepted_callers_signature", None)


def _status(call) -> int:
    with pytest.raises(HTTPException) as raised:
        call()
    return raised.value.status_code


class TestRequireCaller:
    def test_names_the_caller_behind_a_bearer_credential(self, accepting):
        assert require_caller(f"Bearer {TOKENS['sea']}") == "sea"

    def test_503_when_this_process_accepts_no_one(self, accepting_no_one):
        assert _status(lambda: require_caller(f"Bearer {TOKENS['sea']}")) == 503

    @pytest.mark.parametrize(
        "authorization",
        [
            None,
            "",
            "Bearer ",
            "Bearer made-up",
            TOKENS["sea"],
            f"Basic {TOKENS['sea']}",
            f"bearer {TOKENS['sea']}",
        ],
    )
    def test_401_for_a_missing_malformed_or_unknown_credential(
        self, accepting, authorization
    ):
        assert _status(lambda: require_caller(authorization)) == 401


class TestRequirePermission:
    def test_allowed_passes(self):
        require_permission(True)

    def test_refused_is_403(self):
        assert _status(lambda: require_permission(False)) == 403


class TestRequireDecoder:
    def test_names_a_decoder_acting_as_its_own_kind(self, accepting):
        assert require_decoder(TOKENS["aprs-decoder"], "aprs") == "aprs-decoder"

    def test_503_when_this_process_accepts_no_one(self, accepting_no_one):
        assert _status(lambda: require_decoder(TOKENS["aprs-decoder"], "aprs")) == 503

    @pytest.mark.parametrize("presented", ["", "made-up"])
    def test_401_for_a_missing_or_unknown_credential(self, accepting, presented):
        assert _status(lambda: require_decoder(presented, "aprs")) == 401

    def test_403_for_another_kinds_decoder(self, accepting):
        assert _status(lambda: require_decoder(TOKENS["stub-decoder"], "aprs")) == 403

    def test_403_for_a_service_even_core(self, accepting):
        assert _status(lambda: require_decoder(TOKENS["core"], "aprs")) == 403
        assert _status(lambda: require_decoder(TOKENS["sdr"], "voice")) == 403
