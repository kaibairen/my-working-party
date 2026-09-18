# M0 `tests/security-anti` 最终冻结表 v1

**触发：** Security OpenAPI 验收 PASS → 并入 M0 CI 强制集（技术研讨bot / 决策人链路）  
**签核：** HarnessQA → HarnessDevOps（钉 vitest）· 对齐 `M0_SECURITY_FREEZE_v1` + Security 验收稿  
**日期：** 2026-09-19 Asia/Shanghai  
**路径约定：** `services/boundary-harness/apps/api/tests/security-anti/**/*.{test,spec}.{ts,mjs}`  
**规则：** 用例名字符串 MUST 一致；缺任一 🔴 → merge 红  
**与 ready-anti 关系：** 并列强制；不互相替代（ready-anti 仍 14）

## Tier-S 强制（Security，8）

| # | 用例名 | 期望 |
|---|--------|------|
| S1 | `hmac_bad_signature_401` | hooks 坏签 → **401** `webhook_bad_signature` |
| S2 | `hmac_timestamp_skew_401` | \|now−ts\| > 300s → **401** `webhook_skew` |
| S3 | `freeze_blocks_dispatch_423` | freeze on → dispatch（含 MCP）**423** `freeze_active` |
| S4 | `secret_ref_never_echoed` | Pool 响应仅 `secret_ref` 串，无解析明文 |
| S5 | `secret_ref_unsupported_400` | 非 `file:`/`env:` → **400** `secret_ref_unsupported` |
| S6 | `audit_log_append_only` | 无 PATCH/DELETE audit；九列只追加 |
| S7 | `jwt_pool_forbidden_403` | 目标 pool ∉ JWT `pool_ids` → **403** `pool_forbidden` |
| S8 | `dial_whitelist_not_overbroad` | 非五键（换路径/建文件/提议 Assignment）不得 `require_gate`/authority |

**白名单五键：** `external_send` \| `protected_merge` \| `over_budget` \| `destructive_delete` \| `privilege_escalation`

**通配展开依据：** 研讨要求 `hmac_*` / `secret_ref_*` → 上表 S1–S2 / S4–S5。

## 建议同 job、非本表阻塞（已在矩阵 🔴，可后续并入）

| 用例名 | 说明 |
|--------|------|
| `freeze_rbac_only_decision_maker_or_service` | 非授权角色改 freeze → 403 |

## vitest

与 `unit-vitest` 同 job include：

```
**/tests/ready-anti/**/*.{test,spec}.{ts,mjs}
**/tests/security-anti/**/*.{test,spec}.{ts,mjs}
```

权威链：本文件 + `qa/M0_READY_ANTI_FINAL_v1.md`（14）+ `qa/M0_TEST_MATRIX_v1.md` Security 节。
