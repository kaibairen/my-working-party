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

M0 lives **in this repo** (`apps/`, `packages/`). Existing `docs/` are unchanged; implementation follows the **AUTHORITATIVE** PRD, not older drafts.

**Authoritative spec:** [docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md](docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md)

Frozen MUST for this slice: DB is SoT; BriefV1 has no steps/script/must_path (HTTP and MCP share one validator → `422 brief_forbidden_field`); GateDef / GateInstance are separate; runs persist `external_agent_id` + `external_run_id`; `advisory_hint` never blocks dispatch / Run / Ready; **Noop adapter only** (no Cursor).

| Path | Role |
|------|------|
| `apps/api` | Domain HTTP (`HARNESS_MODE=api\|all`) |
| `apps/worker` | Outbox publisher (`gate.ready`) |
| `apps/mcp-server` | 8-tool MCP stub → `/v1` |
| `packages/domain` | Drizzle/SQLite schema + services |
| `packages/policy` | `track`: `authority_gate` \| `advisory_hint` |
| `packages/ready` | `safety_only_v1` + `deliver_ready_v1` |
| `packages/adapters-noop` | M0 runtime |
| `openapi/openapi.yaml` | `/v1` contract |
| `deploy/docker-compose.yml` | local compose |

### Quickstart (goal → assignment → noop → evidence → gate)

```bash
corepack enable
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
