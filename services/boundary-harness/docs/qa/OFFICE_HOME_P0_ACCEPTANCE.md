# Office Home P0 — 30s acceptance

AUTHORITATIVE IA: [OFFICE_HOME_IA_P0_v1.md](../experience/OFFICE_HOME_IA_P0_v1.md).

Playwright: `apps/web/e2e/gate-inbox/office-home.spec.ts` (`office_home_p0_30s`).

| # | Check | How |
|---|--------|-----|
| 1 | Home ≠ Inbox wall | `/` shows 目标 + 新建目标 + 工位心跳; no gate cards on the office canvas |
| 2 | Create goal + fill slot | 名称 + 一句话要什么 → goal row + 填充槽（谁在填 / 填到哪 / 产物） |
| 3 | Roster | 工位心跳 在忙 \| 等证据 \| 空闲; no 指派/开跑/drag |
| 4 | Inbox is drawer | 顶栏 `待办 · n` opens 待我拍板; G1 copy lock; `/inbox` still loadable |

P0 linkage add-on: empty slot **我来填** (human_allowed or exception_grant). Roster shows a desk only when a bot posted `/v1/agents/heartbeat` within TTL (90s); seed placeholders (「交付同事」「Cursor 同事」) stay hidden. Still not dispatch.

M4 MCP glove dogfood: [DOGFOOD_GROKBOT_MCP_SOP.md](../DOGFOOD_GROKBOT_MCP_SOP.md).
