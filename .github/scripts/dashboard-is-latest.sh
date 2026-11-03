#!/usr/bin/env bash
# Prints deploy=true|false to $GITHUB_OUTPUT: whether HEAD's last change to the dashboard
# is still the latest one on origin/main. Compares dashboard history rather than the tip,
# because unrelated commits on main don't trigger the Dashboard workflow.
# Needs full history (actions/checkout with fetch-depth: 0).
set -euo pipefail

paths=(dashboard .github/workflows/dashboard.yml .github/scripts/dashboard-is-latest.sh)
git fetch --quiet origin main
mine=$(git log -1 --format=%H HEAD -- "${paths[@]}")
latest=$(git log -1 --format=%H origin/main -- "${paths[@]}")

if [ "$mine" = "$latest" ]; then
  echo "deploy=true" >> "${GITHUB_OUTPUT:-/dev/stdout}"
else
  echo "deploy=false" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "::notice::Skipping deploy: main has a newer dashboard revision (${latest:0:7}) than this run (${mine:0:7})."
fi
