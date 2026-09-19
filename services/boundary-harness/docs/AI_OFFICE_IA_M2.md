# AI 办公室 IA（M2）

**Superseded for the decision-maker home:** [OFFICE_HOME_IA_P0_v1.md](experience/OFFICE_HOME_IA_P0_v1.md) is AUTHORITATIVE (2026-09-19). `/` = AI 办公室 (goals + fill slots + 工位心跳). Inbox / 待我拍板 is a **drawer**, not the home wall. `/inbox` remains loadable.

P1 **工位心跳** is a read-only presence projection (`GET /v1/desks`): avatar / name / status dot (`在忙` | `等证据` | `空闲`), arranged by self-reported `group` (empty groups hidden). Default roster is **heartbeat agents only** (TTL 90s); seed pools are not Bot colleagues. Empty until a bot POSTs `/v1/agents/heartbeat` / `harness_heartbeat` with `display_name`. Non-DM ops may pass `?include_pools=1` (labeled 执行池, never 同事); decision_maker always sees heartbeat-only. It MUST NOT become dispatch or drag-to-assign. Fill slots label pools as **执行池 · noop / Cursor**, not 同事. Empty fill slots may show **我来填** (`human_allowed` or `exception_grant`) — still a projection, not a dispatch board. Sole hard HITL remains 待我拍板 / Gate decide (drawer).

See [DECISION_MAKER_CLICK_FLOW_v1.md](DECISION_MAKER_CLICK_FLOW_v1.md) for G1 card copy. Copy pack: `services/boundary-harness/apps/web/copy/zh-DM.ts`.
