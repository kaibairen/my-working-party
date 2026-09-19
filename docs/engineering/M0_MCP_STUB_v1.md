# Boundary Harness M0 MCP Stub v1（Bridge 对齐稿）

> 对齐：权威 PRD §8 MCP M1 · `M0_SCHEMA_v1.md` · APPENDIX_RBAC  
> 进程：`boundary-harness --mode=mcp` → 仅调本服务 HTTPS `/v1`  
> **状态：HarnessBridge 放行 · 2026-09-19**  
> 开仓后落 `apps/mcp-server`；工具名以下表**规范名为准**（斜杠别名仅兼容文档，实现只暴露左列）。

`mcp_stub_version = 1`

---

## 规范名（实现只注册这些）

| 规范名 | HTTP | RBAC | M0 行为 |
|--------|------|------|---------|
| `harness_create_goal` | `POST /goals` | coordinator+ | 真写 DB；缺 `coordinator_ref` → 422 |
| `harness_fill_assignment` | `POST /goals/{id}/assignments` | coordinator；人须有效 `exception_grant` | BriefV1 Zod；禁键 → `brief_forbidden_field`；budget → `budget_json` |
| `harness_dispatch` | `POST /assignments/{id}/dispatch` | **仅 coordinator**（+ service） | M0：NoopAdapter；写 run + 双 external id 占位可空；缺 coordinator_ref 拒 |
| `harness_attach_evidence` | `POST /runs/{id}/evidence` | executor \| service | EvidenceKind 枚举；`shadow` 可选；**唯一完成入口** |
| `harness_get_run` | `GET /runs/{id}` | 已授权 | **advisory**；不得当 Gate ready 依据 |
| `harness_list_gates` | `GET /gates?status=ready` | decision_maker \| coordinator | 返回 GateInstance + `ready_result_json.missing[]` |
| `harness_decide_gate` | `POST /gates/{id}/decide` | **仅 decision_maker** | `pass\|revise\|defer` + version 乐观锁；409 冲突 |
| `harness_policy_check` | `POST /policy/check` | executor \| service \| adapter | 返回 allow \| redirect_hint \| require_gate \| deny；**advisory 不阻塞** |
| `harness_heartbeat` | `POST /agents/heartbeat` | coordinator \| executor \| service | 刷新 `last_heartbeat`；默认 `GET /desks` 只列出 TTL 内（默认 90s）的真实心跳，不含种子工位名 |

文档别名（不注册第二套工具）：  
`propose_assignment`→`fill_assignment` · `dispatch_assignment`→`dispatch` · `get_status`→`get_run` · `list_ready_gates`→`list_gates`。

HTTP 手套（`:8787/mcp`）只暴露规范名 + `harness_heartbeat`；stdio 仍带别名。完成写（dispatch / attach_evidence）须带 `x-harness-entry: mcp`（代理注入）。契约：[CONTRACT_MCP_ENTRY_DENY_v0](../../services/boundary-harness/docs/m4/CONTRACT_MCP_ENTRY_DENY_v0.md)。Dogfood：[DOGFOOD_GROKBOT_MCP_SOP](../../services/boundary-harness/docs/DOGFOOD_GROKBOT_MCP_SOP.md)。

---

## 禁止注册

`cursor_raw_*` · 任意 Cloud Agents HTTP 透传 · `set_steps` · 画布写 · 聊天 mark-done · 客户端直写 `assignment.status` 终态冒充 Gate。

---

## 输入草图（Zod 与 Domain 同源）

```ts
// create_goal
{ title: string, mode: 'explore'|'deliver', coordinator_ref: string,
  dispatch_policy?: 'coordinator_only'|'human_allowed', gate_template_id?: string|null }

// fill_assignment
{ goal_id: string, pool_id: string,
  brief: { outcome: string, constraints: string[], evidence_shape: EvidenceKind[] },
  budget: { max_usd?: number, max_tokens?: number, max_runs?: number },
  exception_grant_id?: string }

// dispatch
{ assignment_id: string, idempotency_key: string }

// attach_evidence
{ run_id: string, items: { kind: EvidenceKind, uri: string, sha256?: string, shadow?: boolean }[] }

// decide_gate
{ gate_instance_id: string, decision: 'pass'|'revise'|'defer',
  version: number, note?: string, structural_change?: boolean }

// policy_check
{ action: string, track?: string, context: Record<string, unknown> }
```

`EvidenceKind` = `pr|report_md|summary_md|screenshot|ci_check|artifact_uri`（与 M0 schema 一致）。

---

## M0 stub 验收

1. 八工具可列、可调；全部经 `/v1`，无直连 Cursor。  
2. brief 禁键 MCP 与 HTTP 同 422。  
3. executor 调 `dispatch` → 403。  
4. `attach_evidence` 后才可能 Ready；`get_run.succeeded` 不置 Gate ready。  
5. Path B：`shadow=true` 证据可挂，禁 decide/写 Gate。

---

## 与 Backend 接口

OpenAPI `/v1` 合入后，本 stub 的 path/字段以 OpenAPI 为源；冲突以 `M0_SCHEMA_v1` + 权威 PRD MUST 为准 bump `mcp_stub_version`。

