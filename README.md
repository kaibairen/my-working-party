# my-working-party

grokbot 工作 画布 规划 状态

## 当前产品方案 / Current product scheme

正在研讨：**Boundary Harness（边界线束 / Agent Delivery Harness）** —— 控制面是 harness（护栏），不是 jail（监工）；约束爆炸半径，不约束智能本身。对齐 Grok Bot 的持久自主队友定位。

Under discussion: **Boundary Harness** — control plane as a harness, not a jail; fence the blast radius, not the intelligence. Aligns with Grok Bot autonomy.

**Short-drama product SoT** is [kaibairen/video-copilot](https://github.com/kaibairen/video-copilot). `services/boundary-harness/examples/drama/` is a deprecated pointer only — do not grow product features there. Harness ops stay in this repo. See [DRAMA_PRODUCT_SOT.md](services/boundary-harness/docs/dogfood/DRAMA_PRODUCT_SOT.md).

Canonical docs only (do not implement from older `*_DRAFT.md` or v0.1.x product titles):

- [docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md](docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md)（**AUTHORITATIVE**）
- [docs/product/APPENDIX_READY_PREDICATES_AND_GATE_ANTI_PATTERNS_v1.md](docs/product/APPENDIX_READY_PREDICATES_AND_GATE_ANTI_PATTERNS_v1.md)
- [docs/product/APPENDIX_RBAC_ACTION_MATRIX_v1.md](docs/product/APPENDIX_RBAC_ACTION_MATRIX_v1.md)
- [docs/engineering/BOUNDARY_HARNESS_TECH_IMPL_v1.md](docs/engineering/BOUNDARY_HARNESS_TECH_IMPL_v1.md)
- [docs/engineering/M0_SCHEMA_v1.md](docs/engineering/M0_SCHEMA_v1.md)
- [docs/engineering/M0_MCP_STUB_v1.md](docs/engineering/M0_MCP_STUB_v1.md)
- [docs/engineering/M0_SECURITY_FREEZE_v1.md](docs/engineering/M0_SECURITY_FREEZE_v1.md)
- [docs/engineering/BOUNDARY_HARNESS_ENGINEERING.md](docs/engineering/BOUNDARY_HARNESS_ENGINEERING.md)（supporting — historical engineering plan）
- [docs/product/research/control-plane-as-harness-brief.md](docs/product/research/control-plane-as-harness-brief.md)（supporting — research）

## Harness M0

**Path freeze (TechLead / DevOps):** the M0 monorepo lives only at **`services/boundary-harness/`**. Do **not** use a top-level `harness/` (or repo-root `apps/` / `packages/`) alternative. Canonical CI is [`.github/workflows/harness-m0.yml`](.github/workflows/harness-m0.yml) (`working-directory: services/boundary-harness`).

Implementation is in this repo (no separate `boundary-harness` GitHub project). Existing `docs/` stay. Spec: [docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md](docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md). Backend SoT: [openapi_m0_fragment.yaml](services/boundary-harness/openapi/openapi_m0_fragment.yaml), [0001_m0_schema.sql](services/boundary-harness/packages/domain/migrations/0001_m0_schema.sql), [0002_m0_security.sql](services/boundary-harness/packages/domain/migrations/0002_m0_security.sql). Test matrix: [docs/qa/M0_TEST_MATRIX_v1.md](docs/qa/M0_TEST_MATRIX_v1.md). Security freeze: [docs/engineering/M0_SECURITY_FREEZE_v1.md](docs/engineering/M0_SECURITY_FREEZE_v1.md). Security checklist: [docs/qa/HARNESSSECURITY_M0_SECURITY_CHECKLIST.md](docs/qa/HARNESSSECURITY_M0_SECURITY_CHECKLIST.md). Gate Inbox Playwright CDP: [docs/qa/GATE_INBOX_PLAYWRIGHT_CDP_v1.md](docs/qa/GATE_INBOX_PLAYWRIGHT_CDP_v1.md) (specs at `services/boundary-harness/apps/web/e2e/gate-inbox/`).

Frozen MUST: DB SoT; BriefV1 no steps (HTTP+MCP → `422 brief_forbidden_field`); GateDef/GateInstance; dual external ids; `advisory_hint` never blocks. M0 runtime is **Noop**. M1 Cursor adapter is fixture-mode unless `CURSOR_API_KEY` is set (MCP still MUST NOT expose `cursor_raw_*`).

| Path | Role |
|------|------|
| `services/boundary-harness/apps/api` | Domain HTTP + DM office `/` + Inbox `/inbox` + engineer `/ops` |
| `services/boundary-harness/apps/worker` | Outbox → webhook (`WEBHOOK_URL`) |
| `services/boundary-harness/apps/mcp-server` | stdio MCP + HTTP glove `:8787/mcp` (`pnpm dev:mcp-http`) |
| `services/boundary-harness/packages/*` | domain, policy, ready, adapters-noop, adapters-cursor |
| `services/boundary-harness/docker-compose.yml` | `docker compose up api` |

**Decision-maker:** http://127.0.0.1:8080/ (**AI 办公室** — 目标列表 + 新建目标 + 填充槽含「我来填」+ 只读 **工位心跳**). Inbox / 待我拍板 is a top-bar **drawer** (`待办 · n`); http://127.0.0.1:8080/inbox stays loadable. Roster is presence only (在忙 / 等证据 / 空闲；心跳 TTL 90s) — not dispatch. Bot completion writes (dispatch / evidence) require `X-Harness-Entry: mcp` (MCP proxy injects it). Health / OpenAPI / outbox stay on http://127.0.0.1:8080/ops (403 for `decision_maker`). AUTHORITATIVE IA: [OFFICE_HOME_IA_P0_v1.md](services/boundary-harness/docs/experience/OFFICE_HOME_IA_P0_v1.md). Dogfood SOP: [DOGFOOD_GROKBOT_MCP_SOP.md](services/boundary-harness/docs/DOGFOOD_GROKBOT_MCP_SOP.md).

M1: CursorAdapter (fixture / `CURSOR_API_STUB` / live `POST /v1/agents` with `repos[]` + `source.repository`), Dial freeze → **423** `dial_frozen`, BriefV1 422 on HTTP+MCP, dual external ids, FINISHED≠IDLE. Worker polls Cursor until `FINISHED`, writes `usage.cursor_lifecycle`, re-evals Ready. MCP aliases from PRD §8; no `cursor_raw_*` / `set_steps`. Live repo: `CURSOR_REPOSITORY` (default this GitHub repo).
M3: outbox exactly-once attempts + HMAC-SHA256 outbound (`X-Harness-Signature` / `X-Harness-Timestamp`). SSE `/v1/events` replays from `Last-Event-ID`.

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
# Completion writes require X-Harness-Entry: mcp (MCP proxy injects this).
AID=$(printf '%s' "$ASG" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
RUN=$(curl -sS -X POST http://127.0.0.1:8080/v1/assignments/$AID/dispatch \
  -H "$H" -H "$A" -H 'X-Harness-Entry: mcp' -H 'content-type: application/json' \
  -d '{"idempotency_key":"m0-1"}')

# 4) Evidence (unique completion entry). run.succeeded alone does not make a Gate ready.
RID=$(printf '%s' "$RUN" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
curl -sS -X POST http://127.0.0.1:8080/v1/runs/$RID/evidence \
  -H 'X-Harness-Role: executor' -H 'X-Harness-Actor: exec-1' -H 'X-Harness-Entry: mcp' -H 'content-type: application/json' \
  -d '{"items":[{"kind":"summary_md","uri":"file://summary.md"},{"kind":"artifact_uri","uri":"file://out.tgz"}]}'

# 5) Inbox: list ready GateInstance, then decide (decision_maker + version lock)
curl -sS 'http://127.0.0.1:8080/v1/gates?status=ready' \
  -H 'X-Harness-Role: decision_maker' -H 'X-Harness-Actor: dm-1'
```

Auth: Bearer JWT claims `sub,role,pool_ids,iat,exp` (optional `tid`). Compatibility headers: `X-Harness-Role` (`decision_maker|coordinator|executor|viewer|service`) and `X-Harness-Actor`. Admin freeze: `POST/GET /v1/admin/freeze` (decision_maker|service); new dispatch returns **423** `freeze_active`. Inbound hooks require HMAC-SHA256 (`X-Harness-Signature` / `X-Harness-Timestamp`, skew ±300s). `secret_ref` is `file:` or `env:` only.

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:e2e:inbox   # GATE_INBOX_PLAYWRIGHT_CDP_v1 (ready / decide+409 / missing[] / 禁口头 done)
```
