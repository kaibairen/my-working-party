# Boundary Harness (M0)

Domain API lives in this repo under `services/boundary-harness/` (no separate harness repo).

## Layout

```
apps/api/                 Hono + SQLite (node:sqlite) on :8080
packages/domain/          BriefV1, Ready, Dial/policy (track)
deploy/                   Dockerfile.api + docker-compose.m0.yml + migrations
openapi/openapi.yaml      M0 fragment
qa/a5/fourteen/           14 named ready-anti cases
```

## Commands

```bash
cd services/boundary-harness
npm install
npm test                  # unit + ready-anti (14) + security-anti (9)
npm start                 # API on :8080, applies 0001+0002 on boot
npx tsx apps/api/src/issue-token.ts --role coordinator --sub coord-1 --pools pool_noop
# or: npm run token -- --role coordinator --sub coord-1 --pools pool_noop
```

`GET /healthz` is unauthenticated and returns `{ ok, schema_version }`.

Local defaults (override in compose via secret files):

- `AUTH_JWT_SECRET` / `AUTH_JWT_SECRET_FILE`
- `WEBHOOK_SIGNING_SECRET` / `WEBHOOK_SIGNING_SECRET_FILE`
- `DATABASE_URL=file:./data/harness.m0.db`

`secret_ref` accepts only `file:` or `env:`. Resolved plaintext is never returned.

## Docker

```bash
cd services/boundary-harness/deploy
docker compose -f docker-compose.m0.yml build api
./secrets/bootstrap.sh          # only needed for `up`, not `build`
docker compose -f docker-compose.m0.yml up api
```

If CI cannot mount `./secrets/*`, `build api` still works; document the bootstrap step for `up`.

## Smoke (explore → assignment → noop → evidence → ready stub)

```bash
export TOKEN=$(npm run token --silent -- --role coordinator --sub coord-1 --pools pool_noop)
curl -sS http://127.0.0.1:8080/healthz
curl -sS -X POST http://127.0.0.1:8080/v1/goals \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"explore smoke","mode":"explore","coordinator_ref":"coord-1","gate_template_id":null}'
# then POST /v1/goals/{id}/assignments with BriefV1
# POST /v1/assignments/{id}/dispatch with Idempotency-Key
# POST /v1/runs/{id}/evidence (summary_md + artifact_uri)
# GET  /v1/goals/{id}/ready   # explore stub; Inbox stays empty (zero GateDef)
```

Automated equivalent: `apps/api/test/smoke.test.ts` (`smoke_explore_goal_assignment_noop_evidence_ready_stub`).
