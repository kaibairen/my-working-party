# M0 CI 清单

Canonical: [`docs/qa/M0_CI_CHECKLIST.md`](../../../../docs/qa/M0_CI_CHECKLIST.md)

Workflow: `.github/workflows/harness-m0.yml`  
`working-directory: services/boundary-harness`

```bash
pnpm exec vitest run apps/api/tests/ready-anti
pnpm exec vitest run apps/api/tests/security-anti
```

Hard-fail. Paths: `apps/api/tests/security-anti/**`, `apps/api/tests/ready-anti/**`.

Inbox Playwright CDP (does **not** replace anti jobs): job `e2e-gate-inbox` runs `pnpm test:e2e:inbox` → `apps/web/e2e/gate-inbox/**/*.spec.ts`. Checklist: [GATE_INBOX_PLAYWRIGHT_CDP_v1.md](GATE_INBOX_PLAYWRIGHT_CDP_v1.md).

compose-smoke (`api_8080_bind_no_blip`): wait container healthy, then `deploy/wait-api-healthy.sh` with `NO_BLIP_SECS=5`. Port-open is not green.
