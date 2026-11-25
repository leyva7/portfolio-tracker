#!/usr/bin/env bash
# Builds app.html and runs the tests. Exits with a non-zero code if anything fails.
set -euo pipefail
cd "$(dirname "$0")/.."
node build.js
node tools/demo-seed.js
node tests/engine.test.js
node tests/smoke.js
