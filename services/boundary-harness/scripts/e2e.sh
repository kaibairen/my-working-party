#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${E2E_BASE_URL:-http://127.0.0.1:8080}"
OUT="${ROOT}/artifacts/e2e"
mkdir -p "$OUT"
LOG="$OUT/http.log"
: > "$LOG"

req() {
  local name="$1"; shift
  echo "=== $name ===" | tee -a "$LOG"
  curl -sS -D "$OUT/${name}.headers" -o "$OUT/${name}.body" "$@" | tee -a "$LOG" || true
  echo | tee -a "$LOG"
  echo "--- request $* ---" >> "$LOG"
  cat "$OUT/${name}.headers" >> "$LOG"
  echo >> "$LOG"
  cat "$OUT/${name}.body" >> "$LOG"
  echo >> "$LOG"
  python3 -m json.tool < "$OUT/${name}.body" > "$OUT/${name}.json" 2>/dev/null || cp "$OUT/${name}.body" "$OUT/${name}.json"
}

H=(-H 'X-Harness-Role: coordinator' -H 'X-Harness-Actor: coord-1' -H 'X-Harness-Entry: mcp' -H 'content-type: application/json')

req health -X GET "$BASE/health"
req openapi -X GET "$BASE/openapi.yaml"

req goal -X POST "$BASE/v1/goals" "${H[@]}" \
  -d '{"title":"M0 e2e","mode":"deliver","coordinator_ref":"coord-1"}'
GID=$(python3 -c 'import json;print(json.load(open("'"$OUT"'/goal.json"))["id"])')

req assignment -X POST "$BASE/v1/goals/$GID/assignments" "${H[@]}" \
  -d '{"pool_id":"pool_noop","brief":{"outcome":"working M0","constraints":["no Cursor"],"evidence_shape":["summary_md","artifact_uri"]},"budget":{"max_runs":1}}'
AID=$(python3 -c 'import json;print(json.load(open("'"$OUT"'/assignment.json"))["id"])')

req dispatch -X POST "$BASE/v1/assignments/$AID/dispatch" "${H[@]}" \
  -d '{"idempotency_key":"e2e-script"}'
RID=$(python3 -c 'import json;print(json.load(open("'"$OUT"'/dispatch.json"))["id"])')

req evidence -X POST "$BASE/v1/runs/$RID/evidence" \
  -H 'X-Harness-Role: executor' -H 'X-Harness-Actor: exec-1' -H 'X-Harness-Entry: mcp' -H 'content-type: application/json' \
  -d '{"items":[{"kind":"summary_md","uri":"file://summary.md"},{"kind":"artifact_uri","uri":"file://out.tgz"}]}'

req gates -X GET "$BASE/v1/gates?status=ready" \
  -H 'X-Harness-Role: decision_maker' -H 'X-Harness-Actor: dm-1'
GATE=$(python3 -c 'import json;print(json.load(open("'"$OUT"'/gates.json"))["gates"][0]["id"])')
VER=$(python3 -c 'import json;print(json.load(open("'"$OUT"'/gates.json"))["gates"][0]["version"])')

req decide -X POST "$BASE/v1/gates/$GATE/decide" \
  -H 'X-Harness-Role: decision_maker' -H 'X-Harness-Actor: dm-1' -H 'content-type: application/json' \
  -d "{\"decision\":\"pass\",\"version\":$VER}"

python3 - <<PY
import json
from pathlib import Path
out = Path("$OUT")
run = json.loads((out/"dispatch.json").read_text())
assert run["external_agent_id"] and run["external_run_id"], run
gate = json.loads((out/"decide.json").read_text())
assert gate["gate"]["status"] == "decided", gate
print("e2e ok", run["id"], gate["gate"]["id"])
PY
