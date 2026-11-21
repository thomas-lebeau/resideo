#!/usr/bin/env bash
# Smoke-tests a release archive with the `node` on PATH: extracts it to a
# temporary directory, so only what the archive ships is used, then checks that
# the binary starts and that the native modules shipped next to it load.
#
# Usage: scripts/smoke-test.sh raspberry-home-monitor-linux-<arch>.tar.gz
set -euo pipefail

archive=$(realpath "$1")
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT

tar -xzf "$archive" -C "$dir"
cd "$dir"

echo "Smoke-testing $(basename "$archive") with Node $(node --version) on $(uname -m)"

./raspberry-home-monitor --version
./raspberry-home-monitor --list-plugins

# Plugins import these lazily, so the commands above don't load them. Requiring
# them loads their compiled `.node` binaries, which fails if a module is missing
# from the archive or was built for another architecture or Node version.
node -e 'require("node-dht-sensor"); require("@abandonware/bluetooth-hci-socket")'

echo "Smoke test passed"
