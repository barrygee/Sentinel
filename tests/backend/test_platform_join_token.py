"""The deployment's join token (backend/platform/join_token.py): an explicit
value wins; otherwise core generates the shared file once and services read it."""

import os
import stat

import pytest

from backend.config import settings
from backend.platform import join_token as join_token_module
from backend.platform.join_token import core_join_token, service_join_token


@pytest.fixture(autouse=True)
def fresh_token(monkeypatch):
    # The generated token is cached for the process; every test starts without one.
    monkeypatch.setattr(join_token_module, "_generated_token", None)
    monkeypatch.setattr(settings, "sentinel_join_token", "")
    monkeypatch.setattr(settings, "sentinel_join_token_file", "")


class TestCoreJoinToken:
    def test_an_explicit_token_wins_over_the_file(self, monkeypatch, tmp_path):
        token_file = tmp_path / "join-token"
        token_file.write_text("from-the-file")
        monkeypatch.setattr(settings, "sentinel_join_token", "pinned")
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(token_file))

        assert core_join_token() == "pinned"

    def test_no_token_and_no_file_disables_registration(self):
        assert core_join_token() == ""

    def test_generates_a_long_random_token_into_the_file(self, monkeypatch, tmp_path):
        token_file = tmp_path / "shared" / "join-token"
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(token_file))

        # A strict umask, so only the explicit chmod can make the file readable.
        previous_umask = os.umask(0o077)
        try:
            token = core_join_token()
        finally:
            os.umask(previous_umask)

        assert len(token) >= 32
        assert token_file.read_text() == token
        # Readable by the service containers that mount the same volume.
        assert stat.S_IMODE(token_file.stat().st_mode) == 0o644

    def test_is_stable_once_generated(self, monkeypatch, tmp_path):
        token_file = tmp_path / "join-token"
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(token_file))

        first = core_join_token()
        token_file.write_text("changed-behind-our-back")

        assert core_join_token() == first

    def test_reuses_a_token_already_in_the_file(self, monkeypatch, tmp_path):
        token_file = tmp_path / "join-token"
        token_file.write_text("  written-by-an-earlier-start\n")
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(token_file))

        assert core_join_token() == "written-by-an-earlier-start"

    def test_an_empty_file_is_replaced_with_a_new_token(self, monkeypatch, tmp_path):
        token_file = tmp_path / "join-token"
        token_file.write_text("")
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(token_file))

        token = core_join_token()

        assert token
        assert token_file.read_text() == token

    def test_an_unwritable_location_disables_registration(self, monkeypatch, tmp_path):
        blocker = tmp_path / "not-a-directory"
        blocker.write_text("")
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(blocker / "join-token"))

        assert core_join_token() == ""


class TestServiceJoinToken:
    def test_an_explicit_token_wins(self, monkeypatch, tmp_path):
        token_file = tmp_path / "join-token"
        token_file.write_text("from-the-file")
        monkeypatch.setattr(settings, "sentinel_join_token", "pinned")
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(token_file))

        assert service_join_token() == "pinned"

    def test_reads_the_token_core_wrote(self, monkeypatch, tmp_path):
        token_file = tmp_path / "join-token"
        token_file.write_text("shared-token\n")
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(token_file))

        assert service_join_token() == "shared-token"

    def test_is_empty_before_core_has_written_the_file(self, monkeypatch, tmp_path):
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(tmp_path / "join-token"))

        assert service_join_token() == ""

    def test_is_empty_with_no_token_configured(self):
        assert service_join_token() == ""

    def test_never_creates_the_file(self, monkeypatch, tmp_path):
        token_file = tmp_path / "join-token"
        monkeypatch.setattr(settings, "sentinel_join_token_file", str(token_file))

        service_join_token()

        assert not token_file.exists()
