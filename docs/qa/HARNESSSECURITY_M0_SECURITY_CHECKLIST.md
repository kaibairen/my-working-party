> Implementation (this repo): `services/boundary-harness/` OpenAPI + domain. Working notes: `services/boundary-harness/docs/qa/HARNESSSECURITY_M0_SECURITY_CHECKLIST.md`.

# HarnessSecurity · M0 安全清单

**受众：** 技术研讨 bot / Backend / OpenAPI  
**范围：** M0（API+SQLite+Noop+GateInstance+MCP stub）  
**原则：** 无臆造；未写入权威文的头名/错误码标为缺口  
**日期：** 2026-09-19（Asia/Shanghai）

## 摘要（可转发）

| # | 控制项 | M0 必须落地 | 关键出处 | 状态/风险 |
|---|--------|-------------|----------|-----------|
| S1 | secret_ref | pools 非空；API/日志/证据永不回显明文 | M0_SCHEMA pools；Eng §10.1 | 字段冻；格式/错误码缺口 |
| S2 | Webhook HMAC | `WEBHOOK_SIGNING_SECRET`；入站未验签拒收；事件走 outbox | Eng §10.3/§11；Backend E.2 | 头/算法未冻；GitHub Ready 属 M2 |
| S3 | RBAC | 五角色+附录矩阵；executor dispatch=403；decide 仅 decision_maker | 附录 RBAC；MCP stub；PRD §3 | JWT claims 未进短附录 |
| S4 | 审计只追加 | audit_log / policy_events / gate_decisions 无改删 API | M0_SCHEMA；Eng §10.6 | audit 列结构未展开 |
| S5 | Freeze | dial 含 freeze；freeze 拒**新** dispatch；快照 `dial_at_dispatch` | Eng §10.5；M0_SCHEMA | 无设置 API/错误码 |
| S6 | Dial 白名单 | 仅五键 authority；advisory 不硬停/不建 Gate；policy 带 track | PRD §5.4–5；附录 A | 过宽=致命 |

**一句话：** M0 安全面 = schema 已冻的 `secret_ref` + RBAC/403 + 只追加审计 + Freeze 拒新 dispatch 快照 + policy.`track`/窄白名单；HMAC 与 Freeze 管理 API 仍缺契约细节，**不得在 OpenAPI 外口头约定**。

## MUST_OPENAPI（必进契约）

### 安全与身份
- `Authorization: Bearer`
- roles：`decision_maker|coordinator|executor|viewer|service`
- 403：角色不足 / 无人扇出例外 /（若采用）跨 pool
- `goals.coordinator_ref` required
- `goals.dispatch_policy`：`coordinator_only|human_allowed`

### Pool / Secret
- `Pool.secret_ref` required string；永不回显明文
- 禁止明文 credential 字段

### Policy / Dial / Freeze
- `POST /policy/check` → `decision`,`track`,`reason_code`,`redirect`
- `track`：`authority_gate|advisory_hint`
- Dial 白名单五键：`external_send|protected_merge|over_budget|destructive_delete|privilege_escalation`
- `Run.dial_at_dispatch`：`free|guided|gated|freeze`
- Freeze → 拒新 dispatch（错误码待补冻）

### Webhook / 事件
- `POST /hooks/github`, `POST /hooks/cursor`（若暴露）
- HMAC 验签失败响应（码/头待补冻）
- 出站/SSE 含 `gate.ready`；与 outbox 对齐

### 审计 / Gate
- `POST /gates/{id}/decide`：`decision`,`version`,可选 `note`,`structural_change`
- decide 冲突 **409**
- gate_decisions / audit / policy_events：只追加，无 PATCH/DELETE

### 已点名错误码
- **422** `brief_forbidden_field`
- **422** 缺 coordinator_ref / mode 非法
- **403** RBAC / 无人扇出 / executor dispatch
- **409** Gate decide 乐观锁
- **400** `predicate_evidence_mismatch`

## 待补冻（禁止各写各的）
1. HMAC：算法、签名头、编码、skew、失败 HTTP/code
2. Freeze/Dial：设置 API + dispatch 拒绝 error code
3. `audit_log` 列级 schema
4. JWT claims 是否升格进权威附录
5. `secret_ref` URI 方案与解析失败码

## OpenAPI 落地勾选
- [ ] `Pool.secret_ref` + 响应净化测试
- [ ] Bearer + 角色枚举 + 附录矩阵 path 级 securityRequirements
- [ ] `POST /policy/check` 完整响应 schema（含 `track`）
- [ ] `dial_at_dispatch` enum；freeze 拒 dispatch
- [ ] gate decide + 409；audit 无写删
- [ ] outbox；hooks 占位 + HMAC 必验 description
- [ ] 错误码：`brief_forbidden_field` / 403 / 409
- [ ] CI：白名单不过宽 + `advisory_hint_never_creates_gate`

出处依据见同次抽取全文（权威 PRD / M0_SCHEMA / 附录 A·RBAC / M0_MCP_STUB / Engineering / Backend 评审）。
