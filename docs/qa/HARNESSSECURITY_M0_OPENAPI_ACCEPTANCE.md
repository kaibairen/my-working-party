# HarnessSecurity · M0 OpenAPI / Schema 验收

Repo copy of the 2026-09-19 Security acceptance. Canonical freeze codes/headers are immutable.

See also [`services/boundary-harness/docs/qa/HARNESSSECURITY_M0_OPENAPI_ACCEPTANCE.md`](../services/boundary-harness/docs/qa/HARNESSSECURITY_M0_OPENAPI_ACCEPTANCE.md) and contract hooks at [`services/boundary-harness/apps/api/tests/contract/BACKEND_CONTRACT_HOOKS.md`](../services/boundary-harness/apps/api/tests/contract/BACKEND_CONTRACT_HOOKS.md).

**结论：PASS。** 错误码与头名不得改写：

| 项 | 冻结值 |
|----|--------|
| 坏签 | **401** `webhook_bad_signature` |
| skew | **401** `webhook_skew` |
| Freeze 拒 dispatch | **423** `freeze_active` |
| 跨 pool | **403** `pool_forbidden` |
| secret_ref | `file:/…` · `env:VAR` only |

禁止：`webhook_timestamp_skew` · `webhook_signature_invalid` · `pool_scope_denied`。

## 实现验收用例名（CI 契约门）

| 用例名 | 期望 |
|--------|------|
| `hmac_bad_signature_401` | POST hooks → **401** `code=webhook_bad_signature` |
| `hmac_timestamp_skew_401` | \|now−ts\| > 300 → **401** `code=webhook_skew` |
| `freeze_blocks_dispatch_423` | freeze enabled → dispatch（含 MCP）**423** `freeze_active` |
| `secret_ref_never_echoed` | Pool 响应仅含 `secret_ref` 字符串，无解析明文 |
| `audit_log_append_only` | 无 PATCH/DELETE audit；九列可插入 |
| `jwt_pool_forbidden_403` | 目标 pool ∉ `pool_ids` → **403** `pool_forbidden` |
| `dial_whitelist_not_overbroad` | 非五键不得 `require_gate`/authority |
