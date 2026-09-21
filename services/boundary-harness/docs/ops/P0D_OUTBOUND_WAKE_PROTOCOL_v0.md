# P0-D 出站唤醒 · Bridge 手套订阅 v0.3

- **Owner：** HarnessBridge  
- **Freeze：** `status_change_outbound_wakes_assignee`  
- **Domain 契约 SoT：** publisher 仍是 Backend A→B（outbox → webhook）。本页只冻 Bridge 入口行为。  
- **Bridge 入口：** `POST /hooks/domain-events`（与 MCP 同进程 `:8787`，现树 `apps/mcp-server/src/http-proxy.ts`）

## 行为

1. 校验可选 HMAC（`HARNESS_WEBHOOK_SECRET` / `WEBHOOK_SIGNING_SECRET`；未设则放行）。签名头：`x-harness-webhook-signature` · `x-hub-signature-256` · 现树 Domain 的 `x-harness-signature`。  
2. 信封：`{ id, type, created_at, payload }`；幂等：`envelope.id`（outbox_id）  
3. 类型：`goal.status_changed` · `gate.ready` · `stage.unlocked`（`stage.unlocked` 即使 Domain 后到也先认）  
4. **无 `assignee_bot_id` / `assignee_bot_ids[]` → 跳过唤醒**（不爆炸）  
5. Wake = remind only：只 structured log / ping 目标 Bot；**不**刷决策人主聊天；**不**代 `attach_evidence`  
6. P0-B 绑定列前：默认 wake = structured log（no-op 可接受）

## Payload（Backend 冻结）

Bridge 认：`idempotency_key` / `occurred_at` 可选；幂等仍以 `id` 为准。  
`status_line` 若出现，用 Domain SoT「等你拍板」，不发明「待拍板」（Backend P0-A / PR #35 是 SoT，本切片不改 Domain 聚合）。
