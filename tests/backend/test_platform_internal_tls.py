"""TLS trust between Sentinel processes on different hosts (backend/platform/internal_tls.py, P7.5).

The real check is a handshake: a local TLS server presents a certificate the
deployment CA issued (made by the real setup script), and an httpx client
using `internal_verify()` accepts it while a default client refuses it.
"""

import asyncio
import logging
import ssl
from pathlib import Path

import httpx
import pytest

from backend.config import settings
from backend.platform import internal_tls
from backend.platform.internal_tls import internal_verify
from backend.scripts import generate_service_credentials as setup


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    monkeypatch.setattr(settings, "internal_certificate_authority_file", "")
    internal_tls._context_trusting.cache_clear()
    yield
    internal_tls._context_trusting.cache_clear()


@pytest.fixture(scope="module")
def deployment(tmp_path_factory) -> Path:
    """A CA and core's service-entrypoint certificate (covers `localhost`)."""
    output = tmp_path_factory.mktemp("credentials")
    setup.generate(output)
    return output / "credentials" / setup.GATEWAY_FOLDER


async def _serve_tls(certificate_folder: Path):
    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    context.load_cert_chain(certificate_folder / "certificate.pem", certificate_folder / "private-key.pem")

    async def answer(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            await reader.readuntil(b"\r\n\r\n")
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
            await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError, ssl.SSLError):
            pass
        finally:
            writer.close()

    server = await asyncio.start_server(answer, "127.0.0.1", 0, ssl=context)
    return server, server.sockets[0].getsockname()[1]


def test_nothing_configured_trusts_the_public_authorities_only():
    assert internal_verify() is True


async def test_trusts_a_certificate_the_deployment_ca_issued(deployment, monkeypatch):
    monkeypatch.setattr(settings, "internal_certificate_authority_file", str(deployment / "certificate-authority.pem"))
    server, port = await _serve_tls(deployment)
    async with server:
        async with httpx.AsyncClient(verify=internal_verify()) as client:
            response = await client.get(f"https://localhost:{port}/health")
    assert response.text == "ok"


async def test_without_the_deployment_ca_the_same_certificate_is_refused(deployment):
    server, port = await _serve_tls(deployment)
    async with server:
        async with httpx.AsyncClient(verify=internal_verify()) as client:
            with pytest.raises(httpx.ConnectError):
                await client.get(f"https://localhost:{port}/health")


async def test_a_name_the_certificate_does_not_cover_is_refused(deployment, monkeypatch):
    monkeypatch.setattr(settings, "internal_certificate_authority_file", str(deployment / "certificate-authority.pem"))
    server, port = await _serve_tls(deployment)
    async with server:
        async with httpx.AsyncClient(verify=internal_verify()) as client:
            # 127.0.0.1 is not among the certificate's names (no IP SAN by default).
            with pytest.raises(httpx.ConnectError):
                await client.get(f"https://127.0.0.1:{port}/health")


def test_the_public_authorities_stay_trusted_alongside(deployment, monkeypatch):
    monkeypatch.setattr(settings, "internal_certificate_authority_file", str(deployment / "certificate-authority.pem"))
    context = internal_verify()
    assert isinstance(context, ssl.SSLContext)
    subjects = [dict(field[0] for field in authority["subject"]) for authority in context.get_ca_certs()]
    assert {"commonName": "Sentinel event bus CA"} in subjects
    # certifi's bundle is well over a hundred authorities; ours is one more.
    assert len(subjects) > 100


def test_the_context_is_built_once_per_file(deployment, monkeypatch):
    monkeypatch.setattr(settings, "internal_certificate_authority_file", str(deployment / "certificate-authority.pem"))
    assert internal_verify() is internal_verify()


@pytest.mark.parametrize("contents", [None, "not a certificate"])
def test_an_unusable_ca_file_is_logged_and_falls_back(monkeypatch, tmp_path, caplog, contents):
    path = tmp_path / "certificate-authority.pem"
    if contents is not None:
        path.write_text(contents)
    monkeypatch.setattr(settings, "internal_certificate_authority_file", str(path))
    with caplog.at_level(logging.ERROR):
        assert internal_verify() is True
    assert "can't be loaded" in caplog.text
