# HarnessSecurity · M0 OpenAPI / Schema 验收

**角色：** HarnessSecurity  
**日期：** 2026-09-19 Asia/Shanghai（UTC+8）  
**对照 SoT：** `docs/engineering/M0_SECURITY_FREEZE_v1.md`  
**Backend 落点（不覆盖）：**
- `services/boundary-harness/openapi/openapi_m0_fragment.yaml`
- `services/boundary-harness/openapi/m0_fragment.yaml`（同源副本）
- `services/boundary-harness/packages/domain/migrations/0002_m0_security.sql`

> 本验收**不改写** Backend 已写入的 OpenAPI / migration；仅记录通过项、缺口与可测用例名。

**PASS（可停口头约定）。** 错误码与头名不可变。

| 项 | 冻结值 |
|----|--------|
| 签名头 | `X-Harness-Signature: sha256=<hex>` |
| 时间戳头 | `X-Harness-Timestamp` |
| skew | ±300s → **401** `webhook_skew` |
| 坏签 | **401** `webhook_bad_signature` |
| Freeze 拒 dispatch | **423** `freeze_active` |
| 跨 pool | **403** `pool_forbidden` |
| JWT | `sub, role, pool_ids[], iat, exp`（可选 `tid`） |
| secret_ref | `file:/…` · `env:VAR`；永不回显明文 |

**禁止使用的摘要错码：** `webhook_timestamp_skew` · `webhook_signature_invalid` · `pool_scope_denied`

## 实现验收用例名（可测）

| 用例名 | 期望 |
|--------|------|
| `hmac_bad_signature_401` | POST hooks → **401** `code=webhook_bad_signature` |
| `hmac_timestamp_skew_401` | \|now−ts\| > 300 → **401** `code=webhook_skew` |
| `freeze_blocks_dispatch_423` | freeze enabled → dispatch（含 MCP）**423** `freeze_active` |
| `secret_ref_never_echoed` | Pool 读写响应仅含 `secret_ref` 字符串，无解析明文 |
| `audit_log_append_only` | 无 PATCH/DELETE audit；九列可插入；禁改删 |
| `jwt_pool_forbidden_403` | 操作目标 pool ∉ `pool_ids` → **403** `pool_forbidden` |
| `dial_whitelist_not_overbroad` | 非五键（换路径/建文件/提议 Assignment）不得 `require_gate`/authority |

挂点：`apps/api/tests/contract/BACKEND_CONTRACT_HOOKS.md`
