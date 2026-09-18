# M0 CI 清单

Canonical: [`docs/qa/M0_CI_CHECKLIST.md`](../../../../docs/qa/M0_CI_CHECKLIST.md)

Workflow: `.github/workflows/harness-m0.yml`  
`working-directory: services/boundary-harness`

```bash
pnpm exec vitest run apps/api/tests/ready-anti
pnpm exec vitest run apps/api/tests/security-anti
```

Hard-fail. Paths: `apps/api/tests/security-anti/**`, `apps/api/tests/ready-anti/**`.
