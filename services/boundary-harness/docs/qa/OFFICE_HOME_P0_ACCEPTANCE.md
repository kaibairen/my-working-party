# Office Home P0 — 30s acceptance

AUTHORITATIVE IA: [OFFICE_HOME_IA_P0_v1.md](../experience/OFFICE_HOME_IA_P0_v1.md).

Playwright: `apps/web/e2e/gate-inbox/office-home.spec.ts` (`office_home_p0_30s`).

| # | Check | How |
|---|--------|-----|
| 1 | Home ≠ Inbox wall | `/` shows 目标 + 新建目标 + 工位心跳; no gate cards on the office canvas |
| 2 | Create goal + fill slot | 名称 + 一句话要什么 → goal row + 填充槽（谁在填 / 填到哪 / 产物） |
| 3 | Roster | 工位心跳按组（空组隐藏） 在忙 \| 等证据 \| 空闲; no 指派/开跑/drag |
| 4 | Inbox is drawer | 顶栏 `待办 · n` opens 待我拍板; G1 copy lock; `/inbox` still loadable |

P0 linkage add-on: empty slot **我来填** (human_allowed or exception_grant). Roster is heartbeat-only: empty until a bot posted `/v1/agents/heartbeat` / `harness_heartbeat` within TTL (90s); seed pools are not 同事. Still not dispatch.

## TechLead merge gates (2026-09-19 lock)

| Gate | Named case | Must |
|------|------------|------|
| No fake-name wall | `office_no_fake_name_wall` | DM `GET /v1/desks` (and `?include_pools=1`) never shows seed 「交付同事」「Cursor 同事」; only live heartbeat `display_name` / actor |
| TTL expiry clears the row | `heartbeat_ttl_expiry_clears_row` | After TTL the heartbeat desk disappears — no `pool_seed` fallback on the office roster |
| Readonly presence | `office_no_assign_desk` / `office_no_drag_dispatch` / `office_no_start_run_button` | 3-state 在忙 \| 等证据 \| 空闲; no assign / drag / 开跑 |

M4 MCP glove dogfood: [DOGFOOD_GROKBOT_MCP_SOP.md](../DOGFOOD_GROKBOT_MCP_SOP.md).

2048 dogfood artifact: [examples/2048/README.md](../../examples/2048/README.md) — decision-maker opens `/examples/2048/` after `pnpm --filter @harness/api dev`. Friction log: [FRICTION_2048_HARNESS.md](../dogfood/FRICTION_2048_HARNESS.md).
