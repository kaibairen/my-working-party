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

## TechLead merge gates (freeze names **are** `it("…")` titles)

Registries in `apps/api/tests/contract/required-cases.ts`. CI red if a freeze name is missing.

### #18 office roster (do not loosen)

| Gate | `it("…")` | File |
|------|-----------|------|
| No fake-name wall | `office_no_fake_name_wall` | `p0-linkage.test.ts` |
| TTL expiry clears the row | `heartbeat_ttl_expiry_clears_row` | `p0-linkage.test.ts` |
| No assign desk | `office_no_assign_desk` | `office-anti.test.ts` |
| No drag dispatch | `office_no_drag_dispatch` | `office-anti.test.ts` |
| No 开跑 button | `office_no_start_run_button` | `office-anti.test.ts` |

### QA #21 grouped desks (`DESKS_GROUP_MERGE_GATES`)

| Gate | `it("…")` | File |
|------|-----------|------|
| Grouped layout, readonly | `desks_grouped_layout_readonly` | `p0-linkage.test.ts` · `desks.test.ts` |
| No drag / assign on groups | `desks_group_no_drag_assign` | `p0-linkage.test.ts` · `desks.test.ts` |
| No fake seed names | `desks_group_no_fake_seeds` | `p0-linkage.test.ts` · `desks.test.ts` |
| Ungrouped bucket = 其他 | `desks_ungrouped_bucket` | `p0-linkage.test.ts` · `desks.test.ts` |

### QA #21 2048 (`GAME_2048_MERGE_GATES`)

| Gate | `it("…")` | File |
|------|-----------|------|
| Loads playable | `game_2048_loads_playable` | `examples/2048/board.test.ts` |
| Arrow / swipe moves | `game_2048_arrow_or_swipe_moves` | `examples/2048/board.test.ts` |
| Score updates | `game_2048_score_updates` | `examples/2048/board.test.ts` |
| New game resets | `game_2048_new_game_resets` | `examples/2048/board.test.ts` |

### P0-A status_line — Domain `STATUS_LINE_MERGE_GATES` + shell `STATUS_LINE_PLAYWRIGHT_GATES`

| Gate | Title | File |
|------|-------|------|
| Domain all-slots-done / ready is not filling | `status_line_all_slots_done_not_filling` | `office.test.ts` |
| UI mirrors API (`等你拍板`, never `待拍板` / `同事在填`) | `status_line_all_slots_done_not_filling` | `office-home.spec.ts` |

Shell imports/mirrors Domain `STATUS_LINE_*` (`等你拍板` · `已交齐`). Paints `goal.status_line` as-is. Missing line → empty. Never invent `待拍板` / `同事在填` / `已交产物` as status_line. Desks paint Domain `presence` + fresh heartbeat; no fake busy; no dispatch UI.

### P0-B assignee bind + desk busy (`P0_B_MERGE_GATES`)

| Gate | Title | File |
|------|-------|------|
| Assignment binds a concrete bot | `assignment_binds_bot_id` | `p0-linkage.test.ts` |
| Desk busy only from bound assignee heartbeat | `desk_busy_from_assignee_heartbeat` | `p0-linkage.test.ts` · `desks.test.ts` |

Coordinator/service set `assignee_bot_id`. No new office DM assign/dispatch write routes. Expired heartbeat ≠ busy. Fake seed names stay hidden.

Publisher: [CONTRACT_DOMAIN_OUTBOUND_EVENTS_P0D_v0.md](../m4/CONTRACT_DOMAIN_OUTBOUND_EVENTS_P0D_v0.md).

Extra (not this freeze): `fill_slots_pool_labels_not_colleague`. English 2048 merge smokes stay as non-gate cases.

M4 MCP glove dogfood: [DOGFOOD_GROKBOT_MCP_SOP.md](../DOGFOOD_GROKBOT_MCP_SOP.md).

2048 dogfood artifact: [examples/2048/README.md](../../examples/2048/README.md) — decision-maker opens `/examples/2048/` after `pnpm --filter @harness/api dev`. Friction log: [FRICTION_2048_HARNESS.md](../dogfood/FRICTION_2048_HARNESS.md).
