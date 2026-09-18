# Boundary Harness 完整技术实现方案 v1.1-candidate

> 与权威 PRD v1.0-CANDIDATE.2 对齐。全文细节以 PRD MUST 为准。  
> 日期：2026-09-19

## 栈
TS + Hono/Fastify + Zod + Drizzle；仓 `boundary-harness`；文档 `my-working-party`。

## 进程
api · worker · mcp-server（可同二进制多 mode）

## 实体补丁（相对 v1.0-draft）
- GateDef / **GateInstance** 分离；Inbox 只用 Instance id + 乐观锁  
- runs: `external_agent_id` + `external_run_id` + `idempotency_key` + `dial_at_dispatch`  
- assignments: 权威 `budget_json`；brief 禁键表扩展  
- policy/check: 必带 `track: authority_gate|advisory_hint`  
- EvidenceKind（MVP 冻结）: `pr|report_md|summary_md|screenshot|ci_check|artifact_uri`；谓词 kinds ⊆ evidence_shape  
- exception_grant: 单 Goal、TTL、次数上限；写 audit；与 `human_allowed` 二选一开人扇出  
- goals: 必填 `coordinator_ref`；dispatch 前校验  

## MCP M1
见权威 PRD §8；禁止 cursor_raw / set_steps。

## CursorAdapter
见权威 PRD §8；FINISHED≠IDLE；SSE 优先；冲突 409 复用。

## Ready
版本化谓词 + github_snapshots；outbox 一次跳 ready。

## revise
默认同 Assignment 新 Run + autonomy_budget；structural_change 才新 Assignment。

## 决策人 UX
仅 Gate Inbox；Roster/时间线/canvas = 投影。

## M0 Security freeze（TechLead · 2026-09-19）
权威稿：[`M0_SECURITY_FREEZE_v1.md`](M0_SECURITY_FREEZE_v1.md)。写入 OpenAPI / Tech Impl；口头约定无效。

- Webhook **HMAC-SHA256**：`X-Harness-Signature: sha256=<hex>` + `X-Harness-Timestamp`；载荷 `{timestamp}.{raw_body}`；skew ±300s → 401 `webhook_skew`；验签失败 → 401 `webhook_bad_signature`；密钥 `WEBHOOK_SIGNING_SECRET` 不明文日志。
- Admin freeze：`POST/GET /v1/admin/freeze`（仅 decision_maker|service）；`enabled=true` 拒新 dispatch（含 MCP）→ **423** `freeze_active`。Goal dial `freeze` 仍为 403 `dial_frozen`，与 admin freeze 分立。
- `audit_log` 九列只追加：id, at, actor_sub, actor_role, action, resource_type, resource_id, request_id, payload_json。
- JWT claims：`sub,role,pool_ids,iat,exp`（可选 `tid`）；跨 pool → 403 `pool_forbidden`。
- `secret_ref` 仅 `file:` / `env:`；API 只回 URI，不回解析明文。

## 里程碑
M0–M3 同权威 PRD §9。
