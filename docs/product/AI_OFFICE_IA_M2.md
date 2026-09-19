# AI 办公室 IA（M2）

**Superseded for the decision-maker home:** [OFFICE_HOME_IA_P0_v1.md](../../services/boundary-harness/docs/experience/OFFICE_HOME_IA_P0_v1.md) is AUTHORITATIVE (2026-09-19). `/` = AI 办公室 (goals + fill slots + 工位心跳). Inbox / 待我拍板 is a **drawer**, not the home wall. `/inbox` remains loadable.

P1 **工位心跳** is a read-only presence projection (`GET /v1/desks`): avatar / name / status dot (`在忙` | `等证据` | `空闲`). Default roster is heartbeat agents only (TTL 90s); seed pools are hidden from the decision-maker list. It MUST NOT become dispatch or drag-to-assign. Sole hard HITL remains 待我拍板 / Gate decide (drawer).

See [DECISION_MAKER_CLICK_FLOW_v1.md](DECISION_MAKER_CLICK_FLOW_v1.md) for G1 card copy. Copy pack: `services/boundary-harness/apps/web/copy/zh-DM.ts`.
