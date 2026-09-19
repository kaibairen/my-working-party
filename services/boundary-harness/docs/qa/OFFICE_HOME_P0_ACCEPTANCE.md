# Office Home P0 — 30s acceptance

AUTHORITATIVE IA: [OFFICE_HOME_IA_P0_v1.md](../experience/OFFICE_HOME_IA_P0_v1.md).

Playwright: `apps/web/e2e/gate-inbox/office-home.spec.ts` (`office_home_p0_30s`, `desk_ttl_never_shows_stale_busy`) and frozen antis in `office-p0-anti.spec.ts`.

| # | Check | How |
|---|--------|-----|
| 1 | Home ≠ Inbox wall | `/` shows 目标 + 新建目标 + 工位心跳; no gate cards on the office canvas |
| 2 | Create goal + fill slot | 名称 + 一句话要什么 → goal row + 填充槽（谁在填 / 填到哪 / 产物） |
| 3 | 「我来填」 | empty slot → 我来填 → note + optional artifact URI → 人填进度; no 指派/开跑 |
| 4 | Roster TTL | `presence` / `last_seen_at` / `ttl_seconds` / `heartbeat_fresh`; stale heartbeat never 在忙 |
| 5 | Inbox is drawer | 顶栏 `待办 · n` opens 待我拍板; G1 copy lock; `/inbox` still loadable |

Frozen names: `office_home_not_inbox_wall` · `office_no_assign_desk` · `office_no_drag_dispatch` · `office_no_start_run_button` · `fill_board_not_dispatch_console` · `inbox_is_drawer_not_home`.

P0 linkage (#15): empty slot **我来填**. This Frontend PR is polish only (form + TTL paint). Roster shows `presence` / `last_heartbeat` (`last_seen_at` / `last_heartbeat_at`) / `ttl_seconds` / `heartbeat_fresh` when a bot posted `/v1/agents/heartbeat` within TTL (90s). Stale heartbeat is never painted 在忙. Still not dispatch. Expected JSON: [FRONTEND_OFFICE_P0_SMOKE.md](../FRONTEND_OFFICE_P0_SMOKE.md).

Frozen Playwright names stay in `office-p0-anti.spec.ts`. Smoke: [FRONTEND_OFFICE_P0_SMOKE.md](../FRONTEND_OFFICE_P0_SMOKE.md) (`127.0.0.1:8080`).

M4 MCP glove dogfood: [DOGFOOD_GROKBOT_MCP_SOP.md](../DOGFOOD_GROKBOT_MCP_SOP.md).
