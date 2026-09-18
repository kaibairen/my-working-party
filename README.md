# my-working-party

grokbot 工作 画布 规划 状态

## 当前产品方案 / Current product scheme

正在研讨：**Boundary Harness（边界线束 / Agent Delivery Harness）** —— 控制面是 harness（护栏），不是 jail（监工）；约束爆炸半径，不约束智能本身。对齐 Grok Bot 的持久自主队友定位。

Under discussion: **Boundary Harness** — control plane as a harness, not a jail; fence the blast radius, not the intelligence. Aligns with Grok Bot autonomy.

Canonical docs only (do not implement from older `*_DRAFT.md` or v0.1.x product titles):

- [docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md](docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md)（**AUTHORITATIVE**）
- [docs/product/APPENDIX_READY_PREDICATES_AND_GATE_ANTI_PATTERNS_v1.md](docs/product/APPENDIX_READY_PREDICATES_AND_GATE_ANTI_PATTERNS_v1.md)
- [docs/product/APPENDIX_RBAC_ACTION_MATRIX_v1.md](docs/product/APPENDIX_RBAC_ACTION_MATRIX_v1.md)
- [docs/engineering/BOUNDARY_HARNESS_TECH_IMPL_v1.md](docs/engineering/BOUNDARY_HARNESS_TECH_IMPL_v1.md)
- [docs/engineering/M0_SCHEMA_v1.md](docs/engineering/M0_SCHEMA_v1.md)
- [docs/engineering/M0_MCP_STUB_v1.md](docs/engineering/M0_MCP_STUB_v1.md)
- [docs/engineering/BOUNDARY_HARNESS_ENGINEERING.md](docs/engineering/BOUNDARY_HARNESS_ENGINEERING.md)（supporting — historical engineering plan）
- [docs/product/research/control-plane-as-harness-brief.md](docs/product/research/control-plane-as-harness-brief.md)（supporting — research）

## Harness M0

**Path freeze (TechLead / DevOps):** the M0 monorepo lives only at **`services/boundary-harness/`**. Do **not** use a top-level `harness/` (or repo-root `apps/` / `packages/`) alternative. Canonical CI is [`.github/workflows/harness-m0.yml`](.github/workflows/harness-m0.yml) (`working-directory: services/boundary-harness`).

Implementation is in this repo (no separate `boundary-harness` GitHub project). Existing `docs/` stay. Spec: [docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md](docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md). Test matrix: [docs/qa/M0_TEST_MATRIX_v1.md](docs/qa/M0_TEST_MATRIX_v1.md). Security checklist: [docs/qa/HARNESSSECURITY_M0_SECURITY_CHECKLIST.md](docs/qa/HARNESSSECURITY_M0_SECURITY_CHECKLIST.md).

Frozen MUST: DB SoT; BriefV1 no steps (HTTP+MCP → `422 brief_forbidden_field`); GateDef/GateInstance; dual external ids; `advisory_hint` never blocks. M0 runtime is **Noop**. M1 Cursor adapter is fixture-mode unless `CURSOR_API_KEY` is set (MCP still MUST NOT expose `cursor_raw_*`).

| Path | Role |
|------|------|
| `services/boundary-harness/apps/api` | Domain HTTP + Gate Inbox `/inbox` + `/ops` |
| `services/boundary-harness/apps/worker` | Outbox → webhook (`WEBHOOK_URL`) |
| `services/boundary-harness/apps/mcp-server` | 8-tool MCP stub |
| `services/boundary-harness/packages/*` | domain, policy, ready, adapters-noop, adapters-cursor |
| `services/boundary-harness/docker-compose.yml` | `docker compose up api` |

**Inbox URL:** http://127.0.0.1:8080/inbox (M2-preview). Health/OpenAPI: http://127.0.0.1:8080/ops

```bash
cd services/boundary-harness
docker compose up api
# or: pnpm install && pnpm dev:api
```

### Quickstart (goal → assignment → noop → evidence → gate)

```bash
corepack enable
cd services/boundary-harness
pnpm install
pnpm --filter @harness/api dev
# HARNESS_MODE=all (default in Docker) also runs the worker loop
```

```bash
export H='X-Harness-Role: coordinator'
export A='X-Harness-Actor: coord-1'

# 1) Goal (deliver binds deliver_ready_v1 GateDef)
GOAL=$(curl -sS -X POST http://127.0.0.1:8080/v1/goals \
  -H "$H" -H "$A" -H 'content-type: application/json' \
  -d '{"title":"M0 path","mode":"deliver","coordinator_ref":"coord-1"}')
echo "$GOAL"

# 2) Assignment — BriefV1 only; budget is stored on assignments.budget_json
ASG=$(curl -sS -X POST http://127.0.0.1:8080/v1/goals/$(printf '%s' "$GOAL" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')/assignments \
  -H "$H" -H "$A" -H 'content-type: application/json' \
  -d '{"pool_id":"pool_noop","brief":{"outcome":"working M0","constraints":["no Cursor"],"evidence_shape":["summary_md","artifact_uri"]},"budget":{"max_runs":1}}')

# 3) Dispatch → Noop run (dual external ids persisted; canvas is not required)
AID=$(printf '%s' "$ASG" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
RUN=$(curl -sS -X POST http://127.0.0.1:8080/v1/assignments/$AID/dispatch \
  -H "$H" -H "$A" -H 'content-type: application/json' \
  -d '{"idempotency_key":"m0-1"}')

# 4) Evidence (unique completion entry). run.succeeded alone does not make a Gate ready.
RID=$(printf '%s' "$RUN" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
curl -sS -X POST http://127.0.0.1:8080/v1/runs/$RID/evidence \
  -H 'X-Harness-Role: executor' -H 'X-Harness-Actor: exec-1' -H 'content-type: application/json' \
  -d '{"items":[{"kind":"summary_md","uri":"file://summary.md"},{"kind":"artifact_uri","uri":"file://out.tgz"}]}'

# 5) Inbox: list ready GateInstance, then decide (decision_maker + version lock)
curl -sS 'http://127.0.0.1:8080/v1/gates?status=ready' \
  -H 'X-Harness-Role: decision_maker' -H 'X-Harness-Actor: dm-1'
```

Auth headers: `X-Harness-Role` (`decision_maker|coordinator|executor|viewer|service`) and `X-Harness-Actor`.

```bash
pnpm lint
pnpm test
```
