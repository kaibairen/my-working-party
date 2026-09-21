# CONTRACT_DOMAIN_OUTBOUND_EVENTS_P0D_v0

**Owner:** Domain (Backend A→B publisher)  
**Aligns:** Bridge #37 tip `b86d07a81aa353f9815eb5a3158d9bfac98c6fdd` · [P0D_OUTBOUND_WAKE_PROTOCOL_v0.md](../ops/P0D_OUTBOUND_WAKE_PROTOCOL_v0.md)

Domain writes outbox rows, then `publishOutbox` HTTP POSTs each unpublished row to Bridge
`POST /hooks/domain-events` (default `WEBHOOK_URL` / `DOMAIN_EVENTS_URL` =
`http://127.0.0.1:8787/hooks/domain-events`).

## Envelope

```json
{ "id": "<outbox_id>", "type": "goal.status_changed|gate.ready|stage.unlocked", "created_at": "<iso>", "payload": {} }
```

HMAC optional: `X-Harness-Signature: sha256=<hex>` + `X-Harness-Timestamp` when `WEBHOOK_SIGNING_SECRET` is set.

## Payload

| Field | When |
|-------|------|
| `goal_id` | always |
| `status_line` | `goal.status_changed` — Domain SoT (`等你拍板` / `已交齐` / …) |
| `gate_instance_id` · `result` | `gate.ready` |
| `assignee_bot_id` | **required for wake** when the assignment is bound |

Missing `assignee_bot_id` / `assignee_bot_ids[]` → Domain **still writes outbox** (human SSE / ops).
Bridge **skips the wake path** (`skipped_no_assignee`). Do not invent office assign routes.

## Freeze names (Domain)

- `assignment_binds_assignee_bot_id`
- `desk_busy_from_assignee_heartbeat`
- `outbound_publisher_posts_domain_events`
