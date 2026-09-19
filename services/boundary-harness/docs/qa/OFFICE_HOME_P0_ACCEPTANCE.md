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

## TechLead merge gates (office roster freeze)

Freeze names **are** the `it("…")` titles. Registry: `OFFICE_ROSTER_MERGE_GATES` in `apps/api/tests/contract/required-cases.ts` (CI red if a name is missing).

| Gate | `it("…")` | File | Must |
|------|-----------|------|------|
| No fake-name wall | `office_no_fake_name_wall` | `p0-linkage.test.ts` | DM `GET /v1/desks` (and `?include_pools=1`) never shows seed 「交付同事」「Cursor 同事」; only live heartbeat `display_name` / actor |
| TTL expiry clears the row | `heartbeat_ttl_expiry_clears_row` | `p0-linkage.test.ts` | After TTL the heartbeat desk disappears — no `pool_seed` fallback on the office roster |
| Grouped roster | `desks_grouped_by_heartbeat_group` | `p0-linkage.test.ts` · `desks.test.ts` | Heartbeat `group` / `section`; empty groups omitted; DM still heartbeat-only |
| Pool labels ≠ 同事 | `fill_slots_pool_labels_not_colleague` | `p0-linkage.test.ts` · `office.test.ts` | Fill slots are 「执行池 · noop / Cursor」, never 同事 / `Bot 填 ·` |
| No assign desk | `office_no_assign_desk` | `office-anti.test.ts` | No `/v1/desks/:id/assign`; 3-state only |
| No drag dispatch | `office_no_drag_dispatch` | `office-anti.test.ts` | Roster `data-readonly`; no 指派/拖到工位 |
| No 开跑 button | `office_no_start_run_button` | `office-anti.test.ts` | No start-run / 开跑 control on the office home |

M4 MCP glove dogfood: [DOGFOOD_GROKBOT_MCP_SOP.md](../DOGFOOD_GROKBOT_MCP_SOP.md).

2048 dogfood artifact: [examples/2048/README.md](../../examples/2048/README.md) — decision-maker opens `/examples/2048/` after `pnpm --filter @harness/api dev`. Friction log: [FRICTION_2048_HARNESS.md](../dogfood/FRICTION_2048_HARNESS.md).
