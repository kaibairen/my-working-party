# Boundary Harness 完整技术实现方案 v1.0-draft

> 汇总全对话共识，供 **harness组** 研讨后与权威 PRD 一并冻结  
> 日期：2026-09-19（Asia/Shanghai）

---

## 0. 背景与结论摘要

我们要做的不是第二个 Grok Bot，而是：

**Boundary Harness**——独立微服务控制面：约束爆炸半径，不约束智能。

| 集成 | 方式 | 依赖官方新 SDK？ |
|------|------|------------------|
| 出站调度 Cursor | Cloud Agents HTTP API | 否（已有） |
| Bot 回写状态/证据 | MCP Server 或 Skill→HTTPS 调我们的 API | 否 |
| 通知人 | SSE / Webhook / Gate Inbox | 否 |

---

## 1. 产品硬约束（实现红线）

1. Harness ≠ Jail；默认 Dial=`guided`  
2. SoT = DB；聊天 ≠ 完成依据  
3. 填充 = Assignment（pool+brief）；Goal 带 `explore|deliver`  
4. 扇出默认仅 `coordinator`；人扇出 = Gate 例外  
5. Brief 禁止 `steps/script/must_path`  
6. `authority_gate` 与 `advisory_hint` 分轨  
7. 画布只读；**dispatch 不依赖 UI**  
8. Guided 白名单外行为只审计：外发、受保护合并、超预算、破坏性删除、提权  
9. Block → 先改道给 Runtime；N 次失败再升人  
10. 模型升级后删脚手架并对照测量  

---

## 2. 系统架构

```
[决策人 Gate Inbox / SSE]
[协调 Bot / 执行 Bot ──MCP──┐
                            ▼
                    Boundary Harness API
                    ├ Domain (Goal/Assign/Run/Gate)
                    ├ Policy/Dial
                    ├ Ready Engine
                    ├ Dispatcher
                    └ Notifier
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        Cursor Adapter  GitHub Hook   Webhook Out
              ▼
        Cloud Agent VM
```

---

## 3. 模块与进程

| 进程 | 职责 |
|------|------|
| `api` | REST+SSE+Hooks+AuthZ |
| `worker` | 轮询 Cursor Run、outbox、Ready 重算 |
| `mcp-server` | 工具面；内部调 api |

MVP 可单二进制 `--mode=api|worker|mcp`。

---

## 4. 数据模型（实现）

**表：** pools, goals, goal_gates, assignments, runs, evidence_items, gate_decisions, policy_events, audit_log, outbox

**goals：** id, title, mode, dispatch_policy(`coordinator_only`|`human_allowed`), gate_template_id?, status, created_by, timestamps  

**assignments：** id, goal_id, pool_id, brief_json, status(`proposed|queued|running|done|failed`), budget_json, risk  

**runs：** id, assignment_id, adapter, external_id, status, usage_json, error  

**brief_json schema（拒绝附加危险键）：**
```json
{
  "outcome": "string",
  "constraints": ["string"],
  "evidence_shape": ["pr","report_md","screenshot"],
  "budget": { "max_usd": 0, "max_tokens": 0, "max_runs": 3 }
}
```

---

## 5. HTTP API（OpenAPI 为契约源）

见工程方案；实现顺序：Goals → Assignments → dispatch → evidence → policy/check → gates → SSE → projections(只读) → github hook。

**RBAC：** decision_maker | coordinator | executor | viewer | service

---

## 6. MCP Tools（Grok Bot）

`harness_create_goal` · `harness_propose_assignment` · `harness_dispatch_assignment`(仅 coordinator token) · `harness_attach_evidence` · `harness_policy_check` · `harness_list_ready_gates` · `harness_get_status`

Skill：只描述触发条件与证据形态，禁止逐步剧本。

---

## 7. Cursor Adapter

1. policy.check  
2. create agent/run（idempotency key）  
3. worker poll → evidence + usage  
4. 触发 Ready  

密钥：`pools.secret_ref` → Secret Manager / env；API 永不回显。

---

## 8. Ready / Gate

- 谓词 DSL：all/any of github_pr、github_checks、evidence_present  
- explore：空链或 safety-only  
- deliver：可挂 G0–G5 模板  
- decide: pass|revise|defer → 写 gate_decisions；revise 生成新 Assignment  

---

## 9. 前端（M2）

- Gate Inbox（主）  
- Roster 只读状态  
- Canvas projection 只读（React Flow 可）  
- **无** assignment 拖拽写接口给普通人默认角色  

---

## 10. 技术栈建议（待 TechLead 拍板）

推荐 MVP：**TypeScript + Hono/Fastify + Drizzle + SQLite/Postgres + Zod + Docker Compose**。  
Go 亦可；二选一写进权威 PRD 附录。

---

## 11. 里程碑与验收

**M0** Noop+Gate+MCP stub+SQLite  
**M1** Cursor 真跑+Dial+brief 422  
**M2** Inbox+GitHub Ready+只读 canvas  
**M3** 生产通知与 coordinator 运营  

验收：  
1) 主会话无进度刷屏 2) MCP 可建 Goal/挂证据 3) steps→422 4) 非白名单不弹人 5) 无画布也能 dispatch  

---

## 12. 安全

HMAC webhooks · JWT RBAC · Freeze 拒 dispatch · 审计只追加 · 多 pool 隔离  

---

## 13. 开放决策（组内必须收敛）

1. 语言 TS vs Go  
2. 实现仓新建 vs monorepo  
3. M2 前端范围  
4. 通知：Webhook first  

