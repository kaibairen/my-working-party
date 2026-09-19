# AI 办公室 IA（M2）

Decision-maker default: `/` = AI 办公室, `/inbox` = 待我拍板. Dispatch does not require opening this page or a canvas.

P1 **工位一览** is a read-only presence projection (`GET /v1/desks`): avatar / name / status dot (`在忙` | `等证据` | `空闲`). It MUST NOT become dispatch or drag-to-assign. Sole HITL remains 待我拍板 / Gate decide.

See [DECISION_MAKER_CLICK_FLOW_v1.md](DECISION_MAKER_CLICK_FLOW_v1.md). Copy pack: `services/boundary-harness/apps/web/copy/zh-DM.ts`.
