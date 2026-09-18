# HarnessSecurity · M0 安全清单

**受众：** 技术研讨 bot / Backend / OpenAPI  
**范围：** M0（API+SQLite+Noop+GateInstance+MCP stub）  
**原则：** 无臆造；未写入权威文的头名/错误码标为缺口  
**日期：** 2026-09-19（Asia/Shanghai）

Repo copy of the HarnessSecurity extract. OpenAPI + impl in this package must match MUST_OPENAPI.
TechLead freeze: [`../M0_SECURITY_FREEZE_v1.md`](../M0_SECURITY_FREEZE_v1.md).

## 摘要

| # | 控制项 | M0 必须落地 |
|---|--------|-------------|
| S1 | secret_ref | pools 非空；仅 `file:`/`env:`；API 永不回显解析明文 |
| S2 | Webhook HMAC | HMAC-SHA256；`X-Harness-Signature`/`X-Harness-Timestamp`；±300s；401 `webhook_skew` / `webhook_bad_signature` |
| S3 | RBAC / JWT | 五角色；JWT `sub,role,pool_ids,iat,exp`；跨 pool → 403 `pool_forbidden` |
| S4 | 审计只追加 | audit_log 九列；policy_events / gate_decisions 无改删 API |
| S5 | Freeze | `POST/GET /v1/admin/freeze`；新 dispatch **423** `freeze_active`；Goal dial freeze 仍为 403 `dial_frozen` |
| S6 | Dial 白名单 | 仅五键 authority；advisory 不硬停/不建 Gate；policy 带 track |

## MUST_OPENAPI（本仓已落地）

- Bearer JWT claims `sub,role,pool_ids,iat,exp`（可选 `tid`）→ 不足 **403**；跨 pool **403** `pool_forbidden`
- `Pool.secret_ref` required `file:`/`env:`；仅回 URI；禁止明文 credential 字段
- `POST /policy/check` → `decision`, `track`, `reason_code`, `redirect`
- track：`authority_gate|advisory_hint`
- 白名单五键：`external_send|protected_merge|over_budget|destructive_delete|privilege_escalation`
- `Run.dial_at_dispatch`：`free|guided|gated|freeze`
- Admin freeze 拒新 dispatch（含 MCP）→ **423** `freeze_active`
- Goal dial `freeze` → **403** `dial_frozen`
- `goals.coordinator_ref` required
- decide + **409** optimistic lock
- audit / policy_events / gate_decisions append-only（audit 九列）
- HMAC-SHA256 inbound hooks
- **422** `brief_forbidden_field`
