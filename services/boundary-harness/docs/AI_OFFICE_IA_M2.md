# AI 办公室 IA（P0）

Decision-maker default: `/` = **AI 办公室** (goal list + Bot 填充槽 + Roster 心跳). **待我拍板** is a drawer (`待办 · n`), not the home wall. `/inbox` opens the same shell with the drawer already open.

Dispatch does not require opening this page or a canvas. Fill slots are a **READ projection** (who is filling / progress / artifact). They MUST NOT become 指派给 / 拖到工位 / 开始跑.

Roster (`GET /v1/desks`) is read-only presence: `在忙` | `等证据` | `空闲`.

G1 待我拍板 copy / R17–R25 / `sanitizeCardTitle` stay in the drawer. Advisory cards never enter the drawer.

Copy pack: `apps/web/copy/zh-DM.ts`.

## Live APIs

| UI | Route |
|----|--------|
| Goal list + fill slots | `GET /v1/goals` (Domain `listGoals`) |
| 新建目标 (name + one-line ask) | `POST /v1/goals` — UI sends only title + summary; `mode=deliver` and `coordinator_ref=coord-1` are silent defaults, not Brief fields |
| Roster | `GET /v1/desks` |
| Drawer count + list | `GET /v1/gates?status=ready` (authority only) |
| Decide | `POST /v1/gates/:id/decide` with `version` optimistic lock |

## Gaps

- 一句话要什么 is persisted as Goal `summary` (compat column). There is no separate Brief on the create form.
- Coordinator/Bot still fills assignments via API; the office never writes owner or dispatch.
