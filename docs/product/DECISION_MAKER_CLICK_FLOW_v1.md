# Decision-maker click flow v1 (G1 locked)

Default path is a quiet office, not an API console. Canvas is not a dispatch prerequisite. Outbox never returns to the decision-maker shell.

## §4 Frontend brief

1. `/` and `/office` = **AI办公室**. One action: **待我拍板** (count). No Health / OpenAPI / Outbox / role impersonation.
2. `/inbox` = **待办·n**. Human cards only. SSE refresh; Reload ready is hidden.
3. `/ops` (or `?dev=1` on engineer tools) = Health, OpenAPI, outbox table, snapshots, role chrome. `GET /ops` with `X-Harness-Role: decision_maker` → 403 `ops_forbidden`.

## Seven-step copy

1. Land on 办公室. If nothing is ready: 「现在没有需要你拍板的事。」
2. Click **待我拍板**.
3. See **待办·n**. Card title = goal human title (UUID in 详情).
4. Predicate → 「验收标准：交付就绪」 (or 安全审批). Time is relative.
5. Non-empty missing → 「还差：」 chips. Empty missing is hidden.
6. Decide **通过** / **打回重做** / **稍后处理**.
7. Flash 「已通过。」 / 「已打回重做。」 / 「已稍后处理。」 or 409 「这条已有人处理，已为你刷新」.

## Acceptance screenshots (DM only)

- `office_empty_quiet`
- `inbox_one_card_human`
- `inbox_after_pass_quiet`

Ops/health shots are engineer-only and do not count as DM acceptance.

## Reject (R1–R16)

R1 UUID as card title · R2 READY v1 / status=ready badge · R3 Health in DM chrome · R4 OpenAPI in DM chrome · R5 Outbox table on DM path · R6 Role dropdown / dm-1 on main path · R7 Visible Reload ready · R8 missing[] jargon in primary UI · R9 GateInstances / M2-preview copy · R10 Canvas CTA as next step · R11 Beautified outbox in Inbox · R12 English Pass/Revise/Defer on DM buttons · R13 Empty missing shown as a list · R14 409 shows optimistic_lock · R15 Office looks like a debug console · R16 Ops reachable as a top-nav link from the DM shell.
