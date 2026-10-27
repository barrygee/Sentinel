"""Tests for `native.py`: where a native Mac `sdr-manager-local` keeps its files and the environment it runs in.

The environment must match what compose gives the container, pointed at what
Docker Desktop publishes on the Mac. Every home folder and checkout here is a
temporary one.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_native.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

from sentinel_sdr_manager_local import native
from sentinel_sdr_manager_local.native import (
    CREDENTIAL_FILES,
    NativePaths,
    apply_native_environment,
    find_checkout,
    http_port,
    missing_credential_files,
    native_environment,
    native_paths,
    read_env_file,
)


@pytest.fixture
def checkout(tmp_path: Path) -> Path:
    folder = tmp_path / "Sentinel"
    folder.mkdir()
    (folder / "docker-compose.yml").write_text("services: {}\n")
    return folder


@pytest.fixture
def paths(tmp_path: Path, checkout: Path) -> NativePaths:
    return native_paths(tmp_path / "home", checkout)


@pytest.fixture(autouse=True)
def no_port_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SDR_MANAGER_LOCAL_HTTP_PORT", raising=False)


class TestNativePaths:
    def test_data_and_log_live_in_the_users_library(self, tmp_path: Path, checkout: Path) -> None:
        home = tmp_path / "home"
        paths = native_paths(home, checkout)

        assert paths.data_directory == home / "Library" / "Application Support" / "Sentinel" / "sdr-manager-local"
        assert paths.database == paths.data_directory / "sdr-manager-local.db"
        assert paths.log_file == home / "Library" / "Logs" / "Sentinel" / "sdr-manager-local.log"

    def test_credentials_and_env_live_in_the_checkout(self, paths: NativePaths, checkout: Path) -> None:
        assert paths.credentials_directory == checkout / "sdr-manager-local-credentials"
        assert paths.env_file == checkout / ".env"

    def test_defaults_to_the_users_home_and_this_checkout(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setenv("HOME", str(tmp_path))
        monkeypatch.setattr(native, "find_checkout", lambda: tmp_path / "checkout")

        paths = native_paths()

        assert paths.log_file.is_relative_to(tmp_path / "Library")
        assert paths.checkout == tmp_path / "checkout"


class TestFindCheckout:
    def test_the_checkout_this_package_is_installed_from(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        # From another folder, so the current-folder fallback can't pass for the checkout.
        monkeypatch.chdir(tmp_path)

        checkout = find_checkout()

        assert (checkout / "docker-compose.yml").is_file()
        assert (checkout / "services" / "sdr-manager-local" / "backend" / "sentinel_sdr_manager_local").is_dir()

    def test_four_folders_above_the_package(self, checkout: Path) -> None:
        module_file = (
            checkout / "services" / "sdr-manager-local" / "backend" / "sentinel_sdr_manager_local" / "native.py"
        )

        assert find_checkout(module_file) == checkout.resolve()

    def test_an_install_outside_a_checkout_falls_back_to_the_current_folder(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.chdir(tmp_path)
        module_file = tmp_path / "site-packages" / "a" / "b" / "sentinel_sdr_manager_local" / "native.py"

        assert find_checkout(module_file) == Path.cwd()


class TestReadEnvFile:
    def test_no_env_file_reads_as_empty(self, paths: NativePaths) -> None:
        assert read_env_file(paths) == {}

    def test_every_line_with_blank_and_bare_keys_as_empty_strings(self, paths: NativePaths) -> None:
        paths.env_file.write_text("SDR_MANAGER_LOCAL_NATIVE=1\nCOMPOSE_PROFILES=\nBARE_KEY\n# a comment\n")

        assert read_env_file(paths) == {"SDR_MANAGER_LOCAL_NATIVE": "1", "COMPOSE_PROFILES": "", "BARE_KEY": ""}


class TestHttpPort:
    def test_8000_by_default(self) -> None:
        assert http_port({}) == 8000

    def test_from_env_file(self) -> None:
        assert http_port({"SDR_MANAGER_LOCAL_HTTP_PORT": "9000"}) == 9000

    def test_the_environment_wins_over_the_env_file(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_PORT", "9100")

        assert http_port({"SDR_MANAGER_LOCAL_HTTP_PORT": "9000"}) == 9100

    @pytest.mark.parametrize("raw_port", ["", "eighty", "-1", "80.5"])
    def test_a_value_that_is_not_a_port_number_falls_back_to_8000(self, raw_port: str) -> None:
        assert http_port({"SDR_MANAGER_LOCAL_HTTP_PORT": raw_port}) == 8000


class TestNativeEnvironment:
    def test_what_compose_gives_the_container_pointed_at_docker_desktop(self, paths: NativePaths) -> None:
        credentials = paths.credentials_directory

        assert native_environment(paths, {}) == {
            "PYTHONUNBUFFERED": "1",
            "DB_PATH": str(paths.database),
            "SENTINEL_CORE_URL": "https://localhost:8443",
            "SERVICE_INTERNAL_URL": "http://host.docker.internal:8000",
            "NATS_URL": "",
            "SERVICE_HTTP_CREDENTIALS_FILE": str(credentials / "http-credentials.json"),
            "ACCEPTED_CALLERS_FILE": str(credentials / "accepted-callers.json"),
            "INTERNAL_CERTIFICATE_AUTHORITY_FILE": str(credentials / "certificate-authority.pem"),
        }

    def test_passes_only_the_env_files_sdr_manager_local_settings(self, paths: NativePaths) -> None:
        environment = native_environment(
            paths, {"SDR_MANAGER_LOCAL_MAX_DEVICES": "4", "NATS_URL": "tls://nats:4222", "GATEWAY_ADMIN_URL": "x"}
        )

        assert environment["SDR_MANAGER_LOCAL_MAX_DEVICES"] == "4"
        assert environment["NATS_URL"] == ""
        assert "GATEWAY_ADMIN_URL" not in environment

    def test_registers_on_the_port_it_serves(self, paths: NativePaths) -> None:
        environment = native_environment(paths, {"SDR_MANAGER_LOCAL_HTTP_PORT": "9000"})

        assert environment["SERVICE_INTERNAL_URL"] == "http://host.docker.internal:9000"


class TestApplyNativeEnvironment:
    @pytest.fixture(autouse=True)
    def restore_process_state(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(sys, "path", list(sys.path))
        monkeypatch.chdir(Path.cwd())

    def test_sets_the_environment_creates_the_data_folder_and_moves_into_the_checkout(
        self, paths: NativePaths, checkout: Path
    ) -> None:
        paths.env_file.write_text("SDR_MANAGER_LOCAL_MAX_DEVICES=3\n")
        target: dict[str, str] = {}

        apply_native_environment(paths, target)

        assert target["DB_PATH"] == str(paths.database)
        assert target["SDR_MANAGER_LOCAL_MAX_DEVICES"] == "3"
        assert paths.data_directory.is_dir()
        assert Path.cwd() == checkout.resolve()
        assert sys.path[0] == str(checkout)

    def test_a_variable_already_set_wins(self, paths: NativePaths) -> None:
        target = {"SENTINEL_CORE_URL": "https://localhost:18443"}

        apply_native_environment(paths, target)

        assert target["SENTINEL_CORE_URL"] == "https://localhost:18443"

    def test_the_checkout_is_not_added_to_the_import_path_twice(self, paths: NativePaths, checkout: Path) -> None:
        sys.path.insert(0, str(checkout))

        apply_native_environment(paths, {})

        assert sys.path.count(str(checkout)) == 1

    def test_sets_the_process_environment_by_default(self, paths: NativePaths, monkeypatch: pytest.MonkeyPatch) -> None:
        # Recorded first, so every variable it sets is put back after the test.
        for key in native_environment(paths, {}):
            monkeypatch.delenv(key, raising=False)

        apply_native_environment(paths)

        assert os.environ["DB_PATH"] == str(paths.database)


class TestMissingCredentialFiles:
    def test_every_file_is_missing_before_service_credentials_runs(self, paths: NativePaths) -> None:
        assert missing_credential_files(paths) == list(CREDENTIAL_FILES)

    def test_names_only_what_is_still_missing(self, paths: NativePaths) -> None:
        paths.credentials_directory.mkdir()
        (paths.credentials_directory / "http-credentials.json").write_text("{}")

        assert missing_credential_files(paths) == ["accepted-callers.json", "certificate-authority.pem"]
