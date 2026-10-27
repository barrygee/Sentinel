"""The files derived from the guard policy: its JSON Schema and the API access matrix.

Run with:  uv run --project backend pytest tests/backend/test_guard_policy_artifacts_script.py
"""

from __future__ import annotations

import importlib
import json
import os
import runpy
import sys
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from fastapi import FastAPI

from tests.backend.request_guard_helpers import minimal_policy, pin_guard_settings, write_policy


@pytest.fixture(scope="module")
def artifacts() -> Iterator[ModuleType]:
    # Importing it sets the environment a service needs to build its app;
    # put it back so no other test sees it.
    saved_environment = dict(os.environ)
    module = importlib.import_module("backend.scripts.guard_policy_artifacts")
    os.environ.clear()
    os.environ.update(saved_environment)
    yield module


def fake_service_app(*extra_posts: str) -> SimpleNamespace:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    async def read_thing(thing_id: str) -> None:
        return None

    app.add_api_route("/api/things/{thing_id}", read_thing, methods=["GET"])
    for path in extra_posts:
        app.add_api_route(path, read_thing, methods=["POST"])
    return SimpleNamespace(app=app)


@pytest.fixture
def one_service(monkeypatch: pytest.MonkeyPatch, artifacts: ModuleType) -> list[str]:
    """`artifacts` describing one fake service; append a path to give it an unclassified POST."""
    extra_posts: list[str] = []
    monkeypatch.setattr(artifacts, "SERVICES", (("Test (`test`)", "fake.service", "core"),))
    monkeypatch.setattr(artifacts.importlib, "import_module", lambda name: fake_service_app(*extra_posts))
    return extra_posts


class TestRenderSchema:
    def test_is_the_policy_models_schema(self, artifacts: ModuleType) -> None:
        schema = json.loads(artifacts.render_schema())

        assert schema["$id"] == "guard-policy.schema.json"
        assert schema["title"] == "Sentinel request-guard policy"
        assert "route_rules" in schema["properties"]
        assert "$schema" in schema["properties"]

    def test_the_committed_schema_is_current(self, artifacts: ModuleType) -> None:
        assert artifacts.SCHEMA_PATH.read_text(encoding="utf-8") == artifacts.render_schema()


class TestRenderMatrix:
    def test_a_row_per_route_with_who_may_call_it(self, artifacts: ModuleType, one_service: list[str]) -> None:
        matrix, unclassified = artifacts.render_matrix(minimal_policy())

        assert unclassified == []
        assert "## Test (`test`)" in matrix
        assert "Profile `core`." in matrix
        assert "| GET | `/api/things/{thing_id}` | `browser` | `default` |  |" in matrix

    def test_an_unclassified_route_is_marked_and_reported(self, artifacts: ModuleType, one_service: list[str]) -> None:
        one_service.append("/api/brand-new")

        matrix, unclassified = artifacts.render_matrix(minimal_policy())

        assert unclassified == ["Test (`test`): POST /api/brand-new"]
        assert "| POST | `/api/brand-new` | **unclassified** | | |" in matrix

    def test_every_real_service_is_listed(self, artifacts: ModuleType) -> None:
        modules = {module_name for _, module_name, _ in artifacts.SERVICES}

        assert "backend.main" in modules
        assert "sentinel_sdr_manager_local.service" in modules
        assert len(modules) == 10


@pytest.fixture
def output_paths(monkeypatch: pytest.MonkeyPatch, artifacts: ModuleType, tmp_path: Path) -> tuple[Path, Path]:
    """The script's output files moved into a temporary repo root."""
    schema_path = tmp_path / "backend" / "security" / "guard-policy.schema.json"
    matrix_path = tmp_path / "docs" / "api-access-matrix.md"
    schema_path.parent.mkdir(parents=True)
    matrix_path.parent.mkdir(parents=True)
    monkeypatch.setattr(artifacts, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(artifacts, "SCHEMA_PATH", schema_path)
    monkeypatch.setattr(artifacts, "MATRIX_PATH", matrix_path)
    pin_guard_settings(monkeypatch, guard_policy_file=str(write_policy(tmp_path)))
    return schema_path, matrix_path


class TestMain:
    def test_writes_both_files(
        self,
        artifacts: ModuleType,
        one_service: list[str],
        output_paths: tuple[Path, Path],
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        schema_path, matrix_path = output_paths

        assert artifacts.main([]) == 0

        assert schema_path.read_text(encoding="utf-8") == artifacts.render_schema()
        assert matrix_path.read_text(encoding="utf-8").startswith("# API access matrix")
        assert capsys.readouterr().out.splitlines() == [
            "wrote backend/security/guard-policy.schema.json",
            "wrote docs/api-access-matrix.md",
        ]

    def test_check_passes_when_current(
        self, artifacts: ModuleType, one_service: list[str], output_paths: tuple[Path, Path]
    ) -> None:
        artifacts.main([])

        assert artifacts.main(["--check"]) == 0

    def test_check_fails_on_a_stale_file_without_writing_it(
        self,
        artifacts: ModuleType,
        one_service: list[str],
        output_paths: tuple[Path, Path],
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        schema_path, matrix_path = output_paths
        artifacts.main([])
        matrix_path.write_text("old\n", encoding="utf-8")
        capsys.readouterr()

        assert artifacts.main(["--check"]) == 1

        assert matrix_path.read_text(encoding="utf-8") == "old\n"
        assert "docs/api-access-matrix.md is stale" in capsys.readouterr().err

    def test_check_fails_on_a_missing_file(
        self, artifacts: ModuleType, one_service: list[str], output_paths: tuple[Path, Path]
    ) -> None:
        assert artifacts.main(["--check"]) == 1

    def test_an_unclassified_route_fails_even_while_writing(
        self,
        artifacts: ModuleType,
        one_service: list[str],
        output_paths: tuple[Path, Path],
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        one_service.append("/api/brand-new")

        assert artifacts.main([]) == 1

        assert "no rule in the guard policy: Test (`test`): POST /api/brand-new" in capsys.readouterr().err


class TestModuleEntryPoint:
    def test_python_dash_m_runs_main(self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
        # `--check` against the real services is CI's own step (a fresh
        # process); here only that the module runs main() and exits with it.
        saved_environment = dict(os.environ)
        monkeypatch.setattr(sys, "argv", ["guard_policy_artifacts", "--help"])
        try:
            with pytest.raises(SystemExit) as exited:
                runpy.run_module("backend.scripts.guard_policy_artifacts", run_name="__main__")
        finally:
            os.environ.clear()
            os.environ.update(saved_environment)

        assert exited.value.code == 0
        assert "--check" in capsys.readouterr().out
