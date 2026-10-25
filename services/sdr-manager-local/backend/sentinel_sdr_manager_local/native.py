"""Running `sdr-manager-local` as a native Mac process: where its files live and the environment it runs in.

The container gets its platform variables from compose (`docker-compose.yml`'s
`sdr-manager-local` service); a native process sets the same ones here before
any `backend` module reads them. Everything else stays in Docker, so the
values point at what Docker Desktop publishes on this Mac:

  - core through the gateway's TLS service entrypoint, `https://localhost:8443`;
  - this process, for the app and the gateway, at `host.docker.internal`, which
    Docker Desktop resolves to the Mac;
  - its HTTP token and the deployment CA in `./sdr-manager-local-credentials/`,
    which `service-credentials` fills when `SDR_MANAGER_LOCAL_NATIVE=1`.

Its database and log live in the user's Library, not in the checkout.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values

SERVICE_ID = "sdr-manager-local"
LOCAL_SETTINGS_PREFIX = "SDR_MANAGER_LOCAL_"
CREDENTIALS_FOLDER = "sdr-manager-local-credentials"
HTTP_CREDENTIALS_FILE = "http-credentials.json"
ACCEPTED_CALLERS_FILE = "accepted-callers.json"
CERTIFICATE_AUTHORITY_FILE = "certificate-authority.pem"
CREDENTIAL_FILES = (HTTP_CREDENTIALS_FILE, ACCEPTED_CALLERS_FILE, CERTIFICATE_AUTHORITY_FILE)
CORE_SERVICE_ENTRYPOINT_URL = "https://localhost:8443"
DOCKER_HOST_NAME = "host.docker.internal"
DEFAULT_HTTP_PORT = 8000


@dataclass(frozen=True)
class NativePaths:
    """Every file and folder a native `sdr-manager-local` uses."""

    checkout: Path
    data_directory: Path
    log_file: Path

    @property
    def database(self) -> Path:
        return self.data_directory / f"{SERVICE_ID}.db"

    @property
    def credentials_directory(self) -> Path:
        return self.checkout / CREDENTIALS_FOLDER

    @property
    def env_file(self) -> Path:
        return self.checkout / ".env"


def find_checkout(module_file: Path = Path(__file__)) -> Path:
    """The Sentinel checkout this package is installed from.

    The package is installed editable from `services/sdr-manager-local/backend/`,
    so the checkout is four folders above the package's. A copy installed
    anywhere else falls back to the current folder.
    """
    candidate = module_file.resolve().parent.parents[3]
    return candidate if (candidate / "docker-compose.yml").is_file() else Path.cwd()


def native_paths(home: Path | None = None, checkout: Path | None = None) -> NativePaths:
    """The paths under `home` (the user's home folder unless a test passes one)."""
    home = home or Path.home()
    return NativePaths(
        checkout=checkout or find_checkout(),
        data_directory=home / "Library" / "Application Support" / "Sentinel" / SERVICE_ID,
        log_file=home / "Library" / "Logs" / "Sentinel" / f"{SERVICE_ID}.log",
    )


def read_env_file(paths: NativePaths) -> dict[str, str]:
    """The checkout's `.env` as a dict (empty when there is none); blank-valued keys read as `""`."""
    if not paths.env_file.is_file():
        return {}
    return {key: value or "" for key, value in dotenv_values(paths.env_file).items()}


def http_port(env_values: Mapping[str, str]) -> int:
    """`SDR_MANAGER_LOCAL_HTTP_PORT` from the environment or `.env`, else 8000."""
    raw_port = os.environ.get("SDR_MANAGER_LOCAL_HTTP_PORT") or env_values.get("SDR_MANAGER_LOCAL_HTTP_PORT") or ""
    return int(raw_port) if raw_port.strip().isdigit() else DEFAULT_HTTP_PORT


def native_environment(paths: NativePaths, env_values: Mapping[str, str]) -> dict[str, str]:
    """The variables compose would give the container, for this Mac.

    `.env`'s `SDR_MANAGER_LOCAL_*` lines come first (compose passes them with
    `env_file`); the platform variables after them win, as compose's
    `environment:` does. The rest of `.env` is read by `backend.config` itself.
    """
    credentials = paths.credentials_directory
    environment = {key: value for key, value in env_values.items() if key.startswith(LOCAL_SETTINGS_PREFIX)}
    environment.update(
        {
            "PYTHONUNBUFFERED": "1",
            "DB_PATH": str(paths.database),
            "SENTINEL_CORE_URL": CORE_SERVICE_ENTRYPOINT_URL,
            "SERVICE_INTERNAL_URL": f"http://{DOCKER_HOST_NAME}:{http_port(env_values)}",
            # No event bus: it talks to core over HTTPS only (ADR 0007).
            "NATS_URL": "",
            "SERVICE_HTTP_CREDENTIALS_FILE": str(credentials / HTTP_CREDENTIALS_FILE),
            "ACCEPTED_CALLERS_FILE": str(credentials / ACCEPTED_CALLERS_FILE),
            "INTERNAL_CERTIFICATE_AUTHORITY_FILE": str(credentials / CERTIFICATE_AUTHORITY_FILE),
        }
    )
    return environment


def apply_native_environment(paths: NativePaths, target: MutableMapping[str, str] = os.environ) -> None:
    """Set the native environment in `target`, keeping anything already set there.

    A variable exported in the shell (or the LaunchAgent) wins, so one setting
    can be overridden for a single run without editing `.env`. Creates the data
    folder, and moves into the checkout so `backend.config` reads its `.env`
    and the `backend` package (the checkout's own folder, not an installed
    one) can be imported, as `/app` is in the image.
    """
    for key, value in native_environment(paths, read_env_file(paths)).items():
        target.setdefault(key, value)
    paths.data_directory.mkdir(parents=True, exist_ok=True)
    os.chdir(paths.checkout)
    if str(paths.checkout) not in sys.path:
        sys.path.insert(0, str(paths.checkout))


def missing_credential_files(paths: NativePaths) -> list[str]:
    """The credential files `service-credentials` hasn't written to the checkout yet."""
    return [name for name in CREDENTIAL_FILES if not (paths.credentials_directory / name).is_file()]
