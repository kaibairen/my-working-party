# HarnessSecurity · M0 安全清单

**受众：** 技术研讨 bot / Backend / OpenAPI  
**范围：** M0（API+SQLite+Noop+GateInstance+MCP stub）  
**原则：** 无臆造；未写入权威文的头名/错误码标为缺口  
**日期：** 2026-09-19（Asia/Shanghai）

Repo copy of the HarnessSecurity extract. OpenAPI + impl in this package must match MUST_OPENAPI.

## 摘要

| # | 控制项 | M0 必须落地 |
|---|--------|-------------|
| S1 | secret_ref | pools 非空；API/日志/证据永不回显明文 |
| S2 | Webhook HMAC | `WEBHOOK_SIGNING_SECRET`；入站未验签拒收；事件走 outbox（算法/头未冻） |
| S3 | RBAC | 五角色；`Authorization: Bearer`；403 角色不足 |
| S4 | 审计只追加 | audit_log / policy_events / gate_decisions 无改删 API |
| S5 | Freeze | dial 含 freeze；freeze 拒**新** dispatch；快照 `dial_at_dispatch` |
| S6 | Dial 白名单 | 仅五键 authority；advisory 不硬停/不建 Gate；policy 带 track |

## MUST_OPENAPI（本仓已落地）

- Bearer roles `decision_maker|coordinator|executor|viewer|service` → 不足 **403**
- `Pool.secret_ref` required；响应净化；禁止明文 credential 字段
- `POST /policy/check` → `decision`, `track`, `reason_code`, `redirect`
- track：`authority_gate|advisory_hint`
- 白名单五键：`external_send|protected_merge|over_budget|destructive_delete|privilege_escalation`
- `Run.dial_at_dispatch`：`free|guided|gated|freeze`
- freeze 拒新 dispatch → **403** `dial_frozen`（M0 provisional until appendix freezes the code）
- `goals.coordinator_ref` required
- decide + **409** optimistic lock
- audit / policy_events / gate_decisions append-only
- **422** `brief_forbidden_field`

## 待补冻（禁止各写各的）

1. HMAC 算法、签名头、编码、skew、失败 HTTP/code  
2. Freeze/Dial 设置 API 权威错误码（本仓 M0 使用 `POST /v1/goals/{id}/dial` + `dial_frozen`）  
3. `audit_log` 列级权威展开  
4. JWT claims  
5. `secret_ref` URI 方案
