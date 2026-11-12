"""HTTPS for this machine's SDR Manager: serving it, refusing to fall back, and what other Sentinels trust.

- `run_server.tls_arguments` turns the two TLS settings into uvicorn's, and
  exits rather than serve plain HTTP when they are set but not there;
- `run_server.announce_transport` logs the certificate authority fingerprint
  other Sentinels show their operators;
- `GET /api/tls/certificate-authority` (both mounts, no sign-in) hands that
  authority and fingerprint out, and 404s when there is none to hand out.

Certificates are made with the real `openssl` tool, as service-credentials does.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_tls.py
"""

from __future__ import annotations

import logging
import socket
import subprocess
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from backend.config import settings as backend_settings
from backend.platform.tls_fingerprint import certificate_fingerprint
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sentinel_sdr_manager_local import run_server
from sentinel_sdr_manager_local.config import Settings, get_settings
from sentinel_sdr_manager_local.logging_config import SDR_MANAGER_LOCAL_LOGGING_CONFIG
from sentinel_sdr_manager_local.routers.tls import read_certificate_authority


@pytest.fixture(scope="module")
def authority(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A certificate authority's certificate file."""
    directory = tmp_path_factory.mktemp("authority")
    key, certificate = directory / "key.pem", directory / "certificate-authority.pem"
    subprocess.run(["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(key)], check=True)
    subprocess.run(
        ["openssl", "req", "-x509", "-new", "-key", str(key), "-sha256", "-days", "30", "-subj", "/CN=test CA",
         "-addext", "basicConstraints=critical,CA:TRUE", "-out", str(certificate)],
        check=True,
        capture_output=True,
    )  # fmt: skip
    return certificate


@pytest.fixture
def tls_files(tmp_path: Path) -> tuple[Path, Path]:
    certificate, private_key = tmp_path / "certificate.pem", tmp_path / "private-key.pem"
    certificate.write_text("certificate")
    private_key.write_text("key")
    return certificate, private_key


def _settings(certificate: str = "", private_key: str = "") -> Settings:
    return Settings(tls_certificate_file=certificate, tls_private_key_file=private_key)


# ── tls_arguments ──────────────────────────────────────────────────────────────


class TestTlsArguments:
    def test_neither_file_set_is_plain_http(self) -> None:
        assert run_server.tls_arguments(_settings()) == {}

    def test_both_files_present_are_uvicorns_tls_arguments(self, tls_files: tuple[Path, Path]) -> None:
        certificate, private_key = tls_files

        assert run_server.tls_arguments(_settings(str(certificate), str(private_key))) == {
            "ssl_certfile": str(certificate),
            "ssl_keyfile": str(private_key),
        }

    @pytest.mark.parametrize(
        ("which", "named"),
        [
            pytest.param("certificate", "SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE (not set)", id="certificate-unset"),
            pytest.param("key", "SDR_MANAGER_LOCAL_TLS_PRIVATE_KEY_FILE (not set)", id="key-unset"),
        ],
    )
    def test_only_one_set_refuses_to_start(self, tls_files: tuple[Path, Path], which: str, named: str) -> None:
        certificate, private_key = tls_files
        settings = _settings("", str(private_key)) if which == "certificate" else _settings(str(certificate), "")

        with pytest.raises(SystemExit) as exited:
            run_server.tls_arguments(settings)

        assert named in str(exited.value.code)

    def test_a_missing_file_refuses_to_start_naming_it(self, tmp_path: Path, tls_files: tuple[Path, Path]) -> None:
        certificate, _private_key = tls_files
        missing_key = tmp_path / "gone.pem"

        with pytest.raises(SystemExit) as exited:
            run_server.tls_arguments(_settings(str(certificate), str(missing_key)))

        message = str(exited.value.code)
        assert f"SDR_MANAGER_LOCAL_TLS_PRIVATE_KEY_FILE ({missing_key})" in message
        assert "CERTIFICATE_FILE" not in message
        assert "docker compose up -d" in message

    def test_a_folder_is_not_a_file(self, tmp_path: Path, tls_files: tuple[Path, Path]) -> None:
        _certificate, private_key = tls_files

        with pytest.raises(SystemExit):
            run_server.tls_arguments(_settings(str(tmp_path), str(private_key)))


# ── announce_transport ─────────────────────────────────────────────────────────


class _Recorder(logging.Handler):
    def __init__(self) -> None:
        super().__init__(logging.DEBUG)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)

    @property
    def text(self) -> str:
        return "\n".join(record.getMessage() for record in self.records)


@pytest.fixture
def announced() -> Iterator[_Recorder]:
    """What `uvicorn.error` logs, read off the logger itself.

    Not `caplog`: once any test has run `main()`, its logging config stops
    `uvicorn` loggers propagating to the root, where caplog listens.
    """
    recorder = _Recorder()
    logger = logging.getLogger("uvicorn.error")
    previous_level = logger.level
    logger.addHandler(recorder)
    logger.setLevel(logging.INFO)
    yield recorder
    logger.removeHandler(recorder)
    logger.setLevel(previous_level)


class TestAnnounceTransport:
    def test_https_logs_the_fingerprint_other_sentinels_see(
        self, authority: Path, monkeypatch: pytest.MonkeyPatch, announced: _Recorder
    ) -> None:
        monkeypatch.setattr(backend_settings, "internal_certificate_authority_file", str(authority))

        run_server.announce_transport({"ssl_certfile": "c", "ssl_keyfile": "k"}, 8000)

        fingerprint = certificate_fingerprint(authority.read_text())
        assert f"serving HTTPS on port 8000; certificate fingerprint (SHA-256) {fingerprint}" in announced.text

    def test_https_without_an_authority_says_the_fingerprint_is_unknown(
        self, monkeypatch: pytest.MonkeyPatch, announced: _Recorder
    ) -> None:
        monkeypatch.setattr(backend_settings, "internal_certificate_authority_file", "")

        run_server.announce_transport({"ssl_certfile": "c", "ssl_keyfile": "k"}, 8443)

        assert "serving HTTPS on port 8443; certificate fingerprint (SHA-256) unknown" in announced.text

    def test_plain_http_is_a_warning(self, announced: _Recorder) -> None:
        run_server.announce_transport({}, 8000)

        [record] = announced.records
        assert record.levelno == logging.WARNING
        assert "serving plain HTTP on port 8000" in record.getMessage()


# ── main ───────────────────────────────────────────────────────────────────────


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@pytest.fixture
def started(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[dict[str, Any]]]:
    calls: list[dict[str, Any]] = []
    monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_HOST", "127.0.0.1")
    monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_PORT", str(_free_port()))
    monkeypatch.setattr(run_server.uvicorn, "run", lambda target, **options: calls.append(options))
    get_settings.cache_clear()
    yield calls
    get_settings.cache_clear()


class TestMainServesHttps:
    def test_hands_uvicorn_the_certificate(
        self, started: list[dict[str, Any]], tls_files: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        certificate, private_key = tls_files
        monkeypatch.setenv("SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE", str(certificate))
        monkeypatch.setenv("SDR_MANAGER_LOCAL_TLS_PRIVATE_KEY_FILE", str(private_key))

        run_server.main()

        [options] = started
        assert (options["ssl_certfile"], options["ssl_keyfile"]) == (str(certificate), str(private_key))
        assert options["log_config"] is SDR_MANAGER_LOCAL_LOGGING_CONFIG
        assert options["proxy_headers"] is False

    def test_never_starts_on_plain_http_when_the_certificate_is_missing(
        self, started: list[dict[str, Any]], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE", str(tmp_path / "missing.pem"))
        monkeypatch.setenv("SDR_MANAGER_LOCAL_TLS_PRIVATE_KEY_FILE", str(tmp_path / "missing-key.pem"))

        with pytest.raises(SystemExit):
            run_server.main()

        assert started == []


# ── GET /api/tls/certificate-authority ─────────────────────────────────────────


@pytest.fixture
def client(sdr_manager_local_app_factory: Callable[[], FastAPI]) -> Iterator[TestClient]:
    with TestClient(sdr_manager_local_app_factory(), raise_server_exceptions=False) as test_client:
        yield test_client


class TestCertificateAuthorityEndpoint:
    @pytest.mark.parametrize("mount", ["/api", "/api/sdr-manager/local"])
    def test_hands_out_the_authority_and_its_fingerprint_without_a_sign_in(
        self, client: TestClient, authority: Path, monkeypatch: pytest.MonkeyPatch, mount: str
    ) -> None:
        monkeypatch.setattr(backend_settings, "internal_certificate_authority_file", str(authority))

        response = client.get(f"{mount}/tls/certificate-authority")

        assert response.status_code == 200
        pem = authority.read_text()
        assert response.json() == {"certificate_authority": pem, "fingerprint": certificate_fingerprint(pem)}

    def test_never_hands_out_a_private_key(
        self, client: TestClient, authority: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(backend_settings, "internal_certificate_authority_file", str(authority))

        assert "PRIVATE KEY" not in client.get("/api/tls/certificate-authority").text

    @pytest.mark.parametrize(
        "configured",
        [
            pytest.param("", id="not-configured"),
            pytest.param("/nonexistent/certificate-authority.pem", id="missing-file"),
        ],
    )
    def test_404_when_there_is_none(self, client: TestClient, monkeypatch: pytest.MonkeyPatch, configured: str) -> None:
        monkeypatch.setattr(backend_settings, "internal_certificate_authority_file", configured)

        response = client.get("/api/tls/certificate-authority")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "no_certificate_authority"

    def test_a_file_that_is_not_a_certificate_is_none_and_is_logged(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        junk = tmp_path / "certificate-authority.pem"
        junk.write_text("not a certificate")
        monkeypatch.setattr(backend_settings, "internal_certificate_authority_file", str(junk))

        with caplog.at_level(logging.WARNING):
            assert read_certificate_authority() is None

        assert f"the certificate authority at {junk} can't be read" in caplog.text
