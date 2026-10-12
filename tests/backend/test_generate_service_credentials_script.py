"""
tests/backend/test_generate_service_credentials_script.py

Unit tests for backend/scripts/generate_service_credentials.py — what the
`service-credentials` compose service writes (P7.4): for the event bus, the
CA, the broker's TLS certificate, each NATS user's credentials and
`nats.conf`; for internal HTTP routes, each caller's token and the hashes core
and the radio hub accept (P7.4b). Runs the real `openssl` command line tool,
as the image does.
"""

from __future__ import annotations

import json
import runpy
import stat
import subprocess
import sys
import time
from pathlib import Path

import pytest

from backend.platform.nats_permissions import SERVICE_PERMISSIONS, server_permissions
from backend.platform.service_access import CALLER_ACCESS, DECODER_ACCESS
from backend.platform.service_credentials import credential_hash
from backend.scripts import generate_service_credentials as setup


@pytest.fixture(autouse=True)
def no_extra_hostnames(monkeypatch):
    monkeypatch.delenv("NATS_SERVER_EXTRA_HOSTNAMES", raising=False)


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def _subject_alternative_names(certificate: Path) -> str:
    return subprocess.run(
        ["openssl", "x509", "-noout", "-ext", "subjectAltName", "-in", str(certificate)],
        check=True, capture_output=True, text=True,
    ).stdout  # fmt: skip


def _verifies_against(certificate: Path, authority: Path) -> bool:
    result = subprocess.run(
        [
            "openssl",
            "verify",
            "-CAfile",
            str(authority),
            "-purpose",
            "sslserver",
            str(certificate),
        ],
        capture_output=True,
    )
    return result.returncode == 0


def _read_config(output: Path) -> dict:
    return json.loads((output / "server" / setup.SERVER_CONFIG_FILE).read_text())


class TestGenerate:
    def test_writes_the_whole_layout(self, tmp_path):
        setup.generate(tmp_path)
        authority = tmp_path / "certificate-authority"
        server = tmp_path / "server"
        assert (authority / "certificate.pem").exists()
        assert _mode(authority / "private-key.pem") == 0o600
        assert _mode(server / "private-key.pem") == 0o600
        assert _mode(server / "nats.conf") == 0o600
        assert _verifies_against(
            server / "certificate.pem", authority / "certificate.pem"
        )
        assert "DNS:nats, DNS:localhost" in _subject_alternative_names(
            server / "certificate.pem"
        )
        for user in SERVICE_PERMISSIONS:
            folder = tmp_path / "services" / user
            credentials = json.loads((folder / "nats-credentials.json").read_text())
            assert credentials["user"] == user
            assert len(credentials["password"]) >= 40
            assert _mode(folder / "nats-credentials.json") == 0o600
            # The service gets the CA's certificate, never its key.
            assert (folder / "certificate-authority.pem").read_bytes() == (
                authority / "certificate.pem"
            ).read_bytes()
            expected = [
                "certificate-authority.pem",
                "http-credentials.json",
                "nats-credentials.json",
            ]
            if user in ("core", "radio-hub"):
                expected.insert(0, "accepted-callers.json")
            assert sorted(path.name for path in folder.iterdir()) == expected
        # Nothing left over from issuing the certificate.
        assert sorted(path.name for path in server.iterdir()) == [
            "certificate.pem", "hostnames.txt", "nats.conf", "private-key.pem",
        ]  # fmt: skip

    def test_config_requires_tls_and_gives_each_user_its_password_and_permissions(
        self, tmp_path
    ):
        setup.generate(tmp_path)
        config = _read_config(tmp_path)
        assert config["port"] == 4222
        assert config["http_port"] == 8222
        assert config["tls"] == {
            "cert_file": "/etc/nats-sentinel/certificate.pem",
            "key_file": "/etc/nats-sentinel/private-key.pem",
            "timeout": 5,
        }
        users = {entry["user"]: entry for entry in config["authorization"]["users"]}
        assert set(users) == set(SERVICE_PERMISSIONS)
        for user, entry in users.items():
            credentials = json.loads(
                (tmp_path / "services" / user / "nats-credentials.json").read_text()
            )
            assert entry["password"] == credentials["password"]
            assert entry["permissions"] == server_permissions(user)
        passwords = [entry["password"] for entry in users.values()]
        assert len(set(passwords)) == len(passwords)

    def test_running_again_keeps_every_secret_and_certificate(self, tmp_path, capsys):
        setup.generate(tmp_path)
        before = {
            path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()
        }
        capsys.readouterr()
        setup.generate(tmp_path)
        after = {
            path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()
        }
        assert after == before
        output = capsys.readouterr().out
        assert "is up to date (7 users)" in output
        assert "created" not in output and "issued" not in output

    def test_a_changed_permissions_table_rewrites_the_config_only(
        self, tmp_path, monkeypatch, capsys
    ):
        setup.generate(tmp_path)
        password = json.loads(
            (tmp_path / "services" / "land" / "nats-credentials.json").read_text()
        )["password"]
        monkeypatch.setitem(SERVICE_PERMISSIONS, "land", SERVICE_PERMISSIONS["sdr"])
        capsys.readouterr()
        setup.generate(tmp_path)
        assert "restart nats if it was already running" in capsys.readouterr().out
        land = next(
            entry
            for entry in _read_config(tmp_path)["authorization"]["users"]
            if entry["user"] == "land"
        )
        assert land["permissions"] == {
            "publish": {"allow": ["hub.iq-capture.>"]},
            "subscribe": {"allow": ["_INBOX.land.>"]},
        }
        assert land["password"] == password

    def test_extra_hostnames_reissue_the_server_certificate_under_the_same_ca(
        self, tmp_path, monkeypatch
    ):
        setup.generate(tmp_path)
        authority_before = (
            tmp_path / "certificate-authority" / "certificate.pem"
        ).read_bytes()
        certificate_before = (tmp_path / "server" / "certificate.pem").read_bytes()
        monkeypatch.setenv(
            "NATS_SERVER_EXTRA_HOSTNAMES", " sentinel.lan, ,nats,radio-host "
        )
        setup.generate(tmp_path)
        certificate = tmp_path / "server" / "certificate.pem"
        assert certificate.read_bytes() != certificate_before
        assert (
            tmp_path / "certificate-authority" / "certificate.pem"
        ).read_bytes() == authority_before
        names = _subject_alternative_names(certificate)
        assert "DNS:nats, DNS:localhost, DNS:sentinel.lan, DNS:radio-host" in names
        assert _verifies_against(
            certificate, tmp_path / "certificate-authority" / "certificate.pem"
        )

    def test_a_certificate_near_expiry_is_reissued(self, tmp_path, monkeypatch):
        setup.generate(tmp_path)
        before = (tmp_path / "server" / "certificate.pem").read_bytes()
        # Longer than the certificate is valid for: "expiring" straight away.
        monkeypatch.setattr(
            setup,
            "RENEW_WHEN_EXPIRING_WITHIN_SECONDS",
            (setup.SERVER_CERTIFICATE_VALID_DAYS + 1) * 86400,
        )
        setup.generate(tmp_path)
        assert (tmp_path / "server" / "certificate.pem").read_bytes() != before

    @pytest.mark.parametrize(
        "missing", ["private-key.pem", "hostnames.txt", "certificate.pem"]
    )
    def test_a_server_file_gone_missing_reissues_the_certificate(
        self, tmp_path, missing
    ):
        setup.generate(tmp_path)
        before = (tmp_path / "server" / "certificate.pem").read_bytes()
        (tmp_path / "server" / missing).unlink()
        setup.generate(tmp_path)
        assert (tmp_path / "server" / "certificate.pem").read_bytes() != before
        assert (tmp_path / "server" / missing).exists()

    def test_a_ca_missing_its_key_is_recreated(self, tmp_path):
        setup.generate(tmp_path)
        before = (tmp_path / "certificate-authority" / "certificate.pem").read_bytes()
        (tmp_path / "certificate-authority" / "private-key.pem").unlink()
        setup.generate(tmp_path)
        after = tmp_path / "certificate-authority" / "certificate.pem"
        assert after.read_bytes() != before
        assert (
            tmp_path / "services" / "air" / "certificate-authority.pem"
        ).read_bytes() == after.read_bytes()

    @pytest.mark.parametrize(
        "content",
        [
            "not json",
            json.dumps({"user": "air"}),
            json.dumps({"password": ""}),
            json.dumps(["air"]),
        ],
    )
    def test_unusable_credentials_get_a_new_password(self, tmp_path, content):
        setup.generate(tmp_path)
        credentials = tmp_path / "services" / "air" / "nats-credentials.json"
        credentials.write_text(content)
        setup.generate(tmp_path)
        rewritten = json.loads(credentials.read_text())
        assert rewritten["user"] == "air"
        assert len(rewritten["password"]) >= 40
        air = next(
            entry
            for entry in _read_config(tmp_path)["authorization"]["users"]
            if entry["user"] == "air"
        )
        assert air["password"] == rewritten["password"]


def _http_credentials(output: Path, caller: str) -> dict:
    return json.loads(
        (output / "services" / caller / "http-credentials.json").read_text()
    )


class TestHttpCredentials:
    def test_every_caller_gets_its_own_distinct_token(self, tmp_path):
        setup.generate(tmp_path)
        tokens = {}
        for caller in CALLER_ACCESS:
            credentials = _http_credentials(tmp_path, caller)
            assert credentials["caller"] == caller
            assert len(credentials["token"]) >= 40
            tokens[caller] = credentials["token"]
        assert len(set(tokens.values())) == len(tokens)

    def test_service_tokens_are_private_and_decoder_tokens_readable_by_their_own_user(
        self, tmp_path
    ):
        setup.generate(tmp_path)
        for caller in CALLER_ACCESS:
            expected = 0o644 if caller in DECODER_ACCESS else 0o600
            assert (
                _mode(tmp_path / "services" / caller / "http-credentials.json")
                == expected
            ), caller

    def test_a_decoder_folder_holds_only_its_http_credential(self, tmp_path):
        # Decoders don't use the bus: no NATS user, no CA.
        setup.generate(tmp_path)
        for caller in DECODER_ACCESS:
            folder = tmp_path / "services" / caller
            assert [path.name for path in folder.iterdir()] == ["http-credentials.json"]

    @pytest.mark.parametrize("verifier", ["core", "radio-hub"])
    def test_verifiers_accept_every_caller_by_hash_only(self, tmp_path, verifier):
        setup.generate(tmp_path)
        accepted_path = tmp_path / "services" / verifier / "accepted-callers.json"
        accepted = json.loads(accepted_path.read_text())
        assert _mode(accepted_path) == 0o600
        assert accepted == {
            credential_hash(_http_credentials(tmp_path, caller)["token"]): caller
            for caller in CALLER_ACCESS
        }
        # The list never holds a token itself.
        text = accepted_path.read_text()
        assert all(
            _http_credentials(tmp_path, caller)["token"] not in text
            for caller in CALLER_ACCESS
        )

    @pytest.mark.parametrize("caller", ["space", "sdr", "stub-decoder"])
    def test_other_services_get_no_accepted_callers_list(self, tmp_path, caller):
        setup.generate(tmp_path)
        assert not (tmp_path / "services" / caller / "accepted-callers.json").exists()

    @pytest.mark.parametrize(
        "content",
        [
            "not json",
            json.dumps({"caller": "sea"}),
            json.dumps({"token": ""}),
            json.dumps(["sea"]),
        ],
    )
    def test_an_unusable_credential_gets_a_new_token_and_the_list_follows(
        self, tmp_path, content, capsys
    ):
        setup.generate(tmp_path)
        credentials = tmp_path / "services" / "sea" / "http-credentials.json"
        credentials.write_text(content)
        capsys.readouterr()
        setup.generate(tmp_path)
        assert "created the HTTP credential for sea" in capsys.readouterr().out
        token = _http_credentials(tmp_path, "sea")["token"]
        assert len(token) >= 40
        accepted = json.loads(
            (tmp_path / "services" / "core" / "accepted-callers.json").read_text()
        )
        assert accepted[credential_hash(token)] == "sea"

    def test_a_caller_added_to_the_table_is_accepted_on_the_next_run(
        self, tmp_path, monkeypatch
    ):
        from backend.platform import service_access

        setup.generate(tmp_path)
        monkeypatch.setitem(
            setup.CALLER_ACCESS,
            "pocsag-decoder",
            service_access.CallerAccess(decoder_kind="pocsag"),
        )
        monkeypatch.setitem(
            setup.DECODER_ACCESS,
            "pocsag-decoder",
            service_access.CallerAccess(decoder_kind="pocsag"),
        )
        setup.generate(tmp_path)
        token = _http_credentials(tmp_path, "pocsag-decoder")["token"]
        accepted = json.loads(
            (tmp_path / "services" / "radio-hub" / "accepted-callers.json").read_text()
        )
        assert accepted[credential_hash(token)] == "pocsag-decoder"
        assert (
            _mode(tmp_path / "services" / "pocsag-decoder" / "http-credentials.json")
            == 0o644
        )


class TestServerHostnames:
    def test_built_in_names_only_by_default(self):
        assert setup.server_hostnames() == ["nats", "localhost"]

    def test_extra_names_are_trimmed_and_deduplicated(self, monkeypatch):
        monkeypatch.setenv(
            "NATS_SERVER_EXTRA_HOSTNAMES", "a.lan, localhost,,b.lan,a.lan"
        )
        assert setup.server_hostnames() == ["nats", "localhost", "a.lan", "b.lan"]


class TestRunAsAModule:
    def test_writes_into_the_directory_given(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            sys, "argv", ["generate_service_credentials", str(tmp_path / "out")]
        )
        monkeypatch.delitem(
            sys.modules, "backend.scripts.generate_service_credentials", raising=False
        )
        runpy.run_module(
            "backend.scripts.generate_service_credentials", run_name="__main__"
        )
        assert (tmp_path / "out" / "server" / "nats.conf").exists()

    def test_defaults_to_the_credentials_volume(self, monkeypatch):
        written_to: list[Path] = []
        monkeypatch.setattr(setup, "generate", written_to.append)
        setup.main([])
        assert written_to == [Path("/run/service-credentials")]


class TestCertificateExpiresAt:
    def test_reads_the_end_date_issued(self, tmp_path):
        setup.generate(tmp_path)
        remaining = (
            setup.certificate_expires_at(tmp_path / "server" / "certificate.pem")
            - time.time()
        )
        assert abs(remaining - setup.SERVER_CERTIFICATE_VALID_DAYS * 86400) < 120

    def test_space_padded_single_digit_day(self, monkeypatch):
        class Completed:
            stdout = "notAfter=Oct  2 12:30:06 2028 GMT\n"

        monkeypatch.setattr(setup, "_openssl", lambda *arguments: Completed())
        assert setup.certificate_expires_at(Path("unused")) == 1854102606.0
