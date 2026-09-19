> Implementation (this repo): `services/boundary-harness/` OpenAPI + domain. Working notes: `services/boundary-harness/docs/qa/HARNESSSECURITY_M0_SECURITY_CHECKLIST.md`.
> TechLead freeze: [`docs/engineering/M0_SECURITY_FREEZE_v1.md`](../engineering/M0_SECURITY_FREEZE_v1.md).

# HarnessSecurity · M0 安全清单

**受众：** 技术研讨 bot / Backend / OpenAPI  
**范围：** M0（API+SQLite+Noop+GateInstance+MCP stub）  
**原则：** 无臆造；未写入权威文的头名/错误码标为缺口  
**日期：** 2026-09-19（Asia/Shanghai）

## 摘要（可转发）

| # | 控制项 | M0 必须落地 | 关键出处 | 状态/风险 |
|---|--------|-------------|----------|-----------|
| S1 | secret_ref | pools 非空；仅 `file:`/`env:`；API 永不回显解析明文 | M0_SECURITY_FREEZE §5；M0_SCHEMA pools | 已冻 |
| S2 | Webhook HMAC | HMAC-SHA256；`X-Harness-Signature`/`X-Harness-Timestamp`；±300s；401 codes | M0_SECURITY_FREEZE §1 | 已冻 |
| S3 | RBAC / JWT | 五角色；JWT `sub,role,pool_ids,iat,exp`；跨 pool → 403 `pool_forbidden` | M0_SECURITY_FREEZE §4；附录 RBAC | 已冻 |
| S4 | 审计只追加 | audit_log 九列；policy_events / gate_decisions 无改删 API | M0_SECURITY_FREEZE §3 | 已冻 |
| S5 | Freeze | `POST/GET /v1/admin/freeze`；新 dispatch **423** `freeze_active`；dial 快照仍独立 | M0_SECURITY_FREEZE §2 | 已冻 |
| S6 | Dial 白名单 | 仅五键 authority；advisory 不硬停/不建 Gate；policy 带 track | PRD §5.4–5；附录 A | 已冻 |

**一句话：** M0 安全面以 TechLead `M0_SECURITY_FREEZE_v1` 为准，写入 OpenAPI / Tech Impl。

## MUST_OPENAPI（必进契约）

### 安全与身份
- `Authorization: Bearer` JWT claims `sub,role,pool_ids,iat,exp`（可选 `tid`）
- roles：`decision_maker|coordinator|executor|viewer|service`
- 403：角色不足 / 无人扇出例外 / 跨 pool `pool_forbidden`
- `goals.coordinator_ref` required
- `goals.dispatch_policy`：`coordinator_only|human_allowed`

### Pool / Secret
- `Pool.secret_ref` required；仅 `file:/…` 或 `env:VAR_NAME`
- API 可回 URI 字符串；永不回显解析明文
- 禁止明文 credential 字段

### Policy / Dial / Freeze
- `POST /policy/check` → `decision`,`track`,`reason_code`,`redirect`
- `track`：`authority_gate|advisory_hint`
- Dial 白名单五键：`external_send|protected_merge|over_budget|destructive_delete|privilege_escalation`
- `Run.dial_at_dispatch`：`free|guided|gated|freeze`
- Admin freeze：`POST/GET /v1/admin/freeze`（decision_maker|service）
- 新 dispatch（含 MCP）→ **423** `freeze_active`
- Goal dial `freeze` → **403** `dial_frozen`（与 admin freeze 分立）

### Webhook / 事件
- `POST /hooks/github`, `POST /hooks/cursor`
- HMAC-SHA256；`X-Harness-Signature: sha256=<hex>`；`X-Harness-Timestamp`
- 载荷 `{timestamp}.{raw_body}`；skew ±300s → 401 `webhook_skew`
- 验签失败 → 401 `webhook_bad_signature`
- 出站/SSE 含 `gate.ready`；与 outbox 对齐

### 审计 / Gate
- `POST /gates/{id}/decide`：`decision`,`version`,可选 `note`,`structural_change`
- decide 冲突 **409**
- audit_log 九列只追加，无 PATCH/DELETE

### 已点名错误码
- **422** `brief_forbidden_field`
- **422** 缺 coordinator_ref / mode 非法 / `secret_ref_invalid`
- **403** RBAC / 无人扇出 / executor dispatch / `pool_forbidden` / `dial_frozen`
- **401** `webhook_skew` / `webhook_bad_signature` / unauthorized
- **409** Gate decide 乐观锁
- **423** `freeze_active`
- **400** `predicate_evidence_mismatch`

## OpenAPI 落地勾选
- [x] `Pool.secret_ref` file:/env: + 明文永不回显
- [x] Bearer JWT claims + 角色枚举
- [x] `POST /policy/check` 完整响应 schema（含 `track`）
- [x] `dial_at_dispatch` enum；admin freeze 423
- [x] HMAC-SHA256 + timestamp + skew 401 codes
- [x] audit_log 九列；无写删
- [x] 错误码：`brief_forbidden_field` / 403 / 409 / 423
- [x] CI：白名单不过宽 + `advisory_hint_never_creates_gate`
