"""Trust on first use (`services/host_certificates.py`): reading, checking and pinning a host's authority.

The fetch runs against real TLS servers (`sdr_manager_remote_tls_hosts`), so
every outcome is decided by a real handshake: an honest host, a host whose
certificate the authority it sends didn't sign, a host that speaks plain HTTP,
one that sends junk, and one that isn't there at all.
"""

from __future__ import annotations

import hashlib
import socket
import ssl

import httpx
import pytest
from sdr_manager_remote_tls_hosts import authority_routes, json_route, make_certificates, serve

from sentinel_sdr_manager_remote.services import host_certificates
from sentinel_sdr_manager_remote.services.host_certificates import (
    MAX_CERTIFICATE_AUTHORITY_BYTES,
    HostCertificateError,
    HostOffersNoTlsError,
    certificate_fingerprint,
    fetch_host_certificate_authority,
    is_tls_refusal,
    normalize_fingerprint,
    parse_certificate_authority,
    pinned_context,
)

TIMEOUT = httpx.Timeout(5.0)


@pytest.fixture(scope="module")
def certificates(tmp_path_factory):
    return make_certificates(tmp_path_factory.mktemp("tls"))


def _closed_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


# ── fingerprints ───────────────────────────────────────────────────────────────


class TestFingerprints:
    def test_is_the_sha256_of_the_der_bytes_in_openssl_form(self, certificates):
        expected = hashlib.sha256(ssl.PEM_cert_to_DER_cert(certificates.good_authority_pem)).hexdigest().upper()

        fingerprint = certificate_fingerprint(certificates.good_authority_pem)

        assert fingerprint.replace(":", "") == expected
        assert len(fingerprint.split(":")) == 32
        assert all(len(pair) == 2 for pair in fingerprint.split(":"))

    def test_two_authorities_have_different_fingerprints(self, certificates):
        assert certificate_fingerprint(certificates.good_authority_pem) != certificate_fingerprint(
            certificates.evil_authority_pem
        )

    @pytest.mark.parametrize(
        "typed",
        [
            pytest.param("ab" * 32, id="lowercase-no-colons"),
            pytest.param(":".join(["AB"] * 32), id="canonical"),
            pytest.param(" ".join(["ab"] * 32), id="spaces"),
            pytest.param("  " + ":".join(["aB"] * 32) + "\n", id="padded-mixed-case"),
        ],
    )
    def test_an_operators_fingerprint_is_normalised(self, typed):
        assert normalize_fingerprint(typed) == ":".join(["AB"] * 32)

    @pytest.mark.parametrize(
        "typed",
        [
            pytest.param("", id="empty"),
            pytest.param("AB" * 31, id="too-short"),
            pytest.param("AB" * 33, id="too-long"),
            pytest.param("ZZ" * 32, id="not-hex"),
            pytest.param("AB-" * 32, id="dashes"),
        ],
    )
    def test_anything_but_a_sha256_is_refused(self, typed):
        with pytest.raises(ValueError, match="64 hexadecimal digits"):
            normalize_fingerprint(typed)


# ── parsing ────────────────────────────────────────────────────────────────────


class TestParseCertificateAuthority:
    def test_describes_one_authority(self, certificates):
        authority = parse_certificate_authority(certificates.good_authority_pem)

        assert authority.fingerprint == certificate_fingerprint(certificates.good_authority_pem)
        assert authority.subject == "CN=good authority, O=Sentinel tests"
        assert authority.not_valid_after.endswith("GMT")
        assert authority.pem.startswith("-----BEGIN CERTIFICATE-----")
        assert authority.pem.endswith("-----END CERTIFICATE-----\n")

    def test_text_around_the_certificate_is_dropped(self, certificates):
        authority = parse_certificate_authority("junk before\n" + certificates.good_authority_pem + "junk after")

        assert "junk" not in authority.pem
        assert authority.fingerprint == certificate_fingerprint(certificates.good_authority_pem)

    def test_a_server_certificate_is_not_an_authority(self, certificates):
        with pytest.raises(HostCertificateError, match="not a certificate authority"):
            parse_certificate_authority(certificates.leaf_pem)

    @pytest.mark.parametrize("pem", ["", "no certificate here"], ids=["empty", "text"])
    def test_no_certificate_is_refused(self, pem):
        with pytest.raises(HostCertificateError, match="no certificate authority, or more than one"):
            parse_certificate_authority(pem)

    def test_a_bundle_is_refused(self, certificates):
        # Pinning a bundle would trust every authority in it, not one host's.
        with pytest.raises(HostCertificateError, match="more than one"):
            parse_certificate_authority(certificates.good_authority_pem + certificates.evil_authority_pem)

    def test_a_corrupt_certificate_is_refused(self):
        corrupt = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n"

        with pytest.raises(HostCertificateError, match="can't be read"):
            parse_certificate_authority(corrupt)

    def test_names_keep_attributes_they_have_no_short_form_for(self):
        name = ((("commonName", "Host"),), (("localityName", "Leeds"),), (("broken",),))

        assert host_certificates._describe_name(name) == "CN=Host, localityName=Leeds"

    def test_a_name_that_is_not_a_tuple_describes_as_nothing(self):
        assert host_certificates._describe_name(None) == ""


# ── contexts and error classification ──────────────────────────────────────────


class TestPinnedContext:
    def test_trusts_only_the_pin_and_ignores_host_names(self, certificates):
        context = pinned_context(certificates.good_authority_pem)

        assert context.verify_mode == ssl.CERT_REQUIRED
        assert context.check_hostname is False
        # No public authorities: the host's own is the only one trusted.
        assert [authority["subject"] for authority in context.get_ca_certs()] == [
            ((("commonName", "good authority"),), (("organizationName", "Sentinel tests"),))
        ]

    def test_is_built_once_per_authority(self, certificates):
        assert pinned_context(certificates.good_authority_pem) is pinned_context(certificates.good_authority_pem)
        assert pinned_context(certificates.good_authority_pem) is not pinned_context(certificates.evil_authority_pem)


class TestErrorClassification:
    def test_a_verification_failure_deep_in_the_chain_is_a_refusal(self):
        root = ssl.SSLCertVerificationError("certificate verify failed")
        middle = RuntimeError("httpcore")
        middle.__cause__ = root
        outer = httpx.ConnectError("connect")
        outer.__cause__ = middle

        assert is_tls_refusal(outer) is True
        assert host_certificates._is_not_tls(outer) is False

    def test_another_tls_error_is_a_host_without_tls(self):
        outer = httpx.ConnectError("connect")
        outer.__context__ = ssl.SSLError("wrong version number")

        assert is_tls_refusal(outer) is False
        assert host_certificates._is_not_tls(outer) is True

    def test_a_plain_network_error_is_neither(self):
        outer = httpx.ConnectError("connect")
        outer.__cause__ = ConnectionRefusedError()

        assert is_tls_refusal(outer) is False
        assert host_certificates._is_not_tls(outer) is False

    def test_a_cyclic_chain_ends(self):
        first, second = RuntimeError("a"), RuntimeError("b")
        first.__cause__, second.__cause__ = second, first

        assert is_tls_refusal(first) is False


# ── fetching from real hosts ───────────────────────────────────────────────────


class TestFetchHostCertificateAuthority:
    async def test_reads_an_honest_hosts_authority(self, certificates):
        routes = authority_routes(certificates.good_authority_pem)
        async with serve(routes, certificate=certificates.good_server, key=certificates.server_key) as port:
            authority = await fetch_host_certificate_authority("127.0.0.1", port, timeout=TIMEOUT)

        assert authority.fingerprint == certificate_fingerprint(certificates.good_authority_pem)

    async def test_a_host_whose_certificate_the_sent_authority_did_not_sign_is_refused(self, certificates):
        # Anyone can send a PEM: the server's own certificate has to chain to it.
        routes = authority_routes(certificates.good_authority_pem)
        async with serve(routes, certificate=certificates.evil_server, key=certificates.server_key) as port:
            with pytest.raises(HostCertificateError, match="isn't signed by the certificate authority it sent"):
                await fetch_host_certificate_authority("127.0.0.1", port, timeout=TIMEOUT)

    async def test_a_plain_http_host_offers_no_tls(self, certificates):
        async with serve(authority_routes(certificates.good_authority_pem)) as port:
            with pytest.raises(HostOffersNoTlsError, match="doesn't offer HTTPS"):
                await fetch_host_certificate_authority("127.0.0.1", port, timeout=TIMEOUT)

    async def test_no_host_at_all_is_a_transport_error(self):
        with pytest.raises(httpx.ConnectError):
            await fetch_host_certificate_authority("127.0.0.1", _closed_port(), timeout=TIMEOUT)

    async def test_the_verifying_request_failing_for_another_reason_is_a_transport_error(
        self, certificates, monkeypatch
    ):
        routes = authority_routes(certificates.good_authority_pem)
        real_get = httpx.AsyncClient.get

        async def get_fails(self, url, **kwargs):
            raise httpx.ReadTimeout("slow", request=httpx.Request("GET", url))

        async with serve(routes, certificate=certificates.good_server, key=certificates.server_key) as port:
            monkeypatch.setattr(httpx.AsyncClient, "get", get_fails)
            try:
                with pytest.raises(httpx.ReadTimeout):
                    await fetch_host_certificate_authority("127.0.0.1", port, timeout=TIMEOUT)
            finally:
                monkeypatch.setattr(httpx.AsyncClient, "get", real_get)

    @pytest.mark.parametrize(
        ("route", "message"),
        [
            pytest.param(json_route({"detail": "nope"}, status=404), r"HTTP 404", id="not-found"),
            pytest.param((200, b"not json"), "isn't valid", id="not-json"),
            pytest.param(json_route(["a", "list"]), "isn't valid", id="not-an-object"),
            pytest.param(json_route({"certificate_authority": 7}), "isn't valid", id="not-a-string"),
            pytest.param(json_route({}), "isn't valid", id="missing"),
            pytest.param(
                (200, b"x" * (MAX_CERTIFICATE_AUTHORITY_BYTES + 1)),
                "too large",
                id="too-large",
            ),
        ],
    )
    async def test_a_bad_reply_is_refused(self, certificates, route, message):
        routes = {"/api/tls/certificate-authority": route}
        async with serve(routes, certificate=certificates.good_server, key=certificates.server_key) as port:
            with pytest.raises(HostCertificateError, match=message):
                await fetch_host_certificate_authority("127.0.0.1", port, timeout=TIMEOUT)

    async def test_a_reply_at_the_size_limit_is_read(self, certificates):
        # The cap is on what is buffered, so a reply exactly at it still parses.
        body = b'{"certificate_authority": "' + b"x" * (MAX_CERTIFICATE_AUTHORITY_BYTES - 30) + b'"}'
        body = body + b" " * (MAX_CERTIFICATE_AUTHORITY_BYTES - len(body))
        routes = {"/api/tls/certificate-authority": (200, body)}
        async with serve(routes, certificate=certificates.good_server, key=certificates.server_key) as port:
            with pytest.raises(HostCertificateError, match="no certificate authority"):
                await fetch_host_certificate_authority("127.0.0.1", port, timeout=TIMEOUT)

    async def test_a_server_certificate_sent_as_the_authority_is_refused(self, certificates):
        routes = authority_routes(certificates.leaf_pem)
        async with serve(routes, certificate=certificates.good_server, key=certificates.server_key) as port:
            with pytest.raises(HostCertificateError, match="not a certificate authority"):
                await fetch_host_certificate_authority("127.0.0.1", port, timeout=TIMEOUT)
