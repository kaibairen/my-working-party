# M0 CI 清单 v0.4

> 起草：HarnessDevOps · 对齐 TechLead 纠偏（2026-09-19）  
> **落地仓：`kaibairen/my-working-party`（不分仓）**  
> **Workflow：** [`.github/workflows/harness-m0.yml`](../../.github/workflows/harness-m0.yml)

## 工具链

| 项 | 值 |
|----|-----|
| Node | 22 |
| 包管理 | **pnpm** 10.14 + `pnpm-lock.yaml` |
| 单测 | **vitest** |
| 服务根 | `services/boundary-harness/` |
| Workflow | `.github/workflows/harness-m0.yml` |

## 强制 vitest 步（working-directory: services/boundary-harness）

Hard-fail：无 `continue-on-error`。

```bash
pnpm exec vitest run apps/api/tests/ready-anti
pnpm exec vitest run apps/api/tests/security-anti
```

security-anti 路径：`apps/api/tests/security-anti/**/*.{test,spec}.{ts,mjs}`  
ready-anti 路径：`apps/api/tests/ready-anti/**`

**security-anti S1–S8**（缺任一 merge 红）：见 [M0_SECURITY_ANTI_FINAL_v1.md](M0_SECURITY_ANTI_FINAL_v1.md)。

Inbox Playwright CDP（M2，**不**替代 anti 强制集）：job `e2e-gate-inbox`；清单 [GATE_INBOX_PLAYWRIGHT_CDP_v1.md](GATE_INBOX_PLAYWRIGHT_CDP_v1.md)。
