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
# (apps/api listen + vitest it "api_8080_bind_no_blip", bc-cb490333).
# Do not enable `set -e` here: probe helpers return 1/2 on purpose.
set -uo pipefail

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

# Prints HTTP code (000 on connect failure). Always exits 0.
http_code() {
  local url="$1"
  : >"$errf"
  curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 2 "$url" 2>"$errf" || true
}

# 0 = /health or /healthz 200
# 2 = refused / reset / curl 000
# 1 = other non-200
probe() {
  local code
  code="$(http_code "http://${HOST}:${PORT}/health")"
  if [[ "$code" == "200" ]]; then
    return 0
  fi
  if [[ "$code" == "000" ]] || is_blip_err; then
    code="$(http_code "http://${HOST}:${PORT}/healthz")"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    return 2
  fi
  code="$(http_code "http://${HOST}:${PORT}/healthz")"
  if [[ "$code" == "200" ]]; then
    return 0
  fi
  if [[ "$code" == "000" ]] || is_blip_err; then
    return 2
  fi
  return 1
}

now_s() { date +%s; }

echo "wait-api-healthy: waiting for /health|/healthz on ${HOST}:${PORT} (api_8080_bind_no_blip)"
deadline=$(( $(now_s) + WAIT_TIMEOUT_SECS ))
while true; do
  if probe; then
    break
  fi
  if (( $(now_s) >= deadline )); then
    echo "wait-api-healthy: timeout waiting for /health|/healthz on ${HOST}:${PORT}" >&2
    exit 1
  fi
  sleep "$PROBE_INTERVAL_SECS"
done

echo "wait-api-healthy: first 200; probing ${NO_BLIP_SECS}s no-blip (no refused/reset)"
end=$(( $(now_s) + NO_BLIP_SECS ))
while (( $(now_s) < end )); do
  if ! probe; then
    echo "wait-api-healthy: blip after first healthy — api_8080_bind_no_blip" >&2
    if [[ -s "$errf" ]]; then
      echo "wait-api-healthy: last curl stderr: $(tr '\n' ' ' <"$errf")" >&2
    fi
    exit 2
  fi
  sleep "$PROBE_INTERVAL_SECS"
done

echo "wait-api-healthy: ok (${NO_BLIP_SECS}s continuous /health|/healthz 200, no refused/reset)"
