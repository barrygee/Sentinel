"""Generate (or check) the files derived from the request-guard policy.

- `backend/security/guard-policy.schema.json` — the policy file's JSON Schema,
  so an editor validates the policy as it is written (JSON has no comments;
  the schema's descriptions do that job).
- `docs/reference/api-access-matrix.md` — every route of every Sentinel
  service with who may call it and its protection group, built by loading
  each service's real app. A route no rule covers fails the run, so CI
  catches a new endpoint before a deployment refuses to start with it.

    uv run --project backend python -m backend.scripts.guard_policy_artifacts          # write both
    uv run --project backend python -m backend.scripts.guard_policy_artifacts --check  # CI: exit 1 if stale

Run from the repo root (the service packages are imported by name).
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from pathlib import Path

# Enough of a service's environment for its app module to import and build.
os.environ.setdefault("SERVICE_INTERNAL_URL", "http://service.invalid:8000")
os.environ.setdefault("SENTINEL_CORE_URL", "http://core.invalid:8000")
os.environ["GUARD_ENABLED"] = "true"
os.environ["GUARD_REDIS_URL"] = ""

from backend.platform.security.access import AccessRules  # noqa: E402
from backend.platform.security.policy import GuardPolicy, load_policy  # noqa: E402
from backend.platform.security.route_inventory import iter_routes  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "backend" / "security" / "guard-policy.schema.json"
MATRIX_PATH = REPO_ROOT / "docs" / "reference" / "api-access-matrix.md"

# Every Sentinel process: (service, app module, GUARD_PROFILE compose gives it).
SERVICES: tuple[tuple[str, str, str], ...] = (
    ("core (`app`)", "backend.main", "core"),
    ("Space (`space`)", "sentinel_space.service", "section"),
    ("Land (`land`)", "sentinel_land.service", "section"),
    ("Air (`air`)", "sentinel_air.service", "section"),
    ("Sea (`sea`)", "sentinel_sea.service", "section"),
    ("SDR (`sdr`)", "sentinel_sdr.service", "section"),
    ("Radio hub (`radio`)", "sentinel_radio.service", "radio_hub"),
    ("Docs (`docs`)", "sentinel_docs.service", "docs"),
    ("SDR Manager, other machines (`sdr-manager-remote`)", "sentinel_sdr_manager_remote.service", "sdr_manager_remote"),
    ("SDR Manager, this machine (`sdr-manager-local`)", "sentinel_sdr_manager_local.service", "sdr_manager_local"),
)


def render_schema() -> str:
    """The policy file's JSON Schema, as written to disk."""
    schema = GuardPolicy.model_json_schema(by_alias=True)
    schema["$id"] = "guard-policy.schema.json"
    schema["title"] = "Sentinel request-guard policy"
    return json.dumps(schema, indent=2, sort_keys=True) + "\n"


def render_matrix(policy: GuardPolicy) -> tuple[str, list[str]]:
    """The access matrix as Markdown, and every unclassified route (`service: METHOD path`)."""
    lines = [
        "# API access matrix",
        "",
        "Who may call each route of each Sentinel service, and which protection group",
        "it is in. **Generated** from `backend/security/guard-policy.json` and the",
        "services' real apps by `backend/scripts/guard_policy_artifacts.py`: edit the",
        "policy, then regenerate; CI fails while this page is stale.",
        "",
        "Caller classes and groups are explained in [the request guard guide](../security-guard.md).",
        "A caller outside a route's classes gets a 404, as for a route that doesn't exist.",
        "",
    ]
    unclassified: list[str] = []
    for service_name, module_name, profile in SERVICES:
        app = importlib.import_module(module_name).app
        rules = AccessRules(policy, profile)
        lines += [
            f"## {service_name}",
            "",
            f"Profile `{profile}`.",
            "",
            "| Method | Path | Who may call | Group | What it is |",
            "| --- | --- | --- | --- | --- |",
        ]
        for entry in iter_routes(app.routes):
            rule = rules.explicit_rule_for(entry.method, entry.path)
            if rule is None:
                unclassified.append(f"{service_name}: {entry.method} {entry.path}")
                lines.append(f"| {entry.method} | `{entry.path}` | **unclassified** | | |")
                continue
            access = ", ".join(f"`{caller_class}`" for caller_class in rule.rule.access)
            lines.append(f"| {entry.method} | `{entry.path}` | {access} | `{rule.rule.group}` | {rule.rule.note} |")
        lines.append("")
    return "\n".join(lines), unclassified


def main(arguments: list[str] | None = None) -> int:
    """Write the artifacts, or with `--check` report whether they are current (exit 1 if not)."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0] if __doc__ else None)
    parser.add_argument("--check", action="store_true", help="fail if a file is stale or a route is unclassified")
    parsed = parser.parse_args(arguments)

    policy = load_policy()
    matrix, unclassified = render_matrix(policy)
    expected = {SCHEMA_PATH: render_schema(), MATRIX_PATH: matrix}
    problems = [f"no rule in the guard policy: {route}" for route in unclassified]
    for path, content in expected.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == content:
            continue
        if parsed.check:
            problems.append(
                f"{path.relative_to(REPO_ROOT)} is stale: run python -m backend.scripts.guard_policy_artifacts"
            )
        else:
            path.write_text(content, encoding="utf-8")
            print(f"wrote {path.relative_to(REPO_ROOT)}")
    for problem in problems:
        print(problem, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
