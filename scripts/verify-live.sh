#!/usr/bin/env bash
set -euo pipefail

# Verify the AlphaVyuh frontend builds, types, lints, and core E2E passes.
# Usage: bash scripts/verify-live.sh

cd "$(git rev-parse --show-toplevel)/frontend"

echo "=== 1/4 Typecheck ==="
bun run typecheck

echo "=== 2/4 Lint ==="
bun run lint

echo "=== 3/4 Build ==="
bun run build

echo "=== 4/4 Core workflow E2E ==="
bun run e2e:mock tests/e2e/core-workflow.spec.ts

echo ""
echo "All checks passed."
