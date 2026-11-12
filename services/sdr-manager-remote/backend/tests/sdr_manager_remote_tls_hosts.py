"""Real certificates and real TLS servers for the trust-on-first-use tests.

`make_certificates` runs the `openssl` command line tool (as the credentials
generator's own tests do) to make two certificate authorities — the host's own
(`good`) and an impostor's (`evil`) — and server certificates each one signed.

`serve` starts a minimal HTTP/1.1 server on 127.0.0.1 in the test's own event
loop: over TLS with the given certificate, or over plain HTTP when given none.
Each route answers a fixed status and body. Real handshakes are the point:
the code under test classifies failures by the `ssl` exception that a real
handshake raises, which a mock transport can't produce.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import ssl
import subprocess
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Certificates:
    """Paths and PEM text for every certificate the tests use."""

    directory: Path
    good_authority_pem: str
    evil_authority_pem: str
    server_key: Path
    good_server: Path  # signed by the good authority
    evil_server: Path  # signed by the evil authority
    leaf_pem: str  # a server certificate, not an authority


def _openssl(*arguments: str) -> None:
    subprocess.run(["openssl", *arguments], check=True, capture_output=True)


def _make_authority(directory: Path, name: str) -> tuple[Path, Path]:
    key, certificate = directory / f"{name}-key.pem", directory / f"{name}-authority.pem"
    _openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(key))
    _openssl(
        "req", "-x509", "-new", "-key", str(key), "-sha256", "-days", "30",
        "-subj", f"/CN={name} authority/O=Sentinel tests",
        "-addext", "basicConstraints=critical,CA:TRUE",
        "-addext", "keyUsage=critical,keyCertSign,cRLSign",
        "-out", str(certificate),
    )  # fmt: skip
    return key, certificate


def _sign_server(directory: Path, request: Path, authority: tuple[Path, Path], name: str) -> Path:
    extensions = directory / "server-extensions.cnf"
    extensions.write_text("subjectAltName=DNS:sdr-host,IP:127.0.0.1\nbasicConstraints=CA:FALSE\n")
    certificate = directory / f"{name}-server.pem"
    key, authority_certificate = authority
    _openssl(
        "x509", "-req", "-in", str(request), "-CA", str(authority_certificate), "-CAkey", str(key),
        "-CAcreateserial", "-days", "10", "-sha256", "-extfile", str(extensions), "-out", str(certificate),
    )  # fmt: skip
    return certificate


def make_certificates(directory: Path) -> Certificates:
    """Two authorities and a server certificate from each, all under `directory`."""
    good, evil = _make_authority(directory, "good"), _make_authority(directory, "evil")
    server_key, request = directory / "server-key.pem", directory / "server.csr"
    _openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(server_key))
    _openssl("req", "-new", "-key", str(server_key), "-subj", "/CN=sdr-host", "-out", str(request))
    good_server = _sign_server(directory, request, good, "good")
    return Certificates(
        directory=directory,
        good_authority_pem=good[1].read_text(),
        evil_authority_pem=evil[1].read_text(),
        server_key=server_key,
        good_server=good_server,
        evil_server=_sign_server(directory, request, evil, "evil"),
        leaf_pem=good_server.read_text(),
    )


Route = tuple[int, bytes]


def json_route(body: object, status: int = 200) -> Route:
    """A route answering `body` as JSON."""
    return status, json.dumps(body).encode()


def authority_routes(authority_pem: str) -> dict[str, Route]:
    """What an SDR host serves: its authority, health and status."""
    return {
        "/api/tls/certificate-authority": json_route({"certificate_authority": authority_pem}),
        "/api/health": json_route({"status": "ok"}),
        "/api/status": json_route({"generated_at": 1, "sdrs": []}),
    }


@contextlib.asynccontextmanager
async def serve(
    routes: dict[str, Route],
    *,
    certificate: Path | None = None,
    key: Path | None = None,
    received: list[str] | None = None,
) -> AsyncIterator[int]:
    """Serve `routes` on 127.0.0.1 (TLS when given a certificate); yields the port.

    Every request path that arrives is appended to `received`, so a test can
    prove a request was — or was never — sent.
    """
    context: ssl.SSLContext | None = None
    if certificate is not None and key is not None:
        context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        context.load_cert_chain(certfile=str(certificate), keyfile=str(key))

    async def answer(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            request_line = await reader.readline()
            while (await reader.readline()) not in (b"\r\n", b"\n", b""):
                pass  # headers: nothing here needs them
            parts = request_line.decode("latin-1").split()
            if received is not None and len(parts) == 3:
                received.append(parts[1])
            # A TLS ClientHello sent to the plain server isn't a request line;
            # answering it as HTTP is what a plain-HTTP SDR host does.
            status, body = routes.get(parts[1], (404, b"{}")) if len(parts) == 3 else (400, b"{}")
            writer.write(
                f"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n"
                "Connection: close\r\n\r\n".encode()
                + body
            )
            await writer.drain()
        except (ConnectionError, ssl.SSLError):
            pass  # a client that refused our certificate hangs up mid-handshake
        finally:
            writer.close()
            with contextlib.suppress(ConnectionError, ssl.SSLError):
                await writer.wait_closed()

    server = await asyncio.start_server(answer, "127.0.0.1", 0, ssl=context)
    try:
        yield server.sockets[0].getsockname()[1]
    finally:
        server.close()
        await server.wait_closed()
