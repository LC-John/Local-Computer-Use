#!/usr/bin/env bash
set -euo pipefail

npm run build:m22:app
npm run probe:m22:app
npm run probe:m23:diagnostics-ui
npm run probe:m24:plugin-flow

echo "M25 app track verification passed."
