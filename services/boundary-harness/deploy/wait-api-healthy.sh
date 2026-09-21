#!/usr/bin/env bash
# api_8080_bind_no_blip (DevOps complementary gate)
#
# Wait until GET /health OR /healthz returns HTTP 200, then probe continuously
# for NO_BLIP_SECS (default 5) with no connection refused / reset.
#
# Exit 0 — first 200 + no-blip window clean
# Exit 1 — timeout waiting for first healthy / usage
# Exit 2 — blip after first healthy (refused, reset, or lost 200)
#
# TCP-open / first curl alone is NOT green. Empty-window ≤200ms is Backend H1
# (apps/api listen + vitest it "api_8080_bind_no_blip", cloud agent bc-cb490333).
set -euo pipefail

HOST="${API_HOST:-127.0.0.1}"
PORT="${API_PORT:-8080}"
NO_BLIP_SECS="${NO_BLIP_SECS:-5}"
WAIT_TIMEOUT_SECS="${WAIT_TIMEOUT_SECS:-60}"
PROBE_INTERVAL_SECS="${PROBE_INTERVAL_SECS:-0.2}"

if ! [[ "$NO_BLIP_SECS" =~ ^[0-9]+$ ]] || ! [[ "$WAIT_TIMEOUT_SECS" =~ ^[0-9]+$ ]]; then
  echo "wait-api-healthy: NO_BLIP_SECS and WAIT_TIMEOUT_SECS must be integers" >&2
  exit 1
fi

errf="$(mktemp)"
cleanup() { rm -f "$errf"; }
trap cleanup EXIT

is_blip_err() {
  grep -Eiq 'Connection refused|Connection reset by peer|Recv failure|Failed to connect|Empty reply from server' \
    "$errf" 2>/dev/null
}

# 0 = HTTP 200, 2 = refused/reset class, 1 = other failure
try_get() {
  local url="$1"
  local code ec
  : >"$errf"
  set +e
  code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 2 "$url" 2>"$errf")"
  ec=$?
  set -e
  if [[ "$ec" -eq 0 && "$code" == "200" ]]; then
    return 0
  fi
  if [[ "$ec" -eq 7 || "$ec" -eq 52 || "$ec" -eq 56 || "$code" == "000" ]] || is_blip_err; then
    return 2
  fi
  return 1
}

# 0 = /health or /healthz 200, 2 = blip-class, 1 = other
probe() {
  local ec
  set +e
  try_get "http://${HOST}:${PORT}/health"
  ec=$?
  set -e
  if [[ "$ec" -eq 0 ]]; then
    return 0
  fi
  set +e
  try_get "http://${HOST}:${PORT}/healthz"
  ec=$?
  set -e
  return "$ec"
}

echo "wait-api-healthy: waiting for /health|/healthz on ${HOST}:${PORT} (api_8080_bind_no_blip)"
deadline=$((SECONDS + WAIT_TIMEOUT_SECS))
while true; do
  set +e
  probe
  ec=$?
  set -e
  if [[ "$ec" -eq 0 ]]; then
    break
  fi
  if (( SECONDS >= deadline )); then
    echo "wait-api-healthy: timeout waiting for /health|/healthz on ${HOST}:${PORT}" >&2
    exit 1
  fi
  sleep "$PROBE_INTERVAL_SECS"
done

echo "wait-api-healthy: first 200; probing ${NO_BLIP_SECS}s no-blip (no refused/reset)"
end=$((SECONDS + NO_BLIP_SECS))
while (( SECONDS < end )); do
  set +e
  probe
  ec=$?
  set -e
  if [[ "$ec" -ne 0 ]]; then
    echo "wait-api-healthy: blip after first healthy (probe_ec=${ec}) — api_8080_bind_no_blip" >&2
    if [[ -s "$errf" ]]; then
      echo "wait-api-healthy: last curl stderr: $(tr '\n' ' ' <"$errf")" >&2
    fi
    exit 2
  fi
  sleep "$PROBE_INTERVAL_SECS"
done

echo "wait-api-healthy: ok (${NO_BLIP_SECS}s continuous /health|/healthz 200, no refused/reset)"
