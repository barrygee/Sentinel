"""This process's HTTP credential and caller identification (backend/platform/service_credentials.py)."""

import hashlib
import json
import logging
import os

import pytest

from backend.config import settings
from backend.platform import service_credentials
from backend.platform.service_credentials import (
    accepts_callers,
    credential_hash,
    identify_caller,
    own_token,
)
from tests.backend.service_credentials_test_helpers import (
    TOKENS,
    accept_callers,
    present_credential,
)


@pytest.fixture(autouse=True)
def nothing_configured(monkeypatch):
    monkeypatch.setattr(settings, "service_http_credentials_file", "")
    monkeypatch.setattr(settings, "accepted_callers_file", "")
    monkeypatch.setattr(service_credentials, "_accepted_callers", {})
    monkeypatch.setattr(service_credentials, "_accepted_callers_signature", None)


def test_credential_hash_is_the_sha256_hex_digest():
    assert credential_hash("abc") == hashlib.sha256(b"abc").hexdigest()


class TestOwnToken:
    def test_no_file_configured_means_no_token(self):
        assert own_token() == ""

    def test_reads_the_token_from_the_file(self, monkeypatch, tmp_path):
        present_credential(monkeypatch, tmp_path, "sea")
        assert own_token() == TOKENS["sea"]

    def test_a_missing_file_is_logged_and_gives_no_token(
        self, monkeypatch, tmp_path, caplog
    ):
        monkeypatch.setattr(
            settings, "service_http_credentials_file", str(tmp_path / "absent.json")
        )
        with caplog.at_level(logging.ERROR):
            assert own_token() == ""
        assert "can't be read" in caplog.text

    @pytest.mark.parametrize(
        "contents", ["not json", "[]", '{"caller": "sea"}', '"a string"']
    )
    def test_an_unusable_file_gives_no_token(self, monkeypatch, tmp_path, contents):
        path = tmp_path / "http-credentials.json"
        path.write_text(contents)
        monkeypatch.setattr(settings, "service_http_credentials_file", str(path))
        assert own_token() == ""

    def test_a_non_string_token_gives_no_token(self, monkeypatch, tmp_path):
        path = tmp_path / "http-credentials.json"
        path.write_text(json.dumps({"caller": "sea", "token": 12345}))
        monkeypatch.setattr(settings, "service_http_credentials_file", str(path))
        assert own_token() == ""


class TestAcceptedCallers:
    def test_no_list_configured_accepts_no_one(self):
        assert not accepts_callers()
        assert identify_caller(TOKENS["sea"]) is None

    def test_identifies_each_caller_by_its_token(self, monkeypatch, tmp_path):
        accept_callers(monkeypatch, tmp_path)
        assert accepts_callers()
        for caller, token in TOKENS.items():
            assert identify_caller(token) == caller

    def test_an_unknown_token_is_no_one(self, monkeypatch, tmp_path):
        accept_callers(monkeypatch, tmp_path)
        assert identify_caller("made-up") is None

    def test_an_empty_token_is_no_one(
        self, monkeypatch, tmp_path
    ):
        accept_callers(monkeypatch, tmp_path)
        assert identify_caller("") is None

    def test_the_list_holds_hashes_so_a_hash_is_not_a_credential(
        self, monkeypatch, tmp_path
    ):
        accept_callers(monkeypatch, tmp_path)
        assert identify_caller(credential_hash(TOKENS["sea"])) is None

    def test_a_caller_left_off_the_list_is_no_one(self, monkeypatch, tmp_path):
        accept_callers(monkeypatch, tmp_path, ["sdr"])
        assert identify_caller(TOKENS["sdr"]) == "sdr"
        assert identify_caller(TOKENS["sea"]) is None

    def test_a_rewritten_list_is_read_again(self, monkeypatch, tmp_path):
        path = accept_callers(monkeypatch, tmp_path, ["sdr"])
        assert identify_caller(TOKENS["sea"]) is None
        path.write_text(json.dumps({credential_hash(TOKENS["sea"]): "sea"}))
        # Same second is fine (nanosecond mtime + size), but make the change unmistakable.
        stat = path.stat()
        os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
        assert identify_caller(TOKENS["sea"]) == "sea"
        assert identify_caller(TOKENS["sdr"]) is None

    def test_an_unchanged_list_is_not_read_again(self, monkeypatch, tmp_path):
        accept_callers(monkeypatch, tmp_path, ["sdr"])
        assert identify_caller(TOKENS["sdr"]) == "sdr"
        reads = []
        original_read_text = service_credentials.Path.read_text
        monkeypatch.setattr(
            service_credentials.Path,
            "read_text",
            lambda self, *a, **k: reads.append(self) or original_read_text(self),
        )
        assert identify_caller(TOKENS["sdr"]) == "sdr"
        assert reads == []

    def test_a_missing_list_is_logged_and_accepts_no_one(
        self, monkeypatch, tmp_path, caplog
    ):
        monkeypatch.setattr(
            settings, "accepted_callers_file", str(tmp_path / "absent.json")
        )
        with caplog.at_level(logging.ERROR):
            assert not accepts_callers()
        assert "can't be read" in caplog.text

    @pytest.mark.parametrize("contents", ["not json", "[1, 2]", "42"])
    def test_an_unusable_list_accepts_no_one(self, monkeypatch, tmp_path, contents):
        path = tmp_path / "accepted-callers.json"
        path.write_text(contents)
        monkeypatch.setattr(settings, "accepted_callers_file", str(path))
        assert not accepts_callers()
