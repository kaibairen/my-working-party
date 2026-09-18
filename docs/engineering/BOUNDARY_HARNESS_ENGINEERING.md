# Boundary Harness 工程方案 v0.1

> 仓库：`kaibairen/my-working-party`  
> 产品对齐：`docs/product/AGENT_DELIVERY_HARNESS_PRD.md`  
> 形态：**独立微服务**（自有 API + DB），通过适配器连接 Grok Bot / Cursor 等 runtime  
> 日期：2026-09-19  
> 状态：工程草案
>
> **M0 实现已落本仓**（`apps/` + `packages/`，见 README `## Harness M0`）。权威冻结稿：[`docs/product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md`](../product/BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md)。冲突以权威 PRD MUST 为准；本文件为历史工程草案。

---

## 1. 目标与非目标

### 1.1 目标
1. 提供 Goal / Assignment / Gate / Run / Evidence 的**状态真源**。  
2. 在不扼杀 Bot 自主性的前提下，提供 **Autonomy Dial、authority_gate、Ready 谓词、稀疏 HITL**。  
3. 通过适配器驱动 Cursor Cloud Agents、（可选）Grok Bot 消息/群，而不是重做 Agent 运行时。  
4. MVP 可单进程交付；接口按多服务边界划分，便于后续拆分。

### 1.2 非目标
- 不实现 LLM tool-loop / 电脑操控（那是 Grok Bot / Cursor）。  
- 不做对话图画编排引擎。  
- 不以画布为开工前置。  
- 第一版不接 Temporal（可用 DB 状态机；预留工作流接口）。

---

## 2. 系统上下文

```
                 ┌──────────────┐
  决策人 / 协调Bot │  Web UI/CLI  │
                 └──────┬───────┘
                        │ HTTPS / SSE
                 ┌──────▼───────────────────┐
                 │   Boundary Harness API    │
                 │   (独立微服务)             │
                 └──────┬───────────────────┘
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   Cursor Cloud    Bot Messaging   GitHub/CI
   Agents API      (webhook/DM)    (Ready 输入)
          │             │
          ▼             ▼
     Cloud VM Run    Grok Bot 执行
```

**原则：** Harness **拥有交付状态**；Runtime **拥有执行循环**。

---

## 3. 逻辑架构（模块 = 未来可拆服务）

| 模块 | 职责 | MVP |
|------|------|-----|
| **Gateway** | Auth、RBAC、速率限制、审计入口 | 同进程 |
| **Domain API** | Goal/Assignment/Gate/Run CRUD + 命令 | 同进程 |
| **Policy / Dial** | authority_gate 白名单、预算、改道反馈协议 | 同进程 |
| **Ready Engine** | 谓词求值、证据校验、规范化降级 | 同进程 |
| **Dispatcher** | 认领 Assignment → 调 Adapter 创建 Run | 同进程 + worker |
| **Adapters** | Cursor、Noop、（可选）BotNotify | 插件目录 |
| **Notifier** | Gate 卡 / 例外 → Webhook、Bot DM、SSE | 同进程 |
| **Projection** | 只读看板/画布 JSON（非主路径） | 同进程 |
| **Worker** | 轮询 Run 状态、拉 artifacts/usage | 同进程后台任务 |

后期可按虚线拆成：`api` / `worker` / `ready` 三个部署单元。

---

## 4. 领域模型与存储

### 4.1 核心实体（Postgres 推荐；MVP 可用 SQLite）

```text
pools                 执行池（cursor_account | bot_group | noop）
goals                 意图 + mode(explore|deliver) + dispatch_policy
goal_gates            门禁定义（模板实例）+ ready_predicate_id
assignments           填充单元：goal_id + pool_id + brief_json + budget
runs                  一次尝试：assignment_id + adapter_ref + status + usage
evidence_items        artifact 指针 / CI 结果 / 截图 URI
gate_decisions        人的 pass|revise|defer + actor + reason
policy_events         dial block/redirect/escalate 审计
audit_log             追加写
```

### 4.2 关键字段约束

**goals**
- `mode`: `explore` | `deliver`
- `dispatch_policy`: `coordinator_only`（默认）| `human_allowed`（Gate 例外）
- `gate_template_id`: nullable；explore 可空

**assignments.brief_json**（schema 校验）
```json
{
  "outcome": "string",
  "constraints": ["..."],
  "evidence_shape": ["pr", "report_md", "screenshot"],
  "budget": { "max_tokens": 0, "max_usd": 0, "max_runs": 3 }
}
```
**禁止**字段：`steps`, `script`, `must_path`（API 层直接 422）。

**runs.status**
`queued → dispatched → running → succeeded|failed|cancelled → (evidence_attached)`

**gates.status**
`pending → ready → decided`（仅 Ready 为真时进 ready）

### 4.3 Ready 谓词（数据驱动）

```json
{
  "id": "pr_green_v1",
  "all": [
    { "type": "github_pr", "is_draft": false },
    { "type": "github_checks", "conclusion": "success" },
    { "type": "evidence_present", "kinds": ["summary_md"] }
  ]
}
```
求值器纯函数；失败返回缺失列表（给人/Bot 改道，不空转聊天）。

---

## 5. API 设计（REST + SSE）

Base: `/v1`  
Auth: Bearer（个人 token / 服务账号）；协调 Bot 用 `role=coordinator`。

### 5.1 Goals
- `POST /goals` — 创建（Bot 或人）
- `GET /goals/{id}`
- `PATCH /goals/{id}` — 改 mode/模板（受策略限制）

### 5.2 Assignments（填充）
- `POST /goals/{id}/assignments` — **默认要求 coordinator 角色**；人调用需 `goals.dispatch_policy=human_allowed` 或走 Gate 例外 token
- `POST /assignments/{id}/propose` — 执行 Bot 提议拆分；入 `proposed`，经策略校验变 `queued`
- `POST /assignments/{id}/dispatch` — 创建 Run（idempotent key）

### 5.3 Runs
- `GET /runs/{id}`
- `POST /runs/{id}/cancel`
- `POST /runs/{id}/evidence` — 挂证据（adapter/worker 也可写）

### 5.4 Gates（稀疏 HITL）
- `GET /gates?status=ready` — 决策人收件箱
- `POST /gates/{id}/decide` — `{ decision: pass|revise|defer, note }`
- `GET /events/stream` — SSE：gate.ready / run.failed / budget.exceeded

### 5.5 Policy
- `POST /policy/check` — Dial 预检（adapter 调用前）
- 返回：`allow` | `redirect_hint` | `require_gate` | `deny`

### 5.6 Projection（只读）
- `GET /projections/canvas?goal_id=` — 画布 JSON；**无写接口**

### 5.7 Webhooks（入站）
- `POST /hooks/github` — PR/check 变更 → 重算 Ready  
- `POST /hooks/cursor` —（若有）run 完成回调；否则 worker 轮询 API

---

## 6. 适配器契约

```ts
interface RuntimeAdapter {
  id: string;
  dispatch(input: {
    assignmentId: string;
    brief: Brief;
    poolCredentialsRef: string;
    idempotencyKey: string;
  }): Promise<{ externalRunId: string }>;
  getStatus(externalRunId: string): Promise<RunSnapshot>;
  cancel?(externalRunId: string): Promise<void>;
  fetchArtifacts?(externalRunId: string): Promise<EvidenceDraft[]>;
}
```

### 6.1 CursorAdapter（MVP 必做）
- 使用 [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints)：create agent/run、follow-up、usage、artifacts。  
- Pool = `api_key` 密文引用（KMS/本地 secret store，不进 DB 明文）。  
- Worker：每 5–15s 拉状态；完成则写 evidence + 触发 Ready。

### 6.2 BotNotifyAdapter（MVP 可选）
- 出站：Gate ready / 例外 → Webhook 到用户指定端（或未来 Grok Bot 插件）。  
- **不**通过聊天推进状态机。

### 6.3 NoopAdapter
- 本地联调：假 Run，手动 `POST evidence`。

---

## 7. 关键运行时序

### 7.1 协调 Bot 填充并开跑
1. `POST /goals`（mode=explore|deliver）  
2. `POST /goals/{id}/assignments`（coordinator）  
3. `POST /assignments/{id}/dispatch`  
4. Dispatcher → `policy.check` → CursorAdapter.dispatch  
5. Worker 跟踪 → evidence → Ready  
6. 若 deliver 且谓词真 → `gate.ready` SSE/Webhook  
7. 人 `decide` → 状态推进 / 生成 revise Assignment

### 7.2 越界改道（Guided）
1. Adapter 或 Bot 调用 `policy.check`  
2. 命中白名单 → `redirect_hint`（结构化原因）  
3. 调用方换安全路径；连续 N 次失败 → `require_gate` / 升人  
4. 全程写 `policy_events`

### 7.3 人扇出（例外）
1. 人请求创建 Assignment → 403 + 提示需 Gate 例外  
2. 或 Goal 已 `dispatch_policy=human_allowed`  
3. 审计标记 `actor=human_exception`

---

## 8. 技术选型（建议）

| 层 | MVP 建议 | 备注 |
|----|----------|------|
| 语言 | TypeScript (Node 22) 或 Go | TS 便于 JSON schema / 快速迭代 |
| API | Hono / Fastify 或 Go chi | OpenAPI 先行 |
| DB | SQLite → Postgres | 迁移用 Drizzle/Prisma 或 golang-migrate |
| 队列 | 进程内 + DB `outbox` | 后期 Redis/NATS |
| 校验 | Zod / JSON Schema | brief 禁字段 |
| 密钥 | age/SOPS 或云 KMS + `pools.secret_ref` | |
| 前端 | 极简：Gate Inbox + Roster；画布用 React Flow **只读** | 可第二迭代 |
| 观测 | OpenTelemetry + 结构化日志；usage 按 run 聚合 | |
| 部署 | 单容器 Docker；Compose 含 postgres | |

---

## 9. 仓库与目录（建议新建服务仓或 monorepo 子目录）

```text
boundary-harness/
  apps/api/                 # Gateway + Domain + Ready + Notifier
  apps/worker/              # 可先与 api 同二进制 --mode=worker
  packages/domain/          # 实体、谓词、brief schema
  packages/adapters-cursor/
  packages/adapters-noop/
  packages/policy/
  web/                      # Gate inbox（可选）
  openapi/openapi.yaml
  deploy/docker-compose.yml
  docs/                     # 链回 my-working-party PRD
```

本工程方案文档可先落在 `my-working-party/docs/engineering/`；实现仓可随后拆出。

---

## 10. 安全与多租户

1. Pool 凭证永不明文返回；仅 `secret_ref`。  
2. RBAC：`decision_maker` / `coordinator` / `executor` / `viewer`。  
3. Webhook 验签（HMAC）。  
4. `authority_gate` 服务端强制；客户端可预检但不能绕过。  
5. Freeze 档：拒新 dispatch。  
6. 审计日志只追加。

---

## 11. 配置（12-factor）

```bash
DATABASE_URL=
AUTH_JWT_SECRET=
CURSOR_POOLS_JSON=          # 或单池 CURSOR_API_KEY via secret manager
WEBHOOK_SIGNING_SECRET=
DIAL_DEFAULT=guided
REDIRECT_FAIL_THRESHOLD=3
READY_POLL_SECONDS=10
NOTIFY_WEBHOOK_URL=         # 可选：推到 Bot/IM
```

---

## 12. MVP 里程碑

### M0 — 骨架（约 1 周）
- OpenAPI + SQLite + Goal/Assignment/Run CRUD  
- NoopAdapter + 手动 evidence + 一个硬编码 Ready 谓词  
- Gate decide API + SSE  

### M1 — Cursor 真跑（约 1–2 周）
- CursorAdapter + worker 轮询  
- Pool secret_ref  
- Guided 白名单 policy.check  
- brief schema 拒绝 steps  

### M2 — 稀疏人机与投影（约 1 周）
- Gate Inbox 极简 Web  
- GitHub webhook → Ready  
- 只读 canvas projection  
- usage/花费按 run  

### M3 — Bot 协作
- coordinator 角色 token  
- propose→validate→queue  
- Notifier → 用户指定 webhook（对接 Grok Bot 侧插件/例程，若有）

**成功标准（M1）：** 同一交付对比纯聊天编排，决策主会话 token 显著下降；执行侧仍能自主换路径完成。

---

## 13. 测试策略

- **契约测试**：OpenAPI + brief 禁字段  
- **谓词单测**：纯函数表驱动  
- **Policy 单测**：白名单内外、改道计数升人  
- **Adapter 契约**：用录制的 Cursor fixture / Noop  
- **E2E**：M1 起一条 goal→assignment→fake/real run→gate  

---

## 14. 与产品原则的工程映射

| 产品原则 | 工程落点 |
|----------|----------|
| Harness ≠ Jail | policy 白名单窄；路径自由 |
| SoT 不在聊天 | 全部写 DB；Notifier 只推事件 |
| Assignment 才是填充 | 唯一 write 填充 API |
| 扇出默认协调 Bot | RBAC + dispatch_policy |
| explore/deliver | gate_template 可空 |
| 画布非前置 | projection 只读、dispatch 不依赖 UI |
| authority vs advisory | 两套 API/字段，不可混用 |
| 可删脚手架 | 谓词/模板版本化；feature flag |

---

## 15. 开放工程决策（需拍板）

1. 实现语言：TS vs Go？  
2. 首仓：继续写在 `my-working-party` 还是新建 `boundary-harness`？  
3. 前端 M2 是否要做，还是先 API-only？  
4. Grok Bot 通知：先通用 Webhook，还是等官方插件面？  

---

## 变更记录

| 版本 | 说明 |
|------|------|
| v0.1 | 首版完整工程方案：独立微服务、模块、数据、API、适配器、MVP |
