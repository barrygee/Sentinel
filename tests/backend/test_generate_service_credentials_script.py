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
    monkeypatch.delenv("SENTINEL_CORE_HOSTNAMES", raising=False)
    monkeypatch.delenv("SENTINEL_RADIO_HOST_HOSTNAMES", raising=False)
    # Off unless a test turns it on, so nothing writes to /run/sdr-manager-local-credentials.
    monkeypatch.delenv("SDR_MANAGER_LOCAL_NATIVE", raising=False)


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
            folder = tmp_path / "credentials" / user
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
                # The request guard's Redis password (every service, no decoder).
                "guard-state-password",
                "http-credentials.json",
                "nats-credentials.json",
            ]
            # The verifiers: core, the hub, and sdr-manager-local (which checks
            # sdr-manager-remote's bearer).
            if user in ("core", "radio", "sdr-manager-local"):
                expected.insert(0, "accepted-callers.json")
            assert sorted(path.name for path in folder.iterdir()) == expected
        # Nothing left over from issuing the certificate.
        assert sorted(path.name for path in server.iterdir()) == [
            "certificate.pem", "hostnames.txt", "nats.conf", "private-key.pem",
        ]  # fmt: skip

    def test_caller_folders_live_under_credentials_not_services(self, tmp_path):
        # `services/` would share its name with the repo's services/ folder.
        setup.generate(tmp_path)
        assert setup.CALLER_FOLDERS_DIRECTORY == "credentials"
        assert sorted(path.name for path in tmp_path.iterdir()) == [
            "certificate-authority", "credentials", "guard-state", "server",
        ]  # fmt: skip
        assert (tmp_path / "credentials" / "radio" / "http-credentials.json").exists()
        assert not (tmp_path / "credentials" / "radio-hub").exists()

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
                (tmp_path / "credentials" / user / "nats-credentials.json").read_text()
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
        assert "is up to date (10 users)" in output
        assert "created" not in output and "issued" not in output

    def test_a_changed_permissions_table_rewrites_the_config_only(
        self, tmp_path, monkeypatch, capsys
    ):
        setup.generate(tmp_path)
        password = json.loads(
            (tmp_path / "credentials" / "land" / "nats-credentials.json").read_text()
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
            "SENTINEL_CORE_HOSTNAMES", " sentinel.lan, ,nats,radio-host "
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
            tmp_path / "credentials" / "air" / "certificate-authority.pem"
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
        credentials = tmp_path / "credentials" / "air" / "nats-credentials.json"
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
        (output / "credentials" / caller / "http-credentials.json").read_text()
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
                _mode(tmp_path / "credentials" / caller / "http-credentials.json")
                == expected
            ), caller

    def test_a_decoder_folder_holds_only_its_http_credential(self, tmp_path):
        # Decoders don't use the bus: no NATS user, no CA.
        setup.generate(tmp_path)
        for caller in DECODER_ACCESS:
            folder = tmp_path / "credentials" / caller
            assert [path.name for path in folder.iterdir()] == ["http-credentials.json"]

    @pytest.mark.parametrize("verifier", ["core", "radio"])
    def test_verifiers_accept_every_caller_by_hash_only(self, tmp_path, verifier):
        setup.generate(tmp_path)
        accepted_path = tmp_path / "credentials" / verifier / "accepted-callers.json"
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
        assert not (tmp_path / "credentials" / caller / "accepted-callers.json").exists()

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
        credentials = tmp_path / "credentials" / "sea" / "http-credentials.json"
        credentials.write_text(content)
        capsys.readouterr()
        setup.generate(tmp_path)
        assert "created the HTTP credential for sea" in capsys.readouterr().out
        token = _http_credentials(tmp_path, "sea")["token"]
        assert len(token) >= 40
        accepted = json.loads(
            (tmp_path / "credentials" / "core" / "accepted-callers.json").read_text()
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
            (tmp_path / "credentials" / "radio" / "accepted-callers.json").read_text()
        )
        assert accepted[credential_hash(token)] == "pocsag-decoder"
        assert (
            _mode(tmp_path / "credentials" / "pocsag-decoder" / "http-credentials.json")
            == 0o644
        )


class TestServerHostnames:
    def test_built_in_names_only_by_default(self):
        assert setup.server_hostnames() == ["nats", "localhost"]

    def test_extra_names_are_trimmed_and_deduplicated(self, monkeypatch):
        monkeypatch.setenv(
            "SENTINEL_CORE_HOSTNAMES", "a.lan, localhost,,b.lan,a.lan"
        )
        assert setup.server_hostnames() == ["nats", "localhost", "a.lan", "b.lan"]


class TestGatewayCertificates:
    """Core's TLS service entrypoint, and a radio host's gateway (P7.5)."""

    def test_the_service_entrypoint_gets_a_certificate_from_the_deployment_ca(self, tmp_path):
        setup.generate(tmp_path)
        folder = tmp_path / "credentials" / "gateway"
        authority = tmp_path / "certificate-authority" / "certificate.pem"
        assert sorted(path.name for path in folder.iterdir()) == [
            "certificate-authority.pem", "certificate.pem", "hostnames.txt", "private-key.pem",
        ]  # fmt: skip
        assert _verifies_against(folder / "certificate.pem", authority)
        assert "DNS:gateway, DNS:localhost" in _subject_alternative_names(folder / "certificate.pem")
        assert _mode(folder / "private-key.pem") == 0o600
        # The CA the gateway trusts upstream, never the CA's key.
        assert (folder / "certificate-authority.pem").read_bytes() == authority.read_bytes()

    def test_core_hostnames_cover_the_entrypoint_and_the_broker_alike(self, tmp_path, monkeypatch):
        monkeypatch.setenv("SENTINEL_CORE_HOSTNAMES", "sentinel.lan,192.168.5.10")
        setup.generate(tmp_path)
        entrypoint = _subject_alternative_names(tmp_path / "credentials" / "gateway" / "certificate.pem")
        broker = _subject_alternative_names(tmp_path / "server" / "certificate.pem")
        assert "DNS:gateway, DNS:localhost, DNS:sentinel.lan, IP Address:192.168.5.10" in entrypoint
        assert "DNS:nats, DNS:localhost, DNS:sentinel.lan, IP Address:192.168.5.10" in broker

    def test_the_common_name_is_the_first_host_name(self, tmp_path):
        setup.generate(tmp_path)
        subject = subprocess.run(
            ["openssl", "x509", "-noout", "-subject", "-in", str(tmp_path / "credentials" / "gateway" / "certificate.pem")],
            check=True, capture_output=True, text=True,
        ).stdout  # fmt: skip
        assert "CN=gateway" in subject.replace(" ", "")

    def test_no_radio_host_certificate_unless_one_is_named(self, tmp_path):
        setup.generate(tmp_path)
        assert not (tmp_path / "credentials" / "radio-host-gateway").exists()

    def test_a_named_radio_host_gets_its_gateway_certificate(self, tmp_path, monkeypatch, capsys):
        monkeypatch.setenv("SENTINEL_RADIO_HOST_HOSTNAMES", " radio.lan, 10.0.0.9 ")
        setup.generate(tmp_path)
        folder = tmp_path / "credentials" / "radio-host-gateway"
        certificate = folder / "certificate.pem"
        assert _verifies_against(certificate, tmp_path / "certificate-authority" / "certificate.pem")
        names = _subject_alternative_names(certificate)
        assert "DNS:radio-host-gateway, DNS:localhost, DNS:radio.lan, IP Address:10.0.0.9" in names
        assert (folder / "certificate-authority.pem").exists()
        assert "issued the radio host gateway certificate" in capsys.readouterr().out

    def test_renaming_the_radio_host_reissues_only_its_certificate(self, tmp_path, monkeypatch):
        monkeypatch.setenv("SENTINEL_RADIO_HOST_HOSTNAMES", "radio.lan")
        setup.generate(tmp_path)
        entrypoint_before = (tmp_path / "credentials" / "gateway" / "certificate.pem").read_bytes()
        radio_before = (tmp_path / "credentials" / "radio-host-gateway" / "certificate.pem").read_bytes()
        monkeypatch.setenv("SENTINEL_RADIO_HOST_HOSTNAMES", "radio2.lan")
        setup.generate(tmp_path)
        assert (tmp_path / "credentials" / "gateway" / "certificate.pem").read_bytes() == entrypoint_before
        radio_after = tmp_path / "credentials" / "radio-host-gateway" / "certificate.pem"
        assert radio_after.read_bytes() != radio_before
        assert "DNS:radio2.lan" in _subject_alternative_names(radio_after)

    def test_unsetting_the_radio_host_leaves_its_folder_alone(self, tmp_path, monkeypatch):
        # A bundle may already be on the radio host: nothing is deleted behind it.
        monkeypatch.setenv("SENTINEL_RADIO_HOST_HOSTNAMES", "radio.lan")
        setup.generate(tmp_path)
        monkeypatch.delenv("SENTINEL_RADIO_HOST_HOSTNAMES")
        setup.generate(tmp_path)
        assert (tmp_path / "credentials" / "radio-host-gateway" / "certificate.pem").exists()


class TestHostnameLists:
    def test_entrypoint_names_default_to_the_built_in_ones(self):
        assert setup.entrypoint_hostnames() == ["gateway", "localhost"]

    def test_no_radio_host_names_by_default(self):
        assert setup.radio_host_gateway_hostnames() == []

    def test_radio_host_names_are_trimmed_and_deduplicated(self, monkeypatch):
        monkeypatch.setenv("SENTINEL_RADIO_HOST_HOSTNAMES", "radio.lan, ,localhost,radio.lan")
        assert setup.radio_host_gateway_hostnames() == ["radio-host-gateway", "localhost", "radio.lan"]

    @pytest.mark.parametrize(
        ("hostname", "expected"),
        [("radio.lan", "DNS:radio.lan"), ("192.168.1.2", "IP:192.168.1.2"), ("fd00::7", "IP:fd00::7")],
    )
    def test_addresses_become_ip_names(self, hostname, expected):
        assert setup._subject_alternative_name(hostname) == expected


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


class TestNativeSdrManagerLocalCredentials:
    """`SDR_MANAGER_LOCAL_NATIVE=1`: sdr-manager-local's folder copied for the native Mac process (ADR 0007)."""

    @pytest.mark.parametrize("value", ["1", " 1 "])
    def test_copies_its_three_files_owner_only(self, tmp_path, monkeypatch, value):
        monkeypatch.setenv("SDR_MANAGER_LOCAL_NATIVE", value)
        native = tmp_path / "native"

        setup.generate(tmp_path / "volume", native)

        source = tmp_path / "volume" / "credentials" / "sdr-manager-local"
        assert sorted(path.name for path in native.iterdir()) == [
            "accepted-callers.json",
            "certificate-authority.pem",
            "http-credentials.json",
        ]
        for path in native.iterdir():
            assert path.read_text() == (source / path.name).read_text()
            assert _mode(path) == 0o600
        assert _mode(native) == 0o700

    def test_a_rerun_refreshes_the_accepted_callers(self, tmp_path, monkeypatch):
        monkeypatch.setenv("SDR_MANAGER_LOCAL_NATIVE", "1")
        native = tmp_path / "native"
        setup.generate(tmp_path / "volume", native)
        (native / "accepted-callers.json").write_text("stale")
        native.chmod(0o755)

        setup.generate(tmp_path / "volume", native)

        source = tmp_path / "volume" / "credentials" / "sdr-manager-local" / "accepted-callers.json"
        assert (native / "accepted-callers.json").read_text() == source.read_text()
        assert _mode(native) == 0o700

    @pytest.mark.parametrize("value", [None, "0", "true", ""])
    def test_nothing_is_copied_unless_it_is_1(self, tmp_path, monkeypatch, capsys, value):
        if value is not None:
            monkeypatch.setenv("SDR_MANAGER_LOCAL_NATIVE", value)
        native = tmp_path / "native"

        setup.generate(tmp_path / "volume", native)

        assert not native.exists()
        assert "native Mac" not in capsys.readouterr().out

    def test_a_failed_copy_is_reported_and_the_rest_still_written(self, tmp_path, monkeypatch, capsys):
        monkeypatch.setenv("SDR_MANAGER_LOCAL_NATIVE", "1")
        blocked = tmp_path / "a-file"
        blocked.write_text("not a folder")

        setup.generate(tmp_path / "volume", blocked)

        output = capsys.readouterr().out
        assert f"could not copy sdr-manager-local's credentials to {blocked}" in output
        assert (tmp_path / "volume" / "server" / "nats.conf").is_file()

    def test_the_default_target_is_the_compose_mount(self):
        assert setup.NATIVE_CREDENTIALS_DIRECTORY == Path("/run/sdr-manager-local-credentials")


class TestGuardState:
    """The request guard's Redis: one ACL user limited to its keys, its password to services only."""

    def test_redis_gets_an_acl_with_no_default_user(self, tmp_path):
        setup.generate(tmp_path)

        acl = (tmp_path / "guard-state" / "users.acl").read_text().splitlines()
        assert acl[0] == "user default off"
        assert len(acl) == 2

    def test_the_one_user_touches_only_the_guards_keys_and_cant_administer(self, tmp_path):
        setup.generate(tmp_path)
        password = (tmp_path / "guard-state" / "guard-state-password").read_text().strip()

        user_line = (tmp_path / "guard-state" / "users.acl").read_text().splitlines()[1]
        assert user_line == (
            f"user sentinel on >{password} ~sentinel_guard:* &* +@all -@admin -flushall -flushdb"
        )

    def test_every_service_gets_the_password_and_no_decoder_does(self, tmp_path):
        setup.generate(tmp_path)
        password = (tmp_path / "guard-state" / "guard-state-password").read_text()
        callers = tmp_path / "credentials"

        for service in SERVICE_PERMISSIONS:
            assert (callers / service / "guard-state-password").read_text() == password
        for decoder in DECODER_ACCESS:
            # Decoders parse untrusted RF: they must not be able to lift their own ban.
            assert not (callers / decoder / "guard-state-password").exists()

    def test_the_password_files_are_private(self, tmp_path):
        setup.generate(tmp_path)

        assert _mode(tmp_path / "guard-state" / "guard-state-password") == 0o600
        assert _mode(tmp_path / "guard-state" / "users.acl") == 0o600
        assert _mode(tmp_path / "credentials" / "core" / "guard-state-password") == 0o600

    def test_running_again_keeps_the_password(self, tmp_path, capsys):
        setup.generate(tmp_path)
        first = (tmp_path / "guard-state" / "guard-state-password").read_text()
        assert "created the request guard's Redis password" in capsys.readouterr().out

        setup.generate(tmp_path)

        assert (tmp_path / "guard-state" / "guard-state-password").read_text() == first
        assert "created the request guard's Redis password" not in capsys.readouterr().out

    def test_an_empty_password_file_gets_a_new_password(self, tmp_path):
        (tmp_path / "guard-state").mkdir()
        (tmp_path / "guard-state" / "guard-state-password").write_text("\n")

        setup.generate(tmp_path)

        assert len((tmp_path / "guard-state" / "guard-state-password").read_text().strip()) >= 32

    def test_each_deployment_gets_its_own_password(self, tmp_path):
        setup.generate(tmp_path / "one")
        setup.generate(tmp_path / "two")

        assert (tmp_path / "one" / "guard-state" / "guard-state-password").read_text() != (
            tmp_path / "two" / "guard-state" / "guard-state-password"
        ).read_text()
