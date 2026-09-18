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

## Security anti-patterns S1–S8

| ID | Case | Assert |
|----|------|--------|
| S1 | `secret_ref_never_echoed` | `GET /v1/pools` has no `secret_ref` / secret values |
| S2 | `missing_role_is_401` | no `X-Harness-Role` → 401 |
| S3 | `executor_cannot_dispatch` | executor `POST .../dispatch` → 403 |
| S4 | `viewer_cannot_attach_evidence` | viewer evidence POST → 403 |
| S5 | `only_decision_maker_decides` | coordinator decide → 403 |
| S6 | `client_cannot_write_status` | assignment body `status` → 422 `status_immutable` |
| S7 | `shadow_evidence_cannot_write_gate` | `shadow=true` never moves Gate to ready |
| S8 | `cursor_raw_not_registered` | MCP tool list has no `cursor_raw_*` / `set_steps` |

## Happy path

goal (deliver + coordinator_ref) → assignment (BriefV1 + budget_json) → Noop dispatch (dual external ids) → evidence (`summary_md` + `artifact_uri`) → GateInstance ready + `missing[]` → decide pass.
