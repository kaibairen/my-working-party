#!/usr/bin/env bash
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
umask 077
[[ -f "$dir/auth_jwt_secret" ]] || printf 'dev-m0-jwt-secret-change-me\n' > "$dir/auth_jwt_secret"
[[ -f "$dir/webhook_signing_secret" ]] || printf 'dev-m0-webhook-secret-change-me\n' > "$dir/webhook_signing_secret"
[[ -f "$dir/cursor_pool_key" ]] || printf 'dev-m0-cursor-placeholder\n' > "$dir/cursor_pool_key"
[[ -f "$dir/postgres_password" ]] || printf 'dev-m0-postgres-placeholder\n' > "$dir/postgres_password"
echo "wrote placeholder secrets under $dir (gitignored)"
