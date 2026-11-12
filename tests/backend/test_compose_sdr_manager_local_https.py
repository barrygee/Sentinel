"""sdr-manager-local is reached over HTTPS under compose, with the certificate service-credentials issues.

Its registration (`SERVICE_INTERNAL_URL`) is what core's registry probes and
the gateway proxies to, and `SDR_MANAGER_LOCAL_TLS_*` is what makes it serve
HTTPS: an `http://` registration or a TLS path outside its own credentials
mount would leave it unreachable, or serving plain HTTP to other Sentinels.
"""

from __future__ import annotations

import pytest

from tests.backend.test_compose_hardening import compose_services

CREDENTIALS_MOUNT = "/run/service-credentials"


def _environment(file_name: str) -> dict[str, str]:
    return compose_services(file_name)["sdr-manager-local"]["environment"]


def _credentials_mount_subpath(service: dict) -> str:
    [mount] = [
        volume
        for volume in service["volumes"]
        if isinstance(volume, dict) and volume.get("target") == CREDENTIALS_MOUNT
    ]
    return mount["volume"]["subpath"]


@pytest.mark.parametrize(
    ("file_name", "registration"),
    [
        (
            "docker-compose.yml",
            "https://host.docker.internal:${SDR_MANAGER_LOCAL_HTTP_PORT:-8000}",
        ),
        ("compose.sdr-manager-local-mock.yaml", "https://sdr-manager-local:8000"),
    ],
)
def test_it_registers_an_https_address(file_name: str, registration: str) -> None:
    assert _environment(file_name)["SERVICE_INTERNAL_URL"] == registration


def test_it_serves_the_certificate_from_its_own_credentials_folder() -> None:
    service = compose_services("docker-compose.yml")["sdr-manager-local"]
    environment = service["environment"]

    assert _credentials_mount_subpath(service) == "credentials/sdr-manager-local"
    assert (
        environment["SDR_MANAGER_LOCAL_TLS_CERTIFICATE_FILE"]
        == f"{CREDENTIALS_MOUNT}/certificate.pem"
    )
    assert (
        environment["SDR_MANAGER_LOCAL_TLS_PRIVATE_KEY_FILE"]
        == f"{CREDENTIALS_MOUNT}/private-key.pem"
    )
    # The authority its endpoint hands other Sentinels, from the same folder.
    assert (
        environment["INTERNAL_CERTIFICATE_AUTHORITY_FILE"]
        == f"{CREDENTIALS_MOUNT}/certificate-authority.pem"
    )


def test_the_mock_keeps_the_same_credentials_folder() -> None:
    # The mock overrides the volumes: the certificate must still be mounted.
    assert _credentials_mount_subpath(
        compose_services("compose.sdr-manager-local-mock.yaml")["sdr-manager-local"]
    ) == ("credentials/sdr-manager-local")


@pytest.mark.parametrize("caller", ["app", "gateway"])
def test_the_callers_that_dial_it_trust_the_deployment_ca(caller: str) -> None:
    # The app probes it and writes the gateway's route; the gateway proxies to it.
    app_environment = compose_services("docker-compose.yml")["app"]["environment"]
    variable = (
        "INTERNAL_CERTIFICATE_AUTHORITY_FILE"
        if caller == "app"
        else "GATEWAY_UPSTREAM_CERTIFICATE_AUTHORITY_FILE"
    )

    assert app_environment[variable] == f"{CREDENTIALS_MOUNT}/certificate-authority.pem"
