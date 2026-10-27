"""Generate every Sentinel process's credentials: NATS TLS + users, and internal HTTP tokens (plan §4.5, P7.4).

Run by the one-shot `service-credentials` compose service before `nats` and
every Sentinel service and decoder start, so a deployment needs no
configuration:

    python -m backend.scripts.generate_service_credentials [output directory]

It is safe to run on every `up`: the certificate authority, each service's
NATS password and each caller's HTTP token are created once and kept, each
server certificate is reissued only when its host names change or it is about
to expire, and `nats.conf` and the accepted-callers lists are regenerated from
`backend/platform/nats_permissions.py` and `service_access.py` every time. The
broker reads its config only when it starts, so after a permissions change run
`docker compose restart nats` (the services reconnect on their own).

The output directory (default `/run/service-credentials`, the
`service_credentials` volume) holds:

    certificate-authority/  the CA's certificate and private key — never mounted
    server/                 mounted into `nats`: nats.conf, its certificate and key
    credentials/<caller>/      mounted into one service or decoder:
        http-credentials.json   its internal HTTP token (every caller)
        nats-credentials.json   its NATS user (services only; decoders don't use the bus)
        certificate-authority.pem   the CA certificate (services only)
        accepted-callers.json   the tokens it accepts, as SHA-256 hashes (core and the radio hub)
        guard-state-password    the request guard's Redis password (services only)
    credentials/gateway/    core's TLS service entrypoint: its certificate, key and the CA
    guard-state/            mounted into `redis`: users.acl, the request guard's one Redis user
    credentials/radio-host-gateway/  a radio host's TLS gateway (only with SENTINEL_RADIO_HOST_HOSTNAMES)

With `SDR_MANAGER_LOCAL_NATIVE=1` (SDR Manager running as a native Mac
process, ADR 0007) it also copies `credentials/sdr-manager-local/` to the
checkout's `sdr-manager-local-credentials/` folder, mounted here at
`/run/sdr-manager-local-credentials`, where that process reads it.

A second host (P7.5) gets a copy of its own `credentials/<caller>/` folders
(`backend/scripts/service_credentials_bundle.py`). The broker's and the service
entrypoint's certificates must name the address other hosts dial this one by
(`SENTINEL_CORE_HOSTNAMES`), and a radio host's gateway certificate the address
core dials it by (`SENTINEL_RADIO_HOST_HOSTNAMES`). Uses the `openssl` command
line tool, which the backend image ships.
"""

from __future__ import annotations

import ipaddress
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from backend.platform.nats_permissions import SERVICE_PERMISSIONS, server_permissions
from backend.platform.service_access import CALLER_ACCESS, DECODER_ACCESS, VERIFYING_SERVICES
from backend.platform.service_credentials import credential_hash

DEFAULT_OUTPUT_DIRECTORY = Path("/run/service-credentials")
CERTIFICATE_AUTHORITY_VALID_DAYS = 3650
SERVER_CERTIFICATE_VALID_DAYS = 825
RENEW_WHEN_EXPIRING_WITHIN_SECONDS = 30 * 24 * 3600
BUILT_IN_SERVER_HOSTNAMES = ("nats", "localhost")
"""`nats` is the broker's compose DNS name; `localhost` is for running a client next to it."""
BUILT_IN_ENTRYPOINT_HOSTNAMES = ("gateway", "localhost")
"""Core's TLS service entrypoint is a listener on the `gateway` container."""
BUILT_IN_RADIO_HOST_GATEWAY_HOSTNAMES = ("radio-host-gateway", "localhost")
CALLER_FOLDERS_DIRECTORY = "credentials"
"""`credentials/<caller>/`: one folder per service or decoder, each mounted into that caller only.

Not `services/`, so no folder on the volume shares a name with a repo folder."""
GATEWAY_FOLDER = "gateway"
"""`credentials/gateway/`: the service entrypoint's certificate and key, and the CA it trusts upstream."""
RADIO_HOST_GATEWAY_FOLDER = "radio-host-gateway"
"""`credentials/radio-host-gateway/`: the second host's TLS gateway, copied there with its hub's folders."""
CLIENT_PORT = 4222
MONITORING_PORT = 8222
CERTIFICATE_FILE = "certificate.pem"
PRIVATE_KEY_FILE = "private-key.pem"
CERTIFICATE_AUTHORITY_FILE = "certificate-authority.pem"
NATS_CREDENTIALS_FILE = "nats-credentials.json"
HTTP_CREDENTIALS_FILE = "http-credentials.json"
ACCEPTED_CALLERS_FILE = "accepted-callers.json"
HOSTNAMES_FILE = "hostnames.txt"
SERVER_CONFIG_FILE = "nats.conf"
SERVER_MOUNT_POINT = "/etc/nats-sentinel"
"""Where compose mounts `server/` inside the `nats` container."""
GUARD_STATE_FOLDER = "guard-state"
GUARD_STATE_ACL_FILE = "users.acl"
GUARD_STATE_PASSWORD_FILE = "guard-state-password"
GUARD_STATE_USER = "sentinel"
# The request guard's keys (GUARD_REDIS_PREFIX): its Redis user can touch nothing else.
GUARD_STATE_KEY_PATTERN = "sentinel_guard:*"
NATIVE_SDR_MANAGER_LOCAL_CALLER = "sdr-manager-local"
NATIVE_CREDENTIALS_DIRECTORY = Path("/run/sdr-manager-local-credentials")
"""Where compose mounts the checkout's `sdr-manager-local-credentials/` folder."""


def _openssl(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["openssl", *arguments], check=True, capture_output=True, text=True)


def _write_private(path: Path, text: str, mode: int = 0o600) -> None:
    """Write `text` readable only by this user (the services' runtime user), unless `mode` says otherwise."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch(mode=mode, exist_ok=True)
    path.chmod(mode)
    path.write_text(text)


def ensure_certificate_authority(directory: Path) -> tuple[Path, Path]:
    """Create the deployment's CA once; return (certificate, private key)."""
    certificate, private_key = directory / CERTIFICATE_FILE, directory / PRIVATE_KEY_FILE
    if certificate.exists() and private_key.exists():
        return certificate, private_key
    directory.mkdir(parents=True, exist_ok=True)
    _openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(private_key))
    private_key.chmod(0o600)
    _openssl(
        "req", "-x509", "-new", "-key", str(private_key), "-sha256",
        "-days", str(CERTIFICATE_AUTHORITY_VALID_DAYS),
        "-subj", "/CN=Sentinel event bus CA",
        "-addext", "basicConstraints=critical,CA:TRUE",
        "-addext", "keyUsage=critical,keyCertSign,cRLSign",
        "-out", str(certificate),
    )  # fmt: skip
    print(f"service-credentials: created the certificate authority in {directory}")
    return certificate, private_key


def _server_certificate_is_current(directory: Path, hostnames: list[str]) -> bool:
    certificate = directory / CERTIFICATE_FILE
    if not (certificate.exists() and (directory / PRIVATE_KEY_FILE).exists()):
        return False
    recorded = (directory / HOSTNAMES_FILE).read_text().split() if (directory / HOSTNAMES_FILE).exists() else []
    if recorded != hostnames:
        return False
    return certificate_expires_at(certificate) - time.time() > RENEW_WHEN_EXPIRING_WITHIN_SECONDS


def certificate_expires_at(certificate: Path) -> float:
    """The certificate's notAfter as a Unix timestamp.

    Read and compared here rather than with `openssl x509 -checkend`, whose exit
    status says "will expire" on OpenSSL 3.0 but not on 3.6.
    """
    # "notAfter=Oct  2 12:30:06 2028 GMT": strptime's space also matches the
    # padding before a single-digit day.
    end_date = _openssl("x509", "-enddate", "-noout", "-in", str(certificate)).stdout.strip().split("=", 1)[1]
    parsed = datetime.strptime(end_date, "%b %d %H:%M:%S %Y %Z")
    return parsed.replace(tzinfo=UTC).timestamp()


def _subject_alternative_name(hostname: str) -> str:
    """`IP:` for an address (hosts on a LAN are often dialled by IP), `DNS:` for a name."""
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        return f"DNS:{hostname}"
    return f"IP:{hostname}"


def ensure_server_certificate(
    directory: Path,
    hostnames: list[str],
    authority_certificate: Path,
    authority_key: Path,
    purpose: str = "NATS server",
) -> None:
    """(Re)issue a TLS server certificate for `hostnames` unless the current one still fits."""
    if _server_certificate_is_current(directory, hostnames):
        return
    directory.mkdir(parents=True, exist_ok=True)
    private_key, request = directory / PRIVATE_KEY_FILE, directory / "certificate-request.pem"
    _openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(private_key))
    private_key.chmod(0o600)
    _openssl("req", "-new", "-key", str(private_key), "-subj", f"/CN={hostnames[0]}", "-out", str(request))
    extensions = directory / "certificate-extensions.cnf"
    extensions.write_text(
        "basicConstraints=critical,CA:FALSE\n"
        "keyUsage=critical,digitalSignature,keyEncipherment\n"
        "extendedKeyUsage=serverAuth\n"
        f"subjectAltName={','.join(_subject_alternative_name(hostname) for hostname in hostnames)}\n"
    )
    _openssl(
        "x509", "-req", "-in", str(request), "-CA", str(authority_certificate), "-CAkey", str(authority_key),
        "-CAcreateserial", "-sha256", "-days", str(SERVER_CERTIFICATE_VALID_DAYS),
        "-extfile", str(extensions), "-out", str(directory / CERTIFICATE_FILE),
    )  # fmt: skip
    request.unlink()
    extensions.unlink()
    (directory / HOSTNAMES_FILE).write_text("\n".join(hostnames) + "\n")
    print(f"service-credentials: issued the {purpose} certificate for {', '.join(hostnames)}")


def ensure_service_credentials(directory: Path, user: str, authority_certificate: Path) -> str:
    """Create `user`'s password once, refresh its CA copy; return the password."""
    credentials_path = directory / NATS_CREDENTIALS_FILE
    password = ""
    if credentials_path.exists():
        try:
            password = json.loads(credentials_path.read_text()).get("password", "")
        except (json.JSONDecodeError, AttributeError):
            password = ""
    if not password:
        password = secrets.token_urlsafe(32)
        print(f"service-credentials: created NATS credentials for {user}")
    _write_private(credentials_path, json.dumps({"user": user, "password": password}) + "\n")
    shutil.copyfile(authority_certificate, directory / CERTIFICATE_AUTHORITY_FILE)
    return password


DECODER_CREDENTIAL_MODE = 0o644
"""Decoders run as their own image's user (uid 10001), not the runtime user that
owns these files, so theirs must be world-readable. Each decoder mounts only its
own folder, so no other container can see it."""


def ensure_http_credentials(directory: Path, caller: str) -> str:
    """Create `caller`'s internal HTTP token once; return it."""
    credentials_path = directory / HTTP_CREDENTIALS_FILE
    token = ""
    if credentials_path.exists():
        try:
            token = json.loads(credentials_path.read_text()).get("token", "")
        except (json.JSONDecodeError, AttributeError):
            token = ""
    if not token:
        token = secrets.token_urlsafe(32)
        print(f"service-credentials: created the HTTP credential for {caller}")
    mode = DECODER_CREDENTIAL_MODE if caller in DECODER_ACCESS else 0o600
    _write_private(credentials_path, json.dumps({"caller": caller, "token": token}) + "\n", mode)
    return token


def ensure_guard_state_password(directory: Path) -> str:
    """The request guard's Redis password: created once, kept in the `guard-state` folder."""
    password_path = directory / GUARD_STATE_PASSWORD_FILE
    password = password_path.read_text().strip() if password_path.exists() else ""
    if not password:
        password = secrets.token_urlsafe(32)
        print("service-credentials: created the request guard's Redis password")
    _write_private(password_path, password + "\n")
    return password


def guard_state_acl(password: str) -> str:
    """`users.acl` for the guard's Redis: no default user, one user limited to the guard's keys.

    Everything but administration and wiping the database, on its own keys
    only: fastapi-guard needs scripting (its rate-limit script) and KEYS (ban
    listing), not CONFIG, FLUSHALL or replication.
    """
    return (
        "user default off\n"
        f"user {GUARD_STATE_USER} on >{password} ~{GUARD_STATE_KEY_PATTERN} &* +@all -@admin -flushall -flushdb\n"
    )


def accepted_callers(tokens: dict[str, str]) -> str:
    """`accepted-callers.json`: every caller's token hash, so a verifier never holds a token."""
    return json.dumps({credential_hash(token): caller for caller, token in tokens.items()}, indent=2) + "\n"


def server_config(passwords: dict[str, str]) -> str:
    """`nats.conf` for the broker (NATS reads JSON as config)."""
    config = {
        "server_name": "sentinel",
        "port": CLIENT_PORT,
        "http_port": MONITORING_PORT,
        "tls": {
            "cert_file": f"{SERVER_MOUNT_POINT}/{CERTIFICATE_FILE}",
            "key_file": f"{SERVER_MOUNT_POINT}/{PRIVATE_KEY_FILE}",
            "timeout": 5,
        },
        "authorization": {
            "users": [
                {"user": user, "password": password, "permissions": server_permissions(user)}
                for user, password in passwords.items()
            ]
        },
    }
    return json.dumps(config, indent=2) + "\n"


def _hostnames_from(variable: str) -> list[str]:
    """A comma-separated host name list from the environment, trimmed, blanks dropped."""
    return [name.strip() for name in os.environ.get(variable, "").split(",") if name.strip()]


def server_hostnames() -> list[str]:
    """The names the broker's certificate covers: the built-in ones plus `SENTINEL_CORE_HOSTNAMES`."""
    return list(dict.fromkeys([*BUILT_IN_SERVER_HOSTNAMES, *_hostnames_from("SENTINEL_CORE_HOSTNAMES")]))


def entrypoint_hostnames() -> list[str]:
    """The names core's service entrypoint certificate covers: built-in plus `SENTINEL_CORE_HOSTNAMES`."""
    return list(dict.fromkeys([*BUILT_IN_ENTRYPOINT_HOSTNAMES, *_hostnames_from("SENTINEL_CORE_HOSTNAMES")]))


def radio_host_gateway_hostnames() -> list[str]:
    """The names a radio host's gateway certificate covers; empty when `SENTINEL_RADIO_HOST_HOSTNAMES` is unset."""
    extra = _hostnames_from("SENTINEL_RADIO_HOST_HOSTNAMES")
    return list(dict.fromkeys([*BUILT_IN_RADIO_HOST_GATEWAY_HOSTNAMES, *extra])) if extra else []


def ensure_gateway_certificate(
    directory: Path, hostnames: list[str], authority_certificate: Path, authority_key: Path, purpose: str
) -> None:
    """A gateway's TLS certificate and key, plus the CA certificate it trusts, in its own folder."""
    ensure_server_certificate(directory, hostnames, authority_certificate, authority_key, purpose)
    shutil.copyfile(authority_certificate, directory / CERTIFICATE_AUTHORITY_FILE)


def native_sdr_manager_local_enabled() -> bool:
    """Whether `.env` says SDR Manager runs as a native Mac process (`SDR_MANAGER_LOCAL_NATIVE=1`)."""
    return os.environ.get("SDR_MANAGER_LOCAL_NATIVE", "").strip() == "1"


def copy_native_credentials(callers_directory: Path, native_directory: Path) -> None:
    """Copy sdr-manager-local's folder to where the native Mac process reads it (owner-only).

    A failure is reported, not raised: the rest of the deployment doesn't need
    it, and `sdr-manager-local doctor` names the missing files.
    """
    source = callers_directory / NATIVE_SDR_MANAGER_LOCAL_CALLER
    try:
        native_directory.mkdir(parents=True, exist_ok=True)
        native_directory.chmod(0o700)
        for name in (HTTP_CREDENTIALS_FILE, ACCEPTED_CALLERS_FILE, CERTIFICATE_AUTHORITY_FILE):
            _write_private(native_directory / name, (source / name).read_text())
    except OSError as error:
        print(f"service-credentials: could not copy sdr-manager-local's credentials to {native_directory}: {error}")
        return
    print("service-credentials: copied sdr-manager-local's credentials for the native Mac process")


def generate(output_directory: Path, native_directory: Path = NATIVE_CREDENTIALS_DIRECTORY) -> None:
    """Bring `output_directory` up to date (see the module docstring for its layout)."""
    authority_certificate, authority_key = ensure_certificate_authority(output_directory / "certificate-authority")
    server_directory = output_directory / "server"
    ensure_server_certificate(server_directory, server_hostnames(), authority_certificate, authority_key)
    callers_directory = output_directory / CALLER_FOLDERS_DIRECTORY
    ensure_gateway_certificate(
        callers_directory / GATEWAY_FOLDER,
        entrypoint_hostnames(),
        authority_certificate,
        authority_key,
        "service entrypoint",
    )
    # Only when a radio host is named: the CA key never leaves this host, so its
    # gateway's certificate is issued here and copied there with the bundle.
    if radio_host_hostnames := radio_host_gateway_hostnames():
        ensure_gateway_certificate(
            callers_directory / RADIO_HOST_GATEWAY_FOLDER,
            radio_host_hostnames,
            authority_certificate,
            authority_key,
            "radio host gateway",
        )
    passwords = {
        user: ensure_service_credentials(callers_directory / user, user, authority_certificate)
        for user in SERVICE_PERMISSIONS
    }
    tokens = {caller: ensure_http_credentials(callers_directory / caller, caller) for caller in CALLER_ACCESS}
    # The request guard's shared state: Redis gets the ACL, each service a copy
    # of the password in its own folder (decoders get none, and can't reach Redis).
    guard_state_directory = output_directory / GUARD_STATE_FOLDER
    guard_state_password = ensure_guard_state_password(guard_state_directory)
    _write_private(guard_state_directory / GUARD_STATE_ACL_FILE, guard_state_acl(guard_state_password))
    for user in SERVICE_PERMISSIONS:
        _write_private(callers_directory / user / GUARD_STATE_PASSWORD_FILE, guard_state_password + "\n")
    # Rewritten every run (cheap, and a verifier re-reads it when it changes):
    # core, the hub and sdr-manager-local accept every caller; what each may do is service_access.py's.
    for verifier in VERIFYING_SERVICES:
        _write_private(callers_directory / verifier / ACCEPTED_CALLERS_FILE, accepted_callers(tokens))
    print(f"service-credentials: {len(tokens)} HTTP callers accepted by {', '.join(VERIFYING_SERVICES)}")
    if native_sdr_manager_local_enabled():
        copy_native_credentials(callers_directory, native_directory)
    config_path, config = server_directory / SERVER_CONFIG_FILE, server_config(passwords)
    if config_path.exists() and config_path.read_text() == config:
        print(f"service-credentials: {config_path} is up to date ({len(passwords)} users)")
        return
    _write_private(config_path, config)
    # A broker already running keeps its old config until it restarts.
    print(
        f"service-credentials: wrote {config_path} for {len(passwords)} users; restart nats if it was already running"
    )


def main(arguments: list[str]) -> None:
    """Command line entry: an optional output directory, else the credentials volume."""
    generate(Path(arguments[0]) if arguments else DEFAULT_OUTPUT_DIRECTORY)


if __name__ == "__main__":
    main(sys.argv[1:])
