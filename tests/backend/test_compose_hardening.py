"""Container hardening in the compose files.

Compose is plain YAML, so nothing else in the suite sees these settings, and
each one closes a specific route: a writable `./backend` mount is code execution
in every process that imports it, and a writable `sentinel_db` hands the
AISStream key to any section.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
NO_NEW_PRIVILEGES = "no-new-privileges:true"
PINNED_IMAGE = re.compile(r"^[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}$")

SECTIONS = ["space", "land", "air", "sea", "sdr"]
UNPRIVILEGED = [
    "redis",
    "nats",
    "voice-decoder",
    "aprs-decoder",
    "ais-decoder",
    "stub-decoder",
    "adsb-decoder",
]
RADIO_HOST_DECODERS = ["voice-decoder", "aprs-decoder", "ais-decoder", "stub-decoder"]


class ComposeLoader(yaml.SafeLoader):
    """Accepts Compose's own merge tags, which plain YAML does not define."""


def construct_compose_tag(loader: ComposeLoader, suffix: str, node: yaml.Node) -> object:
    """`!reset` clears a value and `!override` keeps the value it tags."""
    if suffix == "reset":
        return None
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    return loader.construct_mapping(node, deep=True)


ComposeLoader.add_multi_constructor("!", construct_compose_tag)


def compose_services(file_name: str) -> dict[str, dict]:
    return yaml.load((REPO_ROOT / file_name).read_text(), Loader=ComposeLoader)["services"]  # noqa: S506


MAIN_SERVICES = compose_services("docker-compose.yml")
RADIO_HOST_SERVICES = compose_services("compose.radio-host.yaml")
MOCK_SERVICES = compose_services("compose.sdr-manager-local-mock.yaml")


def volume_strings(service: dict) -> list[str]:
    return [volume for volume in service.get("volumes") or [] if isinstance(volume, str)]


def mounts_of(service: dict, source: str) -> list[str]:
    return [volume for volume in volume_strings(service) if volume.split(":")[0] == source]


class TestPrivileges:
    @pytest.mark.parametrize("service_name", sorted(set(MAIN_SERVICES) - {"sdr-manager-local"}))
    def test_no_process_can_gain_privileges(self, service_name: str) -> None:
        assert NO_NEW_PRIVILEGES in MAIN_SERVICES[service_name]["security_opt"]

    @pytest.mark.parametrize("service_name", UNPRIVILEGED)
    def test_services_needing_no_capabilities_drop_them_all(self, service_name: str) -> None:
        assert MAIN_SERVICES[service_name]["cap_drop"] == ["ALL"]

    @pytest.mark.parametrize("service_name", RADIO_HOST_DECODERS)
    def test_radio_host_decoders_drop_them_too(self, service_name: str) -> None:
        assert RADIO_HOST_SERVICES[service_name]["cap_drop"] == ["ALL"]
        assert NO_NEW_PRIVILEGES in RADIO_HOST_SERVICES[service_name]["security_opt"]

    @pytest.mark.parametrize(
        "gateway",
        [MAIN_SERVICES["gateway"], RADIO_HOST_SERVICES["radio-host-gateway"]],
        ids=["main", "radio-host"],
    )
    def test_the_gateway_keeps_the_one_capability_its_binary_demands(self, gateway: dict) -> None:
        # Caddy's binary carries a file capability: without this the exec itself fails.
        assert gateway["cap_drop"] == ["ALL"]
        assert gateway["cap_add"] == ["NET_BIND_SERVICE"]
        assert NO_NEW_PRIVILEGES in gateway["security_opt"]


class TestNats:
    def test_runs_as_the_runtime_user_on_a_read_only_filesystem(self) -> None:
        nats = MAIN_SERVICES["nats"]
        assert nats["user"].startswith("${SENTINEL_RUNTIME_USER_ID")
        assert nats["read_only"] is True

    def test_the_healthcheck_uses_the_loopback_monitor(self) -> None:
        assert "http://127.0.0.1:8222/healthz" in " ".join(MAIN_SERVICES["nats"]["healthcheck"]["test"])


class TestMounts:
    @pytest.mark.parametrize("service_name", SECTIONS)
    def test_sections_cannot_write_the_code(self, service_name: str) -> None:
        (mount,) = mounts_of(MAIN_SERVICES[service_name], "./backend")
        assert mount.endswith(":ro")

    def test_only_the_sections_with_data_editors_can_write_the_data_folder(self) -> None:
        # Settings › SDR and › Space save to backend/data. Any other section
        # gaining this would be a write path it has no use for.
        writers = {name for name in MAIN_SERVICES if mounts_of(MAIN_SERVICES[name], "./backend/data")}
        assert writers == {"sdr", "space"}

    @pytest.mark.parametrize("service_name", ["sdr", "space"])
    def test_the_data_mount_stays_inside_the_data_folder(self, service_name: str) -> None:
        (mount,) = mounts_of(MAIN_SERVICES[service_name], "./backend/data")
        assert mount == "./backend/data:/app/backend/data"

    @pytest.mark.parametrize("service_name", SECTIONS)
    def test_sections_cannot_write_the_legacy_database(self, service_name: str) -> None:
        (mount,) = mounts_of(MAIN_SERVICES[service_name], "sentinel_db")
        assert mount.endswith(":ro")

    @pytest.mark.parametrize(
        "services",
        [
            MAIN_SERVICES["sdr-manager-local"],
            MAIN_SERVICES["service-credentials"],
            MOCK_SERVICES["sdr-manager-local"],
        ],
        ids=["sdr-manager-local", "service-credentials", "sdr-manager-local-mock"],
    )
    def test_root_services_run_only_the_code_in_their_image(self, services: dict) -> None:
        # `app` can still write ./backend, so a mount here would run that code as root.
        assert mounts_of(services, "./backend") == []


class TestImagePins:
    @pytest.mark.parametrize("service_name", ["gateway", "redis", "nats"])
    def test_third_party_images_are_pinned_by_digest(self, service_name: str) -> None:
        assert PINNED_IMAGE.match(MAIN_SERVICES[service_name]["image"])

    def test_the_radio_host_gateway_matches_the_main_one(self) -> None:
        assert RADIO_HOST_SERVICES["radio-host-gateway"]["image"] == MAIN_SERVICES["gateway"]["image"]

    def test_the_uv_build_stage_is_pinned(self) -> None:
        dockerfile = (REPO_ROOT / "backend" / "Dockerfile").read_text()
        assert "uv:latest" not in dockerfile
        assert re.search(r"/uv:\d+\.\d+\.\d+", dockerfile)


class TestGuardContainerRange:
    def test_the_guard_is_told_the_main_dynamic_range(self) -> None:
        environment = MAIN_SERVICES["app"]["environment"]
        assert environment["GUARD_CONTAINER_NETWORKS"] == "${SENTINEL_NETWORK_DYNAMIC_RANGE:-172.28.0.128/25}"

    def test_the_guard_is_told_the_radio_host_range(self) -> None:
        environment = RADIO_HOST_SERVICES["radio"]["environment"]
        assert (
            environment["GUARD_CONTAINER_NETWORKS"] == "${SENTINEL_RADIO_HOST_NETWORK_DYNAMIC_RANGE:-172.29.0.128/25}"
        )
