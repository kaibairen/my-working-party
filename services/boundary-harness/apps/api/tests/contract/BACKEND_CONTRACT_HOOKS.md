# Backend contract hooks (Security acceptance)

Source: HarnessSecurity M0 OpenAPI acceptance 2026-09-19.

CI runs `pnpm exec vitest run apps/api/tests/contract` under `services/boundary-harness` and **fails** if any named case is missing.

Immutable codes / headers (do not invent aliases):

| Code / header | HTTP |
|---------------|------|
| `X-Harness-Signature: sha256=<hex>` | inbound HMAC |
| `X-Harness-Timestamp` | unix seconds |
| `webhook_bad_signature` | 401 |
| `webhook_skew` | 401 |
| `freeze_active` | 423 |
| `pool_forbidden` | 403 |
| `secret_ref` `file:/` \| `env:` | never echo plaintext |

Forbidden aliases: `webhook_timestamp_skew`, `webhook_signature_invalid`, `pool_scope_denied`.

## Required case names

- `hmac_bad_signature_401`
- `hmac_timestamp_skew_401`
- `freeze_blocks_dispatch_423`
- `secret_ref_never_echoed`
- `audit_log_append_only`
- `jwt_pool_forbidden_403`
- `dial_whitelist_not_overbroad`

File: `acceptance.test.ts` plus `required-cases.test.ts` (merge-blocking name registry).

Human evidence attach freeze (`HUMAN_EVIDENCE_MERGE_GATES` in `p0-linkage.test.ts`):

- `bot_attach_requires_mcp_entry`
- `human_attach_bearer_allowed`
