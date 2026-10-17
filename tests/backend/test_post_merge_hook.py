"""`.husky/post-merge` reinstalls dependencies when a merge changed a lockfile.

Each test runs a real `git merge` in a throwaway repository whose hook is the
repo's own script, run with `sh -e` the way husky's dispatcher runs it. `npm`,
`uv` and nvm are stand-ins on a minimal PATH that record how they were called,
so nothing is installed and the tests need neither Node nor network.
"""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
HOOK_SCRIPT = REPO_ROOT / ".husky" / "post-merge"


class MergeSandbox:
    """A git repository on `main` with the hook installed and stub tools on PATH."""

    def __init__(self, root: Path) -> None:
        self.repository = root / "repository"
        self.stub_bin = root / "bin"
        self.call_log = root / "calls.log"
        self.nvm_directory = root / "nvm"
        self.repository.mkdir()
        self.stub_bin.mkdir()
        self.nvm_directory.mkdir()

        # Only the stubs, git and the system shell tools: the real npm/uv/nvm
        # of whoever runs the suite must never be reachable.
        git_path = shutil.which("git")
        assert git_path is not None, "git is needed to run a real merge"
        (self.stub_bin / "git").symlink_to(git_path)
        self.environment = {
            "PATH": f"{self.stub_bin}:/usr/bin:/bin",
            "HOME": str(root),
            "NVM_DIR": str(self.nvm_directory),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "Hook Test",
            "GIT_AUTHOR_EMAIL": "hook-test@example.invalid",
            "GIT_COMMITTER_NAME": "Hook Test",
            "GIT_COMMITTER_EMAIL": "hook-test@example.invalid",
        }

        hooks_directory = root / "hooks"
        hooks_directory.mkdir()
        dispatcher = hooks_directory / "post-merge"
        dispatcher.write_text(f'#!/bin/sh\nsh -e "{HOOK_SCRIPT}" "$@"\n')
        dispatcher.chmod(0o755)

        self.git("init", "-q", "-b", "main")
        self.git("config", "core.hooksPath", str(hooks_directory))
        self.commit_files({"README.md": "start\n"}, "initial")

    def git(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *arguments],
            cwd=self.repository,
            env=self.environment,
            capture_output=True,
            text=True,
            check=True,
        )

    def commit_files(self, files: dict[str, str], message: str) -> None:
        for relative_path, contents in files.items():
            file_path = self.repository / relative_path
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(contents)
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)

    def add_stub(self, tool_name: str, exit_code: int = 0) -> None:
        """Put a `tool_name` on PATH that logs its arguments and exits `exit_code`."""
        stub = self.stub_bin / tool_name
        stub.write_text(
            f'#!/bin/sh\necho "{tool_name} $*" >> "{self.call_log}"\nexit {exit_code}\n'
        )
        stub.chmod(0o755)

    def add_nvm(self, use_exit_code: int = 0) -> None:
        """Provide an nvm.sh whose `nvm` function logs and exits `use_exit_code`."""
        (self.nvm_directory / "nvm.sh").write_text(
            f'nvm() {{ echo "nvm $*" >> "{self.call_log}"; return {use_exit_code}; }}\n'
        )

    def merge_branch_changing(
        self, files: dict[str, str]
    ) -> subprocess.CompletedProcess[str]:
        """Commit `files` on a side branch and fast-forward `main` onto it."""
        self.git("checkout", "-q", "-b", "incoming")
        self.commit_files(files, "incoming change")
        self.git("checkout", "-q", "main")
        return self.git("merge", "--ff-only", "incoming")

    def calls(self) -> list[str]:
        if not self.call_log.exists():
            return []
        return self.call_log.read_text().splitlines()


@pytest.fixture
def sandbox(tmp_path: Path) -> MergeSandbox:
    return MergeSandbox(tmp_path)


def test_package_lock_change_runs_npm_ci(sandbox: MergeSandbox) -> None:
    sandbox.add_stub("npm")
    sandbox.add_stub("uv")

    merge = sandbox.merge_branch_changing({"package-lock.json": "{}\n"})

    assert sandbox.calls() == ["npm ci --no-audit --no-fund"]
    assert "package-lock.json changed — running npm ci" in merge.stdout + merge.stderr


def test_uv_lock_change_runs_uv_sync(sandbox: MergeSandbox) -> None:
    sandbox.add_stub("npm")
    sandbox.add_stub("uv")

    merge = sandbox.merge_branch_changing({"backend/uv.lock": "version = 1\n"})

    assert sandbox.calls() == ["uv sync --project backend"]
    assert "backend/uv.lock changed — running uv sync" in merge.stdout + merge.stderr


def test_both_lockfiles_changed_runs_both_installs(sandbox: MergeSandbox) -> None:
    sandbox.add_stub("npm")
    sandbox.add_stub("uv")

    sandbox.merge_branch_changing(
        {"package-lock.json": "{}\n", "backend/uv.lock": "version = 1\n"}
    )

    assert sandbox.calls() == [
        "npm ci --no-audit --no-fund",
        "uv sync --project backend",
    ]


def test_unrelated_change_installs_nothing_and_stays_quiet(
    sandbox: MergeSandbox,
) -> None:
    sandbox.add_stub("npm")
    sandbox.add_stub("uv")

    merge = sandbox.merge_branch_changing(
        {"frontend/vue/package-lock.json": "{}\n", "uv.lock": ""}
    )

    # Lockfiles of the same name elsewhere don't count: only the root
    # package-lock.json and backend/uv.lock are what the installs read.
    assert sandbox.calls() == []
    assert "post-merge:" not in merge.stdout + merge.stderr


def test_nvm_switches_node_before_npm_ci(sandbox: MergeSandbox) -> None:
    sandbox.add_stub("npm")
    sandbox.add_nvm()

    sandbox.merge_branch_changing({"package-lock.json": "{}\n"})

    assert sandbox.calls() == ["nvm use", "npm ci --no-audit --no-fund"]


def test_failing_nvm_use_still_runs_npm_ci(sandbox: MergeSandbox) -> None:
    # Under `sh -e` an unguarded failing `nvm use` would end the hook here.
    sandbox.add_stub("npm")
    sandbox.add_nvm(use_exit_code=3)

    sandbox.merge_branch_changing({"package-lock.json": "{}\n"})

    assert sandbox.calls() == ["nvm use", "npm ci --no-audit --no-fund"]


def test_failing_npm_ci_prints_retry_and_still_syncs_uv(sandbox: MergeSandbox) -> None:
    sandbox.add_stub("npm", exit_code=1)
    sandbox.add_stub("uv")

    merge = sandbox.merge_branch_changing(
        {"package-lock.json": "{}\n", "backend/uv.lock": "version = 1\n"}
    )

    assert (
        "npm ci failed — run 'nvm use && npm ci' from the repo root"
        in merge.stdout + merge.stderr
    )
    assert sandbox.calls() == [
        "npm ci --no-audit --no-fund",
        "uv sync --project backend",
    ]
    assert "husky" not in merge.stderr


def test_failing_uv_sync_prints_retry(sandbox: MergeSandbox) -> None:
    sandbox.add_stub("uv", exit_code=2)

    merge = sandbox.merge_branch_changing({"backend/uv.lock": "version = 1\n"})

    assert (
        "uv sync failed — run 'uv sync --project backend'"
        in merge.stdout + merge.stderr
    )


def test_missing_uv_prints_install_hint(sandbox: MergeSandbox) -> None:
    assert shutil.which("uv", path=sandbox.environment["PATH"]) is None

    merge = sandbox.merge_branch_changing({"backend/uv.lock": "version = 1\n"})

    assert (
        "uv not found — run 'uv sync --project backend'" in merge.stdout + merge.stderr
    )
    assert sandbox.calls() == []


def test_without_orig_head_the_hook_exits_cleanly(sandbox: MergeSandbox) -> None:
    sandbox.add_stub("npm")
    assert not (sandbox.repository / ".git" / "ORIG_HEAD").exists()

    hook_run = subprocess.run(
        ["sh", "-e", str(HOOK_SCRIPT)],
        cwd=sandbox.repository,
        env=sandbox.environment,
        capture_output=True,
        text=True,
    )

    assert hook_run.returncode == 0
    assert sandbox.calls() == []


def test_hook_script_is_valid_posix_shell() -> None:
    syntax_check = subprocess.run(
        ["sh", "-n", str(HOOK_SCRIPT)], capture_output=True, text=True
    )

    assert syntax_check.returncode == 0, syntax_check.stderr
    assert os.access(HOOK_SCRIPT, os.X_OK)
