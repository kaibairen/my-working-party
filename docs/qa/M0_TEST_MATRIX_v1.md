# Boundary Harness M0 Test Matrix v1

> Status: implementation checklist for `services/boundary-harness`  
> Source of truth: AUTHORITATIVE PRD MUST + appendix A5 + RBAC  
> Runner: vitest (unit / ready-anti / security-anti) + `pnpm test:e2e`

`schema_version = 1` · `mcp_stub_version = 1`

## Ready / Gate anti-patterns (appendix A5)

| ID | Case name | File |
|----|-----------|------|
| A5-1 | `reject_brief_with_steps_422` | `ready-anti.test.ts` |
| A5-2 | `advisory_hint_never_creates_gate` | `ready-anti.test.ts` |
| A5-3 | `chat_done_never_ready` | `ready-anti.test.ts` |
| A5-4 | `run_succeeded_alone_never_ready` | `ready-anti.test.ts` |
| A5-5 | `explore_null_template_zero_gatedef` | `ready-anti.test.ts` |
| A5-6 | `explore_must_not_default_deliver_ready` | `ready-anti.test.ts` |
| A5-7 | `deliver_requires_summary_md` | `packages/ready` + `ready-anti.test.ts` |
| A5-8 | `noop_path_needs_artifact_and_contract` | `packages/ready` + `ready-anti.test.ts` |
| A5-9 | `canvas_not_required_for_dispatch` | `ready-anti.test.ts` |
| A5-10 | `human_dispatch_forbidden_without_exception` | `ready-anti.test.ts` |

Also: `safety_only_v1` / `deliver_ready_v1` pure-function tests in `packages/ready/src/ready.test.ts`.  
`policy.track` tests in `packages/policy/src/policy.test.ts`.  
Security checklist: [HARNESSSECURITY_M0_SECURITY_CHECKLIST.md](HARNESSSECURITY_M0_SECURITY_CHECKLIST.md).

## Security anti-patterns S1–S8 (QA freeze · merge-blocking)

Path: `apps/api/tests/security-anti/**`. See [M0_SECURITY_ANTI_FINAL_v1.md](M0_SECURITY_ANTI_FINAL_v1.md).

| ID | Case | Assert |
|----|------|--------|
| S1 | `hmac_bad_signature_401` | hooks 坏签 → **401** `webhook_bad_signature` |
| S2 | `hmac_timestamp_skew_401` | skew > 300s → **401** `webhook_skew` |
| S3 | `freeze_blocks_dispatch_423` | freeze on → dispatch **423** `freeze_active` |
| S4 | `secret_ref_never_echoed` | Pool 响应仅 `secret_ref` 串，无解析明文 |
| S5 | `secret_ref_unsupported_400` | 非 `file:`/`env:` → **400** `secret_ref_unsupported` |
| S6 | `audit_log_append_only` | 无 PATCH/DELETE audit；九列只追加 |
| S7 | `jwt_pool_forbidden_403` | 目标 pool ∉ JWT `pool_ids` → **403** `pool_forbidden` |
| S8 | `dial_whitelist_not_overbroad` | 非五键不得 `require_gate`/authority |

## Security acceptance contract (immutable codes)

| Case | Expect | File |
|------|--------|------|
| `hmac_bad_signature_401` | 401 `webhook_bad_signature` | `apps/api/tests/contract` |
| `hmac_timestamp_skew_401` | 401 `webhook_skew` | `apps/api/tests/contract` |
| `freeze_blocks_dispatch_423` | 423 `freeze_active` (HTTP+MCP) | `apps/api/tests/contract` |
| `secret_ref_never_echoed` | `file:`/`env:` URI only | `apps/api/tests/contract` |
| `audit_log_append_only` | nine columns; no PATCH/DELETE | `apps/api/tests/contract` |
| `jwt_pool_forbidden_403` | 403 `pool_forbidden` | `apps/api/tests/contract` |
| `dial_whitelist_not_overbroad` | only five authority keys | `apps/api/tests/contract` |

Acceptance: [HARNESSSECURITY_M0_OPENAPI_ACCEPTANCE.md](HARNESSSECURITY_M0_OPENAPI_ACCEPTANCE.md).

## Happy path

goal (deliver + coordinator_ref) → assignment (BriefV1 + budget_json) → Noop dispatch (dual external ids) → evidence (`summary_md` + `artifact_uri`) → GateInstance ready + `missing[]` → decide pass.
