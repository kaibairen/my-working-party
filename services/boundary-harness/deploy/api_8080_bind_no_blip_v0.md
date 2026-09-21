# api_8080_bind_no_blip_v0

Repo-root `devops/incidents/` was not present. This file is the deploy-side SoT
for the DevOps wait/health half of `api_8080_bind_no_blip`. Backend H1
(early listen) lives in `apps/api/src/index.ts` + `server.ts`.

## H1 (Backend) — primary

`startApiServer` binds and serves `GET /health` + `/healthz` **before**
`createHarness` / applySchema. Empty window ≤200ms. `EADDRINUSE` → structured
JSON log + exit 2 (never unhandled crash).

## H2 (Compose) — host port before Node listen

Compose maps `host:8080` before Node listen → first host curl can RST.
Do **not** curl the host port until the container is **healthy**.

Healthcheck (`docker-compose.yml` and `deploy/docker-compose.m0.yml`):

- `wget /health || wget /healthz`
- interval 2s / timeout 2s / retries 15 / start_period 15s

## H3 (Crash)

Unhandled `EADDRINUSE` used to kill the process. Structured exit 2 + log.

## Wait script

`deploy/wait-api-healthy.sh` (executable)

- Env: `BASE` `TIMEOUT_SECS` `NO_BLIP_SECS` (default 5)
- Wait until `/health` or `/healthz` is 200
- Then probe for `NO_BLIP_SECS`; refused/reset → exit 2

## CI

`.github/workflows/harness-m0.yml` job `compose-smoke`:

1. `docker compose up -d --build api`
2. Wait until container **healthy**
3. `bash deploy/wait-api-healthy.sh` with `NO_BLIP_SECS=5`
