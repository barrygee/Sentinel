"""Container hardening in the compose files.

Compose is plain YAML, so nothing else in the suite sees these settings, and
each one closes a specific route: a writable `./backend` mount is code execution
in every process that imports it, and a writable `sentinel_db` hands the
AISStream key to any section.

docker-compose.yml is the deployment: every service runs its image's code, with
no --reload. compose.dev.yaml layers the checkout's code (read-only) and
--reload over it for development, and must stay a pure overlay of exactly that.
The live config file core applies as settings sits in ./config, which only the
app mounts.
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


def construct_compose_tag(
    loader: ComposeLoader, suffix: str, node: yaml.Node
) -> object:
    """`!reset` clears a value and `!override` keeps the value it tags."""
    if suffix == "reset":
        return None
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    return loader.construct_mapping(node, deep=True)


ComposeLoader.add_multi_constructor("!", construct_compose_tag)


def compose_services(file_name: str) -> dict[str, dict]:
    return yaml.load((REPO_ROOT / file_name).read_text(), Loader=ComposeLoader)[
        "services"
    ]  # noqa: S506


MAIN_SERVICES = compose_services("docker-compose.yml")
RADIO_HOST_SERVICES = compose_services("compose.radio-host.yaml")
MOCK_SERVICES = compose_services("compose.sdr-manager-local-mock.yaml")
DEV_SERVICES = compose_services("compose.dev.yaml")

# The uvicorn services of the deployment, each of which the dev overlay reloads.
UVICORN_SERVICES = sorted(
    name
    for name, service in MAIN_SERVICES.items()
    if str(service.get("command", "")).startswith("uvicorn ")
)


def volume_strings(service: dict) -> list[str]:
    return [
        volume for volume in service.get("volumes") or [] if isinstance(volume, str)
    ]


def mounts_of(service: dict, source: str) -> list[str]:
    return [
        volume for volume in volume_strings(service) if volume.split(":")[0] == source
    ]


def is_code_mount(volume: str) -> bool:
    """A bind mount of checkout code: ./backend (bar its data folder) or a ./services package."""
    source = volume.split(":")[0]
    if source == "./backend/data" or source.startswith("./backend/data/"):
        return False
    return (
        source == "./backend"
        or source.startswith("./backend/")
        or source.startswith("./services/")
    )


def code_mounts(service: dict) -> list[str]:
    return [volume for volume in volume_strings(service) if is_code_mount(volume)]


class TestPrivileges:
    @pytest.mark.parametrize(
        "service_name", sorted(set(MAIN_SERVICES) - {"sdr-manager-local"})
    )
    def test_no_process_can_gain_privileges(self, service_name: str) -> None:
        assert NO_NEW_PRIVILEGES in MAIN_SERVICES[service_name]["security_opt"]

    @pytest.mark.parametrize("service_name", UNPRIVILEGED)
    def test_services_needing_no_capabilities_drop_them_all(
        self, service_name: str
    ) -> None:
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
    def test_the_gateway_keeps_the_one_capability_its_binary_demands(
        self, gateway: dict
    ) -> None:
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
        assert "http://127.0.0.1:8222/healthz" in " ".join(
            MAIN_SERVICES["nats"]["healthcheck"]["test"]
        )


class TestMounts:
    def test_the_code_mount_check_recognises_code_and_spares_data(self) -> None:
        # Guards the helper the deployment checks rely on, so they can't pass vacuously.
        assert is_code_mount("./backend:/app/backend:ro")
        assert is_code_mount("./backend/platform:/app/backend/platform")
        assert is_code_mount(
            "./services/sections/sea/backend:/app/services/sections/sea/backend"
        )
        assert not is_code_mount("./backend/data:/app/backend/data")
        assert not is_code_mount("./frontend/spa-dist:/app/frontend/spa-dist:ro")
        assert not is_code_mount("space_data:/app/data")

    def test_only_the_sections_with_data_editors_can_write_the_data_folder(
        self,
    ) -> None:
        # Settings › SDR and › Space save to backend/data. Any other section
        # gaining this would be a write path it has no use for.
        writers = {
            name
            for name in MAIN_SERVICES
            if mounts_of(MAIN_SERVICES[name], "./backend/data")
        }
        assert writers == {"sdr", "space"}

    @pytest.mark.parametrize("service_name", ["sdr", "space"])
    def test_the_data_mount_stays_inside_the_data_folder(
        self, service_name: str
    ) -> None:
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
    def test_root_services_run_only_the_code_in_their_image(
        self, services: dict
    ) -> None:
        # ./backend/data is writable by Space and SDR, so a code mount here would run what they wrote as root.
        assert mounts_of(services, "./backend") == []

    def test_the_mock_overlay_mounts_no_code(self) -> None:
        # It is layered in CI and on laptops alike, so it must not turn the image into the checkout.
        assert code_mounts(MOCK_SERVICES["sdr-manager-local"]) == []


class TestDeployment:
    def test_the_uvicorn_services_are_found(self) -> None:
        # Every check below is per uvicorn service: an empty list would pass them all.
        assert set(UVICORN_SERVICES) >= {
            "app",
            *SECTIONS,
            "radio",
            "docs",
            "sdr-manager-remote",
        }

    @pytest.mark.parametrize("service_name", sorted(MAIN_SERVICES))
    def test_no_service_mounts_code_from_the_checkout(self, service_name: str) -> None:
        assert code_mounts(MAIN_SERVICES[service_name]) == []

    @pytest.mark.parametrize("service_name", UVICORN_SERVICES)
    def test_no_service_reloads_its_code(self, service_name: str) -> None:
        assert "--reload" not in MAIN_SERVICES[service_name]["command"].split()


class TestDevOverlay:
    def test_it_reloads_every_uvicorn_service_and_mounts_sdr_manager_local(
        self,
    ) -> None:
        assert set(DEV_SERVICES) == {*UVICORN_SERVICES, "sdr-manager-local"}

    @pytest.mark.parametrize("service_name", UVICORN_SERVICES)
    def test_its_command_is_the_deployed_one_plus_reload(
        self, service_name: str
    ) -> None:
        # Restating the command is the only way to add --reload; it must not drift from the deployment's.
        deployed = MAIN_SERVICES[service_name]["command"].split()
        developed = DEV_SERVICES[service_name]["command"].split()
        assert "--reload" in developed
        assert [
            argument for argument in developed if argument != "--reload"
        ] == deployed

    @pytest.mark.parametrize("service_name", sorted(DEV_SERVICES))
    def test_every_mount_it_adds_is_read_only_code(self, service_name: str) -> None:
        # Anything writable here would be code a container could change and another reload.
        volumes = DEV_SERVICES[service_name]["volumes"]
        assert volumes
        assert all(
            isinstance(volume, str) and is_code_mount(volume) for volume in volumes
        )
        assert all(volume.endswith(":ro") for volume in volumes)

    @pytest.mark.parametrize("service_name", UVICORN_SERVICES)
    def test_each_reloaded_service_gets_the_shared_backend_code(
        self, service_name: str
    ) -> None:
        assert mounts_of(DEV_SERVICES[service_name], "./backend") == [
            "./backend:/app/backend:ro"
        ]

    def test_sdr_manager_local_is_not_reloaded_and_keeps_the_image_backend(
        self,
    ) -> None:
        # It runs as root, and a reload would restart every dongle's stream.
        sdr_manager_local = DEV_SERVICES["sdr-manager-local"]
        assert "command" not in sdr_manager_local
        assert mounts_of(sdr_manager_local, "./backend") == []
        assert sdr_manager_local["volumes"] == [
            "./services/sdr-manager-local/backend:/app/services/sdr-manager-local/backend:ro"
        ]

    def test_it_changes_nothing_but_mounts_and_commands(self) -> None:
        assert all(
            set(service) <= {"volumes", "command"} for service in DEV_SERVICES.values()
        )


class TestLiveConfigFile:
    def test_only_the_app_mounts_the_config_folder(self) -> None:
        # The app applies edits to this file as settings: any other writer could change them.
        mounters = {
            name
            for name, service in MAIN_SERVICES.items()
            if mounts_of(service, "./config")
        }
        assert mounters == {"app"}
        assert mounts_of(MAIN_SERVICES["app"], "./config") == ["./config:/app/config"]

    def test_the_app_writes_the_file_inside_that_mount(self) -> None:
        assert (
            MAIN_SERVICES["app"]["environment"]["APP_CONFIG_PATH"]
            == "/app/config/sentinel_config.json"
        )

    def test_the_entrypoint_hands_the_config_folder_to_the_runtime_user(self) -> None:
        writable = MAIN_SERVICES["app"]["environment"][
            "SENTINEL_WRITABLE_DIRECTORIES"
        ].split()
        assert set(writable) == {"/app/data", "/app/config"}

    @pytest.mark.parametrize("service_name", ["space", "sdr"])
    def test_the_data_writers_do_not_get_the_config_file(
        self, service_name: str
    ) -> None:
        service = MAIN_SERVICES[service_name]
        assert "APP_CONFIG_PATH" not in service.get("environment", {})
        assert mounts_of(service, "./config") == []

    def test_git_ignores_the_config_folder(self) -> None:
        assert "/config/" in (REPO_ROOT / ".gitignore").read_text().splitlines()


class TestDockerIgnore:
    """What a build context must never carry into an image: one install's data and secrets."""

    PATTERNS = (REPO_ROOT / ".dockerignore").read_text().splitlines()

    @pytest.mark.parametrize(
        "pattern",
        [
            "**/*.db",
            "**/*.db-*",
            "**/*.sqlite",
            "**/*.sqlite3",
            ".env",
            ".env.*",
            "**/.env",
            "**/.env.*",
            "**/sentinel_config.json",
            "config",
        ],
    )
    def test_the_pattern_is_excluded(self, pattern: str) -> None:
        assert pattern in self.PATTERNS

    def test_no_later_line_takes_any_of_them_back(self) -> None:
        # A `!` line re-includes what it matches, wherever it sits after the exclusion.
        reincluded = [line for line in self.PATTERNS if line.startswith("!")]
        assert (
            reincluded
        )  # the file does re-include CONTRIBUTING.md, so this check sees real lines
        forbidden = re.compile(r"\.db|\.sqlite|\.env|sentinel_config|^!/?config")
        assert not [line for line in reincluded if forbidden.search(line)]


class TestImagePins:
    @pytest.mark.parametrize("service_name", ["gateway", "redis", "nats"])
    def test_third_party_images_are_pinned_by_digest(self, service_name: str) -> None:
        assert PINNED_IMAGE.match(MAIN_SERVICES[service_name]["image"])

    def test_the_radio_host_gateway_matches_the_main_one(self) -> None:
        assert (
            RADIO_HOST_SERVICES["radio-host-gateway"]["image"]
            == MAIN_SERVICES["gateway"]["image"]
        )

    def test_the_uv_build_stage_is_pinned(self) -> None:
        dockerfile = (REPO_ROOT / "backend" / "Dockerfile").read_text()
        assert "uv:latest" not in dockerfile
        assert re.search(r"/uv:\d+\.\d+\.\d+", dockerfile)


class TestGuardContainerRange:
    def test_the_guard_is_told_the_main_dynamic_range(self) -> None:
        environment = MAIN_SERVICES["app"]["environment"]
        assert (
            environment["GUARD_CONTAINER_NETWORKS"]
            == "${SENTINEL_NETWORK_DYNAMIC_RANGE:-172.28.0.128/25}"
        )

    def test_the_guard_is_told_the_radio_host_range(self) -> None:
        environment = RADIO_HOST_SERVICES["radio"]["environment"]
        assert (
            environment["GUARD_CONTAINER_NETWORKS"]
            == "${SENTINEL_RADIO_HOST_NETWORK_DYNAMIC_RANGE:-172.29.0.128/25}"
        )
