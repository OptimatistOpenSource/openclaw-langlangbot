#!/usr/bin/env bash
# Publish npm packages (connector first, then openclaw). Run CI checks locally first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build

npm publish --workspace=@optimatist/langlangbot-connector "$@"
npm publish --workspace=@optimatist/langlangbot-openclaw "$@"
