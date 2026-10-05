#!/usr/bin/env bash
# Runs one npm script in every web package: the shared @sentinel/* packages
# (platform/web/*) and the section packages (services/sections/*/frontend).
# The SPA (frontend/vue) is not included; it has its own CI jobs.
#
# `npm run X -w <folder>` only matches workspaces directly below <folder>, so
# it cannot reach services/sections/*/frontend; globbing here means a new
# package is picked up without editing this list. Packages without the script
# are skipped (web-config has no tests).
#
# Usage: npm run web-packages -- <script>     e.g. npm run web-packages -- lint
set -euo pipefail

script_name="${1:?usage: npm run web-packages -- <script>}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for package_dir in "$repo_root"/platform/web/*/ "$repo_root"/services/sections/*/frontend/; do
    (cd "$package_dir" && npm run "$script_name" --if-present)
done
