# M0 CI 清单 v0.4

> 起草：HarnessDevOps · 对齐 TechLead 纠偏（2026-09-19）  
> **落地仓：`kaibairen/my-working-party`（不分仓；独立 `boundary-harness` 仓名作废）**

## 工具链

| 项 | 值 |
|----|-----|
| Node | 22 |
| 包管理 | **pnpm** 9 + `pnpm-lock.yaml` |
| 单测 | **vitest** |
| 服务根 | `services/boundary-harness/` |
| Compose | `services/boundary-harness/deploy/docker-compose.m0.yml` |
| Workflow | `.github/workflows/harness-m0.yml`（草图：`devops/ci/m0-ci.yml`） |

## vitest include（唯一冻结处 — 勿分叉）

```text
services/boundary-harness/{packages/domain,packages/policy,packages/ready,apps/api,apps/mcp-server}/**/*.{test,spec}.ts
```

Backend 可微调，但**只改本 checklist + `m0-ci.yml` 的 vitest job 这一处**。  
**Done 门槛：** 缺 BriefV1 / Ready / Policy 单测 → **不算 M0 Done**。
**ready-anti：** 权威最终表 `qa/M0_READY_ANTI_FINAL_v1.md`（14 例，缺任一 🔴 merge 红）。
**security-anti：** 权威最终表 `qa/M0_SECURITY_ANTI_FINAL_v1.md`（8 例，与 ready-anti 并列；Security OpenAPI PASS 后强制，缺任一 🔴）。

## Compose 服务名

| 服务名 | 必起 (M0) | 说明 |
|--------|-----------|------|
| `api` | **是** | Gateway+Domain+Ready+**SSE**；`HARNESS_MODE=all` |
| `mcp-stub` | 否（`with-mcp`） | Noop + MCP stub；真 Cursor = M1 |
| `postgres` | 否（`m1-preview`） | M1 预演；M0 = SQLite 卷 |

```bash
cd services/boundary-harness/deploy
docker compose -f docker-compose.m0.yml up -d --build api
docker compose -f docker-compose.m0.yml --profile with-mcp up -d
docker compose -f docker-compose.m0.yml --profile m1-preview up -d
```

## 必跑 Jobs

| Job | 要点 |
|-----|------|
| `lint-typecheck` | `pnpm lint` + `pnpm typecheck` |
| `openapi-contract` | `openapi:lint`；migration ↔ OpenAPI 同源 PR |
| `unit-vitest` | 上表 include + ready-anti 14 + security-anti 8（均强制） |
| `compose-smoke` | 起 `api` + `/healthz`（main） |

### Ready 反例（`tests/ready-anti/**/*.test.ts` · 14 · QA 最终表）

权威：`my-working-party-docs/qa/M0_READY_ANTI_FINAL_v1.md`。用例名字符串 MUST 一致；缺任一 → job 红。

**Tier-1（附录 A5，10，不改名不删）**

1. `reject_brief_with_steps_422`
2. `advisory_hint_never_creates_gate`
3. `chat_done_never_ready`
4. `run_succeeded_alone_never_ready`
5. `explore_null_template_zero_gatedef`
6. `explore_must_not_default_deliver_ready`
7. `deliver_requires_summary_md`
8. `noop_path_needs_artifact_and_contract`
9. `canvas_not_required_for_dispatch`
10. `human_dispatch_forbidden_without_exception`

**Tier-2（同 job 强制增 4）**

11. `assignment_success_ne_gate_pass`
12. `no_auto_downgrade_deliver_to_explore`
13. `dial_path_change_not_human`
14. `ready_eval_uses_github_snapshots_only`

### Security 反例（`apps/api/tests/security-anti/**/*.{test,spec}.{ts,mjs}` · 8 · QA 最终表）

权威：`my-working-party-docs/qa/M0_SECURITY_ANTI_FINAL_v1.md`。与 ready-anti **并列强制**（不互相替代）。Security OpenAPI PASS 后并入 M0 CI；缺任一 → merge 红。

**Tier-S（8）**

| # | 用例名 |
|---|--------|
| S1 | `hmac_bad_signature_401` |
| S2 | `hmac_timestamp_skew_401` |
| S3 | `freeze_blocks_dispatch_423` |
| S4 | `secret_ref_never_echoed` |
| S5 | `secret_ref_unsupported_400` |
| S6 | `audit_log_append_only` |
| S7 | `jwt_pool_forbidden_403` |
| S8 | `dial_whitelist_not_overbroad` |

## 迁入顺序（开目录后）

1. 草案 → `services/boundary-harness/deploy/`
2. `m0-ci.yml` → `.github/workflows/harness-m0.yml`
3. 与 Backend 对齐包树后跑通 vitest；ready-anti 14 + security-anti 8

变更：v0.4 并入 security-anti 8（QA `M0_SECURITY_ANTI_FINAL_v1`）；ready-anti 14 不变
