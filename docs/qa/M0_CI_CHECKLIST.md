# M0 CI checklist

Canonical workflow: [`.github/workflows/harness-m0.yml`](../../.github/workflows/harness-m0.yml)  
Working directory: `services/boundary-harness`

- [x] pnpm install (lockfile at `services/boundary-harness/pnpm-lock.yaml`)
- [x] rebuild `better-sqlite3`
- [x] `pnpm lint`
- [x] `pnpm test` — includes BriefV1 422, Ready predicates, `policy.track`, A5 ready-anti, S1–S8 security-anti
- [x] `pnpm test:e2e` — Playwright Gate Inbox (launch or `CDP_URL` / `connectOverCDP`)
- [x] Compose file: `services/boundary-harness/docker-compose.yml` (`docker compose up api`)
- [ ] Optional local: `pnpm e2e` writes `artifacts/e2e/*.log`

Do **not** require `CURSOR_API_KEY` for green CI (fixture / Noop path).
