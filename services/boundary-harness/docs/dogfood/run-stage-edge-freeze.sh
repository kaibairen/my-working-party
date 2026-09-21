#!/usr/bin/env bash
# Re-run Stage-edge freeze gates (423 lock → decide=pass → 201 unlock).
# Docs only helper — does not change Domain lock behavior.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec pnpm exec vitest run apps/api/tests/contract/stage-edge.test.ts \
  -t "stage_locked_blocks_downstream_dispatch|stage_unlock_after_gate_pass" \
  --reporter=verbose
