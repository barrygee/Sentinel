"""
tests/backend/test_platform_nats_credentials.py

Unit tests for backend/platform/nats_credentials.py — the NATS user, reply
inbox and TLS trust a process connects with (P7.4).
"""

from __future__ import annotations

import json
import logging
import ssl

import pytest

from backend.config import settings
from backend.platform.nats_credentials import connection_options
from backend.scripts.generate_nats_credentials import ensure_certificate_authority


@pytest.fixture(autouse=True)
def no_identity(monkeypatch):
    monkeypatch.setattr(settings, "nats_credentials_file", "")
    monkeypatch.setattr(settings, "nats_certificate_authority_file", "")


def test_nothing_configured_connects_anonymously_with_system_trust():
    assert connection_options() == {}


def test_credentials_file_gives_the_user_password_and_its_own_inbox(
    monkeypatch, tmp_path
):
    credentials = tmp_path / "credentials.json"
    credentials.write_text(json.dumps({"user": "land", "password": "secret"}))
    monkeypatch.setattr(settings, "nats_credentials_file", str(credentials))
    assert connection_options() == {
        "user": "land",
        "password": "secret",
        "inbox_prefix": "_INBOX.land",
    }


@pytest.mark.parametrize(
    "content",
    [None, "not json", json.dumps({"user": "land"}), json.dumps(["land", "secret"])],
    ids=["missing", "not-json", "no-password", "not-an-object"],
)
def test_unreadable_credentials_are_logged_and_skipped(
    monkeypatch, tmp_path, caplog, content
):
    credentials = tmp_path / "credentials.json"
    if content is not None:
        credentials.write_text(content)
    monkeypatch.setattr(settings, "nats_credentials_file", str(credentials))
    with caplog.at_level(logging.ERROR, logger="backend.platform.nats_credentials"):
        assert connection_options() == {}
    assert f"NATS credentials at {credentials} can't be read" in caplog.text


def test_certificate_authority_file_becomes_the_tls_trust(monkeypatch, tmp_path):
    certificate, _ = ensure_certificate_authority(tmp_path / "authority")
    monkeypatch.setattr(settings, "nats_certificate_authority_file", str(certificate))
    context = connection_options()["tls"]
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert [entry["subject"] for entry in context.get_ca_certs()] == [
        ((("commonName", "Sentinel event bus CA"),),)
    ]


@pytest.mark.parametrize(
    "content", [None, "not a certificate"], ids=["missing", "garbage"]
)
def test_unloadable_certificate_authority_is_logged_and_skipped(
    monkeypatch, tmp_path, caplog, content
):
    certificate = tmp_path / "authority.pem"
    if content is not None:
        certificate.write_text(content)
    monkeypatch.setattr(settings, "nats_certificate_authority_file", str(certificate))
    with caplog.at_level(logging.ERROR, logger="backend.platform.nats_credentials"):
        assert "tls" not in connection_options()
    assert f"NATS certificate authority at {certificate} can't be loaded" in caplog.text
