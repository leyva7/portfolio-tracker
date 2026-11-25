#!/usr/bin/env bash
# Construye app.html y pasa las pruebas. Sale con código distinto de 0 si algo falla.
set -euo pipefail
cd "$(dirname "$0")/.."
node build.js
node tools/demo-seed.js
node tests/engine.test.js
node tests/smoke.js
