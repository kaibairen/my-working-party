#!/usr/bin/env bash
# api_8080_bind_no_blip — wait until Domain /health is green, then probe for NO_BLIP_SECS.
# Complementary to Backend early-listen (H1). Refused/reset after first 200 → exit 2.
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:8080}"
TIMEOUT_SECS="${TIMEOUT_SECS:-60}"
NO_BLIP_SECS="${NO_BLIP_SECS:-5}"

probe() {
  local path="$1"
  local code
  if ! code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 2 "${BASE}${path}"); then
    local ec=$?
    # curl 7 = refused, 56 = reset
    if [[ "$ec" -eq 7 || "$ec" -eq 56 ]]; then
      return 2
    fi
    return 1
  fi
  if [[ "$code" == "200" ]]; then
    return 0
  fi
  return 1
}

deadline=$((SECONDS + TIMEOUT_SECS))
ready=0
while (( SECONDS < deadline )); do
  if probe /health || probe /healthz; then
    ready=1
    break
  fi
  sleep 0.2
done

if [[ "$ready" != "1" ]]; then
  echo "wait-api-healthy: timeout waiting for ${BASE}/health" >&2
  exit 1
fi

end=$((SECONDS + NO_BLIP_SECS))
while (( SECONDS < end )); do
  if ! probe /health && ! probe /healthz; then
    echo "wait-api-healthy: blip (refused/reset/non-200) after healthy — api_8080_bind_no_blip" >&2
    exit 2
  fi
  sleep 0.2
done

echo "wait-api-healthy: ok ${BASE} (no blip ${NO_BLIP_SECS}s)"
