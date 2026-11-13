"""GET /api/app/certificate-authority(.crt) — what devices install to trust the page over HTTPS.

Certificates are made with the real `openssl` tool, as service-credentials does.

Run with:  uv run --project backend pytest tests/backend/test_app_certificate.py
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

import pytest

from backend.config import settings
from backend.core import app_certificate
from backend.platform.tls_fingerprint import certificate_fingerprint


@pytest.fixture(scope="module")
def authority(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A certificate authority's certificate file (its key stays beside it, never served)."""
    directory = tmp_path_factory.mktemp("authority")
    key, certificate = directory / "key.pem", directory / "certificate-authority.pem"
    subprocess.run(
        [
            "openssl",
            "ecparam",
            "-name",
            "prime256v1",
            "-genkey",
            "-noout",
            "-out",
            str(key),
        ],
        check=True,
    )
    subprocess.run(
        ["openssl", "req", "-x509", "-new", "-key", str(key), "-sha256", "-days", "30", "-subj", "/CN=test CA",
         "-addext", "basicConstraints=critical,CA:TRUE", "-out", str(certificate)],
        check=True,
        capture_output=True,
    )  # fmt: skip
    return certificate


@pytest.fixture
def configured(monkeypatch, authority: Path) -> Path:
    monkeypatch.setattr(settings, "internal_certificate_authority_file", str(authority))
    monkeypatch.setattr(settings, "web_https_port", 9443)
    return authority


class TestCertificateAuthority:
    def test_hands_out_the_authority_its_fingerprint_and_the_https_port(
        self, client, configured
    ):
        response = client.get("/api/app/certificate-authority")

        assert response.status_code == 200
        pem = configured.read_text()
        assert response.json() == {
            "certificate_authority": pem,
            "fingerprint": certificate_fingerprint(pem),
            "https_port": 9443,
        }

    def test_never_hands_out_a_private_key(self, client, configured):
        assert "PRIVATE KEY" not in client.get("/api/app/certificate-authority").text
        assert (
            "PRIVATE KEY" not in client.get("/api/app/certificate-authority.crt").text
        )

    def test_the_port_defaults_to_the_gateways_8444(self):
        assert type(settings).model_fields["web_https_port"].default == 8444


class TestDownload:
    def test_is_the_certificate_as_a_file_a_device_offers_to_install(
        self, client, configured
    ):
        response = client.get("/api/app/certificate-authority.crt")

        assert response.status_code == 200
        assert response.text == configured.read_text()
        assert response.headers["content-type"].startswith("application/x-x509-ca-cert")
        assert (
            response.headers["content-disposition"]
            == 'attachment; filename="sentinel-certificate-authority.crt"'
        )
        assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize(
    "path", ["/api/app/certificate-authority", "/api/app/certificate-authority.crt"]
)
class TestNoneToHandOut:
    @pytest.mark.parametrize(
        "configured_file",
        [
            pytest.param("", id="not-configured"),
            pytest.param("/nonexistent/certificate-authority.pem", id="missing"),
        ],
    )
    def test_404_when_there_is_none(self, client, monkeypatch, path, configured_file):
        monkeypatch.setattr(
            settings, "internal_certificate_authority_file", configured_file
        )

        response = client.get(path)

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "no_certificate_authority"

    def test_a_file_that_is_not_a_certificate_is_404_and_logged(
        self, client, monkeypatch, tmp_path, caplog, path
    ):
        junk = tmp_path / "certificate-authority.pem"
        junk.write_text("not a certificate")
        monkeypatch.setattr(settings, "internal_certificate_authority_file", str(junk))

        with caplog.at_level(logging.WARNING, logger=app_certificate.__name__):
            response = client.get(path)

        assert response.status_code == 404
        assert f"the certificate authority at {junk} can't be read" in caplog.text
