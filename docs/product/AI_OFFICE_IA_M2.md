# AI 办公室 IA（P0）

Decision-maker default: `/` = **AI 办公室** (goal list + Bot 填充槽 + Roster 心跳). **待我拍板** is a drawer (`待办 · n`), not the home wall. `/inbox` opens the same shell with the drawer already open.

Dispatch does not require opening this page or a canvas. Fill slots are a **READ projection** (who is filling / progress / artifact). They MUST NOT become 指派给 / 拖到工位 / 开始跑.

Roster (`GET /v1/desks`) is read-only presence: `在忙` | `等证据` | `空闲`.

G1 待我拍板 copy / R17–R25 / `sanitizeCardTitle` stay in the drawer. Advisory cards never enter the drawer.

Copy pack: `services/boundary-harness/apps/web/copy/zh-DM.ts`.
