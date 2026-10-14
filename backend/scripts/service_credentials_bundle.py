"""Carry some callers' credentials from the core host to a second host (plan §4.6, P7.5).

The CA's private key never leaves the core host, so a second host gets copies of
only its own `credentials/<caller>/` folders from `service-credentials`:

    # on the core host: write the radio host's bundle
    docker compose run --rm -T service-credentials \\
        python -m backend.scripts.service_credentials_bundle export radio-host > radio-host-credentials.tar.gz

    # on the radio host: unpack it into that host's credentials volume
    docker compose -f compose.radio-host.yaml run --rm -T credentials-import < radio-host-credentials.tar.gz

`export` takes caller names (`radio`, `aprs-decoder`, …) or the group
`radio-host` (the hub, every decoder, and the radio host's gateway certificate).
It refuses `core` and `gateway`: those folders would hand another host core's
own identity. `import` accepts only known folders and file names, so a bundle
can't write anywhere else. The bundle holds secrets: move it over a trusted
channel (e.g. `scp`) and delete it afterwards.
"""

from __future__ import annotations

import io
import sys
import tarfile
from pathlib import Path
from typing import BinaryIO

from backend.platform.nats_permissions import CORE_USER
from backend.platform.service_access import CALLER_ACCESS, DECODER_ACCESS
from backend.scripts.generate_service_credentials import (
    ACCEPTED_CALLERS_FILE,
    CALLER_FOLDERS_DIRECTORY,
    CERTIFICATE_AUTHORITY_FILE,
    CERTIFICATE_FILE,
    DECODER_CREDENTIAL_MODE,
    DEFAULT_OUTPUT_DIRECTORY,
    GATEWAY_FOLDER,
    HOSTNAMES_FILE,
    HTTP_CREDENTIALS_FILE,
    NATS_CREDENTIALS_FILE,
    PRIVATE_KEY_FILE,
    RADIO_HOST_GATEWAY_FOLDER,
)

RADIO_HOST_GROUP = "radio-host"
RADIO_HOST_FOLDERS: tuple[str, ...] = ("radio", *DECODER_ACCESS, RADIO_HOST_GATEWAY_FOLDER)
"""What a radio host runs: the hub, any of the decoders, and its TLS gateway."""

REFUSED_FOLDERS = frozenset({CORE_USER, GATEWAY_FOLDER})
"""Core's own identity and its entrypoint's key stay on the core host."""

KNOWN_FILES = frozenset(
    {
        HTTP_CREDENTIALS_FILE,
        NATS_CREDENTIALS_FILE,
        CERTIFICATE_AUTHORITY_FILE,
        ACCEPTED_CALLERS_FILE,
        CERTIFICATE_FILE,
        PRIVATE_KEY_FILE,
        HOSTNAMES_FILE,
    }
)
PUBLIC_FILES = frozenset({CERTIFICATE_AUTHORITY_FILE, CERTIFICATE_FILE, HOSTNAMES_FILE})


class BundleError(Exception):
    """A bundle that can't be written or unpacked as asked."""


def exportable_folders() -> frozenset[str]:
    """Every folder a bundle may carry: each caller's and the radio host gateway's."""
    return frozenset({*CALLER_ACCESS, RADIO_HOST_GATEWAY_FOLDER}) - REFUSED_FOLDERS


def resolve_folders(names: list[str]) -> list[str]:
    """Expand groups and check every name; raises `BundleError` for a refused or unknown one."""
    if not names:
        raise BundleError(f"name the callers to export, or the group {RADIO_HOST_GROUP!r}")
    folders: list[str] = []
    for name in names:
        expanded = list(RADIO_HOST_FOLDERS) if name == RADIO_HOST_GROUP else [name]
        for folder in expanded:
            if folder in REFUSED_FOLDERS:
                raise BundleError(f"{folder!r} stays on the core host: it is core's own identity")
            if folder not in exportable_folders():
                raise BundleError(f"unknown caller {folder!r}")
            if folder not in folders:
                folders.append(folder)
    return folders


def export_bundle(credentials_directory: Path, names: list[str], output: BinaryIO) -> list[str]:
    """Write a gzipped tar of the named folders to `output`; returns the folders written."""
    folders = resolve_folders(names)
    callers = credentials_directory / CALLER_FOLDERS_DIRECTORY
    for folder in folders:
        if not (callers / folder).is_dir():
            hint = (
                " (set SENTINEL_RADIO_HOST_HOSTNAMES on the core host and run `docker compose up` first)"
                if folder == RADIO_HOST_GATEWAY_FOLDER
                else ""
            )
            raise BundleError(f"no credentials for {folder!r} in {callers}{hint}")
    with tarfile.open(fileobj=output, mode="w:gz") as bundle:
        for folder in folders:
            for path in sorted((callers / folder).iterdir()):
                if path.is_file() and path.name in KNOWN_FILES:
                    bundle.add(path, arcname=f"{CALLER_FOLDERS_DIRECTORY}/{folder}/{path.name}", recursive=False)
    return folders


def _file_mode(folder: str, file_name: str) -> int:
    # Decoders run as their image's own user, so their credential is readable
    # by all; their folder is the only thing mounted into them (as on core).
    if file_name in PUBLIC_FILES or folder in DECODER_ACCESS:
        return DECODER_CREDENTIAL_MODE
    return 0o600


def import_bundle(source: BinaryIO, credentials_directory: Path) -> list[str]:
    """Unpack a bundle into `credentials_directory`; returns the folders written.

    Every member is checked before anything is written: a regular file at
    `credentials/<exportable folder>/<known file name>`, nothing else.
    """
    try:
        bundle = tarfile.open(fileobj=io.BytesIO(source.read()), mode="r:gz")
    except (tarfile.TarError, OSError) as error:
        raise BundleError(f"not a credentials bundle: {error}") from error
    with bundle:
        members = bundle.getmembers()
        for member in members:
            parts = member.name.split("/")
            if (
                not member.isfile()
                or len(parts) != 3
                or parts[0] != CALLER_FOLDERS_DIRECTORY
                or parts[1] not in exportable_folders()
                or parts[2] not in KNOWN_FILES
            ):
                raise BundleError(f"refusing unexpected bundle entry {member.name!r}")
        folders: list[str] = []
        for member in members:
            _, folder, file_name = member.name.split("/")
            extracted = bundle.extractfile(member)
            assert extracted is not None  # a regular file, checked above
            destination = credentials_directory / CALLER_FOLDERS_DIRECTORY / folder / file_name
            destination.parent.mkdir(parents=True, exist_ok=True)
            mode = _file_mode(folder, file_name)
            destination.touch(mode=mode, exist_ok=True)
            destination.chmod(mode)
            destination.write_bytes(extracted.read())
            if folder not in folders:
                folders.append(folder)
    return folders


def main(arguments: list[str]) -> int:
    """`export <name>...` to stdout, or `import [directory]` from stdin."""
    try:
        if arguments[:1] == ["export"]:
            folders = export_bundle(DEFAULT_OUTPUT_DIRECTORY, arguments[1:], sys.stdout.buffer)
            print(f"service-credentials: exported {', '.join(folders)}", file=sys.stderr)
            return 0
        if arguments[:1] == ["import"] and len(arguments) <= 2:
            directory = Path(arguments[1]) if len(arguments) == 2 else DEFAULT_OUTPUT_DIRECTORY
            folders = import_bundle(sys.stdin.buffer, directory)
            print(f"service-credentials: imported {', '.join(folders)} into {directory}", file=sys.stderr)
            return 0
    except BundleError as error:
        print(f"service-credentials: {error}", file=sys.stderr)
        return 1
    print("usage: service_credentials_bundle export <caller|radio-host>... | import [directory]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
