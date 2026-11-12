"""`backend/platform/tls_fingerprint.py`: the one fingerprint both ends of SDR host trust compare."""

from __future__ import annotations

import hashlib
import ssl
import subprocess

import pytest

from backend.platform.tls_fingerprint import certificate_fingerprint


@pytest.fixture(scope="module")
def authority_pem(tmp_path_factory: pytest.TempPathFactory) -> str:
    directory = tmp_path_factory.mktemp("authority")
    key, certificate = directory / "key.pem", directory / "certificate.pem"
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
         "-out", str(certificate)],
        check=True,
        capture_output=True,
    )  # fmt: skip
    return certificate.read_text()


def test_matches_what_openssl_prints(authority_pem: str, tmp_path) -> None:
    certificate = tmp_path / "certificate.pem"
    certificate.write_text(authority_pem)
    printed = subprocess.run(
        [
            "openssl",
            "x509",
            "-noout",
            "-fingerprint",
            "-sha256",
            "-in",
            str(certificate),
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout

    assert printed.strip().split("=", 1)[1] == certificate_fingerprint(authority_pem)


def test_is_the_sha256_of_the_der_bytes_in_colon_pairs(authority_pem: str) -> None:
    digest = hashlib.sha256(ssl.PEM_cert_to_DER_cert(authority_pem)).hexdigest().upper()

    assert certificate_fingerprint(authority_pem) == ":".join(
        digest[index : index + 2] for index in range(0, 64, 2)
    )


def test_text_that_is_not_a_certificate_is_a_value_error() -> None:
    with pytest.raises(ValueError):
        certificate_fingerprint("not a certificate")
