"""The image's health check: `/health` over HTTPS when SDR Manager serves it, verified.

Runs `healthcheck.check` against a real local server, plain or TLS, with
certificates made by `openssl` as service-credentials makes them.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_healthcheck.py
"""

from __future__ import annotations

import http.server
import socket
import ssl
import subprocess
import threading
from collections.abc import Iterator
from pathlib import Path

import pytest

from sentinel_sdr_manager_local import healthcheck


def _openssl(*arguments: str) -> None:
    subprocess.run(["openssl", *arguments], check=True, capture_output=True)


def _authority(directory: Path, name: str) -> tuple[Path, Path]:
    key, certificate = directory / f"{name}-key.pem", directory / f"{name}.pem"
    _openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(key))
    _openssl("req", "-x509", "-new", "-key", str(key), "-sha256", "-days", "30", "-subj", f"/CN={name}",
             "-addext", "basicConstraints=critical,CA:TRUE", "-out", str(certificate))  # fmt: skip
    return certificate, key


@pytest.fixture(scope="module")
def credentials(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    """A deployment CA, a server certificate it signed for localhost, and an unrelated CA."""
    directory = tmp_path_factory.mktemp("credentials")
    authority, authority_key = _authority(directory, "deployment-ca")
    stranger, _stranger_key = _authority(directory, "stranger-ca")
    server_key, request, server_certificate = (
        directory / "private-key.pem",
        directory / "request.csr",
        directory / "certificate.pem",
    )
    extensions = directory / "extensions.cnf"
    extensions.write_text("subjectAltName=DNS:localhost,IP:127.0.0.1\n")
    _openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(server_key))
    _openssl("req", "-new", "-key", str(server_key), "-subj", "/CN=SDR Manager", "-out", str(request))
    _openssl("x509", "-req", "-in", str(request), "-CA", str(authority), "-CAkey", str(authority_key),
             "-CAcreateserial", "-days", "30", "-sha256", "-extfile", str(extensions),
             "-out", str(server_certificate))  # fmt: skip
    return {"authority": authority, "stranger": stranger, "certificate": server_certificate, "key": server_key}


class _Health(http.server.BaseHTTPRequestHandler):
    status = 200

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler's name
        self.send_response(self.status if self.path == "/health" else 404)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - the base signature
        pass


def _closed_port() -> int:
    """A port nothing listens on: bound, read, then released."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _serve(handler: type[_Health], tls: ssl.SSLContext | None) -> Iterator[int]:
    server = http.server.HTTPServer(("127.0.0.1", 0), handler)
    if tls is not None:
        server.socket = tls.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server.server_address[1]
    server.shutdown()
    server.server_close()


@pytest.fixture
def https_port(credentials: dict[str, Path]) -> Iterator[int]:
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(credentials["certificate"], credentials["key"])
    yield from _serve(_Health, tls)


@pytest.fixture
def http_port() -> Iterator[int]:
    yield from _serve(_Health, None)


def _https_environment(port: int, credentials: dict[str, Path], authority: str = "authority") -> dict[str, str]:
    return {
        "SDR_MANAGER_LOCAL_HTTP_PORT": str(port),
        "SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE": str(credentials["certificate"]),
        "INTERNAL_CERTIFICATE_AUTHORITY_FILE": str(credentials[authority]),
    }


class TestHealthUrl:
    def test_https_when_sdr_manager_serves_it(self) -> None:
        environment = {"SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE": "/c.pem", "SDR_MANAGER_LOCAL_HTTP_PORT": "8443"}

        assert healthcheck.health_url(environment) == "https://localhost:8443/health"

    def test_plain_http_on_the_default_port_without_a_certificate(self) -> None:
        assert healthcheck.health_url({}) == "http://localhost:8000/health"

    def test_an_empty_port_is_the_default(self) -> None:
        assert healthcheck.health_url({"SDR_MANAGER_LOCAL_HTTP_PORT": ""}) == "http://localhost:8000/health"


class TestTlsContext:
    def test_none_for_plain_http(self) -> None:
        assert healthcheck.tls_context({"SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE": ""}) is None

    def test_verifies_against_the_deployment_authority(self, credentials: dict[str, Path]) -> None:
        context = healthcheck.tls_context(_https_environment(8000, credentials))

        assert context is not None
        assert context.verify_mode == ssl.CERT_REQUIRED
        assert context.check_hostname is True
        assert [authority["subject"] for authority in context.get_ca_certs()] == [((("commonName", "deployment-ca"),),)]

    def test_https_without_an_authority_is_refused(self) -> None:
        with pytest.raises(ValueError, match="INTERNAL_CERTIFICATE_AUTHORITY_FILE is not set"):
            healthcheck.tls_context({"SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE": "/c.pem"})


class TestCheck:
    def test_healthy_over_https(self, https_port: int, credentials: dict[str, Path]) -> None:
        assert healthcheck.check(_https_environment(https_port, credentials)) == 0

    def test_healthy_over_plain_http(self, http_port: int) -> None:
        assert healthcheck.check({"SDR_MANAGER_LOCAL_HTTP_PORT": str(http_port)}) == 0

    def test_a_certificate_from_another_authority_is_unhealthy(
        self, https_port: int, credentials: dict[str, Path], capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert healthcheck.check(_https_environment(https_port, credentials, authority="stranger")) == 1
        assert "CERTIFICATE_VERIFY_FAILED" in capsys.readouterr().err

    def test_plain_http_against_an_https_server_is_unhealthy(
        self, https_port: int, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """The bug this replaced: the old check spoke plain HTTP to an HTTPS SDR Manager."""
        assert healthcheck.check({"SDR_MANAGER_LOCAL_HTTP_PORT": str(https_port)}) == 1
        assert "sdr-manager-local health:" in capsys.readouterr().err

    def test_nothing_listening_is_unhealthy(self, credentials: dict[str, Path]) -> None:
        assert healthcheck.check(_https_environment(_closed_port(), credentials)) == 1

    def test_https_without_an_authority_is_unhealthy(self, capsys: pytest.CaptureFixture[str]) -> None:
        assert healthcheck.check({"SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE": "/c.pem"}) == 1
        assert "INTERNAL_CERTIFICATE_AUTHORITY_FILE is not set" in capsys.readouterr().err

    def test_a_status_other_than_200_is_unhealthy(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """urlopen raises for 4xx/5xx, so a non-200 that comes back (a 204, say) is checked by hand."""

        class _NoContent:
            status = 204

            def __enter__(self) -> _NoContent:
                return self

            def __exit__(self, *exception: object) -> None:
                return None

        monkeypatch.setattr(healthcheck.urllib.request, "urlopen", lambda *arguments, **options: _NoContent())

        assert healthcheck.check({}) == 1
        assert "http://localhost:8000/health answered 204" in capsys.readouterr().err

    def test_an_error_status_is_unhealthy(self, monkeypatch: pytest.MonkeyPatch, http_port: int) -> None:
        monkeypatch.setattr(_Health, "status", 503)

        assert healthcheck.check({"SDR_MANAGER_LOCAL_HTTP_PORT": str(http_port)}) == 1
